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
      const sqlite = sqlite3.verbose();
      this.db = new sqlite.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });