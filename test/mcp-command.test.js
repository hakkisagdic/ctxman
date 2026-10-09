import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseServerArgs } from '../lib/api/mcp/start.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

/**
 * Start `ctxman mcp` on stdio, send JSON-RPC messages one after the other and collect the
 * responses by id. Resolves once every request has been answered.
 */
function mcpSession(args, requests, { cwd, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, 'mcp', ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const responses = new Map();
    const stray = [];
    let buffer = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`no complete MCP session within 20s; stderr: ${stderr}`));
    }, 20000);

    const messages = [
      {
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      ...requests.map((request, i) => ({ jsonrpc: '2.0', id: i + 1, ...request })),
    ];
    const pending = new Set(messages.filter((m) => 'id' in m).map((m) => m.id));

    child.stderr.on('data', (d) => (stderr += d));
    child.stdout.on('data', (d) => {
      buffer += d;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          stray.push(line);
          continue;
        }
        responses.set(message.id, message);
        pending.delete(message.id);
        if (pending.size === 0) {
          clearTimeout(timer);
          // Closing stdin must be enough to stop the server
          child.stdin.end();
        }
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (pending.size > 0) {
        reject(new Error(`server exited with ${code} before answering; stderr: ${stderr}`));
      } else {
        resolve({ responses, stray, stderr, code });
      }
    });

    for (const message of messages) child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

const toolText = (response) => {
  expect(response.result.isError).toBeFalsy();
  return JSON.parse(response.result.content[0].text);
};

describe('parseServerArgs', () => {
  it('accepts both --opt=value and --opt value', () => {
    const expected = {
      transport: 'sse',
      port: 3001,
      host: '0.0.0.0',
      apiKey: 'k',
      cors: true,
      root: '/srv/app',
      help: false,
    };

    expect(
      parseServerArgs([
        '--transport=sse',
        '--port=3001',
        '--host=0.0.0.0',
        '--api-key=k',
        '--cors',
        '--root=/srv/app',
      ])
    ).toEqual(expected);
    expect(
      parseServerArgs([
        '--transport',
        'sse',
        '--port',
        '3001',
        '--host',
        '0.0.0.0',
        '--api-key',
        'k',
        '--cors',
        '--root',
        '/srv/app',
      ])
    ).toEqual(expected);
  });

  it('defaults to stdio on 127.0.0.1:3000', () => {
    expect(parseServerArgs([])).toEqual({
      transport: 'stdio',
      port: 3000,
      host: '127.0.0.1',
      apiKey: undefined,
      cors: false,
      root: undefined,
      help: false,
    });
  });

  it('rejects unknown options and invalid values in strict mode', () => {
    expect(() => parseServerArgs(['--bogus'])).toThrow("Unknown option '--bogus'");
    expect(() => parseServerArgs(['--transport=ws'])).toThrow('Unknown transport "ws"');
    expect(() => parseServerArgs(['--port', 'abc'])).toThrow('Invalid port "abc"');
    expect(() => parseServerArgs(['--port'])).toThrow();
  });

  it('keeps the old tolerance of bin/mcp-server.js in lenient mode', () => {
    const lenient = (args) => parseServerArgs(args, { strict: false });

    expect(lenient(['--bogus', 'extra', '--transport=ws', '--port=abc']).transport).toBe('stdio');
    expect(lenient(['--port=']).port).toBe(3000);
    expect(lenient(['--api-key']).apiKey).toBeUndefined();
    expect(() => lenient(['--transport=sse', '--port=abc'])).toThrow('Invalid port');
  });
});

