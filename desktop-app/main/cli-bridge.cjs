/**
 * CliBridge - Executes CLI commands from Desktop App
 * Uses child_process to spawn ctxman CLI
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
// We need to import getLogger dynamically or use a CJS logger.
// Since logger is ESM, we can't require it easily.
// For now, let's use console.log/error or dynamic import.
// But constructor is sync.
// We'll use a simple console logger for bridge.

const logger = {
  info: (msg) => console.log(`[CliBridge] ${msg}`),
  error: (msg) => console.error(`[CliBridge] ${msg}`),
};

class CliBridge {
  constructor() {
    this.cliPath = this.resolveCliPath();
  }

  resolveCliPath() {
    // Check for bundled CLI in resources (Production)
    const bundledPath = path.join(process.resourcesPath, 'bin', 'cli.js');
    if (fs.existsSync(bundledPath)) {
      logger.info(`Using bundled CLI at: ${bundledPath}`);
      return { command: 'node', args: [bundledPath] };
    }

    // Development / Fallback
    const devPath = path.join(process.cwd(), 'bin', 'cli.js');
    if (fs.existsSync(devPath)) {
      logger.info(`Using dev CLI at: ${devPath}`);
      return { command: 'node', args: [devPath] };
    }

    logger.info('Using global ctxman command');
    return { command: 'ctxman', args: [] };
  }

  /**
   * Execute CLI command and return JSON output
   * @param {string} command - Command name (e.g., 'analyze')
   * @param {Array} args - Command arguments
   * @returns {Promise<Object>} Command result
   */
  async execute(command, args = []) {
    return new Promise((resolve, reject) => {
      const { command: cmd, args: baseArgs } = this.cliPath;
      const finalArgs = [...baseArgs, command, '--json', ...args];

      logger.info(`Executing: ${cmd} ${finalArgs.join(' ')}`);

      const child = spawn(cmd, finalArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' }, // Ensure no color codes in JSON
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve({
              success: true,
              data: result,
              exitCode: code,
            });
          } catch (error) {
            // Not JSON, return raw output
            resolve({
              success: true,
              data: { output: stdout },
              exitCode: code,
            });
          }
        } else {
          reject({
            success: false,
            error: stderr || stdout,
            exitCode: code,
          });
        }
      });

      child.on('error', (error) => {
        reject({
          success: false,
          error: error.message,
          exitCode: -1,
        });
      });
    });
  }

  /**
   * Analyze project
   */
  async analyze(projectPath, options = {}) {
    const args = [projectPath];
    if (options.methodLevel) args.push('--method-level');
    if (options.verbose) args.push('--verbose');

    return await this.execute('analyze', args);
  }

  /**
   * Generate context
   */
  async generateContext(projectPath, options = {}) {
    const args = [projectPath];
    if (options.template) args.push('--template', options.template);
    if (options.maxTokens) args.push('--max-tokens', options.maxTokens.toString());

    return await this.execute('generate', args);
  }

  /**
   * List available formats
   */
  async listFormats() {
    return await this.execute('--list-formats', []);
  }

  /**
   * Get version
   */
  async getVersion() {
    return await this.execute('--version', []);
  }
}

module.exports = { CliBridge };
