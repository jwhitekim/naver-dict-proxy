// The side panel is disabled by default for every tab. Clicking the toolbar
// icon (or its Alt+W shortcut) enables and opens it only for that tab,
// so it doesn't follow you when you switch to a different tab.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: false });
});

// chrome.sidePanel has no way to ask "is it currently open" or a close()
// call — enabled:false is the only way to close one, so toggling means
// tracking open/closed ourselves per tab. This can drift out of sync if the
// panel is closed via its own X button instead of Alt+W (no event
// fires for that), in which case one Alt+W press is spent resyncing
// before it opens again.
const openTabs = new Set();

// Don't await these — chaining them after a resolved promise loses the
// "user gesture" context Chrome requires for sidePanel.open(), causing
// "may only be called in response to a user gesture" even from a real click.
chrome.action.onClicked.addListener((tab) => {
  if (openTabs.has(tab.id)) {
    chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false });
    openTabs.delete(tab.id);
  } else {
    // Only one tab may have the panel open at a time — close it in any
    // other tab before opening it here.
    for (const otherTabId of openTabs) {
      chrome.sidePanel.setOptions({ tabId: otherTabId, enabled: false });
    }
    openTabs.clear();
    chrome.sidePanel.setOptions({ tabId: tab.id, path: 'popup.html', enabled: true });
    chrome.sidePanel.open({ tabId: tab.id });
    openTabs.add(tab.id);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => openTabs.delete(tabId));
