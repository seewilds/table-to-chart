// Shared namespace for all modules
window.TableChart = {
  modal: null,
  chartInstance: null,
  parsedData: null,
  viewMode: 'columns',
  isDragging: false,
  dragOffsetX: 0,
  dragOffsetY: 0
};

// Global alias for convenience
var TC = window.TableChart;
