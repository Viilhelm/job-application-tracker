import { extractLinkedInJob, JOB_DESCRIPTION_SELECTOR } from './linkedin-extractor'

const runtimeId = globalThis.chrome?.runtime?.id
const contextAlive = () => Boolean(runtimeId && globalThis.chrome?.runtime?.id === runtimeId)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'JOBVAULT_EXTRACT_CURRENT_JOB_V2') return
  // Only inside the job panel: a page-wide search hits the "see more" of company feed posts instead.
  const description = document.querySelector(`${JOB_DESCRIPTION_SELECTOR}, [class*="jobs-description"], [data-test-job-description], #job-details`)
  const expand = [...(description?.querySelectorAll<HTMLElement>('button, [role="button"]') || [])]
    .find(button => /(更多|顯示更多|显示更多|see more|show more)/i.test(button.textContent?.trim() || ''))
  expand?.click()
  const respondWhenReady = (attempt = 0) => {
    if (!contextAlive()) return
    const result = extractLinkedInJob()
    if ((result.position || result.jd_text) || attempt >= 8) sendResponse(result)
    else window.setTimeout(() => respondWhenReady(attempt + 1), 300)
  }
  window.setTimeout(() => respondWhenReady(), expand ? 600 : 0)
  return true
})

let notifyTimer = 0
let lastSignature = `${location.href}|${extractLinkedInJob().position}`
let stopped = false
let observer: MutationObserver | null = null
const originalPushState = history.pushState.bind(history)
const originalReplaceState = history.replaceState.bind(history)
const stop = () => {
  if (stopped) return
  stopped = true
  window.clearTimeout(notifyTimer)
  observer?.disconnect()
  history.pushState = originalPushState
  history.replaceState = originalReplaceState
}
const notifyIfChanged = () => {
  if (!contextAlive()) { stop(); return }
  const signature = `${location.href}|${extractLinkedInJob().position}`
  if (signature === lastSignature) return
  lastSignature = signature
  try {
    void chrome.runtime.sendMessage({ type: 'JOBVAULT_LINKEDIN_JOB_CHANGED' }).catch(stop)
  } catch {
    stop()
  }
}
observer = new MutationObserver(() => {
  if (!contextAlive()) { stop(); return }
  window.clearTimeout(notifyTimer)
  notifyTimer = window.setTimeout(() => {
    notifyIfChanged()
  }, 80)
})
observer.observe(document.documentElement, { childList: true, subtree: true })

const scheduleHistoryNotification = () => {
  window.setTimeout(notifyIfChanged, 0)
  window.setTimeout(notifyIfChanged, 150)
}
history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
  originalPushState(data, unused, url)
  scheduleHistoryNotification()
}
history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
  originalReplaceState(data, unused, url)
  scheduleHistoryNotification()
}
window.addEventListener('popstate', () => window.setTimeout(notifyIfChanged, 0))
