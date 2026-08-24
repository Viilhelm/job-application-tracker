import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { canonicalJobUrl, detectSource, EMPLOYMENT_TYPES, rebuildJdBlocks, SOURCES, STATUSES, WORK_MODES, type CapturedEmail, type Job, type JobResponse } from '../lib/domain'
import { detectMailClient } from '../adapters/mail-extractor'
import { MailCapture } from './MailCapture'
import { createJob, lookupJob, updateJob, uploadDocument } from '../lib/notion'
import './popup.css'

const empty: Job = { url: '', company: '', position: '', location: '', work_mode: '', source: 'Other', employment_type: '', status: 'Saved', jd_text: '', jd_blocks: [], notes: '' }

function Popup() {
  const [job, setJob] = useState<Job>(empty)
  const [saved, setSaved] = useState<JobResponse | null>(null)
  const [state, setState] = useState<'loading'|'ready'|'saving'|'success'|'error'>('loading')
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState('')
  const [uploadNote, setUploadNote] = useState<{ text: string; failed: boolean } | null>(null)
  const [email, setEmail] = useState<CapturedEmail | null>(null)
  const [mailPage, setMailPage] = useState<'' | 'empty' | 'unreachable'>('')
  const [editingJd, setEditingJd] = useState(false)
  const jdRef = useRef<HTMLTextAreaElement>(null)
  const initialized = useRef(false)
  const loadSequence = useRef(0)

  useEffect(() => {
    if (!jdRef.current) return
    jdRef.current.style.height = 'auto'
    jdRef.current.style.height = `${jdRef.current.scrollHeight}px`
  }, [job.jd_text, editingJd])

  useEffect(() => {
    const loadActiveTab = async () => {
      const sequence = ++loadSequence.current
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const rawUrl = tab?.url?.startsWith('http') ? tab.url : ''
      const url = canonicalJobUrl(rawUrl)
      const source = detectSource(rawUrl)
      if (!initialized.current) setState('loading')
      setMessage('')
      setSaved(null)
      const client = rawUrl ? detectMailClient(new URL(rawUrl).hostname) : ''
      if (client && tab?.id) {
        let captured: CapturedEmail | null = null
        // A tab opened before the extension was reloaded has no content script until it is injected.
        let reachable = true
        try {
          captured = await chrome.tabs.sendMessage(tab.id, { type: 'JOBVAULT_EXTRACT_EMAIL_V1' })
        } catch {
          try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['mail-adapter.js'] })
            captured = await chrome.tabs.sendMessage(tab.id, { type: 'JOBVAULT_EXTRACT_EMAIL_V1' })
          } catch { reachable = false }
        }
        if (sequence !== loadSequence.current) return
        setEmail(captured)
        setMailPage(reachable ? 'empty' : 'unreachable')
        setState('ready')
        initialized.current = true
        return
      }
      setEmail(null)
      setMailPage('')

      let extracted: Partial<Job> = {}
      if (source === 'LinkedIn' && tab?.id) {
        try {
          extracted = await chrome.tabs.sendMessage(tab.id, { type: 'JOBVAULT_EXTRACT_CURRENT_JOB_V2' })
        } catch {
          try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['linkedin-adapter.js'] })
            extracted = await chrome.tabs.sendMessage(tab.id, { type: 'JOBVAULT_EXTRACT_CURRENT_JOB_V2' })
          } catch { /* Keep the editable manual form if LinkedIn blocks page access. */ }
        }
      }
      if (sequence !== loadSequence.current) return
      setJob({ ...empty, url, source, ...extracted })
      setState('ready')
      initialized.current = true
      if (!url) return
      try { const found = await lookupJob(url); if (sequence !== loadSequence.current) return; if (found) { setSaved(found); setJob(value => ({ ...value, company: found.company, position: found.position, status: found.status })); } }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Could not reach Notion'); setState('error') }
    }
    const onActivated = () => { void loadActiveTab() }
    const onUpdated = (_tabId: number, info: { status?: string; url?: string }, tab: chrome.tabs.Tab) => {
      if (tab.active && (info.status === 'complete' || Boolean(info.url))) void loadActiveTab()
    }
    const onMessage = (message: { type?: string }) => {
      if (message.type === 'JOBVAULT_LINKEDIN_JOB_CHANGED') void loadActiveTab()
    }
    void loadActiveTab()
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.runtime.onMessage.addListener(onMessage)
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      chrome.runtime.onMessage.removeListener(onMessage)
    }
  }, [])

  const field = (name: Exclude<keyof Job, 'jd_blocks'>) => ({ value: job[name], onChange: (event: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) => setJob({ ...job, [name]: event.target.value }) })
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setState('saving'); setMessage('')
    try { const result = saved ? await updateJob(saved.notion_page_id, { company: job.company, position: job.position, location: job.location, work_mode: job.work_mode, employment_type: job.employment_type, status: job.status, notes: job.notes }) : await createJob(job); setSaved(result); setState('success') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed'); setState('error') }
  }
  // Upload feedback stays in the Documents section; the form message belongs to saving.
  async function upload(kind: string, file?: File) {
    if (!file || !saved) return
    setUploading(kind); setUploadNote(null)
    try { setUploadNote({ text: `${await uploadDocument(saved.notion_page_id, kind, file)} uploaded`, failed: false }) }
    catch (error) { setUploadNote({ text: error instanceof Error ? error.message : 'Upload failed', failed: true }) }
    finally { setUploading('') }
  }

  if (mailPage) {
    if (email) return <MailCapture email={email}/>
    return <main>
      <header><div className="mark">JV</div><div><h1>JobVault</h1><p>Attach an email to an application</p></div></header>
      <div className="jd-captured empty">
        {mailPage === 'unreachable'
          ? <><span>⚠ JobVault cannot read this tab</span><small>Refresh the mail tab once. A tab opened before the extension was loaded has no content script yet.</small></>
          : <><span>⚠ No open email found</span><small>Open a message in the reading pane, then reopen this panel.</small></>}
      </div>
    </main>
  }

  return <main>
    <header><div className="mark">JV</div><div><h1>JobVault</h1><p>Your application archive</p></div></header>
    {job.source === 'LinkedIn' && <aside><strong>LinkedIn current-page capture</strong><br/>Review the extracted fields before saving. Refresh this page once if fields are empty.</aside>}
    {saved && <div className="existing"><span>Already saved</span><strong>{saved.status}</strong></div>}
    {state === 'loading' ? <div className="loading">Checking this page…</div> : <form onSubmit={submit}>
      <label>Job URL<input type="url" required {...field('url')} disabled={Boolean(saved)}/></label>
      <div className="grid"><label>Company<input required {...field('company')}/></label><label>Position<input required {...field('position')}/></label></div>
      <div className="grid"><label>Location<input {...field('location')} placeholder="Not found — enter manually"/></label><label>Work mode<select {...field('work_mode')}>{WORK_MODES.map(x => <option key={x} value={x}>{x || 'Not specified'}</option>)}</select></label></div>
      <div className="grid"><label>Source<select {...field('source')}>{SOURCES.map(x => <option key={x}>{x}</option>)}</select></label><label>Employment<select {...field('employment_type')}>{EMPLOYMENT_TYPES.map(x => <option key={x} value={x}>{x || 'Not specified'}</option>)}</select></label></div>
      <label>Status<select {...field('status')}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select></label>
      {!saved && <div className="jd-section"><div className="jd-heading"><strong>Job description</strong><button className="edit-jd" type="button" onClick={() => setEditingJd(value => !value)}>{editingJd ? 'Done' : 'Review / edit'}</button></div>{editingJd ? <textarea ref={jdRef} className="jd-editor" required rows={12} value={job.jd_text} onChange={event => setJob({ ...job, jd_text: event.target.value, jd_blocks: rebuildJdBlocks(event.target.value, job.jd_blocks) })} placeholder="Paste the full job description…"/> : <div className={job.jd_text ? 'jd-captured' : 'jd-captured empty'}>{job.jd_text
        ? <><span>✓ Full description captured</span><small>{job.jd_text.length.toLocaleString()} characters · saved as formatted Notion blocks</small></>
        : <><span>⚠ No description captured</span><small>Refresh the LinkedIn tab, or paste it with Review / edit</small></>}</div>}<input className="jd-required" tabIndex={-1} required value={job.jd_text} onChange={() => undefined}/></div>}
      <label>Notes<textarea rows={3} {...field('notes')} placeholder="Visa, salary, contacts, application strategy…"/></label>
      {message && <div className={state === 'error' ? 'message error' : 'message'}>{message}</div>}
      <button disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : saved ? 'Update application' : 'Save to Notion'}</button>
    </form>}
    {saved && <section><div className="section-title"><h2>Documents</h2><a href={saved.notion_url} target="_blank">Open in Notion ↗</a></div>{[['cv','CV'],['application_letter','Application letter'],['other','Other']].map(([kind,label]) => <label className="upload" key={kind}><span>{label}<small>PDF or DOCX · max 20 MB</small></span><span className="upload-button">{uploading === kind ? 'Uploading…' : 'Choose file'}</span><input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={Boolean(uploading)} onChange={e => upload(kind, e.target.files?.[0])}/></label>)}{uploadNote && <div className={uploadNote.failed ? 'message error upload-note' : 'message upload-note'}>{uploadNote.text}</div>}</section>}
    <footer><button className="link" type="button" onClick={() => chrome.runtime.openOptionsPage()}>Settings</button></footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Popup/></React.StrictMode>)
