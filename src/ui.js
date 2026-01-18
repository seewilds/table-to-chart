// UI Module - Modal creation and management
// Depends on: namespace.js, chart.js

function createModal() {
  if (TC.modal) return TC.modal;

  TC.modal = document.createElement('div');
  TC.modal.id = 'table-chart-modal';
  TC.modal.innerHTML = `
    <div class="table-chart-overlay"></div>
    <div class="table-chart-container">
      <div class="table-chart-info" id="table-chart-info">
        <span class="table-chart-info-text"></span>
        <button class="table-chart-close">&times;</button>
      </div>
      <div class="table-chart-canvas-container">
        <canvas id="table-chart-canvas"></canvas>
      </div>
      <div class="table-chart-controls">
        <div class="table-chart-toolbar">
          <div class="toolbar-group">
            <span class="toolbar-label">Chart Type:</span>
            <select id="table-chart-type">
              <option value="bar">Bar</option>
              <option value="line">Line</option>
              <option value="pie">Pie</option>
              <option value="doughnut">Doughnut</option>
              <option value="radar">Radar</option>
              <option value="polarArea">Polar Area</option>
            </select>
          </div>
          <div class="toolbar-group">
            <span class="toolbar-label">Plot:</span>
            <div class="btn-group">
              <button id="table-chart-view-columns" class="toggle-btn active">Columns</button>
              <button id="table-chart-view-rows" class="toggle-btn">Rows</button>
            </div>
          </div>
          <div class="toolbar-group">
            <span class="toolbar-label">Options:</span>
            <div class="btn-group">
              <button id="table-chart-horizontal" class="toggle-btn">Horizontal</button>
              <button id="table-chart-stacked" class="toggle-btn">Stacked</button>
            </div>
          </div>
          <div class="toolbar-group">
            <span class="toolbar-label">Palette:</span>
            <select id="table-chart-palette">
              <option value="default">Default</option>
              <option value="pastel">Pastel</option>
              <option value="bold">Bold</option>
              <option value="monochrome">Monochrome</option>
              <option value="cyberpunk">Cyberpunk</option>
              <option value="forest">Forest</option>
            </select>
          </div>
          <div class="toolbar-group">
            <span id="table-chart-series-label" class="toolbar-label">Series:</span>
            <select id="table-chart-series" multiple size="4"></select>
          </div>
          <div class="toolbar-group" id="table-chart-label-group">
            <span class="toolbar-label">Labels:</span>
            <select id="table-chart-label-column"></select>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(TC.modal);

  // Event listeners
  TC.modal.querySelector('.table-chart-close').addEventListener('click', closeModal);
  TC.modal.querySelector('.table-chart-overlay').addEventListener('click', closeModal);
  TC.modal.querySelector('#table-chart-type').addEventListener('change', updateChart);
  TC.modal.querySelector('#table-chart-palette').addEventListener('change', updateChart);
  TC.modal.querySelector('#table-chart-series').addEventListener('change', updateChart);
  TC.modal.querySelector('#table-chart-label-column').addEventListener('change', onLabelColumnChange);

  // Toggle buttons
  TC.modal.querySelector('#table-chart-view-columns').addEventListener('click', () => setViewMode('columns'));
  TC.modal.querySelector('#table-chart-view-rows').addEventListener('click', () => setViewMode('rows'));
  TC.modal.querySelector('#table-chart-horizontal').addEventListener('click', toggleOption);
  TC.modal.querySelector('#table-chart-stacked').addEventListener('click', toggleOption);

  // Drag functionality
  const infoBar = TC.modal.querySelector('.table-chart-info');
  const container = TC.modal.querySelector('.table-chart-container');

  infoBar.addEventListener('mousedown', (e) => {
    if (e.target.closest('.table-chart-close')) return;
    TC.isDragging = true;
    const rect = container.getBoundingClientRect();
    TC.dragOffsetX = e.clientX - rect.left;
    TC.dragOffsetY = e.clientY - rect.top;
    container.classList.add('dragging');
    // Set initial position with !important to override stylesheet
    container.style.setProperty('left', rect.left + 'px', 'important');
    container.style.setProperty('top', rect.top + 'px', 'important');
    container.style.setProperty('transform', 'none', 'important');
  });

  document.addEventListener('mousemove', (e) => {
    if (!TC.isDragging) return;
    const x = e.clientX - TC.dragOffsetX;
    const y = e.clientY - TC.dragOffsetY;
    container.style.setProperty('left', x + 'px', 'important');
    container.style.setProperty('top', y + 'px', 'important');
  });

  document.addEventListener('mouseup', () => {
    if (TC.isDragging) {
      TC.isDragging = false;
      container.classList.remove('dragging');
    }
  });

  return TC.modal;
}

function toggleOption(e) {
  e.target.classList.toggle('active');
  updateChart();
}

function setViewMode(mode) {
  TC.viewMode = mode;

  // Update toggle button states
  const colBtn = document.getElementById('table-chart-view-columns');
  const rowBtn = document.getElementById('table-chart-view-rows');

  if (mode === 'columns') {
    colBtn.classList.add('active');
    rowBtn.classList.remove('active');
  } else {
    colBtn.classList.remove('active');
    rowBtn.classList.add('active');
  }

  // Update the view
  updateViewHint();
  populateSeriesSelector();
  updateChart();
}

function updateViewHint() {
  // View info now shown in the info bar
}

function closeModal() {
  if (TC.modal) {
    TC.modal.classList.remove('active');
    if (TC.chartInstance) {
      TC.chartInstance.destroy();
      TC.chartInstance = null;
    }
  }
}

function showModal() {
  createModal();
  TC.modal.classList.add('active');
}

// Update the UI with parsed data info
function updateInfo() {
  const infoText = document.querySelector('.table-chart-info-text');
  if (!TC.parsedData || !infoText) return;

  const metaTitle = TC.parsedData.columnMetadata.title;
  const metaInfo = metaTitle ? `<strong>${metaTitle}</strong> | ` : '';

  infoText.innerHTML = `${metaInfo}${TC.parsedData.rowLabels.length} rows × ${TC.parsedData.dataColumnHeaders.length} columns`;
}

// Populate series selector based on current view mode
function populateSeriesSelector() {
  const select = document.getElementById('table-chart-series');
  const label = document.getElementById('table-chart-series-label');
  const view = getCurrentView();

  if (!view) return;

  select.innerHTML = '';
  label.textContent = TC.viewMode === 'columns' ? 'Column Series:' : 'Row Series:';

  view.series.forEach((series, index) => {
    const option = document.createElement('option');
    option.value = index;
    // Use displayName (deduplicated) for cleaner UI
    option.textContent = series.displayName || series.name;
    // Select first few by default, but not too many
    option.selected = index < Math.min(5, view.series.length);
    select.appendChild(option);
  });

  // Adjust size based on number of series
  select.size = Math.min(Math.max(view.series.length, 2), 8);
}

// Get selected series indices
function getSelectedSeries() {
  const select = document.getElementById('table-chart-series');
  return Array.from(select.selectedOptions).map(opt => parseInt(opt.value));
}

// Populate the label column dropdown with all columns
function populateLabelColumnSelector() {
  const select = document.getElementById('table-chart-label-column');
  if (!TC.parsedData || !TC.parsedData.allColumns) return;

  select.innerHTML = '';

  TC.parsedData.allColumns.forEach(col => {
    const option = document.createElement('option');
    option.value = col.index;

    // Build display text with hints
    let displayText = col.header;
    if (col.isNumericSequence) {
      displayText += ' (1,2,3...)';
    } else if (col.isTextOnly) {
      displayText += ' (text)';
    } else if (col.numericRatio > 0.5) {
      displayText += ' (numeric)';
    }

    option.textContent = displayText;
    option.selected = col.index === TC.parsedData.labelColumnIndex;
    select.appendChild(option);
  });
}

// Get the currently selected label column index
function getSelectedLabelColumn() {
  const select = document.getElementById('table-chart-label-column');
  return parseInt(select.value);
}

// Handle label column change
function onLabelColumnChange() {
  TC.rebuildSeriesFromSelection();
  populateSeriesSelector();
  TC.updateChart();
}

// Export to namespace
window.TableChart.createModal = createModal;
window.TableChart.showModal = showModal;
window.TableChart.closeModal = closeModal;
window.TableChart.setViewMode = setViewMode;
window.TableChart.toggleOption = toggleOption;
window.TableChart.updateViewHint = updateViewHint;
window.TableChart.updateInfo = updateInfo;
window.TableChart.populateSeriesSelector = populateSeriesSelector;
window.TableChart.getSelectedSeries = getSelectedSeries;
window.TableChart.populateLabelColumnSelector = populateLabelColumnSelector;
window.TableChart.getSelectedLabelColumn = getSelectedLabelColumn;
window.TableChart.onLabelColumnChange = onLabelColumnChange;
