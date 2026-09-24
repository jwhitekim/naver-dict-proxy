// Keep one global panel for the browser window. A global panel follows the
// user across tabs; Chrome also owns the open/close toggle state, so it stays
// in sync when the panel is closed from its native X button.
Promise.all([
  chrome.sidePanel.setOptions({ path: 'popup.html', enabled: true }),
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
]).catch((error) => console.error('Failed to configure the side panel:', error));
