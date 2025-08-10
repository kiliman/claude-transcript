const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs').promises;
const path = require('path');
const { format, subHours, subDays } = require('date-fns');

class ChartGenerator {
  constructor(database, config, logger) {
    this.database = database;
    this.config = config;
    this.logger = logger;
    this.width = 800;
    this.height = 400;
    this.chartJSNodeCanvas = new ChartJSNodeCanvas({ 
      width: this.width, 
      height: this.height,
      backgroundColour: 'white'
    });
  }

  async generateAllCharts(forceRegenerate = false) {
    try {
      const outputDir = path.join(__dirname, '..', 'charts');
      await fs.mkdir(outputDir, { recursive: true });

      const graphs = this.config.getGraphs();
      let regeneratedCount = 0;
      let skippedCount = 0;
      
      for (const [title, graphConfig] of Object.entries(graphs)) {
        const filename = this.sanitizeFilename(title) + '.png';
        const filepath = path.join(outputDir, filename);
        const shouldRegenerate = forceRegenerate || await this.shouldRegenerateChart(filepath, title, graphConfig);
        
        if (shouldRegenerate) {
          await this.generateChart(title, graphConfig);
          regeneratedCount++;
        } else {
          skippedCount++;
        }
      }
      
      await this.generateIndexHtml();
      
      this.logger.info(`Chart generation complete: ${regeneratedCount} regenerated, ${skippedCount} skipped`);
    } catch (error) {
      this.logger.error(`Error generating charts: ${error.message}`);
    }
  }

  async generateChart(title, config) {
    try {
      const data = await this.fetchChartData(title, config);
      
      if (!data || data.length === 0) {
        this.logger.warn(`No data available for chart: ${title}`);
        return;
      }

      const chartConfig = this.createChartConfig(title, config, data);
      const buffer = await this.chartJSNodeCanvas.renderToBuffer(chartConfig);
      
      const filename = this.sanitizeFilename(title) + '.png';
      const filepath = path.join(__dirname, '..', 'charts', filename);
      
      await fs.writeFile(filepath, buffer);
      this.logger.debug(`Generated chart: ${filename}`);
    } catch (error) {
      this.logger.error(`Error generating chart "${title}": ${error.message}`);
    }
  }

  async fetchChartData(title, config) {
    const metricKey = config.metric === '*' ? 'all' : config.metric;
    const yAxisName = config['y-axis'];
    const now = Math.floor(Date.now() / 1000);
    const startTime = this.getStartTime(config.limit, now);
    
    let data;
    if (config.source === 'latest') {
      if (metricKey === 'all') {
        data = await this.database.all(
          `SELECT timestamp, key, value, unit 
           FROM metrics 
           WHERE name = ? AND timestamp >= ?
           ORDER BY timestamp DESC 
           LIMIT 1000`,
          [yAxisName, startTime]
        );
      } else {
        data = await this.database.all(
          `SELECT timestamp, value, unit 
           FROM metrics 
           WHERE key = ? AND name = ? AND timestamp >= ?
           ORDER BY timestamp DESC 
           LIMIT 1000`,
          [metricKey, yAxisName, startTime]
        );
      }
    } else if (config.source.startsWith('rollup-')) {
      const increment = config.source.replace('rollup-', '');
      data = await this.database.all(
        `SELECT timestamp, min, max, average, unit
         FROM rollups
         WHERE increment = ? AND key = ? AND name = ? AND timestamp >= ?
         ORDER BY timestamp DESC
         LIMIT 120`,
        [increment, metricKey, yAxisName, startTime]
      );
    }
    
    return data ? data.reverse() : [];
  }

