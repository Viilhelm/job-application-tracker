import { describe, expect, it } from 'vitest'
import type { Job } from './domain'
import { extractNotionId } from './notion-client'
import { emailChildren, jdChildren, splitWorkMode, type NotionBlock, type NotionRichText } from './notion'

const typeOf = (block: NotionBlock) => block.type
const bodyOf = (block: NotionBlock) => (block as Record<string, { rich_text: NotionRichText[] }>)[block.type].rich_text

const job = (overrides: Partial<Job>): Job => ({
  url: 'https://www.linkedin.com/jobs/view/1', company: 'Acme', position: 'Engineer', location: '',
  work_mode: '', source: 'LinkedIn', employment_type: '', status: 'Saved',
  jd_text: '', jd_blocks: [], notes: '', ...overrides,
})

describe('JD page body', () => {
  it('turns link spans into clickable Notion rich text', () => {
    const blocks = jdChildren(job({
      jd_text: 'Apply via our careers page',
      jd_blocks: [{
        type: 'paragraph', text: 'Apply via our careers page',
        spans: [{ text: 'Apply via ' }, { text: 'our careers page', href: 'https://careers.example.com/7' }],
      }],
    }), '2026-08-16T00:00:00Z')
    expect(bodyOf(blocks[2])).toEqual([
      { type: 'text', text: { content: 'Apply via ' } },
      { type: 'text', text: { content: 'our careers page', link: { url: 'https://careers.example.com/7' } } },
    ])
  })

  it('keeps every block type and always leads with the snapshot header', () => {
    const blocks = jdChildren(job({
      jd_text: 'Missions\n\nBuild things',
      jd_blocks: [{ type: 'heading_2', text: 'Missions' }, { type: 'bulleted_list_item', text: 'Build things' }],
    }), '2026-08-16T00:00:00Z')
    expect(blocks.map(typeOf)).toEqual(['heading_1', 'paragraph', 'heading_2', 'bulleted_list_item'])
  })

  it('falls back to paragraphs when a manually entered job has no structure', () => {
    const blocks = jdChildren(job({ jd_text: 'First para.\n\nSecond para.' }), '2026-08-16T00:00:00Z')
    expect(blocks.slice(2).map(block => bodyOf(block)[0].text.content)).toEqual(['First para.', 'Second para.'])
  })

  it('splits text past the Notion rich-text limit instead of dropping it', () => {
    const long = 'x'.repeat(4500)
    const blocks = jdChildren(job({ jd_text: long, jd_blocks: [{ type: 'paragraph', text: long }] }), '2026-08-16T00:00:00Z')
    const chunks = bodyOf(blocks[2])
    expect(chunks).toHaveLength(3)
    expect(chunks.map(chunk => chunk.text.content).join('')).toBe(long)
  })
})

describe('Email timeline entry', () => {
  const email = {
    from: 'Ariane van der Haegen', address: 'ariane@kartesia.com',
    subject: 'Your application', sentAt: '2026-08-16T09:12:00Z',
    text: '', sentAtIso: '2026-08-16T09:12:00.000Z', blocks: [
      { type: 'paragraph' as const, text: 'Thank you for applying.' },
      { type: 'paragraph' as const, text: 'We are looking for a Dutch speaker.' },
    ],
  }

  it('leads with the subject and records who sent it and when', () => {
    const blocks = emailChildren(email)
    expect(blocks.map(typeOf)).toEqual(['heading_2', 'paragraph', 'paragraph', 'paragraph'])
    expect(bodyOf(blocks[0])[0].text.content).toBe('Your application')
    expect(bodyOf(blocks[1])[0].text.content)
      .toBe('From: Ariane van der Haegen <ariane@kartesia.com>\nReceived: 2026-08-16T09:12:00Z')
  })

  it('keeps the body verbatim, in order', () => {
    expect(emailChildren(email).slice(2).map(block => bodyOf(block)[0].text.content))
      .toEqual(['Thank you for applying.', 'We are looking for a Dutch speaker.'])
  })

  it('falls back to plain text when a client exposes no structure', () => {
    const blocks = emailChildren({ ...email, blocks: [], text: 'First line.\n\nSecond line.' })
    expect(blocks.slice(2).map(block => bodyOf(block)[0].text.content)).toEqual(['First line.', 'Second line.'])
  })

  it('still writes an entry when the sender could not be read', () => {
    const blocks = emailChildren({ ...email, from: '', address: '', sentAt: '', subject: '' })
    expect(blocks.map(typeOf)).toEqual(['heading_2', 'paragraph', 'paragraph'])
    expect(bodyOf(blocks[0])[0].text.content).toBe('(no subject)')
  })
})

describe('Notion id extraction', () => {
  it('takes the database id from a database URL, not the view id in ?v=', () => {
    expect(extractNotionId('https://www.notion.so/me/0a6958f70b1542c9a70ca2102de3ced7?v=2f8c89ac6a594f54a9475cc055d17b1e'))
      .toBe('0a6958f70b1542c9a70ca2102de3ced7')
  })

  it('accepts a dashed uuid, a bare id and a slugged page URL', () => {
    expect(extractNotionId('0a6958f7-0b15-42c9-a70c-a2102de3ced7')).toBe('0a6958f70b1542c9a70ca2102de3ced7')
    expect(extractNotionId('0a6958f70b1542c9a70ca2102de3ced7')).toBe('0a6958f70b1542c9a70ca2102de3ced7')
    expect(extractNotionId('https://notion.so/My-Job-Page-0a6958f70b1542c9a70ca2102de3ced7'))
      .toBe('0a6958f70b1542c9a70ca2102de3ced7')
  })
})

describe('Legacy location migration', () => {
  it('splits both separators LinkedIn has used', () => {
    expect(splitWorkMode('马耳他 比尔基卡拉 · 现场办公')).toEqual({ location: '马耳他 比尔基卡拉', mode: 'On-site' })
    expect(splitWorkMode('法国索菲亚科技园 (混合办公)')).toEqual({ location: '法国索菲亚科技园', mode: 'Hybrid' })
    expect(splitWorkMode('Berlin · Remote')).toEqual({ location: 'Berlin', mode: 'Remote' })
  })

  it('leaves rows that never carried a mode untouched', () => {
    expect(splitWorkMode('Berlin · 2 days ago')).toEqual({ location: 'Berlin · 2 days ago', mode: '' })
    expect(splitWorkMode('Lisbon, PT')).toEqual({ location: 'Lisbon, PT', mode: '' })
    expect(splitWorkMode('')).toEqual({ location: '', mode: '' })
  })
})
