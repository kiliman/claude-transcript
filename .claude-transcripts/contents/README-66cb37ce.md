# graph-monitor

This tool is a React app using Vite. There are two main components.

## Data Capture

This Node.js process will execute commands defined in a config.json file. It will continue to run until stopped.

```json
{
  "metrics": {
    "bde": {
      "command": "curl https://www.bigdeskenergy.com",
      "frequency": "30s",
    }
  },
  "graphs": {
    "Response Time: www.bigdeskenergy.com (Last hour)": {
      "source": "latest",
      "limit": "1h",
      "type": "LineChart",
      "x-axis": "timestamp",
      "y-axis": "duration"
    }
    "Response Time: www.bigdeskenergy.com (Last 24 hours)": {
      "source": "rollup-5m",
      "limit": "24h",
      "type": "LineChart",
      "x-axis": "timestamp",
      "y-axis": "duration"
    }

  }

}
```
For each `metric`, we're going to execute the shell command at the requested frequency (a numeric value with a time unit of: s=seconds, m=minutes, h=hour)

The command will output to stdout one or more lines
```
name: value [unit]
```
<example>
duration: 123 ms
status: 200
</example>

Each time a command is executed, we're going to store the following data in a sqlite database
```
timestamp (unix time), key, name, value, unit
```
<example>
1753219424, bde, duration, 123, ms
1753219424, bde, status, 200
</example>

We also want to create a table that keeps a rolling summary of each metric

We'll rollup the values in the following increments, starting with the first increment greater than our frequency.

5 minutes (5m)
30 minutes (30m)
1 hour (1h)
12 hours (12h)
1 day (1d)
1 month (1mo)
1 year (1y)

For each group, we'll keep a maximum on the latest 120 entries.

We'll capture the following data
```
increment, timestamp, key, name, unit, min, max, average
```
- increment is the interval key in parentheses.
- timestamp is the unix time rounded to nearest increment
    - 5m 00:00, 00:05, 00:10, etc.
    - 30m 00:00, 00:30, 01:00, etc.
    - 1h 00:00, 01:00, 02:00, etc.
    - 1d 2025-07-21T00:00, 2025-07-22T00:00, etc.
    - 1m 2025-07-01T00:00, 2025-08-01T00:00, etc.
    - 1y 2025-01-01T00:00, 2026-01-01T00:00, etc.
- key, name, unit from metric
- min*
- max*
- average*

* aggregate of all metrics for this key/name pair for this interval

<example>
5m, 1753219500, bde, duration, 123, ms, 99, 201, 112
<example>


## Graph Web App

The Graph Web App will be a Vite+React app that will use the config to generate a series
of graphs of the captured data. Use the `recharts` package to render the graphs.

Graphs are configured in the config.json file.

For each graph, the key is the title of the chart.

We specify the following:

- source
    - latest: get from captured metrics
    - rollup-interval: rollup-5m gets the rollup values from the appropriate interval
- limit: limit entries up to (1h = 1 hour, etc) `timestamp >= Date.now - limit`
- type: chart type from `recharts`
- x-axis: value name used for x-axis data (timestamp): convert timestamp to actual formatted date/time
- y-axis: value name used for y-axis data (duration)

