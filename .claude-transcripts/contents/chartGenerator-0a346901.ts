  [key: string]: Array<{ timestamp: number; value: number }>;
}

class ChartGenerator {
  private database: Database;
  private config: ConfigLoader;
  private logger: winston.Logger;
  private width: number;
  private height: number;
  private chartJSNodeCanvas: ChartJSNodeCanvas;

  constructor(database: Database, config: ConfigLoader, logger: winston.Logger) {
    this.database = database;
    this.config = config;
    this.logger = logger;
    this.width = 800;
    this.height = 400;
    this.chartJSNodeCanvas = new ChartJSNodeCanvas({ 
      width: this.width, 
      height: this.height,