import { canonicalizeUrl, REJECTION_REASONS, type CapturedEmail, type JdBlock, type Job, type JobResponse, type JdSpan, type SavedJob } from './domain'
import { NotionError, notionRequest, readSettings, writeSettings } from './notion-client'

/** Order used when the database is first created; Notion view order is the user's afterwards. */
const DATABASE_PROPERTIES: Record<string, unknown> = {
  'Position': { title: {} },
  'Status': { select: { options: ['Saved', 'Preparing', 'Applied', 'Assessment', 'HR Interview', 'Technical Interview', 'Final Interview', 'Offer', 'Rejected', 'Withdrawn', 'Archived'].map(name => ({ name })) } },
  'Location': { rich_text: {} },
  'Work Mode': { select: { options: ['Remote', 'Hybrid', 'On-site'].map(name => ({ name })) } },
  'Company': { rich_text: {} },
  'Employment Type': { select: { options: ['Full-time', 'Internship', 'Contract', 'Other'].map(name => ({ name })) } },
  'Job URL': { url: {} },
  'CV': { files: {} },
  'Applied Date': { date: {} },
  'Notes': { rich_text: {} },
  'Application Letter': { files: {} },
  'Other Documents': { files: {} },
  'Canonical URL': { rich_text: {} },
  'Saved Date': { date: {} },
  'Rejection Reason': { select: { options: REJECTION_REASONS.filter(Boolean).map(name => ({ name })) } },
  'Contact Email': { email: {} },
  'Last Contact': { date: {} },
}

const WORK_MODE_MARKERS: Record<string, string> = {
  '混合办公': 'Hybrid', '混合辦公': 'Hybrid', 'hybrid': 'Hybrid',
  '远程办公': 'Remote', '遠程辦公': 'Remote', '远程': 'Remote', '遠程': 'Remote', 'remote': 'Remote',
  '现场办公': 'On-site', '現場辦公': 'On-site', 'on-site': 'On-site', 'onsite': 'On-site',
}

const DOCUMENT_PROPERTIES: Record<string, string> = {
  cv: 'CV',
  application_letter: 'Application Letter',
  motivation_letter: 'Application Letter',
  cover_letter: 'Application Letter',
  other: 'Other Documents',
}

export type NotionRichText = { type: 'text'; text: { content: string; link?: { url: string } }; annotations?: { bold: true } }
export type NotionBlock = { object: 'block'; type: string } & Record<string, unknown>
type NotionProperty = {
  rich_text?: { plain_text?: string }[]
  title?: { plain_text?: string }[]
  select?: { name?: string } | null
}
type NotionPage = { id: string; url: string; properties?: Record<string, NotionProperty> }
type QueryResult = { results: NotionPage[]; has_more?: boolean; next_cursor?: string | null }

function plain(page: NotionPage, name: string): string {
  const property = page.properties?.[name]
  const parts = property?.rich_text || property?.title || []
  return parts.map(part => part.plain_text || '').join('')
}

function toResponse(page: NotionPage, canonical: string, existing: boolean): JobResponse {
  return {
    notion_page_id: page.id,
    notion_url: page.url,
    canonical_url: canonical,
    company: plain(page, 'Company'),
    position: plain(page, 'Position'),
    status: page.properties?.Status?.select?.name || 'Saved',
    existing,
  }
}

/** Notion caps a rich_text item at 2000 characters and a block at 100 items. */
function richText(spans: JdSpan[]): NotionRichText[] {
  const items: NotionRichText[] = []
  for (const span of spans) {
    for (let index = 0; index < span.text.length; index += 2000) {
      const text: NotionRichText['text'] = { content: span.text.slice(index, index + 2000) }
      if (span.href?.startsWith('http')) text.link = { url: span.href }
      items.push(span.bold ? { type: 'text', text, annotations: { bold: true } } : { type: 'text', text })
    }
  }
  return items.slice(0, 100)
}

