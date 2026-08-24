import type { JdBlock, JdSpan } from './domain'

export function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() || ''
}

const SEE_MORE = /(?:…|\.\.\.)?\s*(更多|顯示更多|显示更多|see more|show more)\s*$/i
const SKIP_TAGS = new Set(['script', 'style', 'button', 'svg', 'img', 'noscript', 'template', 'input', 'select', 'textarea'])
const BLOCK_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figure', 'footer', 'form', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tr', 'ul'])

/** Text gathered for the line being built, split by how much of it came from <strong>/<b>. */
type Cursor = { blocks: JdBlock[]; parts: JdSpan[]; strong: number; plain: number; list: JdBlock['type'] | null; skipHeading?: RegExp }

/** Collapses whitespace across part boundaries so the joined spans stay identical to the block text. */
function collapseParts(parts: JdSpan[]): { text: string; spans: JdSpan[] } {
  let text = ''
  const spans: JdSpan[] = []
  for (const part of parts) {
    let value = part.text.replace(/\s+/g, ' ')
    if (!text || text.endsWith(' ')) value = value.replace(/^ /, '')
    if (!value) continue
    text += value
    const previous = spans.at(-1)
    if (previous && previous.href === part.href) previous.text += value
    else spans.push({ text: value, href: part.href })
  }
  return { text, spans }
}

function truncateSpans(spans: JdSpan[], length: number): JdSpan[] {
  const kept: JdSpan[] = []
  let used = 0
  for (const span of spans) {
    if (used >= length) break
    const text = span.text.slice(0, length - used)
    used += text.length
    kept.push({ text, href: span.href })
  }
  return kept
}

function flush(cursor: Cursor, forced?: JdBlock['type']): void {
  const collapsed = collapseParts(cursor.parts)
  const text = collapsed.text.replace(SEE_MORE, '').trim()
  const emphasised = cursor.strong > 0 && cursor.plain === 0
  cursor.parts = []
  cursor.strong = 0
  cursor.plain = 0
  if (!text) return
  const type = forced || cursor.list || (emphasised && text.length <= 120 ? 'heading_2' : 'paragraph')
  const spans = truncateSpans(collapsed.spans, text.length)
  cursor.blocks.push(spans.some(span => span.href) ? { type, text, spans } : { type, text })
}

/** LinkedIn wraps outbound links in a tracked /safety/go redirect; store the destination instead. */
function resolveHref(value: string | null): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, 'https://www.linkedin.com')
    if (url.pathname.startsWith('/safety/go')) return url.searchParams.get('url') || url.href
    return url.href
  } catch { return undefined }
}

function walkDescription(node: Node, cursor: Cursor, strongDepth: number, href?: string): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.textContent || ''
    cursor.parts.push({ text: value, href })
    if (strongDepth > 0) cursor.strong += clean(value).length
    else cursor.plain += clean(value).length
    return
  }
  if (!(node instanceof Element)) return
  const tag = node.tagName.toLowerCase()
  if (SKIP_TAGS.has(tag)) return
  const depth = strongDepth + (tag === 'strong' || tag === 'b' ? 1 : 0)
  const link = tag === 'a' ? resolveHref(node.getAttribute('href')) || href : href
  const children = () => { for (const child of node.childNodes) walkDescription(child, cursor, depth, link) }
  if (tag === 'br') { flush(cursor); return }
  if (/^h[1-6]$/.test(tag)) {
    if (cursor.skipHeading?.test(clean(node.textContent))) return
    flush(cursor)
    children()
    flush(cursor, tag === 'h1' || tag === 'h2' ? 'heading_2' : 'heading_3')
    return
  }
  if (tag === 'li') {
    flush(cursor)
    const enclosing = cursor.list
    cursor.list = node.closest('ol') ? 'numbered_list_item' : 'bulleted_list_item'
    children()
    flush(cursor)
    cursor.list = enclosing
    return
  }
  if (BLOCK_TAGS.has(tag)) { flush(cursor); children(); flush(cursor); return }
  children()
}

export function domBlocks(element: Element, skipHeading?: RegExp): JdBlock[] {
  const cursor: Cursor = { blocks: [], parts: [], strong: 0, plain: 0, list: null, skipHeading }
  walkDescription(element, cursor, 0)
  flush(cursor)
  return cursor.blocks
}


export function blocksToText(blocks: JdBlock[]): string {
  return blocks.map(block => block.text).join('\n\n')
}
