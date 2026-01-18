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

  // Check if an element is visually hidden using computed styles
  isElementHidden(element) {
    // Skip non-element nodes
    if (element.nodeType !== Node.ELEMENT_NODE) return false;

    // Check aria-hidden attribute (universal accessibility pattern)
    if (element.getAttribute('aria-hidden') === 'true') return true;

    // These tags never contain visible text
    const hiddenTags = ['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE'];
    if (hiddenTags.includes(element.tagName)) return true;

    // Check computed styles for common hiding techniques
    const style = window.getComputedStyle(element);

    // Standard hiding
    if (style.display === 'none') return true;
    if (style.visibility === 'hidden') return true;
    if (style.opacity === '0') return true;

    // Screen-reader-only patterns (clip-based hiding)
    // These elements are visible to screen readers but not to users
    const clip = style.clip;
    if (clip === 'rect(0px, 0px, 0px, 0px)' || clip === 'rect(1px, 1px, 1px, 1px)') return true;

    const clipPath = style.clipPath;
    if (clipPath === 'inset(50%)' || clipPath === 'inset(100%)') return true;

    // Zero-size with overflow hidden (another sr-only pattern)
    const width = parseFloat(style.width);
    const height = parseFloat(style.height);
    if ((width === 0 || height === 0) && style.overflow === 'hidden') return true;

    // Off-screen positioning (negative margins/positions used for sr-only)
    const position = style.position;
    if (position === 'absolute' || position === 'fixed') {
      const left = parseFloat(style.left);
      const top = parseFloat(style.top);
      if (left < -9000 || top < -9000) return true;
    }

    return false;
  }

  // Check if any ancestor up to the table is hidden
  hasHiddenAncestor(element) {
    let current = element.parentElement;
    while (current && current !== this.table.parentElement) {
      if (this.isElementHidden(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  // Extract visible text from a cell using computed styles
  extractVisibleText(element) {
    // Check if the element or any ancestor is hidden
    if (this.isElementHidden(element) || this.hasHiddenAncestor(element)) {
      return '';
    }

    const textParts = [];

    // Recursive function to traverse and collect visible text
    const traverse = (node) => {
      // For text nodes, add the text if parent chain is visible
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text && text.trim()) {
          textParts.push(text);
        }
        return;
      }

      // For element nodes, check if hidden before processing children
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (this.isElementHidden(node)) return;
        if (node.tagName === 'SUP') return;
        if (node.classList && (node.classList.contains('reference') || node.classList.contains('mw-ref'))) return;

        // Process children
        for (const child of node.childNodes) {
          traverse(child);
        }
      }
    };

    traverse(element);

    // Join and clean up
    let text = textParts.join(' ');

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Remove common noise patterns that appear across many sites
    text = text
      .replace(/^\s*[—–-]\s*$/, '')  // Standalone dashes (N/A indicators)
      .replace(/\[[^\]]*\]/g, '')     // Bracketed references like [1], [n 1]
      .replace(/\s*\[\s*edit\s*\]\s*/gi, '')  // [edit] links
      .trim();

    text = this.stripTrailingParentheticals(text);

    return text;
  }

  stripTrailingParentheticals(text) {
    let updated = text;
    const trailing = /\s*\(([^)]*)\)\s*$/;
    while (true) {
      const match = updated.match(trailing);
      if (!match) break;
      const content = match[1].trim();
      const hasDigit = /\d/.test(content);
      const hasUnit = /[%$€£¥₹₽₩]/.test(content);
      const wordCount = content ? content.split(/\s+/).length : 0;
      const isShort = content.length <= 10 && wordCount <= 2;
      if (!content || (!hasDigit && !hasUnit && isShort)) {
        updated = updated.replace(trailing, '').trim();
        continue;
      }
      break;
    }
    return updated;
  }

  isMeaningfulText(text) {
    return Boolean(text && text.trim().length > 0);
  }

  rowHasMeaningfulText(row) {
    return row.some(cell => cell && this.isMeaningfulText(cell.text));
  }

  getExplicitHeaderRowCount() {
    if (!this.table.tHead || this.table.tHead.rows.length === 0) return 0;
    const theadRows = this.table.tHead.rows.length;
    let lastMeaningfulIndex = -1;
    for (let i = 0; i < theadRows; i++) {
      const row = this.grid[i];
      if (row && this.rowHasMeaningfulText(row)) {
        lastMeaningfulIndex = i;
      }
    }
    return lastMeaningfulIndex >= 0 ? lastMeaningfulIndex + 1 : 0;
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
        const text = this.extractVisibleText(cell);
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
      if (!row || row.length === 0 || !this.rowHasMeaningfulText(row)) {
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

    const leadingLabelCount = this.detectLeadingLabelColumns(colCount);
    if (leadingLabelCount > this.labelColumnCount) {
      this.labelColumnCount = leadingLabelCount;
      for (let i = 0; i < this.labelColumnCount; i++) {
        columnTypes[i] = 'label';
      }
    }

    this.columnTypes = columnTypes;
    return columnTypes;
  }

  detectLeadingLabelColumns(colCount) {
    let count = 0;
    for (let col = 0; col < colCount; col++) {
      const stats = this.getColumnStats(col);
      if (stats.rowCount === 0) break;
      if (!stats.isLikelyLabel) break;
      count++;
    }
    return count;
  }

  getColumnStats(col) {
    let numericCount = 0;
    let rowCount = 0;
    let bodyRowCount = 0;
    let bodyHeaderCount = 0;

    this.grid.forEach((row, rowIndex) => {
      const cell = row && row[col];
      if (!cell || !this.isMeaningfulText(cell.text)) return;
      rowCount++;
      if (cell.numeric.isNumeric && !cell.numeric.isYear) {
        numericCount++;
      }
      if (rowIndex >= this.headerRowCount) {
        bodyRowCount++;
        if (cell.isHeader) bodyHeaderCount++;
      }
    });

    const numericRatioAll = rowCount > 0 ? numericCount / rowCount : 0;
    const bodyHeaderRatio = bodyRowCount > 0 ? bodyHeaderCount / bodyRowCount : 0;
    const headerRowIndex = this.headerRowCount > 0 ? this.headerRowCount - 1 : -1;
    const headerCell = headerRowIndex >= 0 && this.grid[headerRowIndex]
      ? this.grid[headerRowIndex][col]
      : null;
    const hasHeaderText = headerCell && headerCell.isHeader && this.isMeaningfulText(headerCell.text);

    return {
      rowCount,
      numericRatioAll,
      bodyHeaderRatio,
      isLikelyLabel: numericRatioAll < 0.2 && (bodyHeaderRatio > 0.6 || hasHeaderText)
    };
  }

  // Build metadata for each column to support user-selectable label column
  buildColumnMetadata(columnHeaders) {
    const colCount = Math.max(...this.grid.map(r => r ? r.length : 0));
    const metadata = [];

    for (let col = 0; col < colCount; col++) {
      let numericCount = 0;
      let textCount = 0;
      let dataRowCount = 0;
      const values = [];

      this.grid.forEach((row, rowIndex) => {
        if (this.rowTypes[rowIndex] !== 'data' || !row || !row[col]) return;

        dataRowCount++;
        const cell = row[col];
        values.push(cell);

        if (cell.numeric.isNumeric && !cell.numeric.isYear) {
          numericCount++;
        } else if (cell.text && cell.text.length > 0) {
          textCount++;
        }
      });

      const numericRatio = dataRowCount > 0 ? numericCount / dataRowCount : 0;
      const isTextOnly = numericRatio === 0 && textCount > 0;

      // Check if this column is a numeric sequence (1, 2, 3, ...)
      const isNumericSequence = this.isNumericSequence(values);

      metadata.push({
        index: col,
        header: columnHeaders[col] || `Column ${col + 1}`,
        columnType: this.columnTypes[col] || 'unknown',
        isTextOnly,
        isNumericSequence,
        numericRatio
      });
    }

    return metadata;
  }

  // Check if a column contains a sequential numeric pattern (1, 2, 3, ...)
  isNumericSequence(cells) {
    if (cells.length < 3) return false;

    const numericValues = cells
      .filter(c => c && c.numeric.isNumeric)
      .map(c => c.numeric.value);

    if (numericValues.length < cells.length * 0.8) return false;

    // Check if it's a sequence starting from 1 or 0
    const sorted = [...numericValues].sort((a, b) => a - b);
    if (sorted[0] !== 0 && sorted[0] !== 1) return false;

    // Check if consecutive integers
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) return false;
    }

    return true;
  }

  // Select the best default label column
  selectDefaultLabelColumn(columnMetadata) {
    // First preference: text-only column that isn't a sequence
    for (const col of columnMetadata) {
      if (col.isTextOnly && !col.isNumericSequence) {
        return col.index;
      }
    }

    // Second preference: any non-numeric column that isn't a sequence
    for (const col of columnMetadata) {
      if (col.columnType === 'label' && !col.isNumericSequence) {
        return col.index;
      }
    }

    // Third preference: first label column (even if sequence)
    for (const col of columnMetadata) {
      if (col.columnType === 'label') {
        return col.index;
      }
    }

    // Fall back to first column
    return 0;
  }

  // Build column headers from header rows
  buildColumnHeaders() {
    const headers = [];
    const colCount = Math.max(...this.grid.map(r => r ? r.length : 0));

    for (let col = 0; col < colCount; col++) {
      const headerParts = [];

      for (let row = 0; row < this.headerRowCount; row++) {
        const cell = this.grid[row] && this.grid[row][col];
        if (cell && this.isMeaningfulText(cell.text)) {
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

  extractRowUnit(row, labelColumnCount) {
    const unitTexts = new Set();
    let hasNumeric = false;

    for (let c = labelColumnCount; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      if (cell.numeric.isNumeric && !cell.numeric.isYear) {
        hasNumeric = true;
      }
      if (this.isMeaningfulText(cell.text)) {
        unitTexts.add(cell.text);
      }
    }

    if (hasNumeric || unitTexts.size !== 1) return null;
    return Array.from(unitTexts)[0];
  }

  // Extract the final parsed data structure
  parse() {
    this.buildGrid();
    this.classifyRows();
    this.classifyColumns();

    const explicitHeaderRowCount = this.getExplicitHeaderRowCount();
    if (explicitHeaderRowCount > 0) {
      this.headerRowCount = explicitHeaderRowCount;
    }

    const columnHeaders = this.buildColumnHeaders();

    // Build column metadata for user-selectable label column feature
    const allColumns = this.buildColumnMetadata(columnHeaders);
    const labelColumnIndex = this.selectDefaultLabelColumn(allColumns);

    const dataRows = [];
    const rowLabels = [];
    const activeGroupLabels = new Array(this.labelColumnCount).fill('');
    let unitContext = '';

    // Extract data rows with group/unit context from tbody
    this.grid.forEach((row, rowIndex) => {
      if (!row || this.rowTypes[rowIndex] === 'empty') return;

      const rowSpecificLabels = new Array(this.labelColumnCount).fill('');

      for (let c = 0; c < this.labelColumnCount; c++) {
        const cell = row[c];
        if (!cell || !this.isMeaningfulText(cell.text)) continue;

        if (cell.rowspan > 1) {
          activeGroupLabels[c] = cell.text;
        } else if (cell.originalRow === rowIndex) {
          rowSpecificLabels[c] = cell.text;
        }
      }

      // Reset deeper groups when a higher-level group starts
      const firstGroupIndex = rowSpecificLabels.findIndex(text => this.isMeaningfulText(text));
      if (firstGroupIndex >= 0) {
        for (let c = firstGroupIndex + 1; c < this.labelColumnCount; c++) {
          if (!this.isMeaningfulText(rowSpecificLabels[c])) {
            activeGroupLabels[c] = '';
          }
        }
      }

      if (rowIndex >= this.headerRowCount) {
        const unitCandidate = this.extractRowUnit(row, this.labelColumnCount);
        if (unitCandidate) {
          unitContext = unitCandidate;
        }
      }

      if (this.rowTypes[rowIndex] !== 'data') return;

      // Build row label from label columns plus unit context
      const labelParts = [];
      for (let c = 0; c < this.labelColumnCount; c++) {
        const part = rowSpecificLabels[c] || activeGroupLabels[c];
        if (this.isMeaningfulText(part) && part !== labelParts[labelParts.length - 1]) {
          labelParts.push(part);
        }
      }

      if (this.isMeaningfulText(unitContext)) {
        const unitLower = unitContext.toLowerCase();
        const alreadyIncluded = labelParts.some(part => part.toLowerCase().includes(unitLower));
        if (!alreadyIncluded) {
          labelParts.push(unitContext);
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
      columnTypes: this.columnTypes,
      allColumns,
      labelColumnIndex
    };
  }
}

// Export to namespace
window.TableChart.TableParser = TableParser;