export function jdChildren(job: Job, savedAt: string): NotionBlock[] {
  const blocks: NotionBlock[] = [
    { object: 'block', type: 'heading_1', heading_1: { rich_text: richText([{ text: 'Job Description Snapshot' }]) } },
    { object: 'block', type: 'paragraph', paragraph: { rich_text: richText([{ text: `Saved at: ${savedAt}\nSource URL: ${job.url}` }]) } },
  ]
  const source: JdBlock[] = job.jd_blocks.length
    ? job.jd_blocks
    : job.jd_text.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean).map(text => ({ type: 'paragraph', text }))
  for (const block of source) {
    const spans = block.spans?.length ? block.spans : [{ text: block.text.trim() }]
    blocks.push({ object: 'block', type: block.type, [block.type]: { rich_text: richText(spans) } })
  }
  return blocks
}

async function dataSource(): Promise<{ token: string; id: string }> {
  const settings = await readSettings()
  if (!settings.token) throw new NotionError('No Notion token configured. Open Settings to add one.')
  if (settings.dataSourceId) return { token: settings.token, id: settings.dataSourceId }

  if (settings.databaseId) {
    const database = await notionRequest<{ data_sources?: { id: string }[] }>(settings.token, 'GET', `/databases/${settings.databaseId}`)
    const id = database.data_sources?.[0]?.id
    if (!id) throw new NotionError('That Notion database has no data source.')
    await writeSettings({ dataSourceId: id })
    return { token: settings.token, id }
  }

  if (!settings.parentPageId) throw new NotionError('Open Settings and add a parent page, or an existing database to keep using.')
  const created = await notionRequest<{ id: string; data_sources?: { id: string }[] }>(settings.token, 'POST', '/databases', {
    parent: { type: 'page_id', page_id: settings.parentPageId },
    title: [{ type: 'text', text: { content: 'Job Applications' } }],
    icon: { type: 'emoji', emoji: '💼' },
    is_inline: false,
    initial_data_source: {
      title: [{ type: 'text', text: { content: 'Job Applications' } }],
      properties: DATABASE_PROPERTIES,
    },
  })
  const id = created.data_sources?.[0]?.id
  if (!id) throw new NotionError('Notion created the database without a data source.')
  await writeSettings({ databaseId: created.id, dataSourceId: id })
  return { token: settings.token, id }
}

/** A database created before a property existed has to gain it before anything writes to it. */
async function ensureProperties(
  token: string, id: string, names: string[], definitions: Record<string, unknown> = DATABASE_PROPERTIES,
): Promise<void> {
  const source = await notionRequest<{ properties: Record<string, unknown> }>(token, 'GET', `/data_sources/${id}`)
  const missing = names.filter(name => !(name in source.properties))
  if (!missing.length) return
  await notionRequest(token, 'PATCH', `/data_sources/${id}`, {
    properties: Object.fromEntries(missing.map(name => [name, definitions[name]])),
  })
}

export const CORRESPONDENCE = 'Correspondence'

/** The message body only; subject, sender and date are properties of the record itself. */
export function messageChildren(email: CapturedEmail): NotionBlock[] {
  const body: JdBlock[] = email.blocks.length
    ? email.blocks
    : email.text.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean).map(text => ({ type: 'paragraph', text }))
  return body.map(block => ({
    object: 'block' as const,
    type: block.type,
    [block.type]: { rich_text: richText(block.spans?.length ? block.spans : [{ text: block.text.trim() }]) },
  }))
}

/** Identity, so reopening the panel on a message already filed cannot create a second record. */
const MESSAGE_ID: Record<string, unknown> = { 'Message ID': { rich_text: {} } }

const CORRESPONDENCE_PROPERTIES = (jobsDataSourceId: string): Record<string, unknown> => ({
  'Subject': { title: {} },
  ...MESSAGE_ID,
  'From': { rich_text: {} },
  'From Email': { email: {} },
  'Received': { date: {} },
  // A dual relation makes Notion create the matching property on Job Applications automatically.
  'Application': { relation: { data_source_id: jobsDataSourceId, type: 'dual_property', dual_property: {} } },
})

async function parentPageFor(token: string, databaseId: string, fallback: string): Promise<string> {
  try {
    const database = await notionRequest<{ parent?: { page_id?: string } }>(token, 'GET', `/databases/${databaseId}`)
    return database.parent?.page_id || fallback
  } catch { return fallback }
}

