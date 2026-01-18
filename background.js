// Background service worker - manages chart mode toggle per tab

// Track enabled state per tab
const tabStates = new Map();

// Create icon with green outline
async function createOutlinedIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Load the original icon
  const response = await fetch(chrome.runtime.getURL(`icon${size}.png`));
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  // Draw original icon
  ctx.drawImage(bitmap, 0, 0, size, size);

  // Draw green outline
  const borderWidth = Math.max(2, Math.floor(size / 16));
  ctx.strokeStyle = '#4CAF50';
  ctx.lineWidth = borderWidth;
  ctx.strokeRect(borderWidth / 2, borderWidth / 2, size - borderWidth, size - borderWidth);

  return ctx.getImageData(0, 0, size, size);
}

// Update the action button appearance
async function updateActionButton(tabId, enabled) {
  const title = enabled ? 'Chart Mode: ON' : 'Chart Mode: OFF';
  await chrome.action.setTitle({ tabId, title });

  if (enabled) {
    // Set icon with green outline
    const imageData = {
      16: await createOutlinedIcon(16),
      48: await createOutlinedIcon(48)
    };
    await chrome.action.setIcon({ tabId, imageData });
  } else {
    // Reset to default icon
    await chrome.action.setIcon({
      tabId,
      path: {
        16: 'icon16.png',
        48: 'icon48.png',
        128: 'icon128.png'
      }
    });
  }
}

// Handle toolbar button click
chrome.action.onClicked.addListener(async (tab) => {
  const currentState = tabStates.get(tab.id) || false;
  const newState = !currentState;
  tabStates.set(tab.id, newState);

  await updateActionButton(tab.id, newState);

  // Notify content script of state change
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'chartModeChanged',
      enabled: newState
    });
  } catch (e) {
    // Content script may not be loaded yet
    console.log('Could not send message to tab:', e.message);
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

// Handle content script requesting current state
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getChartModeState' && sender.tab) {
    const enabled = tabStates.get(sender.tab.id) || false;
    sendResponse({ enabled });
  }
  return true;
});
