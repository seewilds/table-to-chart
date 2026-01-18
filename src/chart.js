// Chart Module - Chart rendering and updates
// Depends on: namespace.js

// Color palette definitions
const COLOR_PALETTES = {
  default: [
    [54, 162, 235], [255, 99, 132], [75, 192, 192], [255, 206, 86],
    [153, 102, 255], [255, 159, 64], [199, 199, 199], [83, 102, 255],
    [255, 99, 255], [99, 255, 132], [255, 182, 193], [0, 128, 128], [255, 215, 0]
  ],
  pastel: [
    [174, 198, 207], [255, 179, 186], [186, 225, 200], [255, 223, 186],
    [203, 195, 227], [255, 218, 185], [176, 224, 230], [221, 160, 221]
  ],
  bold: [
    [220, 20, 60], [0, 100, 0], [25, 25, 112], [255, 140, 0],
    [128, 0, 128], [0, 128, 128], [139, 69, 19], [75, 0, 130]
  ],
  monochrome: [
    [40, 40, 40], [80, 80, 80], [120, 120, 120], [160, 160, 160],
    [200, 200, 200], [60, 60, 60], [100, 100, 100], [140, 140, 140]
  ],
  cyberpunk: [
    [255, 0, 255], [0, 255, 255], [255, 0, 128], [128, 0, 255],
    [0, 255, 128], [255, 255, 0], [255, 64, 64], [0, 128, 255]
  ],
  forest: [
    [34, 139, 34], [107, 142, 35], [85, 107, 47], [46, 139, 87],
    [60, 179, 113], [143, 188, 143], [154, 205, 50], [102, 51, 0]
  ]
};

// Build row labels from a specific column
function buildRowLabelsForColumn(labelColIndex) {
  if (!TC.parsedData) return [];

  const labels = [];
  TC.parsedData.rawGrid.forEach((row, rowIndex) => {
    if (TC.parsedData.rowTypes[rowIndex] !== 'data' || !row) return;

    const cell = row[labelColIndex];
    labels.push(cell && cell.text ? cell.text : `Row ${labels.length + 1}`);
  });

  return labels;
}

// Rebuild series data based on user-selected label column
function rebuildSeriesFromSelection() {
  if (!TC.parsedData || !TC.parsedData.allColumns) return;

  const labelColIndex = TC.getSelectedLabelColumn();
  const allColumns = TC.parsedData.allColumns;

  // Build new row labels from selected column
  const newRowLabels = buildRowLabelsForColumn(labelColIndex);
  const rowDedup = deduplicateLabels(newRowLabels);

  // Determine which columns are chartable (numeric, not the label column, not text-only)
  const chartableColumns = allColumns.filter(col =>
    col.index !== labelColIndex &&
    col.numericRatio > 0.5 &&
    !col.isTextOnly
  );

  // Extract data rows with all columns (not just excluding auto-detected label columns)
  const dataRows = [];
  TC.parsedData.rawGrid.forEach((row, rowIndex) => {
    if (TC.parsedData.rowTypes[rowIndex] !== 'data' || !row) return;

    const values = [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      values.push({
        value: cell ? cell.numeric.value : NaN,
        display: cell ? cell.text : '',
        isNumeric: cell ? cell.numeric.isNumeric : false
      });
    }
    dataRows.push(values);
  });

  // Build chartable column headers (only numeric columns, excluding label)
  const chartableHeaders = chartableColumns.map(col => col.header);
  const columnDedup = deduplicateHeaders(chartableHeaders);

  // Build series by columns
  const seriesByColumn = [];
  chartableColumns.forEach((col, idx) => {
    const seriesData = dataRows.map(row => {
      const cell = row[col.index];
      return cell ? cell.value : NaN;
    });

    const numericCount = seriesData.filter(v => !isNaN(v)).length;
    if (numericCount > 0) {
      seriesByColumn.push({
        name: col.header,
        displayName: columnDedup.displayNames[idx],
        data: seriesData,
        index: idx
      });
    }
  });

  // Build series by rows
  const seriesByRow = [];
  newRowLabels.forEach((label, rowIdx) => {
    const seriesData = chartableColumns.map(col => {
      const cell = dataRows[rowIdx][col.index];
      return cell ? cell.value : NaN;
    });

    const numericCount = seriesData.filter(v => !isNaN(v)).length;
    if (numericCount > 0) {
      seriesByRow.push({
        name: label,
        displayName: rowDedup.displayNames[rowIdx],
        data: seriesData,
        index: rowIdx
      });
    }
  });

  // Update parsed data with rebuilt series
  TC.parsedData.rowLabels = newRowLabels;
  TC.parsedData.rowDisplayNames = rowDedup.displayNames;
  TC.parsedData.rowMetadata = { prefix: rowDedup.commonPrefix, suffix: rowDedup.commonSuffix };
  TC.parsedData.dataColumnHeaders = chartableHeaders;
  TC.parsedData.columnDisplayNames = columnDedup.displayNames;
  TC.parsedData.columnMetadata = { parts: columnDedup.metadata, title: columnDedup.title };
  TC.parsedData.seriesByColumn = seriesByColumn;
  TC.parsedData.seriesByRow = seriesByRow;
  TC.parsedData.labelColumnIndex = labelColIndex;

  // Update info display
  TC.updateInfo();
}

// Get the current view's series and labels based on viewMode
function getCurrentView() {
  if (!TC.parsedData) return null;

  if (TC.viewMode === 'columns') {
    // Columns as series, rows as X-axis labels
    return {
      series: TC.parsedData.seriesByColumn,
      labels: TC.parsedData.rowLabels,
      displayLabels: TC.parsedData.rowDisplayNames,
      seriesLabel: 'Columns',
      axisLabel: 'Rows',
      title: TC.parsedData.columnMetadata.title
    };
  } else {
    // Rows as series, columns as X-axis labels
    return {
      series: TC.parsedData.seriesByRow,
      labels: TC.parsedData.dataColumnHeaders,
      displayLabels: TC.parsedData.columnDisplayNames,
      seriesLabel: 'Rows',
      axisLabel: 'Columns',
      title: TC.parsedData.rowMetadata.prefix || TC.parsedData.rowMetadata.suffix || ''
    };
  }
}

// Generate colors for chart
function generateColors(count, alpha = 0.8, paletteName = 'default') {
  const baseColors = COLOR_PALETTES[paletteName] || COLOR_PALETTES.default;

  const result = [];
  for (let i = 0; i < count; i++) {
    const [r, g, b] = baseColors[i % baseColors.length];
    result.push(`rgba(${r}, ${g}, ${b}, ${alpha})`);
  }
  return result;
}

// Update chart based on current settings
function updateChart() {
  const view = getCurrentView();
  if (!view || view.series.length === 0) return;

  const chartType = document.getElementById('table-chart-type').value;
  const horizontal = document.getElementById('table-chart-horizontal').classList.contains('active');
  const stacked = document.getElementById('table-chart-stacked').classList.contains('active');
  const palette = document.getElementById('table-chart-palette').value;
  let selectedIndices = TC.getSelectedSeries();

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

  if (TC.chartInstance) {
    TC.chartInstance.destroy();
  }

  // Use display labels (deduplicated) for cleaner axis labels
  const allAxisLabels = view.displayLabels || view.labels;

  // Filter X-axis labels (rows in columns mode, columns in rows mode)
  const selectedRowIndices = TC.getSelectedRows();
  const axisLabels = selectedRowIndices.map(i => allAxisLabels[i]);

  // Build datasets
  const datasets = selectedSeries.map((series, idx) => {
    // Filter series data to only selected X-axis items
    const filteredData = selectedRowIndices.map(i => series.data[i]);
    const validData = filteredData.map((v, i) => ({
      value: v,
      label: axisLabels[i]
    })).filter(d => !isNaN(d.value));

    return {
      // Use displayName for legend
      label: series.displayName || series.name,
      data: isPieType
        ? validData.map(d => d.value)
        : filteredData,
      backgroundColor: isPieType
        ? generateColors(validData.length, 0.8, palette)
        : generateColors(selectedSeries.length, 0.8, palette)[idx],
      borderColor: isPieType
        ? generateColors(validData.length, 1, palette)
        : generateColors(selectedSeries.length, 1, palette)[idx],
      borderWidth: isPieType ? 2 : 2,
      fill: chartType === 'line' ? false : undefined,
      tension: chartType === 'line' ? 0.1 : undefined
    };
  });

  // For pie charts, use the first selected series and filter valid data
  let labels = axisLabels;
  if (isPieType && selectedSeries.length > 0) {
    const filteredSeriesData = selectedRowIndices.map(i => selectedSeries[0].data[i]);
    const validIndices = filteredSeriesData
      .map((v, i) => !isNaN(v) ? i : -1)
      .filter(i => i >= 0);
    labels = validIndices.map(i => axisLabels[i]);
    datasets[0].data = validIndices.map(i => filteredSeriesData[i]);
  }

  // Build chart title from metadata
  let chartTitle = view.title || '';
  if (!chartTitle && selectedSeries.length <= 3) {
    chartTitle = selectedSeries.map(s => s.displayName || s.name).join(', ');
  } else if (!chartTitle) {
    chartTitle = `${selectedSeries.length} series selected`;
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
          display: !!chartTitle,
          text: chartTitle
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

  TC.chartInstance = new Chart(ctx, chartConfig);
}

// Export to global scope and namespace
window.getCurrentView = getCurrentView;
window.generateColors = generateColors;
window.updateChart = updateChart;
window.buildRowLabelsForColumn = buildRowLabelsForColumn;
window.rebuildSeriesFromSelection = rebuildSeriesFromSelection;

window.TableChart.getCurrentView = getCurrentView;
window.TableChart.generateColors = generateColors;
window.TableChart.updateChart = updateChart;
window.TableChart.buildRowLabelsForColumn = buildRowLabelsForColumn;
window.TableChart.rebuildSeriesFromSelection = rebuildSeriesFromSelection;
