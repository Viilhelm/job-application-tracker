import type { CapturedEmail, SavedJob } from './domain'

/** Matching an extracted name against saved records is not inference about the message: the
 *  candidate is preselected and shown with its reason, and the user can always change it. */
export type JobMatch = { job: SavedJob; reason: string }

const LEGAL_SUFFIX = /\b(inc|llc|ltd|limited|gmbh|bv|nv|ab|as|oy|sa|sas|srl|spa|plc|co|corp|corporation|group|holding|holdings|interim|professionals)\b/g
/** Mail vendors put the customer first: sara@innowave.teamtailor-mail.com belongs to InnoWave. */
const MAIL_VENDORS = /^(mail|email|careers|jobs|no-?reply|noreply|smtp|notifications?|hire|recruiting|talent)$/i

function normalize(value: string): string {
  return value.toLowerCase().replace(LEGAL_SUFFIX, ' ').replace(/[^a-z0-9]+/g, '')
}

function domainLabels(address: string): string[] {
  const domain = address.split('@')[1] || ''
  return domain.split('.').filter(label => label.length >= 3 && !MAIL_VENDORS.test(label) && !/^(com|net|org|edu|gov|co|io|eu|se|nl|de|fr|uk|us)$/i.test(label))
}

function mentions(haystack: string, company: string): boolean {
  if (company.length < 3) return false
  return new RegExp(`(^|[^a-z0-9])${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(haystack)
}

export function matchJob(email: CapturedEmail, jobs: SavedJob[]): JobMatch | null {
  const labels = domainLabels(email.address).map(normalize).filter(Boolean)
  const subject = email.subject.toLowerCase()
  const body = email.text.slice(0, 4000).toLowerCase()

  let best: { job: SavedJob; score: number; reason: string } | null = null
  for (const job of jobs) {
    const company = normalize(job.company)
    if (!company || company.length < 3) continue
    let score = 0
    let reason = ''
    if (labels.some(label => label === company || label.includes(company) || company.includes(label))) {
      score = 3
      reason = `sender domain ${email.address.split('@')[1]}`
    } else if (mentions(subject, job.company.toLowerCase())) {
      score = 2
      reason = 'company named in the subject'
    } else if (mentions(body, job.company.toLowerCase())) {
      score = 1
      reason = 'company named in the message'
    }
    if (score && (!best || score > best.score)) best = { job, score, reason }
  }
  return best ? { job: best.job, reason: best.reason } : null
}
