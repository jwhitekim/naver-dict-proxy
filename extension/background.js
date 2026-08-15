// The side panel is disabled by default for every tab. Clicking the toolbar
// icon (or its Alt+D shortcut) enables and opens it only for that tab, so it
// doesn't follow you when you switch to a different tab.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: false });
});

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'popup.html', enabled: true });
  await chrome.sidePanel.open({ tabId: tab.id });
});
