import type winston from 'winston';
import type Database from './database.ts';

interface RollupInterval {
  key: string;
  seconds: number;
  source: string;
  maxEntries: number;
}

interface MetricInfo {
  key: string;
  name: string;
}

interface RollupData {
  min: number;
  max: number;
  average: number;
}

class RollupManager {
  private database: Database;
  private logger: winston.Logger;
  private rollupIntervals: RollupInterval[];

  constructor(database: Database, logger: winston.Logger) {
    this.database = database;
    this.logger = logger;
    
    // Define rollup hierarchy - each level uses the previous as source
    this.rollupIntervals = [
      { key: '5m', seconds: 5 * 60, source: 'metrics', maxEntries: 120 },
      { key: '30m', seconds: 30 * 60, source: '5m', maxEntries: 120 },
      { key: '1h', seconds: 60 * 60, source: '30m', maxEntries: 120 },
      { key: '12h', seconds: 12 * 60 * 60, source: '1h', maxEntries: 120 },
      { key: '1d', seconds: 24 * 60 * 60, source: '12h', maxEntries: 120 },
      { key: '1mo', seconds: 30 * 24 * 60 * 60, source: '1d', maxEntries: 120 }
    ];
  }

  start(): void {
    this.logger.info('Rollup manager started - will calculate rollups on metric capture');
  }

  async calculateRollupsForMetrics(metrics: MetricInfo[]): Promise<void> {
    const uniqueKeys = new Set<string>();
    metrics.forEach(m => uniqueKeys.add(`${m.key}:${m.name}`));
    
    for (const keyName of uniqueKeys) {
      const [key, name] = keyName.split(':');
      await this.calculateRollupsForMetric(key, name);
    }
  }

  async calculateRollupsForMetric(key: string, name: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    for (const interval of this.rollupIntervals) {
      try {
        await this.updateRollup(interval, key, name, now);
      } catch (error: any) {
        this.logger.error(`Error calculating ${interval.key} rollup for ${key}/${name}: ${error.message}`);
      }
    }
  }

  private async updateRollup(interval: RollupInterval, key: string, name: string, currentTime: number): Promise<void> {
    const alignedTimestamp = this.alignTimestamp(currentTime, interval.seconds);
    const startTime = alignedTimestamp;
    const endTime = alignedTimestamp + interval.seconds;
    
    let data: RollupData;
    let unit: string | undefined;
    
    if (interval.source === 'metrics') {
      // First level uses raw metrics
      const metrics = await this.database.getMetricsForRollup(key, name, startTime, endTime);
      if (metrics.length === 0) return;
      
      const values = metrics.map(m => m.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      
      // Get unit from metrics
      const firstMetric = await (this.database as any).all(
        'SELECT unit FROM metrics WHERE key = ? AND name = ? LIMIT 1',
        [key, name]
      );
      unit = firstMetric[0]?.unit || undefined;
      
      data = { min, max, average };
    } else {
      // Higher levels use previous rollup level
      const sourceData = await (this.database as any).all(
        `SELECT min, max, average, unit 
         FROM rollups 
         WHERE increment = ? AND key = ? AND name = ? 
         AND timestamp >= ? AND timestamp < ?`,
        [interval.source, key, name, startTime, endTime]
      );
      
      if (sourceData.length === 0) return;
      
      // Aggregate from source rollups
      const mins = sourceData.map((d: any) => d.min);
      const maxs = sourceData.map((d: any) => d.max);
      const averages = sourceData.map((d: any) => d.average);
      
      const min = Math.min(...mins);
      const max = Math.max(...maxs);
      const average = averages.reduce((a: number, b: number) => a + b, 0) / averages.length;
      
      unit = sourceData[0]?.unit || undefined;
      data = { min, max, average };
    }
    
    // Insert or update the rollup
    await this.database.insertRollup(
      interval.key,
      alignedTimestamp,
      key,
      name,
      unit,
      data.min,
      data.max,
      data.average
    );
    
    // Cleanup old data
    await this.cleanupOldData(interval, key, name, currentTime);
  }

  private async cleanupOldData(interval: RollupInterval, key: string, name: string, currentTime: number): Promise<void> {
    // Calculate cutoff time based on max entries
    const cutoffTime = currentTime - (interval.maxEntries * interval.seconds);
    
    if (interval.source === 'metrics') {
      // For 5m rollup, clean up raw metrics older than 1 hour
      const metricsKeepTime = currentTime - (60 * 60); // Keep last hour
      await (this.database as any).all(
        'DELETE FROM metrics WHERE key = ? AND name = ? AND timestamp < ?',
        [key, name, metricsKeepTime]
      );
    }
    
    // Clean up old rollups for this interval
    await (this.database as any).all(
      'DELETE FROM rollups WHERE increment = ? AND key = ? AND name = ? AND timestamp < ?',
      [interval.key, key, name, cutoffTime]
    );
  }

  private alignTimestamp(timestamp: number, intervalSeconds: number): number {
    return Math.floor(timestamp / intervalSeconds) * intervalSeconds;
  }

  stop(): void {
    this.logger.info('Rollup manager stopped');
  }
}

export default RollupManager;