/** Messages live in their own database so a job page keeps only its description. */
async function correspondenceSource(): Promise<{ token: string; id: string }> {
  const settings = await readSettings()
  const jobs = await dataSource()
  if (settings.mailDataSourceId) return { token: jobs.token, id: settings.mailDataSourceId }

  if (settings.mailDatabaseId) {
    const database = await notionRequest<{ data_sources?: { id: string }[] }>(jobs.token, 'GET', `/databases/${settings.mailDatabaseId}`)
    const id = database.data_sources?.[0]?.id
    if (!id) throw new NotionError('That Correspondence database has no data source.')
    await writeSettings({ mailDataSourceId: id })
    return { token: jobs.token, id }
  }

  const parent = await parentPageFor(jobs.token, settings.databaseId, settings.parentPageId)
  if (!parent) throw new NotionError('Open Settings and add a parent page so the Correspondence database can be created.')
  const created = await notionRequest<{ id: string; data_sources?: { id: string }[] }>(jobs.token, 'POST', '/databases', {
    parent: { type: 'page_id', page_id: parent },
    title: [{ type: 'text', text: { content: CORRESPONDENCE } }],
    icon: { type: 'emoji', emoji: '✉️' },
    is_inline: false,
    initial_data_source: {
      title: [{ type: 'text', text: { content: CORRESPONDENCE } }],
      properties: CORRESPONDENCE_PROPERTIES(jobs.id),
    },
  })
  const id = created.data_sources?.[0]?.id
  if (!id) throw new NotionError('Notion created the Correspondence database without a data source.')
  await writeSettings({ mailDatabaseId: created.id, mailDataSourceId: id })
  return { token: jobs.token, id }
}

/** Returns the record's URL when this message is already filed, so the panel can say so. */
export async function findMessage(email: CapturedEmail): Promise<string | null> {
  if (!email.messageId) return null
  const mail = await correspondenceSource()
  const query = () => notionRequest<QueryResult>(mail.token, 'POST', `/data_sources/${mail.id}/query`, {
    filter: { property: 'Message ID', rich_text: { equals: email.messageId } },
    page_size: 1,
  })
  let found: QueryResult
  try {
    found = await query()
  } catch {
    // A database created before this property existed cannot be filtered on it; add it and retry once.
    await ensureProperties(mail.token, mail.id, ['Message ID'], MESSAGE_ID)
    found = await query()
  }
  return found.results.length ? found.results[0].url : null
}

/**
 * The relation Notion creates for the dual link is named by Notion, not by us, so it is found by
 * what it points at rather than by a name that could differ per workspace or language.
 */
async function relationTo(token: string, jobsDataSourceId: string, mailDataSourceId: string): Promise<string> {
  const source = await notionRequest<{
    properties: Record<string, { type?: string; relation?: { data_source_id?: string } }>
  }>(token, 'GET', `/data_sources/${jobsDataSourceId}`)
  if ('Messages' in source.properties) return ''
  const found = Object.entries(source.properties).find(([, property]) =>
    property.type === 'relation' && property.relation?.data_source_id === mailDataSourceId)
  return found?.[0] || ''
}

/** A count of related messages, so a row with no reply is visible without opening it. */
async function ensureMessageCount(token: string, jobsDataSourceId: string, mailDataSourceId: string): Promise<void> {
  const relation = await relationTo(token, jobsDataSourceId, mailDataSourceId)
  if (!relation) return
  const rollup = (fn: string) => notionRequest(token, 'PATCH', `/data_sources/${jobsDataSourceId}`, {
    properties: { 'Messages': { rollup: { relation_property_name: relation, rollup_property_name: 'Subject', function: fn } } },
  })
  // Notion has renamed this function across API versions; the older name is the fallback.
  try { await rollup('count') } catch { await rollup('count_all') }
}

