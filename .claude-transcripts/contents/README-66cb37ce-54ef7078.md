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