// Main Module - Event handlers and initialization
// Depends on: namespace.js, parser.js, dedup.js, ui.js, chart.js

// Chart mode state (disabled by default)
let chartModeEnabled = false;
let currentHighlightedTable = null;

function handleTableClick(e) {
  // Only handle clicks when chart mode is enabled
  if (!chartModeEnabled) return;

  const table = e.target.closest('table');
  if (!table) return;

  const rows = table.querySelectorAll('tr');
  if (rows.length < 2) return;

  e.preventDefault();
  e.stopPropagation();

  // Parse the table
  const parser = new TC.TableParser(table);
  TC.parsedData = parser.parse();

  console.log('Parsed table data:', TC.parsedData);

  if (TC.parsedData.seriesByColumn.length === 0 && TC.parsedData.seriesByRow.length === 0) {
    alert('Could not find numeric data in this table. The table may have an unsupported structure.');
    return;
  }

  // Reset view mode and show modal
  TC.viewMode = 'columns';
  TC.showModal();

  // Reset toggle buttons
  document.getElementById('table-chart-view-columns').classList.add('active');
  document.getElementById('table-chart-view-rows').classList.remove('active');

  // Initialize label column selector and rebuild series
  TC.populateLabelColumnSelector();
  TC.rebuildSeriesFromSelection();

  TC.updateInfo();
  TC.updateViewHint();
  TC.populateSeriesSelector();
  TC.populateRowSelector();
  TC.updateChart();
}

function handleMouseEnter(e) {
  // Only highlight when chart mode is enabled
  if (!chartModeEnabled) return;

  const table = e.target.closest('table');
  if (table && table !== currentHighlightedTable) {
    // Remove highlight from previous table if any
    if (currentHighlightedTable) {
      currentHighlightedTable.classList.remove('table-chart-highlight');
    }
    table.classList.add('table-chart-highlight');
    currentHighlightedTable = table;
  }
}

function handleMouseLeave(e) {
  // Only handle when chart mode is enabled
  if (!chartModeEnabled) return;

  const table = e.target;
  if (table.tagName === 'TABLE') {
    // Check if we're actually leaving the table (not entering a child)
    const relatedTarget = e.relatedTarget;
    if (!relatedTarget || !table.contains(relatedTarget)) {
      table.classList.remove('table-chart-highlight');
      if (currentHighlightedTable === table) {
        currentHighlightedTable = null;
      }
    }
  }
}

// Enable chart mode - attach event listeners
function enableChartMode() {
  chartModeEnabled = true;
  console.log('Chart mode enabled');
}

// Disable chart mode - remove highlights
function disableChartMode() {
  chartModeEnabled = false;
  // Remove any existing highlight
  if (currentHighlightedTable) {
    currentHighlightedTable.classList.remove('table-chart-highlight');
    currentHighlightedTable = null;
  }
  console.log('Chart mode disabled');
}

// Initialize event listeners (always attached, but handlers check chartModeEnabled)
document.addEventListener('click', handleTableClick);
document.addEventListener('mouseover', handleMouseEnter);
document.addEventListener('mouseout', handleMouseLeave);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    TC.closeModal();
  }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'chartModeChanged') {
    if (message.enabled) {
      enableChartMode();
    } else {
      disableChartMode();
    }
  }
});

// Request initial state from background
chrome.runtime.sendMessage({ type: 'getChartModeState' }, (response) => {
  if (response && response.enabled) {
    enableChartMode();
  }
});

console.log('Table to Chart extension loaded (v4 - opt-in mode)');
