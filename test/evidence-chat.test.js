import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import MCPServer from '../lib/api/mcp/server.js';
import { APIServer } from '../lib/api/rest/server.js';
import { explainHistory } from '../lib/why/index.js';
import { createChatEvidenceSource, MAX_EXCERPT_CHARS } from '../lib/evidence/index.js';
import { cleanGitEnv } from './helpers/git-env.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const WHY_CLI = fileURLToPath(new URL('../bin/cm-why.js', import.meta.url));

// Synthetic secret-shaped token assembled at runtime (never literal in source)
const SYNTH_GH_TOKEN = ['ghp_', 'x'.repeat(36)].join('');

function git(cwd, args, envExtra = {}) {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...cleanGitEnv(),
      GIT_AUTHOR_NAME: 'Alice',
      GIT_AUTHOR_EMAIL: 'alice@example.com',
      GIT_COMMITTER_NAME: 'Alice',
      GIT_COMMITTER_EMAIL: 'alice@example.com',
      ...envExtra,
    },
    stdio: 'pipe',
  }).trim();
}

function runCli(cwd, args, envOverrides = {}, { viaRootCli = false } = {}) {
  const entry = viaRootCli ? CLI : WHY_CLI;
  const spawnArgs = viaRootCli ? args : args[0] === 'why' ? args.slice(1) : args;
  const env = {
    ...process.env,
    ...envOverrides,
  };
  if (!('CTXMAN_POLICY' in envOverrides)) {
    delete env.CTXMAN_POLICY;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...spawnArgs], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('close', (status) => {
      resolve({
        status,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      });
    });
  });
}

async function invokeRestWhy(apiServer, queryString) {
  let body = '';
  let statusCode = 200;
  const headers = {};
  const req = {
    method: 'GET',
    url: `/api/v1/why?${queryString}`,
    headers: { host: '127.0.0.1:3000' },
  };
  const res = {
    statusCode: 200,
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    writeHead(code, extraHeaders = {}) {
      statusCode = code;
      for (const [k, v] of Object.entries(extraHeaders)) headers[k.toLowerCase()] = v;
    },
    end(chunk = '') {
      body += chunk;
    },
  };
  await apiServer.handleRequest(req, res);
  return { status: statusCode, json: JSON.parse(body) };
}

function writeFakeKeyflip(binDir, { markerFile, cwdFile, handlerBody, stdoutText }) {
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, 'keyflip');
  if (stdoutText !== undefined) {
    const payloadPath = path.join(binDir, 'keyflip-payload.txt');
    fs.writeFileSync(payloadPath, stdoutText);
    const markerCmd = markerFile
      ? `printf '%s\\n' "$*" >> '${markerFile.replace(/'/g, "'\\''")}'\n`
      : '';
    const cwdCmd = cwdFile
      ? `if [ "$1" = "conv" ] && [ "$2" = "search" ]; then pwd > '${cwdFile.replace(/'/g, "'\\''")}'; fi\n`
      : '';
    const shScript = `#!/bin/sh
${markerCmd}${cwdCmd}if [ "$1" = "conv" ] && [ "$2" = "capabilities" ]; then
  printf '{"schemaVersion":1,"capabilities":["search"]}\\n'
  exit 0
fi
cat '${payloadPath.replace(/'/g, "'\\''")}'
`;
    fs.writeFileSync(scriptPath, shScript, { mode: 0o755 });
    return scriptPath;
  }

  const script = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const markerFile = ${JSON.stringify(markerFile || '')};
