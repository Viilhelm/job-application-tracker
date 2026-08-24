export const STATUSES = ['Saved', 'Preparing', 'Applied', 'Assessment', 'HR Interview', 'Technical Interview', 'Final Interview', 'Offer', 'Rejected', 'Withdrawn', 'Archived'] as const
export const SOURCES = ['LinkedIn', 'Company Site', 'Greenhouse', 'Lever', 'Workday', 'Other'] as const
export const EMPLOYMENT_TYPES = ['', 'Full-time', 'Internship', 'Contract', 'Other'] as const
export const WORK_MODES = ['', 'Remote', 'Hybrid', 'On-site'] as const

/** Chosen by the user, never inferred from the email: the reason is the point of the retrospective. */
export const REJECTION_REASONS = ['', 'Language requirement', 'Experience or skills', 'Education or visa', 'Role cancelled', 'Not specified', 'Other'] as const

/** One captured message. `blocks` reuses JdBlock because Notion renders both the same way. */
export type CapturedEmail = { from: string; address: string; subject: string; sentAt: string; sentAtIso: string; text: string; blocks: JdBlock[] }
export type SavedJob = { id: string; company: string; position: string; status: string; url: string }

export type JdSpan = { text: string; href?: string }
/** `spans` is only set when the block carries links; its concatenated text always equals `text`. */
export type JdBlock = { type: 'heading_2' | 'heading_3' | 'paragraph' | 'bulleted_list_item' | 'numbered_list_item'; text: string; spans?: JdSpan[] }
export type Job = { url: string; company: string; position: string; location: string; work_mode: string; source: string; employment_type: string; status: string; jd_text: string; jd_blocks: JdBlock[]; notes: string }
export type JobResponse = { notion_page_id: string; notion_url: string; canonical_url: string; company: string; position: string; status: string; existing: boolean }

/** Edited JD text must stay lossless against jd_blocks, so rebuild them and keep the type of untouched lines. */
export function rebuildJdBlocks(text: string, original: JdBlock[]): JdBlock[] {
  const known = new Map(original.map(block => [block.text, block]))
  return text.split(/\n+/).map(line => line.trim()).filter(Boolean)
    .map(line => {
      const match = known.get(line)
      return match ? { ...match } : { type: 'paragraph' as const, text: line }
    })
}

export function detectSource(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'LinkedIn'
    if (host.includes('greenhouse.io')) return 'Greenhouse'
    if (host.includes('lever.co')) return 'Lever'
    if (host.includes('workday')) return 'Workday'
    return 'Company Site'
  } catch { return 'Other' }
}

const TRACKING_PARAMS = new Set([
  'trackingid', 'trk', 'ref', 'refid', 'referral',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
])

/** Deduplication key: drops fragments and tracking parameters, then sorts what is left. */
export function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    const kept = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()) && !key.toLowerCase().startsWith('utm_'))
      .sort(([keyA, valueA], [keyB, valueB]) => keyA.localeCompare(keyB) || valueA.localeCompare(valueB))
    url.search = new URLSearchParams(kept).toString()
    return url.toString()
  } catch { return value }
}

export function canonicalJobUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) {
      const pathId = url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1]
      const jobId = pathId || url.searchParams.get('currentJobId')
      if (jobId && /^\d+$/.test(jobId)) return `https://www.linkedin.com/jobs/view/${jobId}`
    }
    return value
  } catch { return value }
}
