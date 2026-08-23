import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, getLogger, createLogger } from '../lib/utils/logger.js';
import fs from 'fs';
import _path from 'path';

vi.mock('fs');

describe('Logger', () => {
  let logger;
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleGroupSpy;
  let consoleGroupEndSpy;
  let consoleTimeSpy;
  let consoleTimeEndSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    consoleTimeSpy = vi.spyOn(console, 'time').mockImplementation(() => {});
    consoleTimeEndSpy = vi.spyOn(console, 'timeEnd').mockImplementation(() => {});

    // Mock fs.existsSync to return true for log dir check
    fs.existsSync.mockReturnValue(true);

    logger = new Logger({
      level: 'info',
      logToFile: true,
      logDir: 'logs',
      logFile: 'test.log',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('uses default options', () => {
      const defaultLog = new Logger();
      expect(defaultLog.level).toBe('info');
    });

    test('creates log directory if missing', () => {
      fs.existsSync.mockReturnValue(false);
      new Logger({ logDir: 'new-logs' });
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('new-logs'), {
        recursive: true,
      });
    });
  });

  describe('Log Levels', () => {
    test('logs info messages', () => {
      logger.info('Info message');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Info message'));
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test.log'),
        expect.stringContaining('Info message'),
        'utf8'
      );
    });

    test('logs error messages', () => {
      logger.error('Error message');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Error message'));
    });

    test('respects log level', () => {
      logger = new Logger({ level: 'error' });
      logger.info('Should not log');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    test('logs debug when level is debug', () => {
      logger = new Logger({ level: 'debug' });
      logger.debug('Debug message');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Debug message'));
    });
  });

  describe('File Logging', () => {
    test('writes to file when enabled', () => {
      logger.info('Test');
      expect(fs.appendFileSync).toHaveBeenCalled();
    });

    test('skips file writing when disabled', () => {
      logger = new Logger({ logToFile: false });
      logger.info('Test');
      expect(fs.appendFileSync).not.toHaveBeenCalled();
    });

    test('handles write errors gracefully', () => {
      fs.appendFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });
      logger.info('Test');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to write to log file:', 'Write failed');
    });
  });

  describe('Grouping and Timing', () => {
    test('groups logs', () => {
      logger.group('My Group');
      expect(consoleGroupSpy).toHaveBeenCalledWith('My Group');
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('--- My Group ---'),
        'utf8'
      );
    });

    test('ends groups', () => {
      logger.groupEnd();
      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });

    test('starts timer', () => {
      logger.time('Timer');
      expect(consoleTimeSpy).toHaveBeenCalledWith('Timer');
    });

    test('ends timer', () => {
      logger.timeEnd('Timer');
      expect(consoleTimeEndSpy).toHaveBeenCalledWith('Timer');
    });
  });

  describe('Log Rotation', () => {
    test('clears old logs', () => {
      const now = Date.now();
      const oldTime = now - 8 * 24 * 60 * 60 * 1000; // 8 days ago

      fs.readdirSync.mockReturnValue(['old.log', 'new.log']);
      fs.statSync.mockImplementation((p) => ({
        mtime: new Date(p.includes('old') ? oldTime : now),
      }));

      logger.clearOldLogs(7);

      expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('old.log'));
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(expect.stringContaining('new.log'));
    });

    test('handles errors during cleanup', () => {
      fs.readdirSync.mockImplementation(() => {
        throw new Error('Read failed');
      });
      logger.clearOldLogs();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear old logs')
      );
    });
  });

  describe('Recent Logs', () => {
    test('reads recent logs', () => {
      fs.readFileSync.mockReturnValue('line1\nline2\nline3');
      const logs = logger.getRecentLogs(2);
      expect(logs).toEqual(['line2', 'line3']);
    });

    test('returns empty array if file missing', () => {
      fs.existsSync.mockReturnValue(false);
      const logs = logger.getRecentLogs();
      expect(logs).toEqual([]);
    });
  });

  describe('Singleton and Factory', () => {
    test('getLogger returns singleton', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();
      expect(logger1).toBe(logger2);
    });

    test('createLogger returns new instance', () => {
      const logger1 = createLogger();
      const logger2 = createLogger();
      expect(logger1).not.toBe(logger2);
    });
  });
});
