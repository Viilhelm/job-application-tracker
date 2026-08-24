import { describe, expect, it } from 'vitest'
import type { CapturedEmail, SavedJob } from './domain'
import { matchJob } from './match'

const job = (company: string, position = 'Engineer'): SavedJob =>
  ({ id: company, company, position, status: 'Applied', url: 'https://notion.so/x' })

const email = (overrides: Partial<CapturedEmail>): CapturedEmail => ({
  from: '', address: '', subject: '', sentAt: '', sentAtIso: '', text: '', blocks: [], ...overrides,
})

const jobs = [job('Hero'), job('InnoWave'), job('Northwind Ltd'), job('Google')]

describe('Matching an email to a saved application', () => {
  it('prefers the sender domain, the strongest signal available', () => {
    const found = matchJob(email({ address: 'denise.aukes@hero.eu', text: 'We also work with Google tools.' }), jobs)
    expect(found!.job.company).toBe('Hero')
    expect(found!.reason).toBe('sender domain hero.eu')
  })

  it('sees through a mail vendor domain to the customer in front of it', () => {
    expect(matchJob(email({ address: 'sara@innowave.teamtailor-mail.com' }), jobs)!.job.company).toBe('InnoWave')
  })

  it('ignores legal suffixes when comparing names', () => {
    expect(matchJob(email({ address: 'hr@northwind.example' }), jobs)!.job.company).toBe('Northwind Ltd')
  })

  it('falls back to the subject, then to the body', () => {
    expect(matchJob(email({ address: 'no-reply@sendgrid.net', subject: 'Your application at Hero' }), jobs)!.reason)
      .toBe('company named in the subject')
    expect(matchJob(email({ address: 'no-reply@sendgrid.net', text: 'Thanks for applying to Google.' }), jobs)!.reason)
      .toBe('company named in the message')
  })

  it('does not match a company name buried inside another word', () => {
    expect(matchJob(email({ address: 'x@y.example', text: 'Our heroic team ships fast.' }), [job('Hero')])).toBeNull()
  })

  it('returns nothing rather than a guess when no signal is present', () => {
    expect(matchJob(email({ address: 'someone@unrelated.example', text: 'Hello there.' }), jobs)).toBeNull()
    expect(matchJob(email({ address: 'hr@hero.eu' }), [])).toBeNull()
  })
})
