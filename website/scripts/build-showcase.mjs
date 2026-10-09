#!/usr/bin/env node
/**
 * Regenerates website/.vitepress/data/showcase.json with real ctxman output, produced by
 * running the CLI, the MCP server and the REST API against a clone of this repository.
 * Nothing is written into the working tree except the JSON file.
 *
 * Usage (from the repository root, after `npm ci`):
 *   node website/scripts/build-showcase.mjs
 *
 * Exact token counts need tiktoken, a devDependency of the root package.
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(REPO, 'bin', 'cli.js');
const MCP = path.join(REPO, 'bin', 'mcp-server.js');
const OUT = path.join(REPO, 'website', '.vitepress', 'data', 'showcase.json');

const { default: TokenUtils } = await import(
  pathToFileURL(path.join(REPO, 'lib/utils/token-utils.js')).href
);
const { Scanner } = await import(pathToFileURL(path.join(REPO, 'lib/core/Scanner.js')).href);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-showcase-'));
const clone = path.join(work, 'ctxman');
// Shown in place of the temporary directory
const DISPLAY_ROOT = '~/ctxman';

execFileSync('git', ['clone', '--quiet', '--local', REPO, clone]);
const git = (...args) => execFileSync('git', args, { cwd: clone, encoding: 'utf-8' }).trim();

const clean = (text, root = clone) =>
  text
    .replace(/\x1b\[[0-9;]*m/g, '') // eslint-disable-line no-control-regex
    .replaceAll(root, DISPLAY_ROOT)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Run the CLI with stdin closed and a HOME of its own (no user config, no update checks)
function ctxman(args, cwd = clone) {
  const output = execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: work, USERPROFILE: work, NO_COLOR: '1' },
  });
  return clean(output, cwd);
}

// Back to the committed tree: drops config files and outputs of the previous step
function reset(files = {}) {
  git('clean', '-fdxq');
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(clone, name), content);
  }
}

const number = (text, label) => {
  const match = text.match(new RegExp(`${label}:\\s*([\\d,]+)`));
  return match ? Number(match[1].replace(/,/g, '')) : null;
};

// Lines from the first one matching `from` up to (not including) the first matching `to`
function lines(text, from, to) {
  const all = text.split('\n');
  const start = all.findIndex((line) => from.test(line));
  if (start === -1) return '';
  const end = to ? all.findIndex((line, i) => i > start && to.test(line)) : -1;
  return all
    .slice(start, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}

const head = (text, count) => {
  const all = text.split('\n');
  return all.length > count ? [...all.slice(0, count), '…'].join('\n') : text;
};

const tokens = (text, name) => TokenUtils.calculate(text, name);
const read = (name, dir = clone) => fs.readFileSync(path.join(dir, name), 'utf-8');
const percent = (part, whole) => Math.round((1 - part / whole) * 100);

const examples = {};

// 1. The repository as it is, without any ctxman configuration
reset();
const raw = ctxman(['--cli', '--simple']);
examples.raw = {
  command: 'ctxman --cli',
  output: [
    lines(raw, /Total files analyzed/, /Average tokens per file/),
    lines(raw, /TOP 5 LARGEST FILES/, /TOP 5 LARGEST DIRECTORIES/),
  ].join('\n\n'),
  files: number(raw, 'Total files analyzed'),
  tokens: number(raw, 'Total tokens'),
};

// 2. Generated bundles and lockfiles out
const contextignore = [
  '# Build output and lockfiles: large, generated, nothing for a model to learn',
  'html/',
  '**/package-lock.json',
  'desktop-app/',
  'docs/*.txt',
  'test-repos/',
  '',
].join('\n');
reset({ '.contextignore': contextignore });
const ignored = ctxman(['--cli', '--simple']);
examples.contextignore = {
  config: contextignore.trim(),
  command: 'ctxman --cli',
  output: lines(ignored, /Total files analyzed/, /BY FILE TYPE/),
  files: number(ignored, 'Total files analyzed'),
  tokens: number(ignored, 'Total tokens'),
};

