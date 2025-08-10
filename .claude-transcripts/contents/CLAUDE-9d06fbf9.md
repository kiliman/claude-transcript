# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Graph Monitor is a system monitoring tool that captures metrics by executing shell commands, stores the results in SQLite, and generates static PNG charts for visualization.

## Architecture

The system consists of two main components:

1. **Data Capture Component** (`/data-capture`):
   - Executes configured shell commands periodically
   - Stores metrics in SQLite database (`metrics.db`)
   - Performs automatic data rollups (5m, 30m, 1h, 2h, 4h, 12h, 24h intervals)
   - Generates static PNG charts using Chart.js

2. **Web Server Component** (`serve-charts.js`):
   - Serves static chart PNG files from `/charts` directory
   - Provides index.html for viewing charts
   - Runs on port 8080

## Key Commands

```bash
# Install dependencies
npm install
cd data-capture && npm install

# Run data capture only
npm run capture

# Run web server only  
npm run serve

# Run both components
npm start
```

## Important Technical Details

### Data Flow
1. `config.js` defines metrics (shell commands) and graph specifications
2. Scheduler (`scheduler.js`) executes commands based on intervals
3. Executor (`executor.js`) parses command output for duration and status
4. Database (`database.js`) stores raw metrics and manages rollups
5. Chart generator (`chart-generator.js`) creates PNG files from data
6. HTTP server serves charts from `/charts` directory

### Database Schema
- `metrics` table: Raw metric data (id, timestamp, name, value, status)
- `rollup_*` tables: Aggregated data at various intervals

### Current Configuration
The system currently monitors:
- `mail.bigdeskenergy.com` response time
- `google.com` response time

### Implementation Notes
- Uses CommonJS modules (not ES modules)
- Winston logger writes to `/logs` directory
- No test framework is configured
- The actual implementation generates static PNG charts, not a React app as originally specified in README.md