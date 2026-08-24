const API = 'https://api.notion.com/v1'
const VERSION = '2026-03-11'

export type NotionSettings = { token: string; parentPageId: string; databaseId: string; dataSourceId: string; mailDatabaseId: string; mailDataSourceId: string }

export class NotionError extends Error {}

/**
 * Accepts a raw id, a dashed uuid, or any Notion URL. The id is anchored to the end of the path:
 * scanning forwards instead would let hex letters in a slug ("…-Page-") swallow the first character.
 * The query string is dropped first because a database URL carries a second id in `?v=`.
 */
export function extractNotionId(value: string): string {
  const path = value.trim().split('?')[0].replace(/\/+$/, '').replace(/-/g, '')
  const match = /[0-9a-f]{32}$/i.exec(path)
  return match ? match[0].toLowerCase() : value.trim()
}

export async function readSettings(): Promise<NotionSettings> {
  // The token is per-device and must not sync across browsers; ids are cheap to re-resolve.
  const secret = await chrome.storage.local.get({ token: '' })
  const shared = await chrome.storage.sync.get({ parentPageId: '', databaseId: '', dataSourceId: '', mailDatabaseId: '', mailDataSourceId: '' })
  return {
    token: String(secret.token),
    parentPageId: String(shared.parentPageId),
    databaseId: String(shared.databaseId),
    dataSourceId: String(shared.dataSourceId),
    mailDatabaseId: String(shared.mailDatabaseId),
    mailDataSourceId: String(shared.mailDataSourceId),
  }
}

export async function writeSettings(values: Partial<NotionSettings>): Promise<void> {
  if ('token' in values) await chrome.storage.local.set({ token: values.token })
  const shared = Object.fromEntries(
    (['parentPageId', 'databaseId', 'dataSourceId', 'mailDatabaseId', 'mailDataSourceId'] as const)
      .filter(key => key in values).map(key => [key, values[key]])
  )
  if (Object.keys(shared).length) await chrome.storage.sync.set(shared)
}

function describe(payload: unknown, status: number): string {
  const value = payload as { message?: unknown; code?: unknown } | null
  if (value && typeof value.message === 'string') return value.message
  if (status === 401) return 'Notion rejected the token. Check it in Settings.'
  if (status === 404) return 'Notion could not find that page or database. Share it with your integration.'
  return `Notion request failed (${status})`
}

export async function notionRequest<T>(
  token: string, method: string, path: string, body?: unknown, form?: FormData,
): Promise<T> {
  if (!token) throw new NotionError('No Notion token configured. Open Settings to add one.')
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: form || (body === undefined ? undefined : JSON.stringify(body)),
  }).catch(() => { throw new NotionError('Cannot reach Notion. Check your network connection.') })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new NotionError(describe(payload, response.status))
  return payload as T
}

/** Smallest call that proves the token works, used by the Settings connection test. */
export async function verifyToken(token: string): Promise<string> {
  const user = await notionRequest<{ name?: string; bot?: { workspace_name?: string } }>(token, 'GET', '/users/me')
  return user.bot?.workspace_name || user.name || 'your workspace'
}