// 3. Only the source, checked against the target model's context window
// A leading slash anchors a pattern at the project root, like in .gitignore
const contextinclude = [
  'lib/**',
  'bin/**',
  '/index.js',
  '/index.d.ts',
  '/package.json',
  '/README.md',
  '',
].join('\n');
reset({ '.contextinclude': contextinclude });
const included = ctxman(['--cli', '--simple', '--target-model', 'claude-sonnet-4.5']);
examples.contextinclude = {
  config: contextinclude.trim(),
  command: 'ctxman --cli --target-model claude-sonnet-4.5',
  output: [
    lines(included, /Total files analyzed/, /Average tokens per file/),
    lines(included, /Context Window Analysis/, /Context version created/),
  ].join('\n\n'),
  files: number(included, 'Total files analyzed'),
  tokens: number(included, 'Total tokens'),
};

// 4. The same context as JSON and as TOON, file level and method level
reset({ '.contextinclude': contextinclude });
ctxman(['--cli', '--simple', '-m', '--context-export']);
const methodJson = read('llm-context.json');
ctxman(['--cli', '--simple', '-m', '--context-export', '-o', 'toon']);
const methodToon = read('llm-context.toon');
ctxman(['--cli', '--simple', '--context-export']);
const fileJson = read('llm-context.json');
ctxman(['--cli', '--simple', '--context-export', '-o', 'toon']);
const fileToon = read('llm-context.toon');
const formats = {
  files: { json: tokens(fileJson, 'llm-context.json'), toon: tokens(fileToon, 'llm-context.toon') },
  methods: {
    json: tokens(methodJson, 'llm-context.json'),
    toon: tokens(methodToon, 'llm-context.toon'),
  },
};
formats.files.saving = percent(formats.files.toon, formats.files.json);
formats.methods.saving = percent(formats.methods.toon, formats.methods.json);
examples.formats = {
  command: 'ctxman --cli --context-export -o toon',
  ...formats,
  totalMethods: JSON.parse(methodJson).methodStats.totalMethods,
  excerpt: head(fileToon.trim(), 18),
};

// 5. Method-level context for one module, in TOON
reset({ '.contextinclude': 'lib/core/**\n' });
ctxman(['--cli', '--simple', '-m', '--context-export', '-o', 'toon']);
const coreToon = read('llm-context.toon').trim();
examples.methods = {
  config: 'lib/core/**',
  command: 'ctxman --cli -m --context-export -o toon',
  output: head(coreToon, 32),
  tokens: tokens(coreToon, 'llm-context.toon'),
};

// 6. Only what changed in the last ten commits
reset();
const changed = ctxman(['--cli', '--simple', '--changed-since', 'HEAD~10']);
examples.changed = {
  command: 'ctxman --cli --changed-since HEAD~10',
  output: [
    lines(changed, /changed files/, /Analyzing project|PROJECT TOKEN/),
    lines(changed, /Total files analyzed/, /Average tokens per file/),
  ]
    .filter(Boolean)
    .join('\n\n'),
  files: number(changed, 'Total files analyzed'),
  tokens: number(changed, 'Total tokens'),
};

// 7. Secrets in source never reach the digest
const demo = path.join(work, 'payments-service');
fs.mkdirSync(path.join(demo, 'src'), { recursive: true });
const leakySource = [
  '// Left here during a late-night debugging session',
  "export const s3 = { region: 'eu-west-1', accessKeyId: 'AKIAABCDEFGHIJKLMNOP' };",
  "export const github = { token: 'ghp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8' };",
  '',
].join('\n');
fs.writeFileSync(path.join(demo, 'src', 'config.js'), leakySource);
fs.writeFileSync(
  path.join(demo, 'src', 'charge.js'),
  "import { s3 } from './config.js';\n\nexport function charge(amount) {\n  return { amount, region: s3.region };\n}\n"
);
const digestRun = ctxman(['--cli', '--simple', '--gitingest'], demo);
const digest = clean(read('digest.txt', demo), demo);
examples.redaction = {
  source: leakySource.trim(),
  command: 'ctxman --cli --gitingest',
  output: lines(digestRun, /Redacted secrets/),
  // The digest's block for src/config.js: header, separator and content
  digest: digest
    .split(/\n(?==+\nFILE: )/)
    .find((block) => block.includes('FILE: src/config.js'))
    .trim(),
};

