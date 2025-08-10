import sqlite3 from 'sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RunResult {
  id: number;
  changes: number;
}

interface MetricRow {
  value: number;
}

interface LatestMetric {
  timestamp: number;
  value: number;
  unit?: string;
}

interface RollupData {
  timestamp: number;
  min: number;
  max: number;
  average: number;
  unit?: string;
}

class Database {
  private dbPath: string;
  private db: sqlite3.Database | null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(__dirname, '..', 'metrics.db');
    this.db = null;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.verbose().Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async initialize(): Promise<void> {
    await this.connect();
    await this.createTables();
    await this.createIndexes();
  }

  async createTables(): Promise<void> {
    const createMetricsTable = `
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        key TEXT NOT NULL,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT,
        UNIQUE(timestamp, key, name)
      )
    `;

    const createRollupsTable = `
      CREATE TABLE IF NOT EXISTS rollups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        increment TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        key TEXT NOT NULL,
        name TEXT NOT NULL,
        unit TEXT,
        min REAL NOT NULL,
        max REAL NOT NULL,
        average REAL NOT NULL,
        UNIQUE(increment, timestamp, key, name)
      )
    `;

    await this.run(createMetricsTable);
    await this.run(createRollupsTable);
  }

  async createIndexes(): Promise<void> {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_metrics_key_name ON metrics(key, name)',
      'CREATE INDEX IF NOT EXISTS idx_metrics_composite ON metrics(key, name, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_rollups_increment ON rollups(increment)',
      'CREATE INDEX IF NOT EXISTS idx_rollups_timestamp ON rollups(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_rollups_composite ON rollups(increment, key, name, timestamp)'
    ];

    for (const index of indexes) {
      await this.run(index);
    }
  }

  async insertMetric(timestamp: number, key: string, name: string, value: number, unit?: string): Promise<RunResult> {
    const sql = `
      INSERT OR REPLACE INTO metrics (timestamp, key, name, value, unit)
      VALUES (?, ?, ?, ?, ?)
    `;
    return this.run(sql, [timestamp, key, name, value, unit]);
  }

  async insertRollup(
    increment: string,
    timestamp: number,
    key: string,
    name: string,
    unit: string | undefined,
    min: number,
    max: number,
    average: number
  ): Promise<RunResult> {
    const sql = `
      INSERT OR REPLACE INTO rollups (increment, timestamp, key, name, unit, min, max, average)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    return this.run(sql, [increment, timestamp, key, name, unit, min, max, average]);
  }

  async getMetricsForRollup(key: string, name: string, startTime: number, endTime: number): Promise<MetricRow[]> {
    const sql = `
      SELECT value
      FROM metrics
      WHERE key = ? AND name = ? AND timestamp >= ? AND timestamp < ?
      ORDER BY timestamp
    `;
    return this.all(sql, [key, name, startTime, endTime]);
  }

  async getLatestMetrics(key: string, name: string, limit: number): Promise<LatestMetric[]> {
    const sql = `
      SELECT timestamp, value, unit
      FROM metrics
      WHERE key = ? AND name = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    return this.all(sql, [key, name, limit]);
  }

  async getRollupData(increment: string, key: string, name: string, startTime: number): Promise<RollupData[]> {
    const sql = `
      SELECT timestamp, min, max, average, unit
      FROM rollups
      WHERE increment = ? AND key = ? AND name = ? AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 120
    `;
    return this.all(sql, [increment, key, name, startTime]);
  }

  async cleanupOldRollups(increment: string, key: string, name: string): Promise<RunResult> {
    const sql = `
      DELETE FROM rollups
      WHERE increment = ? AND key = ? AND name = ?
      AND id NOT IN (
        SELECT id FROM rollups
        WHERE increment = ? AND key = ? AND name = ?
        ORDER BY timestamp DESC
        LIMIT 120
      )
    `;
    return this.run(sql, [increment, key, name, increment, key, name]);
  }

  private run(sql: string, params: any[] = []): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  private all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

export default Database;