export async function saveEmail(jobPageId: string, email: CapturedEmail, rejectionReason = ''): Promise<string> {
  const existing = await findMessage(email)
  if (existing) return existing
  const jobs = await dataSource()
  await ensureProperties(jobs.token, jobs.id, ['Rejection Reason', 'Contact Email', 'Last Contact'])
  const mail = await correspondenceSource()
  await ensureProperties(mail.token, mail.id, ['Message ID'], MESSAGE_ID)

  const received = email.sentAtIso || new Date().toISOString()
  const properties: Record<string, unknown> = {
    'Subject': { title: [{ text: { content: email.subject || '(no subject)' } }] },
    'Message ID': { rich_text: [{ text: { content: email.messageId } }] },
    'Received': { date: { start: received } },
    'Application': { relation: [{ id: jobPageId }] },
  }
  if (email.from) properties['From'] = { rich_text: [{ text: { content: email.from } }] }
  if (email.address) properties['From Email'] = { email: email.address }

  const children = messageChildren(email)
  const page = await notionRequest<NotionPage>(mail.token, 'POST', '/pages', {
    parent: { type: 'data_source_id', data_source_id: mail.id },
    properties,
    children: children.slice(0, 100),
  })
  for (let index = 100; index < children.length; index += 100) {
    await notionRequest(mail.token, 'PATCH', `/blocks/${page.id}/children`, { children: children.slice(index, index + 100) })
  }

  const jobProperties: Record<string, unknown> = { 'Last Contact': { date: { start: received } } }
  if (email.address) jobProperties['Contact Email'] = { email: email.address }
  if (rejectionReason && REJECTION_REASONS.includes(rejectionReason as typeof REJECTION_REASONS[number])) {
    jobProperties['Rejection Reason'] = { select: { name: rejectionReason } }
  }
  await notionRequest(jobs.token, 'PATCH', `/pages/${jobPageId}`, { properties: jobProperties })
  // Best effort: a missing count is cosmetic and must not fail a message that is already filed.
  try { await ensureMessageCount(jobs.token, jobs.id, mail.id) } catch { /* leave the count to the next save */ }
  return page.url
}

/** The picker needs enough to recognize a job; the full row is never loaded. */
export async function listJobs(): Promise<SavedJob[]> {
  const { token, id } = await dataSource()
  const found = await notionRequest<QueryResult>(token, 'POST', `/data_sources/${id}/query`, {
    sorts: [{ property: 'Saved Date', direction: 'descending' }],
    page_size: 100,
  })
  return found.results.map(page => ({
    id: page.id,
    url: page.url,
    company: plain(page, 'Company'),
    position: plain(page, 'Position'),
    status: page.properties?.Status?.select?.name || '',
  }))
}

export async function lookupJob(url: string): Promise<JobResponse | null> {
  const canonical = canonicalizeUrl(url)
  const { token, id } = await dataSource()
  const found = await notionRequest<QueryResult>(token, 'POST', `/data_sources/${id}/query`, {
    filter: { property: 'Canonical URL', rich_text: { equals: canonical } },
    page_size: 1,
  })
  return found.results.length ? toResponse(found.results[0], canonical, true) : null
}

export async function createJob(job: Job): Promise<JobResponse> {
  const existing = await lookupJob(job.url)
  if (existing) return existing

  const canonical = canonicalizeUrl(job.url)
  const savedAt = new Date().toISOString()
  const { token, id } = await dataSource()
  const properties: Record<string, unknown> = {
    'Position': { title: [{ text: { content: job.position } }] },
    'Company': { rich_text: [{ text: { content: job.company } }] },
    'Status': { select: { name: job.status } },
    'Job URL': { url: job.url },
    'Canonical URL': { rich_text: [{ text: { content: canonical } }] },
    'Saved Date': { date: { start: savedAt } },
  }
  if (job.location) properties['Location'] = { rich_text: [{ text: { content: job.location } }] }
  if (job.work_mode) properties['Work Mode'] = { select: { name: job.work_mode } }
  if (job.employment_type) properties['Employment Type'] = { select: { name: job.employment_type } }
  if (job.notes) properties['Notes'] = { rich_text: [{ text: { content: job.notes.slice(0, 2000) } }] }

  // Notion accepts at most 100 children per request, so a long JD is appended in further batches.
  const children = jdChildren(job, savedAt)
  const page = await notionRequest<NotionPage>(token, 'POST', '/pages', {
    parent: { type: 'data_source_id', data_source_id: id },
    properties,
    children: children.slice(0, 100),
  })
  for (let index = 100; index < children.length; index += 100) {
    await notionRequest(token, 'PATCH', `/blocks/${page.id}/children`, { children: children.slice(index, index + 100) })
  }
  return toResponse(page, canonical, false)
}

