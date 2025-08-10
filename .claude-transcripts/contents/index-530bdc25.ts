import ConfigLoader from './config.ts';
import Database from './database.ts';
import MetricScheduler from './scheduler.ts';
import RollupManager from './rollup.ts';
import ChartGenerator from './chartGenerator.ts';
import logger from './logger.ts';
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
    this.logger = logger;
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
      