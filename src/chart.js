// Chart Module - Chart rendering and updates
// Depends on: namespace.js

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

// Update chart based on current settings
function updateChart() {
  const view = getCurrentView();
  if (!view || view.series.length === 0) return;

  const chartType = document.getElementById('table-chart-type').value;
  const horizontal = document.getElementById('table-chart-horizontal').classList.contains('active');
  const stacked = document.getElementById('table-chart-stacked').classList.contains('active');
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
  const axisLabels = view.displayLabels || view.labels;

  // Build datasets
  const datasets = selectedSeries.map((series, idx) => {
    const validData = series.data.map((v, i) => ({
      value: v,
      label: axisLabels[i]
    })).filter(d => !isNaN(d.value));

    return {
      // Use displayName for legend
      label: series.displayName || series.name,
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
  let labels = axisLabels;
  if (isPieType && selectedSeries.length > 0) {
    const validIndices = selectedSeries[0].data
      .map((v, i) => !isNaN(v) ? i : -1)
      .filter(i => i >= 0);
    labels = validIndices.map(i => axisLabels[i]);
    datasets[0].data = validIndices.map(i => selectedSeries[0].data[i]);
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

window.TableChart.getCurrentView = getCurrentView;
window.TableChart.generateColors = generateColors;
window.TableChart.updateChart = updateChart;
