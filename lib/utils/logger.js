/**
 * Logger System
 * Centralized logging with multiple levels and file output
 * v2.3.6+
 */

import fs from 'fs';
import path from 'path';

class Logger {
  constructor(options = {}) {
    this.level = (options.level || process.env.LOG_LEVEL || 'info').toLowerCase();
    this.logToFile = options.logToFile !== false;
    this.logDir = options.logDir || path.join(process.cwd(), '.ctxman', 'logs');
    this.logFile = options.logFile || `ctxman-${this.getDateString()}.log`;
    this.silent = options.silent || false;

    // Log levels (higher number = more verbose)
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4,
    };

    // Colors for terminal output
    this.colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m', // Yellow
      info: '\x1b[36m', // Cyan
      debug: '\x1b[35m', // Magenta
      trace: '\x1b[90m', // Gray
      reset: '\x1b[0m',
    };

    // Icons for each level
    this.icons = {
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🔍',
      trace: '🔬',
    };

    this.initializeLogDirectory();
  }

  /**
   * Initialize log directory
   */
  initializeLogDirectory() {
    if (this.logToFile) {
      const fullLogDir = path.isAbsolute(this.logDir)
        ? this.logDir
        : path.join(process.cwd(), this.logDir);
      if (!fs.existsSync(fullLogDir)) {
        fs.mkdirSync(fullLogDir, { recursive: true });
      }
    }
  }

  /**
   * Get current date string for log file names
   */
  getDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  /**
   * Get timestamp for log entries
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Check if should log based on level
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  /**
   * Format log message
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = this.getTimestamp();
    const icon = this.icons[level];

    // Console format (with colors)
    const consoleMessage = `${this.colors[level]}${icon} [${level.toUpperCase()}]${this.colors.reset} ${message}`;

    // File format (plain text with metadata)
    const metaString = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    const fileMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;

    return { consoleMessage, fileMessage };
  }

  /**
   * Write log to file
   */
  writeToFile(message) {
    if (!this.logToFile) return;

    try {
      const fullLogPath = path.isAbsolute(this.logDir)
        ? path.join(this.logDir, this.logFile)
        : path.join(process.cwd(), this.logDir, this.logFile);

      fs.appendFileSync(fullLogPath, message + '\n', 'utf8');
    } catch (error) {
      // Fail silently to avoid infinite loop
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * Core logging method
   */
  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const { consoleMessage, fileMessage } = this.formatMessage(level, message, meta);

    // Output to console
    if (!this.silent) {
      console.log(consoleMessage);
    }

    // Output to file
    this.writeToFile(fileMessage);
  }

  /**
   * Convenience methods
   */
  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  trace(message, meta = {}) {
    this.log('trace', message, meta);
  }

  /**
   * Log with custom icon
   */
  custom(icon, level, message, meta = {}) {
    const originalIcon = this.icons[level];
    this.icons[level] = icon;
    this.log(level, message, meta);
    this.icons[level] = originalIcon;
  }

  /**
   * Group related logs
   */
  group(title) {
    if (!this.silent) {
      console.group(title);
    }
    this.writeToFile(`\n--- ${title} ---`);
  }

  groupEnd() {
    if (!this.silent) {
      console.groupEnd();
    }
    this.writeToFile('--- End Group ---\n');
  }

  /**
   * Log with timer
   */
  time(label) {
    console.time(label);
    this.writeToFile(`[TIMER START] ${label}`);
  }

  timeEnd(label) {
    console.timeEnd(label);
    this.writeToFile(`[TIMER END] ${label}`);
  }

  /**
   * Clear old log files (keep last N days)
   */
  clearOldLogs(daysToKeep = 7) {
    try {
      const fullLogDir = path.isAbsolute(this.logDir)
        ? this.logDir
        : path.join(process.cwd(), this.logDir);
      if (!fs.existsSync(fullLogDir)) return;

      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

      const files = fs.readdirSync(fullLogDir);
      files.forEach((file) => {
        const filePath = path.join(fullLogDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtime.getTime();

        if (age > maxAge) {
          fs.unlinkSync(filePath);
          this.debug(`Deleted old log file: ${file}`);
        }
      });
    } catch (error) {
      this.error('Failed to clear old logs', { error: error.message });
    }
  }

  /**
   * Get log file path
   */
  getLogFilePath() {
    return path.isAbsolute(this.logDir)
      ? path.join(this.logDir, this.logFile)
      : path.join(process.cwd(), this.logDir, this.logFile);
  }

  /**
   * Read recent logs
   */
  getRecentLogs(lines = 100) {
    try {
      const logPath = this.getLogFilePath();
      if (!fs.existsSync(logPath)) {
        return [];
      }

      const content = fs.readFileSync(logPath, 'utf8');
      const allLines = content.split('\n').filter((line) => line.trim());
      return allLines.slice(-lines);
    } catch (error) {
      this.error('Failed to read logs', { error: error.message });
      return [];
    }
  }
}

// Create singleton instance
let defaultLogger = null;

/**
 * Get or create default logger instance
 */
function getLogger(options = {}) {
  if (!defaultLogger) {
    defaultLogger = new Logger(options);
  }
  return defaultLogger;
}

/**
 * Create a new logger instance
 */
function createLogger(options = {}) {
  return new Logger(options);
}

export { Logger, getLogger, createLogger };
