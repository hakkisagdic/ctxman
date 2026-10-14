import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from '../lib/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Logger with a log directory that cannot be created', () => {
  let workDir;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-logger-dir-'));
    // A regular file where the log directory should go makes mkdir fail (ENOTDIR) even
    // when the tests run as root, where a read-only directory would not
    fs.writeFileSync(path.join(workDir, '.ctxman'), '');
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('falls back to console-only logging instead of throwing', () => {
    const logDir = path.join(workDir, '.ctxman', 'logs');
    let logger;

    expect(() => {
      logger = new Logger({ logDir, silent: true });
    }).not.toThrow();
    expect(logger.logToFile).toBe(false);
    expect(() => logger.info('still works')).not.toThrow();
  });

  it('lets the MCP server start from such a working directory', () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'mcp-server.js')], {
      cwd: workDir,
      input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) + '\n',
      encoding: 'utf8',
      timeout: 15000,
    });

    expect(r.stderr).not.toContain('ENOTDIR');
    expect(JSON.parse(r.stdout.trim().split('\n')[0])).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {},
    });
  });
});
