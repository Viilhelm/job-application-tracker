import { detectMailClient, extractEmail } from './mail-extractor'

const runtimeId = globalThis.chrome?.runtime?.id
const contextAlive = () => Boolean(runtimeId && globalThis.chrome?.runtime?.id === runtimeId)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'JOBVAULT_EXTRACT_EMAIL_V1') return
  const client = detectMailClient(location.hostname)
  // Both clients mount the reading pane after the shell, so a first read can legitimately find nothing.
  const respondWhenReady = (attempt = 0) => {
    if (!contextAlive()) return
    const email = extractEmail(document, client)
    if (email || attempt >= 12) sendResponse(email)
    else window.setTimeout(() => respondWhenReady(attempt + 1), 150)
  }
  respondWhenReady()
  return true
})
