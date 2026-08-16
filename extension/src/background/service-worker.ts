chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  chrome.storage.sync.get('backendUrl').then(value => {
    if (!value.backendUrl) chrome.storage.sync.set({ backendUrl: 'http://127.0.0.1:8000' })
  })
})

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})