  createChartConfig(title, config, data) {
    const chartType = this.getChartType(config.type);
    const isAreaChart = config.type === 'AreaChart';
    const isMultiSeries = data.length > 0 && data[0].key;
    
    // Generate full time range based on limit
    const now = Math.floor(Date.now() / 1000);
    const startTime = this.getStartTime(config.limit, now);
    const labels = this.generateTimeLabels(startTime, now, config.source);
    
    let datasets;
    
    if (isMultiSeries) {
      // Group data by key for multi-series charts
      const groupedData = this.groupDataByKey(data);
      datasets = Object.entries(groupedData).map(([key, values], index) => ({
        label: key,
        data: this.alignDataToFullTimeRange(values, labels, startTime, now),
        backgroundColor: isAreaChart ? this.getColor(index, 0.2) : this.getColor(index),
        borderColor: this.getColor(index),
        fill: isAreaChart,
        tension: 0.1,
        pointRadius: 0,
        spanGaps: false
      }));
    } else {
      // Check if we have rollup data with aggregation
      const isRollup = config.source.startsWith('rollup-');
      const hasAggregation = isRollup && config.aggregation && config.aggregation.length > 0;
      
      if (hasAggregation) {
        // Create separate datasets for each aggregation type
        const dataMaps = {
          min: {},
          max: {},
          average: {}
        };
        
        data.forEach(d => {
          const ts = d.timestamp;
          if (d.min !== undefined) dataMaps.min[ts] = d.min;
          if (d.max !== undefined) dataMaps.max[ts] = d.max;
          if (d.average !== undefined) dataMaps.average[ts] = d.average;
        });
        
        datasets = [];
        
        // Add datasets for requested aggregations
        if (config.aggregation.includes('min')) {
          const minData = labels.map(label => {
            const ts = this.parseFormattedTimestamp(label);
            return dataMaps.min[ts] !== undefined ? dataMaps.min[ts] : null;
          });
          
          datasets.push({
            label: `${config['y-axis']} (min)`,
            data: minData,
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            borderColor: 'rgb(54, 162, 235)',
            borderWidth: 1,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            spanGaps: false,
            borderDash: [5, 5]
          });
        }
        
        if (config.aggregation.includes('average')) {
          const avgData = labels.map(label => {
            const ts = this.parseFormattedTimestamp(label);
            return dataMaps.average[ts] !== undefined ? dataMaps.average[ts] : null;
          });
          
          datasets.push({
            label: `${config['y-axis']} (avg)`,
            data: avgData,
            backgroundColor: isAreaChart ? 'rgba(75, 192, 192, 0.2)' : 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgb(75, 192, 192)',
            borderWidth: 2,
            fill: isAreaChart,
            tension: 0.1,
            pointRadius: 0,
            spanGaps: false
          });
        }
        
        if (config.aggregation.includes('max')) {
          const maxData = labels.map(label => {
            const ts = this.parseFormattedTimestamp(label);
            return dataMaps.max[ts] !== undefined ? dataMaps.max[ts] : null;
          });
          
          datasets.push({
            label: `${config['y-axis']} (max)`,
            data: maxData,
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            borderColor: 'rgb(255, 99, 132)',
            borderWidth: 1,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            spanGaps: false,
            borderDash: [5, 5]
          });
        }
      } else {
        // Single dataset for non-aggregated data
        const dataMap = {};
        data.forEach(d => {
          const ts = d.timestamp;
          dataMap[ts] = d.average || d.value;
        });
        
        const alignedData = labels.map(label => {
          const ts = this.parseFormattedTimestamp(label);
          return dataMap[ts] !== undefined ? dataMap[ts] : null;
        });
        
        datasets = [{
          label: config['y-axis'],
          data: alignedData,
          backgroundColor: isAreaChart ? 'rgba(75, 192, 192, 0.2)' : 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgb(75, 192, 192)',
          borderWidth: 2,
          fill: isAreaChart,
          tension: 0.1,
          pointRadius: 0,
          spanGaps: false
        }];
      }
    }

    return {
      type: chartType,
      data: {
        labels,
        datasets
      },
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16 }
          },
          legend: {
            display: true,
            position: 'bottom'
          }
        },
        scales: {
          x: {
            display: true,
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: {
            display: true,
            beginAtZero: true
          }
        }
      }
    };
  }

  groupDataByKey(data) {
    const grouped = {};
    data.forEach(item => {
      if (!grouped[item.key]) {
        grouped[item.key] = [];
      }
      grouped[item.key].push({
        timestamp: item.timestamp,
        value: item.value
      });
    });
    return grouped;
  }


  getChartType(type) {
    const typeMap = {
      'LineChart': 'line',
      'BarChart': 'bar',
      'AreaChart': 'line'
    };
    return typeMap[type] || 'line';
  }

  getColor(index, opacity = 1) {
    const colors = [
      [75, 192, 192],
      [255, 99, 132],
      [54, 162, 235],
      [255, 205, 86],
      [153, 102, 255],
      [255, 159, 64]
    ];
    const color = colors[index % colors.length];
    return opacity === 1 
      ? `rgb(${color[0]}, ${color[1]}, ${color[2]})` 
      : `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
  }

  formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
      return format(date, 'HH:mm');
    }
    
    return format(date, 'MMM dd HH:mm');
  }

  generateTimeLabels(startTime, endTime, source) {
    const labels = [];
    let interval;
    
    if (source === 'latest') {
      interval = 60; // 1 minute
    } else if (source === 'rollup-5m') {
      interval = 5 * 60; // 5 minutes
    } else if (source === 'rollup-30m') {
      interval = 30 * 60; // 30 minutes
    } else if (source === 'rollup-1h') {
      interval = 60 * 60; // 1 hour
    } else if (source === 'rollup-12h') {
      interval = 12 * 60 * 60; // 12 hours
    } else if (source === 'rollup-1d') {
      interval = 24 * 60 * 60; // 1 day
    } else {
      interval = 60; // default to 1 minute
    }
    
    // Align start time to interval
    const alignedStart = Math.floor(startTime / interval) * interval;
    
    for (let t = alignedStart; t <= endTime; t += interval) {
      labels.push(this.formatTimestamp(t));
    }
    
    return labels;
  }

  parseFormattedTimestamp(formatted) {
    // This is a simplified reverse of formatTimestamp
    // In production, we'd want a more robust solution
    const now = new Date();
    const today = now.toDateString();
    
    // Check if it's today's format (HH:mm)
    if (formatted.match(/^\d{2}:\d{2}$/)) {
      const [hours, minutes] = formatted.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return Math.floor(date.getTime() / 1000);
    }
    
    // Otherwise parse full format (MMM dd HH:mm)
    // This is a simplified parser - in production use a proper date parser
    return 0; // Placeholder
  }

  alignDataToFullTimeRange(values, labels, startTime, endTime) {
    // Create a map for efficient lookup
    const valueMap = {};
    values.forEach(v => {
      valueMap[v.timestamp] = v.value;
    });
    
    // Generate data points for each label
    return labels.map(label => {
      // Find the timestamp that corresponds to this label
      // This is simplified - in production we'd need proper timestamp parsing
      for (const v of values) {
        if (this.formatTimestamp(v.timestamp) === label) {
          return v.value;
        }
      }
      return null; // No data for this time point
    });
  }

  getStartTime(limit, now) {
    const units = {
      's': 1,
      'm': 60,
      'h': 3600,
      'd': 86400,
      'mo': 2592000,
      'y': 31536000
    };
    
    const match = limit.match(/^(\d+)([smhdy]|mo)$/);
    if (!match) return 0;
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    return now - (value * units[unit]);
  }


  sanitizeFilename(title) {
    return title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async shouldRegenerateChart(filepath, title, config) {
    try {
      // Always regenerate "latest" source charts
      if (config.source === 'latest') {
        return true;
      }
      
      // Check if file exists
      const stats = await fs.stat(filepath).catch(() => null);
      if (!stats) {
        return true; // File doesn't exist, need to generate
      }
      
      // For rollup charts, check if we have new data since last generation
      const fileModifiedTime = Math.floor(stats.mtimeMs / 1000);
      
      // Get the rollup interval
      const increment = config.source.replace('rollup-', '');
      const metricKey = config.metric === '*' ? 'all' : config.metric;
      const yAxisName = config['y-axis'];
      
      // Check latest rollup timestamp
      const latestRollup = await this.database.all(
        `SELECT MAX(timestamp) as latest 
         FROM rollups 
         WHERE increment = ? AND key = ? AND name = ?`,
        [increment, metricKey, yAxisName]
      );
      
      if (!latestRollup || !latestRollup[0] || !latestRollup[0].latest) {
        return false; // No rollup data available
      }
      
      const latestDataTime = latestRollup[0].latest;
      
      // Regenerate if we have data newer than the file
      return latestDataTime >= fileModifiedTime;
    } catch (error) {
      this.logger.error(`Error checking regeneration for "${title}": ${error.message}`);
      return true; // On error, regenerate to be safe
    }
  }

  async generateIndexHtml() {
    const graphs = this.config.getGraphs();
    const chartFiles = Object.keys(graphs).map(title => ({
      title,
      filename: this.sanitizeFilename(title) + '.png'
    }));

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="30">
  <title>Graph Monitor Dashboard</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .dashboard {
      max-width: 1600px;
      margin: 0 auto;
    }
    h1 {
      color: #333;
      margin-bottom: 30px;
    }
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(800px, 1fr));
      gap: 30px;
    }
    .chart {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .chart img {
      width: 100%;
      height: auto;
      display: block;
    }
    .timestamp {
      text-align: center;
      color: #666;
      margin-top: 20px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <h1>Graph Monitor Dashboard</h1>
    <div class="charts-grid">
${chartFiles.map(({ filename }) => `      <div class="chart">
        <img src="${filename}" alt="Chart">
      </div>`).join('\n')}
    </div>
    <div class="timestamp">
      Last updated: ${new Date().toLocaleString()} (Auto-refreshes every 30 seconds)
    </div>
  </div>
</body>
</html>`;

    const indexPath = path.join(__dirname, '..', 'charts', 'index.html');
    await fs.writeFile(indexPath, html);
    this.logger.info('Generated index.html');
  }
}

module.exports = ChartGenerator;