import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(__dirname, '..', 'bin', 'mcp-server.js');

// Starts bin/mcp-server.js on stdio, sends the given JSON-RPC messages and collects every
// stdout line until the response with `waitForId` arrives.
function runStdioSession(cwd, messages, waitForId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = [];
    let buffer = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`no response ${waitForId} within 15s; stderr: ${stderr}`));
    }, 15000);

    child.stderr.on('data', (d) => (stderr += d));
    child.stdout.on('data', (d) => {
      buffer += d;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        if (!line.trim()) continue;
        lines.push(line);
        try {
          if (JSON.parse(line).id === waitForId) {
            clearTimeout(timer);
            child.kill();
            resolve({ lines, stderr });
          }
        } catch {
          // keep collecting; the assertion reports non-JSON lines
        }
      }
    });
    child.on('error', reject);

    for (const message of messages) {
      child.stdin.write(JSON.stringify(message) + '\n');
    }
  });
}

describe('bin/mcp-server.js stdio transport', () => {
  let projectDir;

  beforeAll(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-mcp-stdio-'));
    fs.mkdirSync(path.join(projectDir, 'src'));
    fs.writeFileSync(path.join(projectDir, 'src', 'app.js'), 'function main() {\n  return 1;\n}\n');
    // The ignore-rule notice used to be printed with console.log as well
    fs.writeFileSync(path.join(projectDir, '.contextignore'), '*.log\n');
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('writes nothing but JSON-RPC messages to stdout while running a tool', async () => {
    const { lines, stderr } = await runStdioSession(
      projectDir,
      [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'analyze_codebase', arguments: { path: projectDir } },
        },
      ],
      2
    );

    const nonJson = lines.filter((line) => {
      try {
        JSON.parse(line);
        return false;
      } catch {
        return true;
      }
    });
    expect(nonJson).toEqual([]);

    const result = JSON.parse(lines.find((line) => JSON.parse(line).id === 2)).result;
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text).stats.totalFiles).toBe(1);
    // The diagnostics still reach the user, on stderr
    expect(stderr).toContain('Starting scan');
  }, 20000);
});
