import { describe, expect, it } from 'vitest'
import { canonicalizeUrl, canonicalJobUrl, detectSource } from './domain'

describe('canonical URLs', () => {
  it('drops fragments and tracking parameters so the same job matches itself', () => {
    expect(canonicalizeUrl('https://WWW.Example.com/jobs/7/?utm_source=x&trk=y&id=9#apply'))
      .toBe('https://www.example.com/jobs/7?id=9')
  })

  it('sorts remaining parameters so parameter order cannot create a duplicate', () => {
    expect(canonicalizeUrl('https://example.com/j?b=2&a=1')).toBe(canonicalizeUrl('https://example.com/j?a=1&b=2'))
  })

  it('keeps requisition identifiers', () => {
    expect(canonicalizeUrl('https://example.com/careers?gh_jid=4321')).toContain('gh_jid=4321')
  })
})

describe('source detection', () => {
  it('uses manual LinkedIn source detection', () => expect(detectSource('https://www.linkedin.com/jobs/view/123')).toBe('LinkedIn'))
  it('detects ATS sources', () => expect(detectSource('https://boards.greenhouse.io/acme/jobs/1')).toBe('Greenhouse'))
  it('converts LinkedIn search state to a stable job URL', () => {
    expect(canonicalJobUrl('https://www.linkedin.com/jobs/search-results/?currentJobId=4448536145&keywords=ai'))
      .toBe('https://www.linkedin.com/jobs/view/4448536145')
  })
})