export async function updateJob(pageId: string, values: Partial<Job>): Promise<JobResponse> {
  const properties: Record<string, unknown> = {}
  if (values.company) properties['Company'] = { rich_text: [{ text: { content: values.company } }] }
  if (values.position) properties['Position'] = { title: [{ text: { content: values.position } }] }
  if (values.location) properties['Location'] = { rich_text: [{ text: { content: values.location } }] }
  if (values.notes) properties['Notes'] = { rich_text: [{ text: { content: values.notes.slice(0, 2000) } }] }
  if (values.work_mode) properties['Work Mode'] = { select: { name: values.work_mode } }
  if (values.employment_type) properties['Employment Type'] = { select: { name: values.employment_type } }
  if (values.status) {
    properties['Status'] = { select: { name: values.status } }
    if (values.status === 'Applied') properties['Applied Date'] = { date: { start: new Date().toISOString() } }
  }
  const { token } = await dataSource()
  const page = await notionRequest<NotionPage>(token, 'PATCH', `/pages/${pageId}`, { properties })
  return toResponse(page, plain(page, 'Canonical URL'), false)
}

export async function uploadDocument(pageId: string, kind: string, file: File): Promise<string> {
  const property = DOCUMENT_PROPERTIES[kind]
  if (!property) throw new NotionError(`Unknown document type ${kind}`)
  if (file.size > 20 * 1024 * 1024) throw new NotionError('That file is larger than the 20 MB limit.')
  const { token } = await dataSource()
  const upload = await notionRequest<{ id: string }>(token, 'POST', '/file_uploads', { mode: 'single_part', filename: file.name })
  const form = new FormData()
  form.append('file', file, file.name)
  await notionRequest(token, 'POST', `/file_uploads/${upload.id}/send`, undefined, form)
  await notionRequest(token, 'PATCH', `/pages/${pageId}`, {
    properties: { [property]: { files: [{ name: file.name, type: 'file_upload', file_upload: { id: upload.id } }] } },
  })
  return file.name
}

/** Legacy rows stored the mode as 'City · Hybrid' or 'City (混合办公)'. */
export function splitWorkMode(location: string): { location: string; mode: string } {
  const match = /\s*[·(（]\s*([^)）·]+?)\s*[)）]?\s*$/.exec(location)
  const mode = match ? WORK_MODE_MARKERS[match[1].trim().toLowerCase()] : undefined
  if (!match || !mode) return { location, mode: '' }
  return { location: location.slice(0, match.index).trim(), mode }
}

/** One-time split of the legacy combined Location text; rows without a known mode are left alone. */
export async function migrateWorkMode(): Promise<number> {
  const { token, id } = await dataSource()
  await ensureProperties(token, id, ['Work Mode'])
  let cursor: string | undefined
  let migrated = 0
  do {
    const page: QueryResult = await notionRequest(token, 'POST', `/data_sources/${id}/query`, { page_size: 100, start_cursor: cursor })
    for (const row of page.results) {
      if (row.properties?.['Work Mode']?.select) continue
      const current = (row.properties?.Location?.rich_text || []).map(part => part.plain_text || '').join('')
      const split = splitWorkMode(current)
      if (!split.mode) continue
      await notionRequest(token, 'PATCH', `/pages/${row.id}`, {
        properties: {
          'Location': { rich_text: split.location ? [{ text: { content: split.location } }] : [] },
          'Work Mode': { select: { name: split.mode } },
        },
      })
      migrated += 1
    }
    cursor = page.has_more ? page.next_cursor || undefined : undefined
  } while (cursor)
  return migrated
}
