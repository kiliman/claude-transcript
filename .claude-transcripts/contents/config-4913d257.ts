import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Metric {
  command: string;
  [key: string]: any;
}

interface Graph {
  metric: string;
  [key: string]: any;
}

interface Config {
  metrics: Record<string, Metric>;
  graphs?: Record<string, Graph>;
  [key: string]: any;
}

interface ReloadResult {
  success: boolean;
  config?: Config;
  error?: string;
}

class ConfigLoader {
  private configPath: string;
  private config: Config | null;

  constructor(configPath?: string) {
    this.configPath = configPath || join(__dirname, '..', 'config.json');
    this.config = null;
  }

  load(): Config {
    try {
      const configData = readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
      this.validate();
      return this.config!;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Configuration file not found at ${this.configPath}`);
      } else if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in configuration file: ${error.message}`);
      }
      throw error;
    }
  }

  reload(): ReloadResult {
    try {
      const configData = readFileSync(this.configPath, 'utf8');
      const newConfig = JSON.parse(configData) as Config;
      
      // Store old config in case validation fails
      const oldConfig = this.config;
      this.config = newConfig;
      
      try {
        this.validate();
        return { success: true, config: this.config };
      } catch (validationError: any) {
        // Restore old config if validation fails
        this.config = oldConfig;
        return { success: false, error: validationError.message };
      }
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        return { success: false, error: `Invalid JSON: ${error.message}` };
      }
      return { success: false, error: error.message };
    }
  }

  private validate(): void {
    if (!this.config?.metrics || typeof this.config.metrics !== 'object') {
      throw new Error('Configuration must contain a "metrics" object');
    }

    for (const [key, metric] of Object.entries(this.config.metrics)) {
      if (!metric.command || typeof metric.command !== 'string') {
        throw new Error(`Metric "${key}" must have a "command" string`);
      }
    }

    // Validate graphs if present
    if (this.config.graphs) {
      const metricKeys = Object.keys(this.config.metrics);
      
      for (const [title, graph] of Object.entries(this.config.graphs)) {
        if (!graph.metric) {
          throw new Error(`Graph "${title}" must have a "metric" field`);
        }
        
        // Validate metric exists unless it's "*" for all
        if (graph.metric !== '*' && !metricKeys.includes(graph.metric)) {
          throw new Error(`Graph "${title}" references unknown metric: ${graph.metric}`);
        }
      }
    }
  }


  getMetrics(): Record<string, Metric> {
    if (!this.config) {
      this.load();
    }
    return this.config!.metrics;
  }

  getGraphs(): Record<string, Graph> {
    if (!this.config) {
      this.load();
    }
    return this.config!.graphs || {};
  }
}

export default ConfigLoader;