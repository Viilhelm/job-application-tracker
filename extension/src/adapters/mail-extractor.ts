import { blocksToText, clean, domBlocks } from '../lib/blocks'
import type { CapturedEmail } from '../lib/domain'

export type MailClient = 'gmail' | 'outlook' | ''

export function detectMailClient(host: string): MailClient {
  if (host === 'mail.google.com') return 'gmail'
  if (/(^|\.)outlook\.(live|office|office365)\.com$/.test(host)) return 'outlook'
  return ''
}

/**
 * Read only from the reading pane. The message list holds a sender for every conversation in the
 * mailbox, so a page-wide lookup would file a stranger's address under this job — the same failure
 * the LinkedIn search page produced by matching a stale job panel.
 */
const PANES: Record<Exclude<MailClient, ''>, string> = {
  outlook: '#ReadingPaneContainerId, #ItemReadingPaneContainer, [role="main"]',
  gmail: '[role="main"]',
}
const BODIES: Record<Exclude<MailClient, ''>, string> = {
  outlook: '[id^="UniqueMessageBody"], [role="document"]',
  gmail: '.a3s, [data-message-id] [dir="ltr"]',
}
const SUBJECTS: Record<Exclude<MailClient, ''>, string> = {
  outlook: '[id$="_SUBJECT"]',
  gmail: 'h2',
}

const ADDRESS = /^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$/
/** Outlook writes the sender as one text node: "Denise Aukes<denise.aukes@hero.eu>". */
const NAME_ADDRESS = /^(.*?)\s*<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>$/

/** Gmail and Outlook agree on nothing here, so every known carrier is tried in reliability order. */
function findSender(pane: Element, body: Element | null): { from: string; address: string } {
  const outside = (element: Element) => !body || !body.contains(element)
  for (const node of pane.querySelectorAll('[email], [jid], [data-hovercard-id]')) {
    if (!outside(node)) continue
    const address = node.getAttribute('email') || node.getAttribute('jid') || node.getAttribute('data-hovercard-id') || ''
    if (!ADDRESS.test(address.trim())) continue
    const name = node.getAttribute('name') || node.getAttribute('data-name') || clean(node.textContent)
    return { from: clean(name) === address.trim() ? '' : clean(name), address: address.trim() }
  }
  for (const node of pane.querySelectorAll('span, div, td, a')) {
    if (!outside(node) || node.children.length) continue
    const matched = NAME_ADDRESS.exec(clean(node.textContent))
    if (matched) return { from: clean(matched[1]), address: matched[2] }
  }
  return { from: '', address: '' }
}

/**
 * Only an unambiguous year-first date is converted. "8/9/2026" is either August or September
 * depending on locale, and a silently wrong date is worse for a timeline than no date at all.
 */
export function toIsoDate(raw: string): string {
  const matched = /(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?:\D{1,3}(\d{1,2}):(\d{2}))?/.exec(raw)
  if (!matched) return ''
  const [, year, month, day, hour = '0', minute = '0'] = matched
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function findSentAt(pane: Element, client: Exclude<MailClient, ''>): string {
  if (client === 'outlook') return clean(pane.querySelector('[id$="_DATETIME"]')?.textContent)
  const dated = [...pane.querySelectorAll('[title]')]
    .map(node => node.getAttribute('title') || '')
    .find(title => /\d{4}/.test(title) && /\d{1,2}[/\-.月]\d{1,2}|\d{1,2}:\d{2}/.test(title))
  return clean(dated) || clean(pane.querySelector('span[class~="g3"]')?.textContent)
}

/**
 * Both clients expose a per-message id. Without one a message would be filed again every time the
 * panel is opened, so a subject/sender/date key stands in and is still stable for the same message.
 */
function messageIdIn(pane: Element, client: Exclude<MailClient, ''>, fallback: string[]): string {
  const native = client === 'outlook'
    ? /^MSG_(.+?)_[A-Z]+$/.exec(pane.querySelector('[id^="MSG_"]')?.id || '')?.[1]
    : pane.querySelector('[data-message-id]')?.getAttribute('data-message-id')
      || pane.querySelector('[data-legacy-message-id]')?.getAttribute('data-legacy-message-id')
  return clean(native) || fallback.filter(Boolean).join('|')
}

export function extractEmail(root: ParentNode = document, client: MailClient): CapturedEmail | null {
  if (!client) return null
  const pane = root.querySelector(PANES[client])
  const body = pane?.querySelector(BODIES[client]) || null
  if (!pane || !body) return null
  const blocks = domBlocks(body)
  if (!blocks.length) return null
  const subjectIn = (scope: ParentNode) => [...scope.querySelectorAll(SUBJECTS[client])]
    .filter(node => !body.contains(node))
    .map(node => clean(node.textContent)).find(Boolean) || ''
  // A narrow Outlook window moves the subject to a bar above the pane. Widening the search is safe
  // only there: `[id$="_SUBJECT"]` is specific to the open message, while Gmail's `h2` is not.
  const subject = subjectIn(pane) || (client === 'outlook' ? subjectIn(root) : '')
  const sentAt = findSentAt(pane, client)
  const sender = findSender(pane, body)
  return {
    ...sender,
    messageId: messageIdIn(pane, client, [sender.address, subject, sentAt]),
    subject,
    sentAt,
    sentAtIso: toIsoDate(sentAt),
    text: blocksToText(blocks),
    blocks,
  }
}
