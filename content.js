(function() {
  'use strict';

  let modal = null;
  let chartInstance = null;
  let parsedData = null;
  let viewMode = 'columns'; // 'columns' = column headers as series, 'rows' = row labels as series

  // ============================================================
  // INTELLIGENT TABLE PARSER
  // ============================================================

  class TableParser {
    constructor(table) {
      this.table = table;
      this.grid = [];
      this.rowTypes = [];
      this.columnTypes = [];
      this.headerRowCount = 0;
      this.labelColumnCount = 0;
    }

    // Build a normalized grid handling colspan/rowspan
    buildGrid() {
      const rows = this.table.querySelectorAll('tr');
      const grid = [];
      const spans = {}; // Track cells that span into future rows

      rows.forEach((row, rowIndex) => {
        grid[rowIndex] = grid[rowIndex] || [];
        const cells = row.querySelectorAll('td, th');
        let colIndex = 0;

        cells.forEach(cell => {
          // Skip past any cells that are filled by rowspan from above
          while (spans[`${rowIndex},${colIndex}`]) {
            grid[rowIndex][colIndex] = spans[`${rowIndex},${colIndex}`];
            delete spans[`${rowIndex},${colIndex}`];
            colIndex++;
          }

          const colspan = parseInt(cell.getAttribute('colspan')) || 1;
          const rowspan = parseInt(cell.getAttribute('rowspan')) || 1;
          const text = cell.textContent.trim();
          const isHeader = cell.tagName.toLowerCase() === 'th';

          const cellData = {
            text,
            isHeader,
            colspan,
            rowspan,
            element: cell,
            numeric: this.parseNumeric(text),
            originalRow: rowIndex,
            originalCol: colIndex
          };

          // Fill this cell and any colspan cells
          for (let c = 0; c < colspan; c++) {
            grid[rowIndex][colIndex + c] = cellData;

            // Register rowspan for future rows
            for (let r = 1; r < rowspan; r++) {
              spans[`${rowIndex + r},${colIndex + c}`] = cellData;
            }
          }

          colIndex += colspan;
        });

        // Fill any remaining spans at end of row
        while (spans[`${rowIndex},${colIndex}`]) {
          grid[rowIndex][colIndex] = spans[`${rowIndex},${colIndex}`];
          delete spans[`${rowIndex},${colIndex}`];
          colIndex++;
        }
      });

      this.grid = grid;
      return grid;
    }

    // Parse a string to numeric, handling various formats
    parseNumeric(str) {
      if (!str || str === '' || str === '-' || str === 'N/A' || str === 'n/a') {
        return { value: NaN, isNumeric: false };
      }

      // Remove common formatting
      let cleaned = str
        .replace(/[$€£¥₹₽₩]/g, '')  // Currency symbols
        .replace(/,/g, '')            // Thousands separators
        .replace(/\s/g, '')           // Whitespace
        .replace(/[()]/g, match => match === '(' ? '-' : '') // Accounting negative
        .replace(/%$/, '');           // Trailing percent

      // Check for footnote markers like "1,234.5 F" or "value *"
      cleaned = cleaned.replace(/[a-zA-Z*†‡§¶]+$/, '').trim();

      const num = parseFloat(cleaned);

      // Check if it looks like a year (4 digits between 1900-2100)
      const yearMatch = str.match(/^(19|20)\d{2}$/);

      return {
        value: num,
        isNumeric: !isNaN(num) && isFinite(num),
        isYear: yearMatch !== null,
        isPercentage: str.includes('%'),
        original: str
      };
    }

    // Classify each row as header, subheader, or data
    classifyRows() {
      const rowTypes = [];

      this.grid.forEach((row, rowIndex) => {
        if (!row || row.length === 0) {
          rowTypes[rowIndex] = 'empty';
          return;
        }

        const stats = this.analyzeRow(row);

        // Decision logic for row type
        if (stats.allHeaders) {
          rowTypes[rowIndex] = 'header';
        } else if (stats.numericRatio > 0.5 && stats.numericCount >= 2) {
          rowTypes[rowIndex] = 'data';
        } else if (stats.hasSpanningCell && stats.numericRatio < 0.3) {
          rowTypes[rowIndex] = 'header';
        } else if (stats.uniqueCellCount === 1 && row.length > 2) {
          rowTypes[rowIndex] = 'header'; // Single value spanning multiple columns
        } else if (stats.numericRatio === 0 && rowIndex < this.grid.length / 2) {
          rowTypes[rowIndex] = 'header';
        } else if (stats.numericRatio > 0.3) {
          rowTypes[rowIndex] = 'data';
        } else {
          rowTypes[rowIndex] = rowIndex < 3 ? 'header' : 'data';
        }
      });

      // Find the transition point from headers to data
      let lastHeaderRow = -1;
      for (let i = 0; i < rowTypes.length; i++) {
        if (rowTypes[i] === 'header') {
          lastHeaderRow = i;
        } else if (rowTypes[i] === 'data' && lastHeaderRow >= 0) {
          break;
        }
      }

      this.headerRowCount = lastHeaderRow + 1;
      this.rowTypes = rowTypes;
      return rowTypes;
    }

    // Analyze statistics for a row
    analyzeRow(row) {
      let numericCount = 0;
      let headerCellCount = 0;
      let hasSpanningCell = false;
      const uniqueCells = new Set();

      row.forEach(cell => {
        if (!cell) return;

        uniqueCells.add(cell);
        if (cell.numeric.isNumeric && !cell.numeric.isYear) {
          numericCount++;
        }
        if (cell.isHeader) {
          headerCellCount++;
        }
        if (cell.colspan > 1 || cell.rowspan > 1) {
          hasSpanningCell = true;
        }
      });

      return {
        numericCount,
        numericRatio: numericCount / row.length,
        allHeaders: headerCellCount === row.length,
        hasSpanningCell,
        uniqueCellCount: uniqueCells.size
      };
    }

    // Classify columns as label or data
    classifyColumns() {
      if (this.grid.length === 0) return [];

      const colCount = Math.max(...this.grid.map(r => r ? r.length : 0));
      const columnTypes = [];

      for (let col = 0; col < colCount; col++) {
        let numericCount = 0;
        let textCount = 0;
        let dataRowCount = 0;

        this.grid.forEach((row, rowIndex) => {
          if (this.rowTypes[rowIndex] !== 'data' || !row || !row[col]) return;

          dataRowCount++;
          const cell = row[col];
          if (cell.numeric.isNumeric && !cell.numeric.isYear) {
            numericCount++;
          } else if (cell.text && cell.text.length > 0) {
            textCount++;
          }
        });

        if (dataRowCount === 0) {
          columnTypes[col] = 'unknown';
        } else if (numericCount / dataRowCount > 0.5) {
          columnTypes[col] = 'numeric';
        } else {
          columnTypes[col] = 'label';
        }
      }

      // Count label columns from the left
      this.labelColumnCount = 0;
      for (let i = 0; i < columnTypes.length; i++) {
        if (columnTypes[i] === 'label') {
          this.labelColumnCount = i + 1;
        } else {
          break;
        }
      }

      // Ensure at least 1 label column if we have data
      if (this.labelColumnCount === 0 && columnTypes.some(t => t === 'numeric')) {
        this.labelColumnCount = 1;
        columnTypes[0] = 'label';
      }

      this.columnTypes = columnTypes;
      return columnTypes;
    }

    // Build column headers from header rows
    buildColumnHeaders() {
      const headers = [];
      const colCount = Math.max(...this.grid.map(r => r ? r.length : 0));

      for (let col = 0; col < colCount; col++) {
        const headerParts = [];

        for (let row = 0; row < this.headerRowCount; row++) {
          const cell = this.grid[row] && this.grid[row][col];
          if (cell && cell.text) {
            // Avoid duplicating text from spanning cells
            const lastPart = headerParts[headerParts.length - 1];
            if (cell.text !== lastPart) {
              headerParts.push(cell.text);
            }
          }
        }

        headers[col] = headerParts.length > 0
          ? headerParts.join(' > ')
          : `Column ${col + 1}`;
      }

      return headers;
    }

    // Extract the final parsed data structure
    parse() {
      this.buildGrid();
      this.classifyRows();
      this.classifyColumns();

      const columnHeaders = this.buildColumnHeaders();
      const dataRows = [];
      const rowLabels = [];

      // Extract data rows
      this.grid.forEach((row, rowIndex) => {
        if (this.rowTypes[rowIndex] !== 'data' || !row) return;

        // Build row label from label columns
        const labelParts = [];
        for (let c = 0; c < this.labelColumnCount; c++) {
          if (row[c] && row[c].text) {
            labelParts.push(row[c].text);
          }
        }
        rowLabels.push(labelParts.join(' - ') || `Row ${dataRows.length + 1}`);

        // Extract numeric values from data columns
        const values = [];
        for (let c = this.labelColumnCount; c < row.length; c++) {
          const cell = row[c];
          values.push({
            value: cell ? cell.numeric.value : NaN,
            display: cell ? cell.text : '',
            isNumeric: cell ? cell.numeric.isNumeric : false
          });
        }
        dataRows.push(values);
      });

      // Get data column headers (excluding label columns)
      const dataColumnHeaders = columnHeaders.slice(this.labelColumnCount);

      // Build series by columns (each data column becomes a series)
      const seriesByColumn = [];
      for (let c = 0; c < dataColumnHeaders.length; c++) {
        const seriesData = dataRows.map(row => {
          const cell = row[c];
          return cell ? cell.value : NaN;
        });

        const numericCount = seriesData.filter(v => !isNaN(v)).length;
        if (numericCount > 0) {
          seriesByColumn.push({
            name: dataColumnHeaders[c],
            data: seriesData,
            index: c
          });
        }
      }

      // Build series by rows (each data row becomes a series)
      const seriesByRow = [];
      rowLabels.forEach((label, rowIdx) => {
        const seriesData = dataRows[rowIdx].map(cell => cell.value);
        const numericCount = seriesData.filter(v => !isNaN(v)).length;
        if (numericCount > 0) {
          seriesByRow.push({
            name: label,
            data: seriesData,
            index: rowIdx
          });
        }
      });

      return {
        rowLabels,
        columnHeaders,
        dataColumnHeaders,
        seriesByColumn,
        seriesByRow,
        dataRows,
        headerRowCount: this.headerRowCount,
        labelColumnCount: this.labelColumnCount,
        rawGrid: this.grid,
        rowTypes: this.rowTypes,
        columnTypes: this.columnTypes
      };
    }
  }

  // ============================================================
  // DATA VIEW HELPERS
  // ============================================================

  // Get the current view's series and labels based on viewMode
  function getCurrentView() {
    if (!parsedData) return null;

    if (viewMode === 'columns') {
      // Columns as series, rows as X-axis labels
      return {
        series: parsedData.seriesByColumn,
        labels: parsedData.rowLabels,
        seriesLabel: 'Columns',
        axisLabel: 'Rows'
      };
    } else {
      // Rows as series, columns as X-axis labels
      return {
        series: parsedData.seriesByRow,
        labels: parsedData.dataColumnHeaders,
        seriesLabel: 'Rows',
        axisLabel: 'Columns'
      };
    }
  }

  // ============================================================
  // MODAL AND CHART RENDERING
  // ============================================================

  function createModal() {
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'table-chart-modal';
    modal.innerHTML = `
      <div class="table-chart-overlay"></div>
      <div class="table-chart-container">
        <div class="table-chart-header">
          <h3>Table Data Visualization</h3>
          <button class="table-chart-close">&times;</button>
        </div>
        <div class="table-chart-info" id="table-chart-info"></div>
        <div class="table-chart-controls">
          <div class="table-chart-control-row">
            <label>
              Chart Type:
              <select id="table-chart-type">
                <option value="bar">Bar Chart</option>
                <option value="line">Line Chart</option>
                <option value="pie">Pie Chart</option>
                <option value="doughnut">Doughnut Chart</option>
                <option value="radar">Radar Chart</option>
                <option value="polarArea">Polar Area</option>
              </select>
            </label>
            <label>
              <input type="checkbox" id="table-chart-horizontal">
              Horizontal
            </label>
            <label>
              <input type="checkbox" id="table-chart-stacked">
              Stacked
            </label>
          </div>
          <div class="table-chart-control-row table-chart-view-row">
            <span class="table-chart-view-label">View Data:</span>
            <div class="table-chart-toggle">
              <button id="table-chart-view-columns" class="active">
                <span class="toggle-icon">↓</span> By Columns
              </button>
              <button id="table-chart-view-rows">
                <span class="toggle-icon">→</span> By Rows
              </button>
            </div>
            <span class="table-chart-view-hint" id="table-chart-view-hint"></span>
          </div>
          <div class="table-chart-control-row">
            <label>
              <span id="table-chart-series-label">Data Series:</span>
              <select id="table-chart-series" multiple size="4"></select>
            </label>
            <div class="table-chart-series-hint">Hold Ctrl/Cmd to select multiple</div>
          </div>
        </div>
        <div class="table-chart-canvas-container">
          <canvas id="table-chart-canvas"></canvas>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    modal.querySelector('.table-chart-close').addEventListener('click', closeModal);
    modal.querySelector('.table-chart-overlay').addEventListener('click', closeModal);
    modal.querySelector('#table-chart-type').addEventListener('change', updateChart);
    modal.querySelector('#table-chart-series').addEventListener('change', updateChart);
    modal.querySelector('#table-chart-horizontal').addEventListener('change', updateChart);
    modal.querySelector('#table-chart-stacked').addEventListener('change', updateChart);

    // View mode toggle
    modal.querySelector('#table-chart-view-columns').addEventListener('click', () => setViewMode('columns'));
    modal.querySelector('#table-chart-view-rows').addEventListener('click', () => setViewMode('rows'));

    return modal;
  }

  function setViewMode(mode) {
    viewMode = mode;

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
    const hint = document.getElementById('table-chart-view-hint');
    const view = getCurrentView();
    if (!view) return;

    if (viewMode === 'columns') {
      hint.textContent = `X-axis: ${parsedData.rowLabels.length} rows | Series: ${view.series.length} columns`;
    } else {
      hint.textContent = `X-axis: ${parsedData.dataColumnHeaders.length} columns | Series: ${view.series.length} rows`;
    }
  }

  function closeModal() {
    if (modal) {
      modal.classList.remove('active');
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
    }
  }

  function showModal() {
    createModal();
    modal.classList.add('active');
  }

  // Generate colors for chart
  function generateColors(count, alpha = 0.8) {
    const baseColors = [
      [54, 162, 235],
      [255, 99, 132],
      [75, 192, 192],
      [255, 206, 86],
      [153, 102, 255],
      [255, 159, 64],
      [199, 199, 199],
      [83, 102, 255],
      [255, 99, 255],
      [99, 255, 132],
      [255, 182, 193],
      [0, 128, 128],
      [255, 215, 0]
    ];

    const result = [];
    for (let i = 0; i < count; i++) {
      const [r, g, b] = baseColors[i % baseColors.length];
      result.push(`rgba(${r}, ${g}, ${b}, ${alpha})`);
    }
    return result;
  }

  // Update the UI with parsed data info
  function updateInfo() {
    const info = document.getElementById('table-chart-info');
    if (!parsedData) return;

    info.innerHTML = `
      <span>Detected: ${parsedData.headerRowCount} header row(s), ${parsedData.labelColumnCount} label column(s), ${parsedData.rowLabels.length} data rows, ${parsedData.dataColumnHeaders.length} data columns</span>
    `;
  }

  // Populate series selector based on current view mode
  function populateSeriesSelector() {
    const select = document.getElementById('table-chart-series');
    const label = document.getElementById('table-chart-series-label');
    const view = getCurrentView();

    if (!view) return;

    select.innerHTML = '';
    label.textContent = viewMode === 'columns' ? 'Column Series:' : 'Row Series:';

    view.series.forEach((series, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = series.name;
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

  // Update chart based on current settings
  function updateChart() {
    const view = getCurrentView();
    if (!view || view.series.length === 0) return;

    const chartType = document.getElementById('table-chart-type').value;
    const horizontal = document.getElementById('table-chart-horizontal').checked;
    const stacked = document.getElementById('table-chart-stacked').checked;
    let selectedIndices = getSelectedSeries();

    if (selectedIndices.length === 0) {
      // Select first series if none selected
      const select = document.getElementById('table-chart-series');
      if (select.options.length > 0) {
        select.options[0].selected = true;
        selectedIndices = [0];
      }
    }

    const selectedSeries = selectedIndices.map(i => view.series[i]).filter(Boolean);
    if (selectedSeries.length === 0) return;

    const isPieType = ['pie', 'doughnut', 'polarArea'].includes(chartType);
    const isRadar = chartType === 'radar';

    const ctx = document.getElementById('table-chart-canvas').getContext('2d');

    if (chartInstance) {
      chartInstance.destroy();
    }

    // Build datasets
    const datasets = selectedSeries.map((series, idx) => {
      const validData = series.data.map((v, i) => ({
        value: v,
        label: view.labels[i]
      })).filter(d => !isNaN(d.value));

      return {
        label: series.name,
        data: isPieType
          ? validData.map(d => d.value)
          : series.data,
        backgroundColor: isPieType
          ? generateColors(validData.length, 0.8)
          : generateColors(selectedSeries.length, 0.8)[idx],
        borderColor: isPieType
          ? generateColors(validData.length, 1)
          : generateColors(selectedSeries.length, 1)[idx],
        borderWidth: isPieType ? 2 : 2,
        fill: chartType === 'line' ? false : undefined,
        tension: chartType === 'line' ? 0.1 : undefined
      };
    });

    // For pie charts, use the first selected series and filter valid data
    let labels = view.labels;
    if (isPieType && selectedSeries.length > 0) {
      const validIndices = selectedSeries[0].data
        .map((v, i) => !isNaN(v) ? i : -1)
        .filter(i => i >= 0);
      labels = validIndices.map(i => view.labels[i]);
      datasets[0].data = validIndices.map(i => selectedSeries[0].data[i]);
    }

    const chartConfig = {
      type: chartType === 'bar' ? 'bar' : chartType,
      data: {
        labels: labels,
        datasets: isPieType ? [datasets[0]] : datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: (chartType === 'bar' && horizontal) ? 'y' : 'x',
        plugins: {
          legend: {
            display: true,
            position: isPieType ? 'right' : 'top'
          },
          title: {
            display: true,
            text: selectedSeries.length <= 3
              ? selectedSeries.map(s => s.name).join(', ')
              : `${selectedSeries.length} series selected`
          }
        },
        scales: (isPieType || isRadar) ? {} : {
          x: {
            stacked: stacked,
            ticks: {
              maxRotation: 45,
              minRotation: 0
            }
          },
          y: {
            stacked: stacked,
            beginAtZero: true
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    };

    chartInstance = new Chart(ctx, chartConfig);
  }

  // ============================================================
  // EVENT HANDLERS
  // ============================================================

  function handleTableClick(e) {
    const table = e.target.closest('table');
    if (!table) return;

    const rows = table.querySelectorAll('tr');
    if (rows.length < 2) return;

    e.preventDefault();
    e.stopPropagation();

    // Parse the table
    const parser = new TableParser(table);
    parsedData = parser.parse();

    console.log('Parsed table data:', parsedData);

    if (parsedData.seriesByColumn.length === 0 && parsedData.seriesByRow.length === 0) {
      alert('Could not find numeric data in this table. The table may have an unsupported structure.');
      return;
    }

    // Reset view mode and show modal
    viewMode = 'columns';
    showModal();

    // Reset toggle buttons
    document.getElementById('table-chart-view-columns').classList.add('active');
    document.getElementById('table-chart-view-rows').classList.remove('active');

    updateInfo();
    updateViewHint();
    populateSeriesSelector();
    updateChart();
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

  // Initialize
  document.addEventListener('click', handleTableClick);
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  });

  console.log('Table to Chart extension loaded (v3 - dual view modes)');
})();
