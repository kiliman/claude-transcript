import ConfigLoader from './config.js';
import Database from './database.js';
import MetricScheduler from './scheduler.js';
import RollupManager from './rollup.js';
import ChartGenerator from './chartGenerator.js';
import createLogger from './logger.js';
import { watchFile, unwatchFile, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type winston from 'winston';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DataCaptureService {
  private logger: winston.Logger;
  private config: ConfigLoader;
  private database: Database;
  private scheduler: MetricScheduler | null;
  private rollupManager: RollupManager | null;
  private chartGenerator: ChartGenerator | null;
  private chartInterval: NodeJS.Timeout | null;
  private configWatcher: any;

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

  async start(): Promise<void> {
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
    } catch (error: any) {
      this.logger.error(`Failed to start service: ${error.message}`);
      process.exit(1);
    }
  }

  private ensureLogsDirectory(): void {
    const logsDir = join(__dirname, '..', 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
  }

  private startChartGeneration(): void {
    // Set up periodic chart generation every minute
    this.chartInterval = setInterval(() => {
      this.chartGenerator!.generateAllCharts();
    }, 60000);
    
    this.logger.info('Started periodic chart generation (updates every minute)');
  }

  private startConfigWatcher(): void {
    const configPath = (this.config as any).configPath;
    
    this.logger.info(`Watching config file for changes: ${configPath}`);
    
    // Use fs.watchFile for better cross-platform compatibility
    this.configWatcher = watchFile(configPath, { interval: 2000 }, (curr, prev) => {
      // Check if file was modified (mtime changed)
      if (curr.mtime > prev.mtime) {
        this.logger.info('Configuration file changed, attempting to reload...');
        this.reloadConfig();
      }
    });
  }

  private async reloadConfig(): Promise<void> {
    const result = this.config.reload();
    
    if (result.success) {
      this.logger.info('Configuration reloaded successfully');
      
      // Reload scheduler with new config
      this.scheduler!.reload(this.config);
      
      // Update chart generator with new config
      this.chartGenerator = new ChartGenerator(this.database, this.config, this.logger);
      
      // Regenerate all charts immediately with new config (force regenerate)
      this.logger.info('Regenerating all charts with new configuration...');
      await this.chartGenerator.generateAllCharts(true);
    } else {
      this.logger.error(`Configuration reload failed, keeping existing config: ${result.error}`);
    }
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
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
        unwatchFile((this.config as any).configPath);
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