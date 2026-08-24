import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { extractNotionId, readSettings, verifyToken, writeSettings } from '../lib/notion-client'
import { migrateWorkMode } from '../lib/notion'
import './options.css'

function Options() {
  const [token, setToken] = useState('')
  const [parentPageId, setParentPageId] = useState('')
  const [databaseId, setDatabaseId] = useState('')
  const [mailDatabaseId, setMailDatabaseId] = useState('')
  const [knownMail, setKnownMail] = useState('')
  const [known, setKnown] = useState('')
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    void readSettings().then(values => {
      setToken(values.token)
      setParentPageId(values.parentPageId)
      setDatabaseId(values.databaseId)
      setKnown(values.databaseId)
      setMailDatabaseId(values.mailDatabaseId)
      setKnownMail(values.mailDatabaseId)
    })
  }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setMessage('')
    const page = parentPageId ? extractNotionId(parentPageId) : ''
    const database = databaseId ? extractNotionId(databaseId) : ''
    const mail = mailDatabaseId ? extractNotionId(mailDatabaseId) : ''
    setParentPageId(page)
    setDatabaseId(database)
    setMailDatabaseId(mail)
    // A different database invalidates the cached data source, which belongs to the old one.
    await writeSettings({
      token: token.trim(), parentPageId: page, databaseId: database, mailDatabaseId: mail,
      ...(database === known ? {} : { dataSourceId: '' }),
      ...(mail === knownMail ? {} : { mailDataSourceId: '' }),
    })
    setKnown(database)
    setKnownMail(mail)
    try {
      setMessage(`Connected to ${await verifyToken(token.trim())}.`)
      setFailed(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection test failed')
      setFailed(true)
    }
  }

  async function migrate() {
    setMessage('Splitting legacy Location values…')
    setFailed(false)
    try {
      const count = await migrateWorkMode()
      setMessage(count ? `Moved the work mode out of Location on ${count} row(s).` : 'Nothing to split — every row is already up to date.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Migration failed')
      setFailed(true)
    }
  }

  return <main>
    <h1>JobVault settings</h1>
    <p>JobVault talks to Notion directly from your browser. Nothing is sent to any other server.</p>
    <form onSubmit={save}>
      <label>Notion integration token
        <input type="password" required autoComplete="off" placeholder="ntn_…" value={token}
          onChange={event => setToken(event.target.value)}/>
      </label>
      <label>Parent page ID or URL
        <input type="text" placeholder="https://notion.so/Your-Page-abc123…" value={parentPageId}
          onChange={event => setParentPageId(event.target.value)}/>
      </label>
      <label>Existing database ID or URL <span className="optional">optional — leave empty to create one</span>
        <input type="text" placeholder="Paste an existing Job Applications database to keep using it" value={databaseId}
          onChange={event => setDatabaseId(event.target.value)}/>
      </label>
      <label>Existing Correspondence database <span className="optional">optional — created on the first saved email</span>
        <input type="text" placeholder="Leave empty unless you already have one" value={mailDatabaseId}
          onChange={event => setMailDatabaseId(event.target.value)}/>
      </label>
      <button>Save &amp; test connection</button>
    </form>
    {message && <div className={failed ? 'message error' : 'message'}>{message}</div>}
    <h2>Setup</h2>
    <ol className="hint">
      <li>Create an internal integration at <code>notion.so/profile/integrations</code> and copy its token.</li>
      <li>Create one blank Notion page to hold your job tracker.</li>
      <li>Open that page, choose <strong>Connections</strong>, and connect your integration to it.</li>
      <li>Paste the token and the page URL above. JobVault creates the database on first save.</li>
    </ol>
    <p className="hint">
      Already have a Job Applications database? Paste it into the third field and JobVault keeps writing to it.
      To get its address, open the database in Notion, and if it sits inside another page choose
      <strong> Open as full page</strong> first — copying the link while it is inline gives you the parent page instead,
      which Notion then reports only as “not found”. Then copy the browser address; the <code>?v=…</code> part is a view
      id and is ignored.
    </p>
    <p className="hint">The token is stored in this browser only and never syncs to other devices.</p>
    <h2>Maintenance</h2>
    <p className="hint">Older rows stored the work mode inside Location, as “City · Hybrid”. Run this once to move it into the Work Mode property. Rows without a recognizable mode are left untouched.</p>
    <button type="button" className="secondary" onClick={migrate}>Split legacy Location values</button>
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Options/></React.StrictMode>)
