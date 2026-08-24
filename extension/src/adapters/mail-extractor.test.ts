import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { beforeEach, describe, expect, it } from 'vitest'
import { detectMailClient, extractEmail, toIsoDate } from './mail-extractor'

const outlookPane = readFileSync(new URL('./__fixtures__/outlook-reading-pane.html', import.meta.url), 'utf8')
const gmailThread = readFileSync(new URL('./__fixtures__/gmail-thread.html', import.meta.url), 'utf8')

beforeEach(() => {
  const dom = new JSDOM('<!doctype html>')
  globalThis.document = dom.window.document
  globalThis.Node = dom.window.Node
  globalThis.Element = dom.window.Element
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Document = dom.window.Document
})

describe('Mail client detection', () => {
  it('recognizes the supported hosts and nothing else', () => {
    expect(detectMailClient('mail.google.com')).toBe('gmail')
    expect(detectMailClient('outlook.live.com')).toBe('outlook')
    expect(detectMailClient('outlook.office.com')).toBe('outlook')
    expect(detectMailClient('www.linkedin.com')).toBe('')
    expect(detectMailClient('mail.google.com.evil.test')).toBe('')
  })
})

describe('Date parsing', () => {
  it('converts an unambiguous year-first date', () => {
    expect(toIsoDate('周一 2026/8/24 6:48')).toContain('2026-08-24')
  })

  it('refuses a date whose month and day could be either way round', () => {
    expect(toIsoDate('Mon 8/9/2026 6:48 AM')).toBe('')
    expect(toIsoDate('yesterday')).toBe('')
  })
})

describe('Outlook reading pane', () => {
  beforeEach(() => { document.body.innerHTML = outlookPane })

  it('reads subject, sender, date and body', () => {
    const email = extractEmail(document, 'outlook')!
    expect(email.subject).toBe('Your application at Northwind')
    expect(email.from).toBe('Sam Rivers')
    expect(email.address).toBe('talent@northwind.example')
    expect(email.sentAt).toBe('周一 2026/8/24 6:48')
    expect(email.sentAtIso).toContain('2026-08-24')
    expect(email.blocks[0].text).toBe('Dear Alex,')
    expect(email.blocks.at(-1)!.text).toBe('Reply to talent-noreply@northwind.example if needed.')
  })

  it('takes the sender, not the recipient listed after it', () => {
    expect(extractEmail(document, 'outlook')!.address).not.toBe('alex@example.com')
  })

  it('ignores an address written inside the message body', () => {
    expect(extractEmail(document, 'outlook')!.address).not.toBe('talent-noreply@northwind.example')
  })
})

describe('Gmail thread', () => {
  it('reads subject, sender, date and body', () => {
    document.body.innerHTML = gmailThread
    const email = extractEmail(document, 'gmail')!
    expect(email.subject).toBe('Following up on your recent application to Northwind')
    expect(email.from).toBe('Northwind Careers')
    expect(email.address).toBe('talent@northwind.example')
    expect(email.sentAt).toBe('2026年8月24日 上午6:48')
    expect(email.blocks.map(block => block.text)).toEqual([
      'Hi Alex,',
      'Thank you for your interest in the AI Engineer role.',
      'After review, we will not be moving forward with your application at this time.',
      'Best,',
      'The Northwind Team',
    ])
  })
})

describe('No open message', () => {
  it('returns nothing rather than guessing from the message list', () => {
    document.body.innerHTML = '<div id="MailList"><span>Someone Else&lt;stranger@other.example&gt;</span></div>'
    expect(extractEmail(document, 'outlook')).toBeNull()
    expect(extractEmail(document, 'gmail')).toBeNull()
  })

  it('never reaches outside the reading pane', () => {
    document.body.innerHTML = `<span>Stranger&lt;stranger@other.example&gt;</span>${outlookPane}`
    expect(extractEmail(document, 'outlook')!.address).toBe('talent@northwind.example')
  })
})
