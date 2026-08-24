import type { JdBlock } from '../lib/domain'
import { blocksToText, clean, domBlocks } from '../lib/blocks'

export type ExtractedJob = { company: string; position: string; location: string; work_mode: string; employment_type: string; jd_text: string; jd_blocks: JdBlock[] }

function text(root: ParentNode, selectors: string[]): string {
  for (const selector of selectors) {
    const value = root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim()
    if (value) return value
  }
  return ''
}

function meta(root: ParentNode, selector: string): string {
  return clean(root.querySelector<HTMLMetaElement>(selector)?.content)
}

const ABOUT_THE_JOB = /^(about the job|关于职位|關於職位)$/i

/** LinkedIn ships hashed CSS class names, so the job panel is keyed by its stable component id. */
export const JOB_DESCRIPTION_SELECTOR = '[id^="JobDetails_AboutTheJob_"], [componentkey^="JobDetails_AboutTheJob_"]'
const LEGACY_DESCRIPTION_SELECTOR = '[class*="jobs-description"] [class*="html-content"], [class*="jobs-description-content"], [data-test-job-description], .jobs-description__content .jobs-box__html-content, .jobs-description-content__text, #job-details, .jobs-description'

function visibleHeadings(root: ParentNode): Element[] {
  return [...root.querySelectorAll('h1, h2, h3, [role="heading"]')]
    .filter(element => clean(element.textContent).length > 1)
}

function jobDetailRoot(root: ParentNode): ParentNode {
  const explicit = root.querySelector(
    '.jobs-search__job-details--container, .jobs-details, .job-view-layout, [data-job-details], [class*="job-details-container"]'
  )
  if (explicit) return explicit
  const about = visibleHeadings(root).find(element => ABOUT_THE_JOB.test(clean(element.textContent)))
  let container = about?.parentElement || null
  let candidate: Element | null = container
  while (container) {
    const length = clean(container.textContent).length
    if (length > 300 && length < 30_000) candidate = container
    if (length >= 30_000) break
    container = container.parentElement
  }
  return candidate || root
}

function aboutTheJobContainer(root: ParentNode): Element | null {
  const heading = visibleHeadings(root).find(element => ABOUT_THE_JOB.test(clean(element.textContent)))
  let container: Element | null = heading?.parentElement || null
  while (container) {
    const length = clean(container.textContent).length
    if (length >= 120 && length <= 30_000) return container
    container = container.parentElement
  }
  return null
}

const WORK_MODES: [RegExp, string][] = [
  [/^(混合办公|混合辦公|hybrid)$/i, 'Hybrid'],
  [/^(远程办公|遠程辦公|远程|遠程|remote)$/i, 'Remote'],
  [/^(现场办公|現場辦公|on.?site)$/i, 'On-site'],
]
// LinkedIn labels vary around the stem ("合同" vs "合同制"), so match within a short pill instead of exactly.
const EMPLOYMENT_PILL = /(全职|全職|兼职|兼職|实习|實習|合同|合約|full.?time|part.?time|intern(ship)?|contract|temporary)/i
const TOP_CARD_HINT = /(混合办公|混合辦公|hybrid|远程|遠程|remote|现场办公|現場辦公|on.?site|全职|全職|full.?time|实习|實習|intern)/i

type TopCard = { position: string; company: string; location: string; workMode: string; employment: string }
const EMPTY_TOP_CARD: TopCard = { position: '', company: '', location: '', workMode: '', employment: '' }

/** The header has no stable class, but it always precedes the description inside the job panel. */
function topCardElement(pageRoot: ParentNode, description: Element | null): Element | null {
  const looksLikeHeader = (element: Element) => {
    const value = clean(element.textContent)
    return value.length > 20 && value.length < 3_000 && TOP_CARD_HINT.test(value)
  }
  const banner = pageRoot.querySelector('[id^="JobDetails_ManageJobBanner_"]')?.nextElementSibling
  if (banner && looksLikeHeader(banner)) return banner
  let node = description
  for (let depth = 0; node?.parentElement && depth < 8; depth++) {
    const siblings = [...node.parentElement.children]
    const match = siblings.slice(0, siblings.indexOf(node)).reverse().find(looksLikeHeader)
    if (match) return match
    node = node.parentElement
  }
  return null
}

/**
 * LinkedIn repeats a name when a city and its district are spelled the same ("葡萄牙 里斯本 里斯本").
 * Only exact adjacent repeats collapse: "斯德哥尔摩县 斯德哥尔摩" are different administrative levels,
 * and "法国 … 法国索菲亚科技园" repeats a word that belongs to the next name.
 */
function dedupePlaces(value: string): string {
  const comma = value.includes(',')
  const parts = value.split(comma ? ',' : ' ').map(part => part.trim()).filter(Boolean)
  return parts.filter((part, index) => part !== parts[index - 1]).join(comma ? ', ' : ' ')
}

function readTopCard(element: Element | null): TopCard {
  if (!element) return EMPTY_TOP_CARD
  const leaves = [...element.querySelectorAll('*')]
    .filter(node => node.children.length === 0)
    .map(node => clean(node.textContent))
    .filter(Boolean)
  // The shortest element still holding the whole line is the one that scopes it tightest.
  const lines = [...element.querySelectorAll('p, div, span, li')]
    .map(node => clean(node.textContent))
    .filter(value => value.length >= 2 && value.length <= 300)
    .sort((a, b) => a.length - b.length)
  const locationLine = lines.find(value =>
    value.includes('·') && /ago|前|applicant|申请|申請/i.test(value) && clean(value.split('·')[0]).length >= 2
  )
  // An <a> nested in an <a> is unnested by the parser, so the outer company link ends up textless.
  const company = [...element.querySelectorAll('a[href*="/company/"]')]
    .map(node => clean(node.textContent)).find(Boolean) || ''
  const position = [...element.querySelectorAll('p')]
    .filter(node => !node.closest('a[href*="/company/"]'))
    .map(node => clean(node.textContent))
    .find(value => value.length >= 3 && value.length <= 200 && value !== company && !/[·•]/.test(value))
  return {
    position: position || '',
    company,
    location: dedupePlaces(clean(locationLine?.split('·')[0])),
    workMode: WORK_MODES.find(([pattern]) => leaves.some(value => pattern.test(value)))?.[1] || '',
    employment: normalizeEmployment(leaves.find(value => value.length <= 12 && EMPLOYMENT_PILL.test(value)) || ''),
  }
}

function titleMetadata(root: ParentNode): { position: string; company: string } {
  const ogTitle = meta(root, 'meta[property="og:title"]')
  const pageTitle = clean(root.querySelector('title')?.textContent)
  const source = ogTitle || pageTitle
  const parts = source.split(/\s+[|·]\s+/).map(clean).filter(Boolean)
  if (parts.at(-1)?.toLowerCase() === 'linkedin') parts.pop()
  return { position: parts[0] || '', company: parts[1] || '' }
}

function normalizeEmployment(value: unknown): string {
  const source = Array.isArray(value) ? value.join(' ') : String(value || '')
  if (/full.?time|全职|全職/i.test(source)) return 'Full-time'
  if (/intern|实习|實習/i.test(source)) return 'Internship'
  if (/contract|temporary|合同|合約/i.test(source)) return 'Contract'
  if (/part.?time|兼职|兼職/i.test(source)) return 'Other'
  return ''
}

function fromJsonLd(root: ParentNode): Partial<ExtractedJob> {
  for (const script of root.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    try {
      const raw = JSON.parse(script.textContent || '{}')
      const job = (Array.isArray(raw) ? raw : [raw]).find(value => value?.['@type'] === 'JobPosting')
      if (!job) continue
      const address = job.jobLocation?.address || job.jobLocation?.[0]?.address || {}
      const holder = document.createElement('div')
      holder.innerHTML = job.description || ''
      const blocks = job.description ? domBlocks(holder) : []
      return { position: job.title || '', company: job.hiringOrganization?.name || '', location: [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(', '), employment_type: normalizeEmployment(job.employmentType), jd_text: blocksToText(blocks), jd_blocks: blocks }
    } catch { /* Ignore malformed structured data. */ }
  }
  return {}
}

/** The panel id carries the job id, which is how a stale pane is told apart from the current one. */
export function jobIdFromUrl(href: string): string {
  const view = /\/jobs\/view\/(\d+)/.exec(href)?.[1]
  if (view) return view
  try { return new URL(href, 'https://www.linkedin.com').searchParams.get('currentJobId') || '' } catch { return '' }
}

export function descriptionFor(root: ParentNode, jobId: string): Element | null {
  return (jobId && root.querySelector(`[id="JobDetails_AboutTheJob_${jobId}"]`))
    || root.querySelector(JOB_DESCRIPTION_SELECTOR)
}

export function extractLinkedInJob(root: ParentNode = document, jobId = ''): ExtractedJob {
  const pageRoot = root
  root = jobDetailRoot(root)
  const structured = fromJsonLd(pageRoot)
  const titleData = titleMetadata(pageRoot)
  const top = root.querySelector('.job-details-jobs-unified-top-card__container--two-pane, [class*="top-card"]') || root
  const metadata = text(top, ['[class*="top-card"] [class*="tertiary"]', '[class*="top-card"] [class*="primary-description"]', '.job-details-jobs-unified-top-card__tertiary-description-container', '.job-details-jobs-unified-top-card__primary-description-container', '.jobs-unified-top-card__bullet'])
  const ogDescription = meta(pageRoot, 'meta[property="og:description"]') || meta(pageRoot, 'meta[name="description"]')
  const descriptionElement = descriptionFor(pageRoot, jobId) || root.querySelector(LEGACY_DESCRIPTION_SELECTOR) || aboutTheJobContainer(root)
  const card = readTopCard(topCardElement(pageRoot, descriptionElement))
  const extractedBlocks = descriptionElement ? domBlocks(descriptionElement, ABOUT_THE_JOB) : structured.jd_blocks || []
  const fallbackText = extractedBlocks.length ? '' : ogDescription
  const jdBlocks = extractedBlocks.length ? extractedBlocks : fallbackText ? [{ type: 'paragraph' as const, text: fallbackText }] : []
  return {
    position: structured.position || text(root, ['[class*="job-title"] h1', '[class*="job-title"]', '[data-test-job-title]', '.job-details-jobs-unified-top-card__job-title h1', '.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title']) || card.position || titleData.position,
    company: structured.company || text(root, ['[class*="company-name"] a', '[class*="company-name"]', '[data-test-company-name]', '.job-details-jobs-unified-top-card__company-name a', '.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name']) || card.company || titleData.company,
    location: structured.location || metadata.split(/\s*[·•]\s*/)[0]?.trim() || card.location,
    work_mode: card.workMode,
    employment_type: structured.employment_type || normalizeEmployment(text(root, ['.job-details-preferences-and-skills__pill', '.jobs-unified-top-card__job-insight'])) || card.employment,
    jd_text: blocksToText(jdBlocks),
    jd_blocks: jdBlocks,
  }
}
