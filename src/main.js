// Main Module - Event handlers and initialization
// Depends on: namespace.js, parser.js, dedup.js, ui.js, chart.js

function handleTableClick(e) {
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

  TC.updateInfo();
  TC.updateViewHint();
  TC.populateSeriesSelector();
  TC.updateChart();
}

function handleMouseOver(e) {
  const table = e.target.closest('table');
  if (table && !table.classList.contains('table-chart-highlight')) {
    table.classList.add('table-chart-highlight');
  }
}

function handleMouseOut(e) {
  const table = e.target.closest('table');
  if (table) {
    table.classList.remove('table-chart-highlight');
  }
}

// Initialize event listeners
document.addEventListener('click', handleTableClick);
document.addEventListener('mouseover', handleMouseOver);
document.addEventListener('mouseout', handleMouseOut);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    TC.closeModal();
  }
});

console.log('Table to Chart extension loaded (v3 - modular)');
