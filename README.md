# Table to Chart

A browser extension that turns any HTML table into an interactive chart with a single click.

## Features

- **One-click charting**: Click any table on a webpage to instantly visualize it
- **Multiple chart types**: Bar, Line, Pie, Doughnut, Radar, and Polar Area
- **Two plot modes**:
  - *Columns*: Plot data columns as series with rows on the X-axis
  - *Rows*: Plot data rows as series with columns on the X-axis
- **Filtering**: Multi-select which rows or columns appear in the chart
- **Series selection**: Choose which data series to display
- **Label column picker**: Select which column provides the X-axis labels
- **Chart options**: Horizontal orientation, stacked bars
- **Color palettes**: Default, Pastel, Bold, Monochrome, Cyberpunk, Forest
- **Draggable modal**: Reposition the chart window anywhere on the page
- **Smart parsing**: Automatically detects numeric data, headers, and table structure

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

## Usage

1. Navigate to any webpage with a table
2. Click on the table - it will highlight on hover
3. The chart modal appears with your data visualized
4. Use the toolbar to customize:
   - **Chart Type**: Switch between chart styles
   - **Plot**: Toggle between columns/rows as series
   - **Options**: Enable horizontal or stacked layout
   - **Palette**: Change color scheme
   - **Series**: Select which series to show
   - **Rows/Columns**: Filter X-axis items
   - **Labels**: Choose the label column

Press `Escape` or click outside to close the chart.

## Tech Stack

- Vanilla JavaScript (no framework)
- Chart.js for rendering
- Chrome Extension Manifest V3
