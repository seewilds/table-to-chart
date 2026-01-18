# Table to Chart Extension

Turn any HTML table into an interactive chart in a single click.

## Features

- One-click charting from any HTML table
- Smart parsing for messy tables, multi-row headers, and row/column labels
- Multiple chart types: Bar, Line, Pie, Doughnut, Radar, Polar Area
- Switch view: columns as series or rows as series
- Filter categories and series with multi-select controls
- Advanced label column selector for row label source
- Chart options: horizontal and stacked
- Export to PNG or copy to clipboard
- Color palettes: Default, Pastel, Bold, Monochrome, Cyberpunk, Forest
- Draggable modal UI

## Installation (Developer Mode)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable Developer mode
4. Click "Load unpacked" and select the extension folder

## Usage

1. Navigate to any webpage with a table
2. Click a table to open the chart modal
3. Use the toolbar to customize the chart:
   - Chart Type
   - View (Columns or Rows)
   - Options (Horizontal, Stacked)
   - Palette
   - Series
   - Categories
   - Advanced: Label column

Press `Escape` or click outside the modal to close it.

## Privacy Policy

This extension does not collect, store, or transmit any personal data.
All parsing and chart rendering happens locally in your browser.
No analytics, trackers, or ads are used.

## Support

If you need help or want to report a bug, open an issue in this repository.

## Tech Stack

- Vanilla JavaScript
- Chart.js
- Chrome Extension Manifest V3
