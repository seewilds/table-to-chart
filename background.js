// Background service worker - manages chart mode toggle per tab

// Scripts and styles to inject
const SCRIPTS = [
  'chart.min.js',
  'src/namespace.js',
  'src/dedup.js',
  'src/parser.js',
  'src/chart.js',
  'src/ui.js',
  'src/main.js'
];
const STYLES = ['styles.css'];

// Get tab state from storage
async function getTabState(tabId) {
  const result = await chrome.storage.session.get(`tab_${tabId}`);
  return result[`tab_${tabId}`] || false;
}

// Set tab state in storage
async function setTabState(tabId, enabled) {
  await chrome.storage.session.set({ [`tab_${tabId}`]: enabled });
}

// Remove tab state from storage
async function removeTabState(tabId) {
  await chrome.storage.session.remove(`tab_${tabId}`);
}

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

// Check if scripts are already injected in a tab
async function isInjected(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => typeof window.TableChart !== 'undefined'
    });
    return results[0]?.result === true;
  } catch (e) {
    return false;
  }
}

// Inject content scripts and styles
async function injectScripts(tabId) {
  // Check if already injected
  if (await isInjected(tabId)) {
    // Just enable chart mode
    await chrome.tabs.sendMessage(tabId, { type: 'chartModeChanged', enabled: true });
    return;
  }

  try {
    // Inject CSS first
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: STYLES
    });

    // Inject JS files in order
    await chrome.scripting.executeScript({
      target: { tabId },
      files: SCRIPTS
    });

    // Enable chart mode after injection
    await chrome.tabs.sendMessage(tabId, { type: 'chartModeChanged', enabled: true });
  } catch (e) {
    console.error('Failed to inject scripts:', e);
  }
}

// Disable chart mode (scripts stay injected but inactive)
async function disableChartMode(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'chartModeChanged', enabled: false });
  } catch (e) {
    // Content script not loaded, nothing to disable
  }
}

// Handle toolbar button click
chrome.action.onClicked.addListener(async (tab) => {
  const currentState = await getTabState(tab.id);
  const newState = !currentState;
  await setTabState(tab.id, newState);
  await updateActionButton(tab.id, newState);

  if (newState) {
    await injectScripts(tab.id);
  } else {
    await disableChartMode(tab.id);
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  removeTabState(tabId);
});

// Re-inject scripts on navigation/reload when chart mode is enabled
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const enabled = await getTabState(tabId);
    if (enabled) {
      await injectScripts(tabId);
    }
    await updateActionButton(tabId, enabled);
  }
});

// Restore icon state when tab is activated (handles service worker suspension)
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const enabled = await getTabState(tabId);
  await updateActionButton(tabId, enabled);
});

// Handle content script requesting current state
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getChartModeState' && sender.tab) {
    getTabState(sender.tab.id).then(enabled => {
      sendResponse({ enabled });
    });
    return true; // Keep channel open for async response
  }
});
