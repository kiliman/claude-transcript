const CommandExecutor = require('./executor');
const Database = require('./database');

class MetricScheduler {
  constructor(config, database, logger, rollupManager) {
    this.config = config;
    this.database = database;
    this.logger = logger;
    this.rollupManager = rollupManager;
    this.executor = new CommandExecutor(logger);
    this.mainInterval = null;
  }

  start() {
    const metrics = this.config.getMetrics();

    // Execute all metrics immediately
    this.executeAllMetrics();

    // Then run every minute
    this.mainInterval = setInterval(() => {
      this.executeAllMetrics();
    }, 60000);

    this.logger.info(`Started metric collection - running all metrics every minute`);
  }

  async executeAllMetrics() {
    const metrics = this.config.getMetrics();

    for (const [key, metric] of Object.entries(metrics)) {
      this.executeMetric(key, metric);
    }
  }

  async executeMetric(key, metric) {
    try {
      this.logger.debug(`Executing metric "${key}": ${metric.command}`);

      const result = await this.executor.execute(metric.command);
      // Round timestamp to nearest minute
      const now = Date.now() / 1000;
      const timestamp = Math.round(now / 60) * 60;

      if (result.success) {
        const storedMetrics = [];
        for (const m of result.metrics) {
          await this.database.insertMetric(
            timestamp,
            key,
            m.name,
            m.value,
            m.unit
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
    } catch (error) {
      this.logger.error(`Error processing metric "${key}": ${error.message}`);
    }
  }

  reload(newConfig) {
    this.logger.info('Reloading metric scheduler with new configuration...');

    // Stop the main interval
    if (this.mainInterval) {
      clearInterval(this.mainInterval);
    }

    // Update config and restart
    this.config = newConfig;
    this.start();
  }

  stop() {
    if (this.mainInterval) {
      clearInterval(this.mainInterval);
    }

    this.logger.info('Stopped metric collection');
  }
}

module.exports = MetricScheduler;