describe('ctxman mcp', () => {
  let base;
  let project;

  beforeAll(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-mcp-cmd-')));
    project = path.join(base, 'project');
    fs.mkdirSync(path.join(project, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(project, 'src', 'session.js'),
      [
        'export class SessionStore {',
        '  constructor() {',
        '    this.sessions = new Map();',
        '  }',
        '',
        '  expireSession(id) {',
        '    this.sessions.delete(id);',
        '  }',
        '}',
        '',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(project, 'src', 'math.js'),
      'export function addNumbers(a, b) {\n  return a + b;\n}\n'
    );
    // Prints a notice with console.log, which must not reach stdout
    fs.writeFileSync(path.join(project, '.contextignore'), '*.log\n');
    fs.mkdirSync(path.join(base, 'outside'));
  });

  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  const run = (...args) =>
    spawnSync(process.execPath, [CLI, 'mcp', ...args], {
      cwd: base,
      encoding: 'utf-8',
      env: { ...process.env, HOME: base, USERPROFILE: base },
    });

  it('prints its own help', () => {
    const result = run('--help');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ctxman mcp install --client <name>');
    expect(result.stdout).toContain('--root <dir>');
    expect(result.stdout).toContain('claude-desktop');
  });

  it('rejects unknown commands and options without starting a server', () => {
    const command = run('serve-forever');
    const option = run('--port', 'abc');

    expect(command.status).toBe(2);
    expect(command.stderr).toContain('Unknown mcp command "serve-forever"');
    expect(option.status).toBe(2);
    expect(option.stderr).toContain('Invalid port');
  });

  it('fails when the --root directory does not exist', () => {
    const result = run('--root', path.join(base, 'missing'));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('MCP root is not an existing directory');
  });

  it('serves tools/list, ranked search_code and get_symbol over stdio', async () => {
    const { responses, stray, code } = await mcpSession(
      [],
      [
        { method: 'tools/list' },
        {
          method: 'tools/call',
          params: {
            name: 'search_code',
            arguments: { path: project, query: 'expire session', type: 'ranked', limit: 3 },
          },
        },
        {
          method: 'tools/call',
          params: { name: 'get_symbol', arguments: { path: project, name: 'addNumbers' } },
        },
        {
          method: 'tools/call',
          params: { name: 'get_symbol', arguments: { path: project, name: 'addNumber' } },
        },
      ],
      { cwd: base }
    );

    expect(stray).toEqual([]);
    expect(code).toBe(0);

    const tools = responses.get(1).result.tools;
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['search_code', 'get_symbol', 'list_methods'])
    );
    expect(tools.find((t) => t.name === 'search_code').inputSchema.properties.type.enum).toEqual([
      'regex',
      'semantic',
      'ranked',
    ]);

    const ranked = toolText(responses.get(2));
    expect(ranked.results[0]).toMatchObject({
      file: path.join('src', 'session.js'),
      name: 'expireSession',
      parent: 'SessionStore',
      startLine: 6,
      endLine: 8,
    });
    expect(ranked.results[0].text).toContain('this.sessions.delete(id);');

    const symbol = toolText(responses.get(3));
    expect(symbol).toMatchObject({ match: 'exact', total: 1 });
    expect(symbol.symbols[0]).toMatchObject({
      file: path.join('src', 'math.js'),
      startLine: 1,
      endLine: 3,
      source: 'export function addNumbers(a, b) {\n  return a + b;\n}',
    });

    const suggestion = toolText(responses.get(4));
    expect(suggestion.match).toBe('none');
    expect(suggestion.suggestions[0].name).toBe('addNumbers');
  }, 30000);

  it('confines tools to --root and to CTXMAN_MCP_ROOT', async () => {
    const outside = {
      method: 'tools/call',
      params: { name: 'analyze_codebase', arguments: { path: path.join(base, 'outside') } },
    };
    const inside = {
      method: 'tools/call',
      params: { name: 'get_symbol', arguments: { path: 'src', name: 'SessionStore' } },
    };

    for (const [args, env] of [
      [['--root', project], {}],
      [[], { CTXMAN_MCP_ROOT: project }],
    ]) {
      const { responses, stderr } = await mcpSession(args, [outside, inside], { cwd: base, env });

      expect(responses.get(1).result.isError).toBe(true);
      expect(responses.get(1).result.content[0].text).toContain('outside the MCP root');
      expect(toolText(responses.get(2)).symbols[0]).toMatchObject({
        name: 'SessionStore',
        file: 'session.js',
        startLine: 1,
        endLine: 9,
      });
      expect(stderr).toContain(`confined to ${project}`);
    }
  }, 40000);
});
