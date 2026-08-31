import { detectMailClient, extractEmail } from './mail-extractor'

const runtimeId = globalThis.chrome?.runtime?.id
const contextAlive = () => Boolean(runtimeId && globalThis.chrome?.runtime?.id === runtimeId)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'JOBVAULT_EXTRACT_EMAIL_V1') return
  const client = detectMailClient(location.hostname)
  /*
   * The reading pane mounts after the shell, and Outlook fills the subject element later still, so
   * reading as soon as the body appears can capture a message whose subject is not written yet.
   * Keep waiting for a subject, but not indefinitely: some messages genuinely have none, and the
   * record is titled from the sender and date in that case.
   */
  const respondWhenReady = (attempt = 0) => {
    if (!contextAlive()) return
    const email = extractEmail(document, client)
    const settled = email && (email.subject || attempt >= 8)
    if (settled || attempt >= 20) sendResponse(email)
    else window.setTimeout(() => respondWhenReady(attempt + 1), 150)
  }
  respondWhenReady()
  return true
})
