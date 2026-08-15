// The side panel is disabled by default for every tab. Clicking the toolbar
// icon (or its Alt+D shortcut) enables and opens it only for that tab, so it
// doesn't follow you when you switch to a different tab.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: false });
});

// Don't await these — chaining them after a resolved promise loses the
// "user gesture" context Chrome requires for sidePanel.open(), causing
// "may only be called in response to a user gesture" even from a real click.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.setOptions({ tabId: tab.id, path: 'popup.html', enabled: true });
  chrome.sidePanel.open({ tabId: tab.id });
});
