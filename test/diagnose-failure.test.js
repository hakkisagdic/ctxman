import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { diagnoseFailure, parseStackFrames } from '../lib/diagnose/index.js';
import MCPServer from '../lib/api/mcp/server.js';

describe('diagnoseFailure & cm-diagnose CLI & MCP diagnose_failure', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-diag-')));

    fs.mkdirSync(path.join(tmpDir, 'src', 'service'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'secrets'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.ctxman'), { recursive: true });

    // File with method
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'service', 'payment.js'),
      `export class PaymentService {\n  processTransaction(user, amount) {\n    if (!user.card) {\n      throw new Error('Missing payment method for user');\n    }\n    return true;\n  }\n}\n`
    );

    // Caller
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'service', 'checkout.js'),
      `import { PaymentService } from './payment.js';\nexport function checkout(user, cart) {\n  const service = new PaymentService();\n  return service.processTransaction(user, cart.total);\n}\n`
    );

    // Secret bearing file & policy
    fs.writeFileSync(
      path.join(tmpDir, 'secrets', 'db-passwords.txt'),
      'mysql://root:supersecret@localhost:3306/prod'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.ctxman', 'policy.json'),
      JSON.stringify({ version: 1, deny: ['secrets/'] })
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('parseStackFrames', () => {
    it('parses Node / V8 stack frames', () => {
      const trace = `Error: Something went wrong
    at PaymentService.processTransaction (/app/src/service/payment.js:4:13)
    at checkout (/app/src/service/checkout.js:4:18)
    at Object.<anonymous> (/app/index.js:10:1)`;

      const frames = parseStackFrames(trace);
      expect(frames).toHaveLength(3);
      expect(frames[0].file).toBe('/app/src/service/payment.js');
      expect(frames[0].line).toBe(4);
      expect(frames[0].col).toBe(13);
      expect(frames[0].func).toBe('PaymentService.processTransaction');
    });

    it('parses Python traceback frames', () => {
      const trace = `Traceback (most recent call last):
  File "app/main.py", line 42, in handle_request
    response = service.call()
  File "/usr/lib/python3.10/socket.py", line 120, in read
    return sock.recv()`;

      const frames = parseStackFrames(trace);
      expect(frames.length).toBeGreaterThanOrEqual(2);
      expect(frames[0].file).toBe('app/main.py');
      expect(frames[0].line).toBe(42);
      expect(frames[0].func).toBe('handle_request');
    });

    it('parses Rust and Go error lines', () => {
      const trace = `thread 'main' panicked at 'explicit panic', src/lib.rs:25:5
goroutine 1 [running]:
main.process(0x0?)
\t/path/to/server.go:88 +0x24`;

      const frames = parseStackFrames(trace);
      expect(frames.some((f) => f.file.endsWith('lib.rs') && f.line === 25)).toBe(true);
      expect(frames.some((f) => f.file.endsWith('server.go') && f.line === 88)).toBe(true);
    });

    it('parses Vitest failure indicator lines', () => {
      const trace = `FAIL test/auth.test.js > login test
❯ test/auth.test.js:55:12
  53|     expect(res.status).toBe(200);`;

      const frames = parseStackFrames(trace);
      expect(frames.some((f) => f.file === 'test/auth.test.js' && f.line === 55)).toBe(true);
    });
  });

  describe('diagnoseFailure', () => {
    it('diagnoses failure, extracts code window and enclosing method', async () => {
      const trace = `Error: Missing payment method for user
    at PaymentService.processTransaction (${path.join(tmpDir, 'src', 'service', 'payment.js')}:4:13)
    at checkout (${path.join(tmpDir, 'src', 'service', 'checkout.js')}:4:18)`;

      const result = await diagnoseFailure(tmpDir, trace, {
        budget: 24000,
        format: 'markdown',
      });

      expect(result.implicatedFiles).toContain('src/service/payment.js');
      expect(result.implicatedFiles).toContain('src/service/checkout.js');
      expect(result.text).toContain('# Failure Diagnosis Report');
      expect(result.text).toContain('src/service/payment.js:4');
      // Should mark the failing line with '>'
      expect(result.text).toContain('>    4 | ');
    });

    it('returns JSON format when requested', async () => {
      const trace = `Error: fail
    at (${path.join(tmpDir, 'src', 'service', 'payment.js')}:4:5)`;

      const result = await diagnoseFailure(tmpDir, trace, {
        format: 'json',
      });

      const parsed = JSON.parse(result.text);
      expect(parsed.implicatedFiles).toContain('src/service/payment.js');
      expect(parsed.snippets).toBeDefined();
      expect(parsed.snippets[0].line).toBe(4);
    });

    it('filters out policy denied files', async () => {
      const trace = `Error: leaked secret
    at readSecrets (${path.join(tmpDir, 'secrets', 'db-passwords.txt')}:1:1)`;

      const result = await diagnoseFailure(tmpDir, trace, {
        format: 'json',
      });

      const parsed = JSON.parse(result.text);
      expect(parsed.implicatedFiles).not.toContain('secrets/db-passwords.txt');
      expect(parsed.deniedFiles).toContain('secrets/db-passwords.txt');
    });

    it('redacts secrets from failure text and snippets', async () => {
      const secret = 'sk-ant-api03-' + 'x'.repeat(40);
      const trace = `Error: connection failed with ${secret}
    at PaymentService.processTransaction (${path.join(tmpDir, 'src', 'service', 'payment.js')}:4:13)`;

      const result = await diagnoseFailure(tmpDir, trace, {
        redact: true,
      });

      expect(result.text).not.toContain(secret);
      expect(result.redactions.total).toBeGreaterThan(0);
    });
  });

  describe('cm-diagnose CLI', () => {
    it('runs via CLI and prints help', () => {
      const cliPath = path.resolve('bin/cm-diagnose.js');
      const res = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf-8' });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('ctxman diagnose');
    });

    it('accepts error log file argument', () => {
      const logFile = path.join(tmpDir, 'error.log');
      fs.writeFileSync(
        logFile,
        `Error: fail at (${path.join(tmpDir, 'src', 'service', 'payment.js')}:4:5)`
      );

      const cliPath = path.resolve('bin/cm-diagnose.js');
      const res = spawnSync(process.execPath, [cliPath, logFile, '--json'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      expect(res.status).toBe(0);
      const json = JSON.parse(res.stdout);
      expect(json.implicatedFiles).toContain('src/service/payment.js');
    });

    it('accepts error log from stdin with --stdin flag', () => {
      const cliPath = path.resolve('bin/cm-diagnose.js');
      const trace = `Error: fail at (${path.join(tmpDir, 'src', 'service', 'payment.js')}:4:5)`;

      const res = spawnSync(process.execPath, [cliPath, '--stdin', '--json'], {
        cwd: tmpDir,
        input: trace,
        encoding: 'utf-8',
      });

      expect(res.status).toBe(0);
      const json = JSON.parse(res.stdout);
      expect(json.implicatedFiles).toContain('src/service/payment.js');
    });
  });

  describe('MCP diagnose_failure tool', () => {
    it('executes diagnose_failure handler within MCP server', async () => {
      const server = new MCPServer(tmpDir);
      const handler = server.server._requestHandlers.get('tools/call');

      const trace = `Error: payment failed
    at (${path.join(tmpDir, 'src', 'service', 'payment.js')}:4:5)`;

      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'diagnose_failure',
          arguments: {
            path: tmpDir,
            trace,
            budget: 12000,
          },
        },
      });

      expect(response.content).toBeDefined();
      expect(response.content[0].text).toContain('# Failure Diagnosis Report');
      expect(response.content[0].text).toContain('src/service/payment.js');
    });
  });
});
