import React, { useEffect, useMemo, useState } from 'react'
import { REJECTION_REASONS, type CapturedEmail, type FiledMessage, type SavedJob } from '../lib/domain'
import { matchJob } from '../lib/match'
import { findMessage, listJobs, saveEmail, updateMessage } from '../lib/notion'

export function MailCapture({ email }: { email: CapturedEmail }) {
  const [jobs, setJobs] = useState<SavedJob[]>([])
  const [filter, setFilter] = useState('')
  const [pick, setPick] = useState('')
  const [matchReason, setMatchReason] = useState('')
  const [reason, setReason] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'filed' | 'error'>('loading')
  const [savedUrl, setSavedUrl] = useState('')
  const [filed, setFiled] = useState<FiledMessage | null>(null)
  const [resync, setResync] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Filing the same message twice would create a second record, so identity is checked first.
    Promise.all([findMessage(email), listJobs()])
      .then(([already, found]) => {
        setJobs(found)
        if (already) {
          setFiled(already)
          setSavedUrl(already.url)
          setPick(already.applicationId)
          setReason(found.find(job => job.id === already.applicationId)?.rejectionReason || '')
          // Improved extraction can read a message better than the stored copy; offer to refresh it.
          setResync(already.subject !== (email.subject || '(no subject)'))
          setState('filed')
          return
        }
        // Preselected, never auto-saved: the reason is shown so a wrong guess is obvious.
        const matched = matchJob(email, found)
        if (matched) { setPick(matched.job.id); setMatchReason(matched.reason) }
        setState('ready')
      })
      .catch(error => { setMessage(error instanceof Error ? error.message : 'Could not read Notion'); setState('error') })
  }, [email])

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const matching = needle
      ? jobs.filter(job => `${job.company} ${job.position} ${job.status}`.toLowerCase().includes(needle))
      : jobs
    const list = matching.slice(0, 40)
    // The chosen application stays in the list, or filtering would silently blank the selection.
    const chosen = jobs.find(job => job.id === pick)
    return chosen && !list.some(job => job.id === chosen.id) ? [chosen, ...list] : list
  }, [jobs, filter, pick])

  const picked = jobs.find(job => job.id === pick)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const editing = filed
    setState('saving'); setMessage('')
    try {
      if (editing) {
        await updateMessage(editing, pick, reason, resync ? email : null)
        setSavedUrl(editing.url)
      } else {
        setSavedUrl(await saveEmail(pick, email, reason))
      }
      setState('saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the email')
      setState('error')
    }
  }

  const preview = email.blocks.slice(0, 3).map(block => block.text).join(' ').slice(0, 240)

  return <main>
    <header><div className="mark">JV</div><div><h1>JobVault</h1><p>Attach this email to an application</p></div></header>

    <div className="jd-captured">
      <span>✓ {email.subject || '(no subject)'}</span>
      <small>{email.from || email.address || 'Unknown sender'}{email.sentAt ? ` · ${email.sentAt}` : ''}</small>
    </div>
    <p className="mail-preview">{preview}{preview.length >= 240 ? '…' : ''}</p>

    {state === 'saved'
      ? <div className="message">Saved to {picked ? `${picked.company} — ${picked.position}` : 'Notion'}.
          {savedUrl && <> <a href={savedUrl} target="_blank" rel="noreferrer">Open the message ↗</a></>}
          {picked && <> · <a href={picked.url} target="_blank" rel="noreferrer">Open the application ↗</a></>}
        </div>
      : <form onSubmit={save}>
          {filed && <div className="existing"><span>Already filed</span>
            <a href={savedUrl} target="_blank" rel="noreferrer">Open the record ↗</a>
          </div>}
          <label>Attach to
            <select required value={pick} onChange={event => { setPick(event.target.value); setMatchReason('') }}>
              <option value="">{state === 'loading' ? 'Loading saved jobs…' : 'Choose an application'}</option>
              {shown.map(job => <option key={job.id} value={job.id}>
                {job.company} — {job.position}{job.status ? ` (${job.status})` : ''}
              </option>)}
            </select>
          </label>
          {matchReason && <p className="match-reason">Preselected from the {matchReason}. Change it above if that is not the right application.</p>}
          <label>Narrow the list <span className="optional">only if the application is not in it</span>
            <input type="search" value={filter} placeholder="Type a company or position…"
              onChange={event => setFilter(event.target.value)}/>
          </label>
          <label>Rejection reason <span className="optional">optional — you choose it, never guessed</span>
            <select value={reason} onChange={event => setReason(event.target.value)}>
              {REJECTION_REASONS.map(value => <option key={value} value={value}>{value || 'Not applicable'}</option>)}
            </select>
          </label>
          {filed && <label className="checkbox">
            <input type="checkbox" checked={resync} onChange={event => setResync(event.target.checked)}/>
            <span>Replace the stored subject and body with what is on screen now
              <small>Use this after an extraction fix; the record keeps its place and its links.</small></span>
          </label>}
          {message && <div className="message error">{message}</div>}
          <button disabled={!pick || state === 'saving'}>
            {state === 'saving' ? 'Saving…' : filed ? 'Update the filed message' : 'Save email to application'}
          </button>
        </form>}
  </main>
}
