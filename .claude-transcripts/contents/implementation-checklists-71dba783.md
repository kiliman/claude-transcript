# Implementation Checklists for Graph Monitor

## Data Capture Component (Node.js Process)

### Configuration & Setup
- [ ] Create configuration loader to read `config.json`
- [ ] Validate configuration structure (metrics and graphs sections)
- [ ] Set up error handling for invalid configurations

### Database Setup
- [ ] Initialize SQLite database
- [ ] Create `metrics` table with columns: timestamp, key, name, value, unit
- [ ] Create `rollups` table with columns: increment, timestamp, key, name, unit, min, max, average
- [ ] Add database indexes for performance optimization

### Command Execution System
- [ ] Implement command scheduler with configurable frequencies
- [ ] Parse frequency strings (e.g., "30s", "5m", "1h") into milliseconds
- [ ] Execute shell commands using Node.js child_process
- [ ] Parse command stdout to extract "name: value [unit]" format
- [ ] Handle command execution errors and timeouts

### Data Storage
- [ ] Store raw metric data in `metrics` table with Unix timestamps
- [ ] Implement data insertion with proper error handling
- [ ] Handle multiple metrics from single command execution

### Rollup System
- [ ] Calculate rollup intervals: 5m, 30m, 1h, 12h, 1d, 1mo, 1y
- [ ] Determine appropriate rollup intervals based on metric frequency
- [ ] Implement timestamp rounding for each interval type
- [ ] Calculate min, max, and average for each rollup period
- [ ] Maintain rolling window of latest 120 entries per rollup interval
- [ ] Schedule rollup calculations appropriately

### Process Management
- [ ] Implement graceful startup and shutdown
- [ ] Add logging system for monitoring and debugging
- [ ] Handle process signals (SIGTERM, SIGINT)
- [ ] Implement process restart capability

## Graph Web App Component (Vite + React)

### Project Setup
- [ ] Initialize Vite + React project structure
- [ ] Install `recharts` dependency
- [ ] Set up development and build configurations

### Configuration Management
- [ ] Create configuration loader for `config.json`
- [ ] Implement configuration validation for graphs section
- [ ] Handle configuration changes/updates

### Database Integration
- [ ] Set up SQLite connection from React app
- [ ] Implement data fetching functions for metrics and rollups
- [ ] Handle database query errors

### Data Processing
- [ ] Implement source selection logic (latest vs rollup-interval)
- [ ] Parse and apply time limit filters
- [ ] Convert Unix timestamps to formatted date/time strings
- [ ] Transform database results into recharts-compatible format

### Chart Components
- [ ] Create dynamic chart component based on configuration
- [ ] Support different chart types from recharts library
- [ ] Implement configurable x-axis and y-axis mapping
- [ ] Add proper chart titles from configuration keys
- [ ] Style charts appropriately

### User Interface
- [ ] Create main dashboard layout
- [ ] Render all configured graphs
- [ ] Implement responsive design
- [ ] Add loading states and error handling
- [ ] Include refresh/update functionality

### Real-time Updates
- [ ] Implement data polling or real-time updates
- [ ] Handle new data without full page refresh
- [ ] Optimize re-rendering performance

### Error Handling & UX
- [ ] Display meaningful error messages
- [ ] Handle missing data gracefully
- [ ] Add fallback states for empty charts
- [ ] Implement proper loading indicators

---

## Next Steps

Please review these checklists and let me know:
1. Are there any items you'd like me to add, modify, or remove?
2. Are there any specific implementation preferences or constraints?
3. Should I prioritize certain features or components?

Once you approve the checklists, I'll be ready to start implementing the system according to your specifications.