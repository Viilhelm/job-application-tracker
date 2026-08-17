import { descriptionFor, extractLinkedInJob, jobIdFromUrl } from './linkedin-extractor'

const runtimeId = globalThis.chrome?.runtime?.id
const contextAlive = () => Boolean(runtimeId && globalThis.chrome?.runtime?.id === runtimeId)

/**
 * The panel for the newly selected job is only mounted after LinkedIn swaps it in, and the previous
 * job's panel can still be present meanwhile. Waiting for the id that matches the URL is what keeps
 * one job's description from being saved under another job's URL.
 */
const readyFor = (jobId: string) => {
  const description = descriptionFor(document, jobId)
  return Boolean(description && (description.textContent || '').trim().length > 40)
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'JOBVAULT_EXTRACT_CURRENT_JOB_V2') return
  const jobId = jobIdFromUrl(location.href)
  // Only inside the job panel: a page-wide search hits the "see more" of company feed posts instead.
  const expand = [...(descriptionFor(document, jobId)?.querySelectorAll<HTMLElement>('button, [role="button"]') || [])]
    .find(button => /(更多|顯示更多|显示更多|see more|show more)/i.test(button.textContent?.trim() || ''))
  expand?.click()
  const respondWhenReady = (attempt = 0) => {
    if (!contextAlive()) return
    if (readyFor(jobId) || attempt >= 20) sendResponse(extractLinkedInJob(document, jobId))
    else window.setTimeout(() => respondWhenReady(attempt + 1), 150)
  }
  window.setTimeout(() => respondWhenReady(), expand ? 400 : 0)
  return true
})

let notifyTimer = 0
// Keyed on the rendered panel, not on the URL: LinkedIn updates the URL before the panel catches up.
const signature = () => {
  const jobId = jobIdFromUrl(location.href)
  return `${jobId}|${readyFor(jobId)}`
}
let lastSignature = signature()
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
  const current = signature()
  if (current === lastSignature) return
  lastSignature = current
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
