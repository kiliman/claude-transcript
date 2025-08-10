
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