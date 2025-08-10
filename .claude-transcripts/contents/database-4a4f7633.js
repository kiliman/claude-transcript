const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '..', 'metrics.db');
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async initialize() {
    await this.connect();
    await this.createTables();
    await this.createIndexes();
  }

  async createTables() {
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

  async createIndexes() {
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

  async insertMetric(timestamp, key, name, value, unit) {
    const sql = `
      INSERT OR REPLACE INTO metrics (timestamp, key, name, value, unit)
      VALUES (?, ?, ?, ?, ?)
    `;
    return this.run(sql, [timestamp, key, name, value, unit]);
  }

  async insertRollup(increment, timestamp, key, name, unit, min, max, average) {
    const sql = `
      INSERT OR REPLACE INTO rollups (increment, timestamp, key, name, unit, min, max, average)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    return this.run(sql, [increment, timestamp, key, name, unit, min, max, average]);
  }

  async getMetricsForRollup(key, name, startTime, endTime) {
    const sql = `
      SELECT value
      FROM metrics
      WHERE key = ? AND name = ? AND timestamp >= ? AND timestamp < ?
      ORDER BY timestamp
    `;
    return this.all(sql, [key, name, startTime, endTime]);
  }

  async getLatestMetrics(key, name, limit) {
    const sql = `
      SELECT timestamp, value, unit
      FROM metrics
      WHERE key = ? AND name = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    return this.all(sql, [key, name, limit]);
  }

  async getRollupData(increment, key, name, startTime) {
    const sql = `
      SELECT timestamp, min, max, average, unit
      FROM rollups
      WHERE increment = ? AND key = ? AND name = ? AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 120
    `;
    return this.all(sql, [increment, key, name, startTime]);
  }

  async cleanupOldRollups(increment, key, name) {
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

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
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

module.exports = Database;