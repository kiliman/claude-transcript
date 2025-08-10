import CommandExecutor from './executor.ts';
import type Database from './database.ts';
import type ConfigLoader from './config.ts';
import type RollupManager from './rollup.ts';
import type winston from 'winston';

interface Metric {
  command: string;
  [key: string]: any;
}

interface StoredMetric {
  key: string;
  name: string;
}

class MetricScheduler {
  private config: ConfigLoader;
  private database: Database;
  private logger: winston.Logger;
  private rollupManager: RollupManager | null;
  private executor: CommandExecutor;
  private mainInterval: NodeJS.Timeout | null;

  constructor(
    config: ConfigLoader,
    database: Database,
    logger: winston.Logger,
    rollupManager: RollupManager | null
  ) {
    this.config = config;
    this.database = database;
    this.logger = logger;
    this.rollupManager = rollupManager;
    this.executor = new CommandExecutor(logger);
    this.mainInterval = null;
  }

  start(): void {
    const metrics = this.config.getMetrics();

    // Execute all metrics immediately
    this.executeAllMetrics();

    // Then run every minute
    this.mainInterval = setInterval(() => {
      this.executeAllMetrics();
    }, 60000);

    this.logger.info(`Started metric collection - running all metrics every minute`);
  }

  async executeAllMetrics(): Promise<void> {
    const metrics = this.config.getMetrics();

    for (const [key, metric] of Object.entries(metrics)) {
      this.executeMetric(key, metric);
    }
  }

  async executeMetric(key: string, metric: Metric): Promise<void> {
    try {
      this.logger.debug(`Executing metric "${key}": ${metric.command}`);

      const result = await this.executor.execute(metric.command);
      // Round timestamp to nearest minute
      const now = Date.now() / 1000;
      const timestamp = Math.round(now / 60) * 60;

      if (result.success) {
        const storedMetrics: StoredMetric[] = [];
        for (const m of result.metrics) {
          await this.database.insertMetric(
            timestamp,
            key,
            m.name,
            typeof m.value === 'number' ? m.value : parseFloat(m.value as string),
            m.unit || undefined
          );
          storedMetrics.push({ key, name: m.name });
        }

        this.logger.debug(`Stored ${result.metrics.length} metrics for "${key}"`);

        // Calculate rollups for the metrics we just stored
        if (this.rollupManager) {
          await this.rollupManager.calculateRollupsForMetrics(storedMetrics);
        }
      } else {
        this.logger.error(`Failed to execute metric "${key}": ${result.error}`);
      }
    } catch (error: any) {
      this.logger.error(`Error processing metric "${key}": ${error.message}`);
    }
  }

  reload(newConfig: ConfigLoader): void {
    this.logger.info('Reloading metric scheduler with new configuration...');

    // Stop the main interval
    if (this.mainInterval) {
      clearInterval(this.mainInterval);
    }

    // Update config and restart
    this.config = newConfig;
    this.start();
  }

  stop(): void {
    if (this.mainInterval) {
      clearInterval(this.mainInterval);
    }

    this.logger.info('Stopped metric collection');
  }
}

export default MetricScheduler;