// 8. MCP over stdio: the same analysis as tools for an AI client
async function mcpSession(calls) {
  const server = spawn(process.execPath, [MCP], {
    cwd: clone,
    env: { ...process.env, HOME: work },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const pending = new Map();
  const stray = [];
  let buffer = '';
  server.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        pending.get(message.id)?.(message);
      } catch {
        stray.push(line); // Anything but JSON-RPC here would break a real client
      }
    }
  });
  let id = 0;
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, resolve);
      setTimeout(() => reject(new Error(`MCP ${method} timed out`)), 30000);
      server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: messageId, method, params })}\n`);
    });

  try {
    await request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'ctxman-showcase', version: '1.0.0' },
    });
    server.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`
    );
    const results = [];
    for (const [method, params] of calls) {
      results.push(await request(method, params));
    }
    return { results, stray };
  } finally {
    server.kill();
  }
}

reset({ '.contextinclude': contextinclude });
const listMethodsArgs = { path: DISPLAY_ROOT, file: 'lib/core/ContextBuilder.js' };
const mcp = await mcpSession([
  ['tools/list', {}],
  ['tools/call', { name: 'list_methods', arguments: { ...listMethodsArgs, path: clone } }],
]);
const toolNames = mcp.results[0].result.tools.map((tool) => tool.name);
const methodList = JSON.parse(mcp.results[1].result.content[0].text);
examples.mcp = {
  tools: toolNames,
  request: { name: 'list_methods', arguments: listMethodsArgs },
  response: methodList.map((entry) => ({
    file: entry.file,
    methods: entry.methods.map(({ name, line, tokens: count }) => ({ name, line, tokens: count })),
  })),
  cleanStdout: mcp.stray.length === 0,
};

// 9. REST API: a token budget the context must fit in
const port = await new Promise((resolve) => {
  const probe = net.createServer().listen(0, '127.0.0.1', () => {
    const { port: free } = probe.address();
    probe.close(() => resolve(free));
  });
});
const api = spawn(process.execPath, [CLI, 'serve', '--port', String(port)], {
  cwd: clone,
  env: { ...process.env, HOME: work },
  stdio: 'ignore',
});
try {
  let response;
  for (let attempt = 0; attempt < 50 && !response; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    response = await fetch(`http://127.0.0.1:${port}/api/v1/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: clone, targetTokens: 30000 }),
    }).catch(() => null);
  }
  const context = await response.json();
  const kept = Object.values(context.files).flat();
  examples.budget = {
    request: `curl -s localhost:3000/api/v1/context -H 'Content-Type: application/json' \\\n  -d '{"path": "${DISPLAY_ROOT}", "targetTokens": 30000}'`,
    projectFiles: context.metadata.totalFiles,
    projectTokens: context.metadata.totalTokens,
    keptFiles: kept.length,
    keptTokens: kept.reduce((sum, file) => sum + file.tokens, 0),
    sample: kept
      .slice(0, 6)
      .map(({ path: file, tokens: count }) => ({ path: file, tokens: count })),
  };
} finally {
  api.kill();
}

// Scan speed on the unconfigured tree (median of five)
reset();
const timings = [];
let scanned = 0;
for (let i = 0; i < 5; i++) {
  const started = performance.now();
  scanned = new Scanner(clone).scan().length;
  timings.push(performance.now() - started);
}
timings.sort((a, b) => a - b);

const showcase = {
  meta: {
    commit: git('rev-parse', '--short', 'HEAD'),
    commitDate: git('show', '-s', '--format=%cI', 'HEAD'),
    ctxmanVersion: JSON.parse(read('package.json')).version,
    node: process.version,
    exactTokens: TokenUtils.hasExactCounting(),
  },
  stats: {
    rawTokens: examples.raw.tokens,
    focusedTokens: examples.contextinclude.tokens,
    reduction: percent(examples.contextinclude.tokens, examples.raw.tokens),
    toonSaving: formats.methods.saving,
    methods: examples.formats.totalMethods,
    scannedFiles: scanned,
    scanMs: Math.round(timings[2]),
  },
  examples,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(showcase, null, 2)}\n`);
fs.rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${path.relative(REPO, OUT)} (commit ${showcase.meta.commit})`);
console.log(showcase.stats);
