const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class CommandExecutor {
  constructor(logger) {
    this.logger = logger;
  }

  async execute(command) {
    try {
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(command, { 
        timeout: 30000,
        maxBuffer: 1024 * 1024
      });
      
      const duration = Date.now() - startTime;
      
      if (stderr && stderr.trim()) {
        this.logger.warn(`Command stderr output: ${stderr}`);
      }

      const metrics = this.parseOutput(stdout);
      
      metrics.push({
        name: 'execution_time',
        value: duration,
        unit: 'ms'
      });

      return {
        success: true,
        metrics,
        duration
      };
    } catch (error) {
      this.logger.error(`Command execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        metrics: []
      };
    }
  }

  parseOutput(output) {
    const metrics = [];
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
      if (colonMatch) {
        const [, name, valueAndUnit] = colonMatch;
        
        const valueMatch = valueAndUnit.match(/^([\d.-]+)\s*(.*)$/);
        if (valueMatch) {
          const [, value, unit] = valueMatch;
          metrics.push({
            name: name.trim(),
            value: parseFloat(value),
            unit: unit.trim() || null
          });
        } else {
          metrics.push({
            name: name.trim(),
            value: valueAndUnit.trim(),
            unit: null
          });
        }
      }
    }
    
    return metrics;
  }
}

module.exports = CommandExecutor;