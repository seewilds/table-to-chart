// Header Deduplication Module
// Depends on: namespace.js

// Extract common parts from header strings and return simplified names + metadata
function deduplicateHeaders(headers, separator = ' > ') {
  if (!headers || headers.length === 0) {
    return { displayNames: [], metadata: [], title: '' };
  }

  if (headers.length === 1) {
    return {
      displayNames: [headers[0]],
      metadata: [],
      title: ''
    };
  }

  // Split each header into parts
  const splitHeaders = headers.map(h => h.split(separator).map(p => p.trim()));

  // Find max parts length
  const maxParts = Math.max(...splitHeaders.map(h => h.length));

  // For each position, check if all headers have the same value
  const commonParts = [];
  const uniquePositions = [];

  for (let pos = 0; pos < maxParts; pos++) {
    const valuesAtPos = splitHeaders.map(h => h[pos] || '');
    const uniqueValues = new Set(valuesAtPos.filter(v => v !== ''));

    if (uniqueValues.size === 1 && valuesAtPos.every(v => v === valuesAtPos[0])) {
      // All same - this is common/metadata
      commonParts.push(valuesAtPos[0]);
    } else if (uniqueValues.size > 1) {
      // Different values - this position is unique
      uniquePositions.push(pos);
    }
  }

  // Build display names from unique positions only
  const displayNames = splitHeaders.map(parts => {
    const uniqueParts = uniquePositions.map(pos => parts[pos] || '').filter(p => p);
    return uniqueParts.join(separator) || parts.join(separator);
  });

  // Build title from common parts (filter out generic ones)
  const meaningfulCommon = commonParts.filter(part => {
    const lower = part.toLowerCase();
    // Skip very generic terms
    return !['dollars', 'units', 'number', 'count', 'value', 'values'].includes(lower);
  });

  const title = meaningfulCommon.join(' - ');

  return {
    displayNames,
    metadata: commonParts,
    title,
    uniquePositions
  };
}

// Also deduplicate row labels if they have common prefixes/suffixes
function deduplicateLabels(labels) {
  if (!labels || labels.length < 2) {
    return { displayNames: labels || [], commonPrefix: '', commonSuffix: '' };
  }

  // Find common prefix
  let commonPrefix = '';
  const first = labels[0];
  for (let i = 0; i < first.length; i++) {
    const char = first[i];
    if (labels.every(l => l[i] === char)) {
      commonPrefix += char;
    } else {
      break;
    }
  }

  // Only use prefix if it ends at a word boundary and is meaningful
  const prefixMatch = commonPrefix.match(/^(.+[\s\-:>])/);
  commonPrefix = prefixMatch ? prefixMatch[1] : '';

  // Find common suffix
  let commonSuffix = '';
  const reversed = labels.map(l => l.split('').reverse().join(''));
  const firstRev = reversed[0];
  for (let i = 0; i < firstRev.length; i++) {
    const char = firstRev[i];
    if (reversed.every(l => l[i] === char)) {
      commonSuffix = char + commonSuffix;
    } else {
      break;
    }
  }

  // Only use suffix if it starts at a word boundary
  const suffixMatch = commonSuffix.match(/([\s\-:>].+)$/);
  commonSuffix = suffixMatch ? suffixMatch[1] : '';

  // Build display names
  const displayNames = labels.map(label => {
    let display = label;
    if (commonPrefix) {
      display = display.substring(commonPrefix.length);
    }
    if (commonSuffix) {
      display = display.substring(0, display.length - commonSuffix.length);
    }
    return display.trim() || label;
  });

  return {
    displayNames,
    commonPrefix: commonPrefix.trim(),
    commonSuffix: commonSuffix.trim()
  };
}

// Export to global scope for parser.js to use
window.deduplicateHeaders = deduplicateHeaders;
window.deduplicateLabels = deduplicateLabels;
