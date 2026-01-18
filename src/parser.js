// Table Parser Module
// Depends on: namespace.js, dedup.js

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

    // Deduplicate headers and labels
    const columnDedup = deduplicateHeaders(dataColumnHeaders);
    const rowDedup = deduplicateLabels(rowLabels);

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
          displayName: columnDedup.displayNames[c],
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
          displayName: rowDedup.displayNames[rowIdx],
          data: seriesData,
          index: rowIdx
        });
      }
    });

    return {
      rowLabels,
      rowDisplayNames: rowDedup.displayNames,
      rowMetadata: { prefix: rowDedup.commonPrefix, suffix: rowDedup.commonSuffix },
      columnHeaders,
      dataColumnHeaders,
      columnDisplayNames: columnDedup.displayNames,
      columnMetadata: { parts: columnDedup.metadata, title: columnDedup.title },
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

// Export to namespace
window.TableChart.TableParser = TableParser;