const cwdFile = ${JSON.stringify(cwdFile || '')};
if (markerFile) fs.appendFileSync(markerFile, JSON.stringify(args) + '\\n');
if (cwdFile && args[0] === 'conv' && args[1] === 'search') {
  fs.writeFileSync(cwdFile, process.cwd());
}
if (args[0] === 'conv' && args[1] === 'capabilities') {
  process.stdout.write(JSON.stringify({ schemaVersion: 1, capabilities: ['search'] }) + '\\n');
  process.exit(0);
}
${handlerBody}
`;
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

function buildPathWithoutKeyflip(tempRoot) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const cleanDirs = [];
  let gitExecutable = null;

  for (const dir of dirs) {
    const candidateGit = path.join(dir, 'git');
    if (!gitExecutable && fs.existsSync(candidateGit)) {
      gitExecutable = candidateGit;
    }
    const candidateKeyflip = path.join(dir, 'keyflip');
    if (!fs.existsSync(candidateKeyflip)) {
      cleanDirs.push(dir);
    }
  }

  if (gitExecutable) {
    const gitBinDir = path.join(tempRoot, 'git-only-bin');
    fs.mkdirSync(gitBinDir, { recursive: true });
    fs.symlinkSync(gitExecutable, path.join(gitBinDir, 'git'));
    return [gitBinDir, ...cleanDirs].join(path.delimiter);
  }

  return cleanDirs.join(path.delimiter);
}

describe('chat evidence source via keyflip (--chats)', () => {
  const tempDirs = [];
  let repo;
  let outsideDir;
  let fakeBinDir;
  let markerFile;
  let cwdFile;

  const makeTempDir = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  };

  const writePolicy = (doc) => {
    fs.mkdirSync(path.join(repo, '.ctxman'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.ctxman', 'policy.json'), JSON.stringify(doc));
  };

  beforeEach(() => {
    const parent = makeTempDir('ctxman-chat-');
    repo = path.join(parent, 'repo');
    outsideDir = path.join(parent, 'other-repo');
    fakeBinDir = path.join(parent, 'fake-bin');
    markerFile = path.join(parent, 'keyflip-invoked.log');
    cwdFile = path.join(parent, 'keyflip-cwd.txt');

    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    git(repo, ['init', '-q']);
    fs.writeFileSync(
      path.join(repo, 'src', 'cart.js'),
      'export function total(items) {\n  return items.reduce((sum, item) => sum + item.price, 0);\n}\n'
    );
    git(repo, ['add', 'src/cart.js']);
    git(repo, ['commit', '-qm', 'feat: add cart total'], {
      GIT_AUTHOR_DATE: '2026-11-01T10:00:00Z',
      GIT_COMMITTER_DATE: '2026-11-01T10:00:00Z',
    });
  });

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
  });

  it('unit: parses keyflip JSON, maps fields, filters by cwd, and handles malformed output', async () => {
    const realRepo = fs.realpathSync(repo);
    const hitsPayload = {
      schemaVersion: 1,
      hits: [
        {
          id: 'conv-alpha',
          chunk: 2,
          role: 'assistant',
          title: 'Rounding decision in cart',
          cwd: realRepo,
          updatedAt: '2026-11-10T12:00:00Z',
          ts: null,
          score: 0.92,
          snippet: 'Decided to round totals at checkout rather than per line item.',
        },
        {
          id: 'conv-sub',
          chunk: 0,
          role: 'user',
          title: 'Subdir cwd hit',
          cwd: path.join(realRepo, 'src'),
          updatedAt: '2026-11-11T12:00:00Z',
          ts: null,
          score: 0.81,
          snippet: 'Checked src/cart.js total calculation.',
        },
        {
          id: 'conv-outside',
          chunk: 1,
          role: 'assistant',
          title: 'Unrelated repository chat',
          cwd: outsideDir,
          updatedAt: '2026-11-12T12:00:00Z',
          ts: null,
          score: 0.99,
          snippet: 'Should be dropped by cwd filter.',
        },
        {
          id: 'conv-nocwd',
          chunk: 1,
          role: 'assistant',
          cwd: '',
          updatedAt: '2026-11-12T12:00:00Z',
          score: 0.99,
          snippet: 'Should also be dropped.',
        },
      ],
    };

    const recordedCalls = [];
    const source = createChatEvidenceSource({
      root: repo,
      execFile: async (bin, args, opts) => {
        recordedCalls.push({ bin, args, cwd: opts.cwd });
        if (args[1] === 'capabilities') return { stdout: '{"schemaVersion":1}\n', stderr: '' };
        return { stdout: JSON.stringify(hitsPayload), stderr: '' };
      },
    });

    expect(source.id).toBe('chat');
    expect(await source.available()).toBe(true);

    const results = await source.search('src/cart.js', { symbols: ['total'] });
    expect(recordedCalls[1].args).toEqual([
      'conv',
      'search',
      'src/cart.js total',
      '--json',
      '--limit',
      '10',
      '--no-subagents',
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      id: 'chat:conv-alpha#2',
      kind: 'chat',
      source: 'keyflip',
      url: null,
      ref: 'conv-alpha#2',
      author: 'assistant',
      title: 'Rounding decision in cart',
      timestamp: '2026-11-10T12:00:00Z',
      score: 0.92,
    });
    expect(results[1].ref).toBe('conv-sub#0');

    const warnings = [];
    const badJsonSource = createChatEvidenceSource({
      root: repo,
      execFile: async () => ({ stdout: 'not-json{', stderr: '' }),
    });
    expect(
      await badJsonSource.search('src/cart.js', { onWarning: (m) => warnings.push(m) })
    ).toEqual([]);
    expect(warnings.some((w) => /invalid JSON/i.test(w))).toBe(true);

    const driftWarnings = [];
    const badVersionSource = createChatEvidenceSource({
      root: repo,
      execFile: async () => ({ stdout: '{"schemaVersion":2,"hits":[]}', stderr: '' }),
    });
    expect(
      await badVersionSource.search('src/cart.js', { onWarning: (m) => driftWarnings.push(m) })
    ).toEqual([]);
    expect(driftWarnings.some((w) => /schemaVersion/i.test(w))).toBe(true);
  });

  it('Check 1 & 6: CLI --chats --json cites chat hits, records repo cwd, and drops outside cwd hits', async () => {
    writePolicy({ version: 1, sources: { chat: { enabled: true } } });
    const realRepo = fs.realpathSync(repo);
    const payload = {
      schemaVersion: 1,
      hits: [
        {
          id: 'session-101',
          chunk: 3,
          role: 'assistant',
          title: 'Why cart total sums cents',
          cwd: realRepo,
          updatedAt: '2026-11-15T08:30:00Z',
          ts: null,
          score: 0.95,
          snippet: 'We agreed to sum integer cents in total() to avoid drift.',
        },
        {
          id: 'session-outside',
          chunk: 0,
          role: 'user',
          title: 'Secret sibling workspace chat',
          cwd: outsideDir,
          updatedAt: '2026-11-16T08:30:00Z',
          ts: null,
          score: 0.99,
          snippet: 'OUTSIDE_REPO_SHOULD_BE_DROPPED',
        },
      ],
    };
    writeFakeKeyflip(fakeBinDir, {
      markerFile,
      cwdFile,
      stdoutText: `${JSON.stringify(payload)}\n`,
    });

    const res = await runCli(
      repo,
      ['why', 'src/cart.js:total', '--chats', '--json'],
      { PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}` },
      { viaRootCli: true }
    );

    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    const chatCitations = parsed.citations.filter((c) => c.kind === 'chat');
    expect(chatCitations).toHaveLength(1);
    expect(chatCitations[0]).toMatchObject({
      kind: 'chat',
      source: 'keyflip',
      ref: 'session-101#3',
      author: 'assistant',
      timestamp: '2026-11-15T08:30:00Z',
      score: 0.95,
    });
    expect(res.stdout).not.toContain('OUTSIDE_REPO_SHOULD_BE_DROPPED');
    expect(fs.readFileSync(cwdFile, 'utf8').trim()).toBe(realRepo);
  });

  it('Check 2: when keyflip is absent from PATH, --chats output equals output without --chats', async () => {
    writePolicy({ version: 1, sources: { chat: { enabled: true } } });
    const pathRoot = makeTempDir('ctxman-nopath-');
    const cleanPath = buildPathWithoutKeyflip(pathRoot);

    const withoutChatsJson = await runCli(repo, ['src/cart.js:total', '--json'], {
      PATH: cleanPath,
    });
    const withChatsJson = await runCli(repo, ['src/cart.js:total', '--chats', '--json'], {
      PATH: cleanPath,
    });
    expect(withoutChatsJson.status).toBe(0);
    expect(withChatsJson.status).toBe(0);
    expect(withChatsJson.stdout).toBe(withoutChatsJson.stdout);

    const withoutChatsMd = await runCli(repo, ['src/cart.js:total'], { PATH: cleanPath });
    const withChatsMd = await runCli(repo, ['src/cart.js:total', '--chats'], { PATH: cleanPath });
    expect(withoutChatsMd.status).toBe(0);
    expect(withChatsMd.status).toBe(0);
    expect(withChatsMd.stdout).toBe(withoutChatsMd.stdout);
  });

  it('Check 3 & 5: redacts secrets in text and JSON outputs and caps excerpts at 800 chars', async () => {
    writePolicy({ version: 1, sources: { chat: { enabled: true } } });
    const realRepo = fs.realpathSync(repo);
    const longPrefix = 'A'.repeat(790);
    const longTail = 'B'.repeat(500);

    const payload = {
      schemaVersion: 1,
      hits: [
        {
          id: 'sec-1',
          chunk: 0,
          role: 'user',
          title: `Token check ${SYNTH_GH_TOKEN}`,
          cwd: realRepo,
          updatedAt: '2026-11-15T09:00:00Z',
          ts: null,
          score: 0.9,
          snippet: `${longPrefix} ${SYNTH_GH_TOKEN} ${longTail}`,
        },
      ],
    };

    writeFakeKeyflip(fakeBinDir, {
      markerFile,
      stdoutText: `${JSON.stringify(payload)}\n`,
    });

    const env = { PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}` };

    const jsonRes = await runCli(repo, ['src/cart.js:total', '--chats', '--json'], env);
    expect(jsonRes.status).toBe(0);
    expect(jsonRes.stdout).not.toContain(SYNTH_GH_TOKEN);
    expect(jsonRes.stdout).toContain('[REDACTED:github-token]');
    const parsed = JSON.parse(jsonRes.stdout);
    const chatCitations = parsed.citations.filter((c) => c.kind === 'chat');
    expect(chatCitations).toHaveLength(1);
    expect(chatCitations[0].excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
    expect(chatCitations[0].title).toContain('[REDACTED:github-token]');

    const mdRes = await runCli(repo, ['src/cart.js:total', '--chats'], env);
    expect(mdRes.status).toBe(0);
    expect(mdRes.stdout).not.toContain(SYNTH_GH_TOKEN);
    expect(mdRes.stdout).toContain('[REDACTED:github-token]');
    expect(mdRes.stdout).toContain('## Local Chats');
  });

  it('Check 4: policy disabled/absent blocks keyflip and org false overrides project true', async () => {
    const realRepo = fs.realpathSync(repo);
    writeFakeKeyflip(fakeBinDir, {
      markerFile,
      stdoutText: `${JSON.stringify({
        schemaVersion: 1,
        hits: [
          {
            id: 'x',
            chunk: 0,
            role: 'user',
            cwd: realRepo,
            updatedAt: '2026-11-15T00:00:00Z',
            snippet: 'hi',
            score: 1,
          },
        ],
      })}\n`,
    });
    const env = { PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}` };

    // 1. No policy file -> blocked
    const noPolicyRes = await runCli(repo, ['src/cart.js:total', '--chats', '--json'], env);
    expect(noPolicyRes.status).toBe(0);
    expect(fs.existsSync(markerFile)).toBe(false);
    expect(JSON.parse(noPolicyRes.stdout).warnings.some((w) => /disabled by policy/i.test(w))).toBe(
      true
    );

    // 2. Explicit false in project policy -> blocked
    writePolicy({ version: 1, sources: { chat: { enabled: false } } });
    const falsePolicyRes = await runCli(repo, ['src/cart.js:total', '--chats', '--json'], env);
    expect(falsePolicyRes.status).toBe(0);
    expect(fs.existsSync(markerFile)).toBe(false);
    expect(
      JSON.parse(falsePolicyRes.stdout).warnings.some((w) => /disabled by policy/i.test(w))
    ).toBe(true);

    // 3. Project true + org false -> org stricter false wins -> blocked
    writePolicy({ version: 1, sources: { chat: { enabled: true } } });
    const orgPolicyPath = path.join(makeTempDir('ctxman-org-'), 'org-policy.json');
    fs.writeFileSync(
      orgPolicyPath,
      JSON.stringify({ version: 1, sources: { chat: { enabled: false } } })
    );
    const orgOverrideRes = await runCli(repo, ['src/cart.js:total', '--chats', '--json'], {
      ...env,
      CTXMAN_POLICY: orgPolicyPath,
    });
    expect(orgOverrideRes.status).toBe(0);
    expect(fs.existsSync(markerFile)).toBe(false);
    expect(
      JSON.parse(orgOverrideRes.stdout).warnings.some((w) => /disabled by policy/i.test(w))
    ).toBe(true);
  });

  it('Check 7: MCP explain_history and REST /api/v1/why never invoke keyflip or leak chat evidence', async () => {
    writePolicy({ version: 1, sources: { chat: { enabled: true } } });
    const realRepo = fs.realpathSync(repo);
    writeFakeKeyflip(fakeBinDir, {
      markerFile,
      stdoutText: `${JSON.stringify({
        schemaVersion: 1,
        hits: [
          {
            id: 'leak-1',
            chunk: 0,
            role: 'assistant',
            cwd: realRepo,
            updatedAt: '2026-11-15T00:00:00Z',
            snippet: 'PRIVATE_CHAT_LEAK',
            score: 1,
          },
        ],
      })}\n`,
    });

    const prevPath = process.env.PATH;
    const prevPolicy = process.env.CTXMAN_POLICY;
    process.env.PATH = `${fakeBinDir}${path.delimiter}${prevPath}`;
    delete process.env.CTXMAN_POLICY;

    try {
      // 1. Direct explainHistory with destination: 'mcp' | 'rest' ignores chats: true
      const mcpDestResult = await explainHistory(repo, 'src/cart.js:total', {
        chats: true,
        destination: 'mcp',
      });
      expect(mcpDestResult.data.citations.some((c) => c.kind === 'chat')).toBe(false);
      expect(fs.existsSync(markerFile)).toBe(false);

      // 2. MCP server explain_history tool
      const mcpServer = new MCPServer();
      const mcpResult = await mcpServer.server._requestHandlers.get('tools/call')(
        {
          method: 'tools/call',
          params: {
            name: 'explain_history',
            arguments: { path: repo, target: 'src/cart.js:total', chats: true },
          },
        },
        {}
      );
      expect(mcpResult.isError).toBeUndefined();
      expect(mcpResult.content[0].text).not.toContain('PRIVATE_CHAT_LEAK');
      expect(mcpResult.content[0].text).not.toContain('Local Chats');
      expect(fs.existsSync(markerFile)).toBe(false);

      // 3. REST server GET /api/v1/why
      const apiServer = new APIServer({ port: 0, host: '127.0.0.1' });
      const restRes = await invokeRestWhy(
        apiServer,
        `path=${encodeURIComponent(repo)}&target=${encodeURIComponent('src/cart.js:total')}&chats=true`
      );
      expect(restRes.status).toBe(200);
      expect(restRes.json.data.citations.some((c) => c.kind === 'chat')).toBe(false);
      expect(restRes.json.text).not.toContain('PRIVATE_CHAT_LEAK');
      expect(fs.existsSync(markerFile)).toBe(false);
    } finally {
      process.env.PATH = prevPath;
      if (prevPolicy !== undefined) process.env.CTXMAN_POLICY = prevPolicy;
    }
  });

  it('Check 8: slow keyflip sleeping 10 s times out around 5 s with warning and exit 0', async () => {
    writePolicy({ version: 1, sources: { chat: { enabled: true } } });
    writeFakeKeyflip(fakeBinDir, {
      markerFile,
      handlerBody: `
const timer = setTimeout(() => {
  process.stdout.write(JSON.stringify({ schemaVersion: 1, hits: [] }) + '\\n');
}, 10000);
process.on('SIGTERM', () => {
  clearTimeout(timer);
  process.exit(0);
});
`,
    });

    const apiStart = Date.now();
    const apiResult = await explainHistory(repo, 'src/cart.js:total', {
      chats: true,
      env: { ...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}` },
    });
    const apiElapsedMs = Date.now() - apiStart;
    expect(apiElapsedMs).toBeLessThan(6500);
    expect(apiResult.warnings.some((w) => /chat/i.test(w) && /timed out/i.test(w))).toBe(true);

    const cliStart = Date.now();
    const res = await runCli(repo, ['src/cart.js:total', '--chats', '--json'], {
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}`,
    });
    const cliElapsedMs = Date.now() - cliStart;

    expect(res.status).toBe(0);
    expect(cliElapsedMs).toBeLessThan(10000);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.warnings.some((w) => /chat/i.test(w) && /timed out/i.test(w))).toBe(true);
  }, 25000);

  it('Check 9 & malformed JSON: without --chats keyflip is never invoked, --help lists --chats, and invalid JSON warns cleanly', async () => {
    writePolicy({ version: 1, sources: { chat: { enabled: true } } });
    writeFakeKeyflip(fakeBinDir, {
      markerFile,
      stdoutText: 'not-valid-json{{{',
    });
    const env = { PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}` };

    const helpRes = await runCli(repo, ['--help'], env);
    expect(helpRes.status).toBe(0);
    expect(helpRes.stdout).toContain('--chats');

    const offRes = await runCli(repo, ['src/cart.js:total', '--json'], env);
    expect(offRes.status).toBe(0);
    expect(fs.existsSync(markerFile)).toBe(false);

    const invalidJsonRes = await runCli(repo, ['src/cart.js:total', '--chats', '--json'], env);
    expect(invalidJsonRes.status).toBe(0);
    expect(fs.existsSync(markerFile)).toBe(true);
    const parsed = JSON.parse(invalidJsonRes.stdout);
    expect(parsed.warnings.some((w) => /invalid JSON/i.test(w))).toBe(true);
  });

  it('records privateSources: ["chat"] in audit log without storing conversation text', async () => {
    writePolicy({
      version: 1,
      audit: { enabled: true },
      sources: { chat: { enabled: true } },
    });
    const realRepo = fs.realpathSync(repo);
    writeFakeKeyflip(fakeBinDir, {
      markerFile,
      stdoutText: `${JSON.stringify({
        schemaVersion: 1,
        hits: [
          {
            id: 'audit-1',
            chunk: 0,
            role: 'user',
            title: 'UNIQUE_PRIVATE_CHAT_TITLE',
            cwd: realRepo,
            updatedAt: '2026-11-15T10:00:00Z',
            snippet: 'UNIQUE_PRIVATE_CHAT_BODY_SHOULD_NOT_BE_LOGGED',
            score: 0.88,
          },
        ],
      })}\n`,
    });

    const res = await runCli(repo, ['src/cart.js:total', '--chats', '--json'], {
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}`,
    });
    expect(res.status).toBe(0);

    const auditContent = fs.readFileSync(path.join(repo, '.ctxman', 'audit.log'), 'utf8');
    expect(auditContent).not.toContain('UNIQUE_PRIVATE_CHAT_TITLE');
    expect(auditContent).not.toContain('UNIQUE_PRIVATE_CHAT_BODY_SHOULD_NOT_BE_LOGGED');
    const [entry] = auditContent
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(entry.privateSources).toEqual(['chat']);
  });
});
