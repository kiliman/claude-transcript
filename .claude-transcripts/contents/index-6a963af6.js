const ConfigLoader = require('./config');
const Database = require('./database');
const MetricScheduler = require('./scheduler');
const RollupManager = require('./rollup');
const ChartGenerator = require('./chartGenerator');
const createLogger = require('./logger');
const fs = require('fs');
const path = require('path');

class DataCaptureService {
  constructor() {
    this.logger = createLogger();
    this.config = new ConfigLoader();
    this.database = new Database();
    this.scheduler = null;
    this.rollupManager = null;
    this.chartGenerator = null;
    this.chartInterval = null;
    this.configWatcher = null;
  }

  async start() {
    try {
      this.logger.info('Starting Data Capture Service...');
      
      this.ensureLogsDirectory();
      
      this.logger.info('Loading configuration...');
      this.config.load();
      
      this.logger.info('Initializing database...');
      await this.database.initialize();
      
      this.rollupManager = new RollupManager(this.database, this.logger);
      this.rollupManager.start();
      
      this.scheduler = new MetricScheduler(this.config, this.database, this.logger, this.rollupManager);
      this.scheduler.start();
      
      this.chartGenerator = new ChartGenerator(this.database, this.config, this.logger);
      
      // Generate all charts immediately on startup (force regenerate)
      await this.chartGenerator.generateAllCharts(true);
      
      this.startChartGeneration();
      this.startConfigWatcher();
      this.setupShutdownHandlers();
      
      this.logger.info('Data Capture Service started successfully');
    } catch (error) {
      this.logger.error(`Failed to start service: ${error.message}`);
      process.exit(1);
    }
  }

  ensureLogsDirectory() {
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  startChartGeneration() {
    // Set up periodic chart generation every minute
    this.chartInterval = setInterval(() => {
      this.chartGenerator.generateAllCharts();
    }, 60000);
    
    this.logger.info('Started periodic chart generation (updates every minute)');
  }

  startConfigWatcher() {
    const configPath = this.config.configPath;
    
    this.logger.info(`Watching config file for changes: ${configPath}`);
    
    // Use fs.watchFile for better cross-platform compatibility
    this.configWatcher = fs.watchFile(configPath, { interval: 2000 }, (curr, prev) => {
      // Check if file was modified (mtime changed)
      if (curr.mtime > prev.mtime) {
        this.logger.info('Configuration file changed, attempting to reload...');
        this.reloadConfig();
      }
    });
  }

  async reloadConfig() {
    const result = this.config.reload();
    
    if (result.success) {
      this.logger.info('Configuration reloaded successfully');
      
      // Reload scheduler with new config
      this.scheduler.reload(this.config);
      
      // Update chart generator with new config
      this.chartGenerator = new ChartGenerator(this.database, this.config, this.logger);
      
      // Regenerate all charts immediately with new config (force regenerate)
      this.logger.info('Regenerating all charts with new configuration...');
      await this.chartGenerator.generateAllCharts(true);
    } else {
      this.logger.error(`Configuration reload failed, keeping existing config: ${result.error}`);
    }
  }

  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      
      if (this.scheduler) {
        this.scheduler.stop();
      }
      
      if (this.rollupManager) {
        this.rollupManager.stop();
      }
      
      if (this.chartInterval) {
        clearInterval(this.chartInterval);
      }
      
      if (this.configWatcher) {
        fs.unwatchFile(this.config.configPath);
      }
      
      if (this.database) {
        await this.database.close();
      }
      
      this.logger.info('Service shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      this.logger.error(`Uncaught exception: ${error.message}`, { stack: error.stack });
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }
}

const service = new DataCaptureService();
service.start();