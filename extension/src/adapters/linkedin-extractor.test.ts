import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { beforeEach, describe, expect, it } from 'vitest'
import { extractLinkedInJob } from './linkedin-extractor'

const aboutTheJobFixture = readFileSync(new URL('./__fixtures__/linkedin-about-the-job.html', import.meta.url), 'utf8')
const topCardFixture = readFileSync(new URL('./__fixtures__/linkedin-top-card.html', import.meta.url), 'utf8')
const searchTopCardFixture = readFileSync(new URL('./__fixtures__/linkedin-top-card-search.html', import.meta.url), 'utf8')

beforeEach(() => {
  const dom = new JSDOM('<!doctype html>')
  globalThis.document = dom.window.document
  globalThis.Node = dom.window.Node
  globalThis.Element = dom.window.Element
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Document = dom.window.Document
})

describe('LinkedIn current-page extraction', () => {
  it('prefers JobPosting structured data', () => {
    document.body.innerHTML = `<script type="application/ld+json">{
      "@type":"JobPosting","title":"Junior AI Engineer",
      "hiringOrganization":{"name":"InnoWave"},
      "jobLocation":{"address":{"addressLocality":"Lisbon","addressCountry":"PT"}},
      "employmentType":"FULL_TIME","description":"<p>Build useful AI systems.</p>"
    }</script>`
    expect(extractLinkedInJob()).toEqual({ company: 'InnoWave', position: 'Junior AI Engineer', location: 'Lisbon, PT', work_mode: '', employment_type: 'Full-time', jd_text: 'Build useful AI systems.', jd_blocks: [{ type: 'paragraph', text: 'Build useful AI systems.' }] })
  })

  it('falls back to visible LinkedIn elements', () => {
    document.body.innerHTML = `<main>
      <div class="job-details-jobs-unified-top-card__container--two-pane">
        <div class="job-details-jobs-unified-top-card__job-title"><h1>Data Engineer</h1></div>
        <div class="job-details-jobs-unified-top-card__company-name"><a>Acme</a></div>
        <div class="job-details-jobs-unified-top-card__tertiary-description-container">Berlin · 2 days ago</div>
      </div><div id="job-details">Design data platforms.</div>
    </main>`
    expect(extractLinkedInJob()).toMatchObject({ company: 'Acme', position: 'Data Engineer', location: 'Berlin', jd_text: 'Design data platforms.' })
  })

  it('uses semantic headings when LinkedIn class names change', () => {
    document.head.innerHTML = '<title>Junior AI Engineer | InnoWave | LinkedIn</title>'
    document.body.innerHTML = `<main><section><h2>Junior AI Engineer</h2></section>
      <article><h2>关于职位</h2><div>InnoWave is looking for an engineer.</div>
      <div>Responsibilities include building reliable AI systems and collaborating with clients across the full delivery lifecycle.</div></article></main>`
    expect(extractLinkedInJob()).toMatchObject({ company: 'InnoWave', position: 'Junior AI Engineer' })
    expect(extractLinkedInJob().jd_text).toContain('Responsibilities include')
  })

  it('preserves description headings and list items and recognizes Chinese employment', () => {
    document.body.innerHTML = `<div class="job-title"><h1>Engineer</h1></div>
      <div class="jobs-unified-top-card__job-insight">全职</div>
      <div id="job-details"><p><strong>Responsibilities</strong></p><ul><li>Build systems</li><li>Work with clients</li></ul><button>更多</button></div>`
    const result = extractLinkedInJob()
    expect(result.employment_type).toBe('Full-time')
    expect(result.jd_blocks).toEqual([
      { type: 'heading_2', text: 'Responsibilities' },
      { type: 'bulleted_list_item', text: 'Build systems' },
      { type: 'bulleted_list_item', text: 'Work with clients' },
    ])
    expect(result.jd_text).not.toContain('更多')
  })

  it('scopes extraction to the selected job panel on LinkedIn search pages', () => {
    document.body.innerHTML = `<nav><h1>职位</h1></nav><div class="jobs-details">
      <div class="company-name">Insignia Group of Companies</div>
      <div class="job-title"><h1>Full-Stack Developer (AI-First)</h1></div>
      <div class="top-card"><div><span>马耳他 比尔基卡拉</span><span> · 1 周前 · 41 位申请者</span></div><div><span>现场办公</span></div><div><span>全职</span></div></div>
      <div id="job-details"><h2>About the job</h2><p>Build useful products.</p></div>
    </div>`
    expect(extractLinkedInJob()).toMatchObject({
      company: 'Insignia Group of Companies',
      position: 'Full-Stack Developer (AI-First)',
      location: '马耳他 比尔基卡拉',
      work_mode: 'On-site',
      employment_type: 'Full-time',
    })
  })

  it('does not mistake recruiter promotion metadata for location', () => {
    document.body.innerHTML = `<div class="jobs-details">
      <div class="company-name">Hedvig</div><div class="job-title"><h1>Junior Analytics Engineer</h1></div>
      <div class="top-card"><div>瑞典 斯德哥尔摩县 斯德哥尔摩 · 的时间：1 天前 · 83 位会员点击了申请</div>
      <div>由招聘者推广 · 领英站外管理的回复</div><span>现场办公</span><span>全职</span></div>
      <div id="job-details"><h2>About the job</h2><p>Build insurance products.</p></div>
    </div>`
    expect(extractLinkedInJob()).toMatchObject({ location: '瑞典 斯德哥尔摩县 斯德哥尔摩', work_mode: 'On-site' })
  })

  it('reads the live JobDetails_AboutTheJob panel captured from LinkedIn', () => {
    document.head.innerHTML = '<title>Junior Agentic AI Software Engineer | 恩智浦半导体 | LinkedIn</title>'
    document.body.innerHTML = aboutTheJobFixture
    const result = extractLinkedInJob()
    expect(result.position).toBe('Junior Agentic AI Software Engineer')
    expect(result.jd_blocks.filter(block => block.type === 'heading_2').map(block => block.text)).toEqual([
      'Missions', 'Required Qualifications', 'Preferred Qualifications',
    ])
    expect(result.jd_blocks.slice(0, 4)).toEqual([
      { type: 'paragraph', text: 'NXP Semiconductors is seeking a New Graduate Agentic AI Software Engineer to join our AI software development organization. In this role, you will contribute to the development of agent‑based AI software solutions leveraging state‑of‑the‑art foundation models and modern software engineering practices.' },
      { type: 'paragraph', text: 'You will work as part of a multidisciplinary team to design, implement, and validate AI software components that enable intelligent, autonomous, and scalable systems.' },
      { type: 'heading_2', text: 'Missions' },
      { type: 'bulleted_list_item', text: 'Design, develop, and maintain agentic AI software components under guidance from senior engineers' },
    ])
    expect(result.jd_blocks.at(-1)).toEqual({
      type: 'paragraph',
      text: 'More information about NXP in France...',
      spans: [{ text: 'More information about NXP in France...', href: 'https://www.nxp.com/company/about-nxp/worldwide-locations/france:FRANCE' }],
    })
    expect(result.jd_blocks.some(block => block.text === '关于职位')).toBe(false)
    expect(result.jd_text).not.toContain('seeking aNew Graduate')
  })

  it('reads the live job panel header captured from LinkedIn', () => {
    document.body.innerHTML = `<div>${topCardFixture}${aboutTheJobFixture}</div>`
    expect(extractLinkedInJob()).toMatchObject({
      position: 'Junior Agentic AI Software Engineer',
      company: '恩智浦半导体',
      location: '法国 普罗旺斯-阿尔卑斯-蔚蓝海岸 法国索菲亚科技园',
      work_mode: 'Hybrid',
      employment_type: 'Full-time',
    })
  })

  it('reads the job panel header on a search-results page', () => {
    document.body.innerHTML = `<div>${searchTopCardFixture}${aboutTheJobFixture}</div>`
    expect(extractLinkedInJob()).toMatchObject({
      position: 'Junior AI Developer',
      company: 'reeeliance',
      location: '德国 汉堡',
      work_mode: 'Hybrid',
      employment_type: 'Full-time',
    })
  })

  it('collapses a repeated place name but keeps different administrative levels', () => {
    const header = (place: string) => `<div><div>
      <p><span>${place}</span> · <span>的时间: 1 个月前</span> · <span>超过 100 位会员点击了申请</span></p>
      <div><span>混合办公</span></div><div><span>全职</span></div></div>
      <div id="JobDetails_AboutTheJob_1"><p>Build things.</p></div></div>`

    document.body.innerHTML = header('葡萄牙 里斯本 里斯本')
    expect(extractLinkedInJob().location).toBe('葡萄牙 里斯本')

    document.body.innerHTML = header('瑞典 斯德哥尔摩县 斯德哥尔摩')
    expect(extractLinkedInJob().location).toBe('瑞典 斯德哥尔摩县 斯德哥尔摩')

    document.body.innerHTML = header('Lisbon, Lisbon, Portugal')
    expect(extractLinkedInJob().location).toBe('Lisbon, Portugal')
  })

  it('recognizes employment pills that extend the stem, such as 合同制', () => {
    document.body.innerHTML = `<div><div>
      <p><span>布鲁塞尔地区</span> · <span>的时间: 1 周前</span> · <span>超过 100 位申请者</span></p>
      <p><span>由招聘者推广 • 积极审核申请者</span></p>
      <div><span>现场办公</span></div><div><span>合同制</span></div>
      <div><span>1 项技能匹配，共 10 项技能</span></div><div><span>快速申请</span></div></div>
      <div id="JobDetails_AboutTheJob_1"><p>Analyse private debt data.</p></div></div>`
    expect(extractLinkedInJob()).toMatchObject({
      location: '布鲁塞尔地区', work_mode: 'On-site', employment_type: 'Contract',
    })
  })

  it('does not read the recruiter promotion line as the location', () => {
    document.body.innerHTML = `<div>${topCardFixture}${aboutTheJobFixture}</div>`
    expect(extractLinkedInJob().location).not.toContain('招聘者')
    expect(extractLinkedInJob().location).not.toContain('的时间')
  })

  it('keeps a link that sits inside a sentence without splitting the text', () => {
    document.body.innerHTML = `<div id="JobDetails_AboutTheJob_1"><p>Apply via <a href="https://careers.example.com/roles/7">our careers page</a> before Friday.</p></div>`
    const block = extractLinkedInJob().jd_blocks[0]
    expect(block.text).toBe('Apply via our careers page before Friday.')
    expect(block.spans).toEqual([
      { text: 'Apply via ' },
      { text: 'our careers page', href: 'https://careers.example.com/roles/7' },
      { text: ' before Friday.' },
    ])
  })

  it('keeps jd_text and jd_blocks byte-identical for the backend lossless check', () => {
    document.body.innerHTML = aboutTheJobFixture
    const result = extractLinkedInJob()
    expect(result.jd_blocks.map(block => block.text).join(' ').replace(/\s+/g, ' ').trim()).toBe(
      result.jd_text.replace(/\s+/g, ' ').trim()
    )
  })
})
