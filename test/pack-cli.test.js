import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import TokenUtils from '../lib/utils/token-utils.js';
import MCPServer from '../lib/api/mcp/server.js';
import { TOOL_DEFAULT_BUDGET } from '../lib/pack/index.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const PACK = fileURLToPath(new URL('../bin/cm-pack.js', import.meta.url));
const FAKE_AWS_KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

const FILES = {
  'src/math.js': [
    'export function add(a, b) {',
    '  const sum = a + b;',
    '  return sum;',
    '}',
    '',
    'export function scale(values, factor) {',
    '  return values.map((value) => value * factor);',
    '}',
    '',
  ].join('\n'),
  'src/app.js': "import { add } from './math.js';\nconsole.log(add(1, 2));\n",
  'src/app.test.js': "import { add } from './math.js';\ntest(() => add(1, 2));\n",
  'config/settings.js': `export const awsKey = '${FAKE_AWS_KEY}';\n`,
  'README.md': '# Demo\n\nA tiny project.\n',
};

describe('ctxman pack (CLI)', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pack-cli-'));
    for (const [relativePath, content] of Object.entries(FILES)) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), content);
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const run = (args, { input, cwd = root, env = {} } = {}) =>
    spawnSync(process.execPath, args, {
      cwd,
      input,
      encoding: 'utf-8',
      env: { ...process.env, HOME: root, USERPROFILE: root, ...env },
    });
  // Through the ctxman entry point, and the subcommand script alone (faster to start)
  const ctxman = (...args) => run([CLI, 'pack', ...args]);
  const pack = (...args) => run([PACK, ...args]);

  it('prints only the document on stdout and a summary on stderr', () => {
    // Shared modules print this notice with console.log; it must not reach stdout
    fs.writeFileSync(path.join(root, '.contextignore'), '**/*.test.js\n');
    const result = ctxman();

    expect(result.status).toBe(0);
    expect(result.stdout.startsWith('<directory_structure>\nconfig/\n')).toBe(true);
    expect(result.stdout.endsWith('</documents>\n')).toBe(true);
    expect(result.stdout).not.toContain('src/app.test.js');
    expect(result.stdout).not.toContain('rules loaded');
    const tokens = TokenUtils.calculate(result.stdout, 'pack.xml');
    expect(result.stderr).toContain(
      `ctxman pack: 4 file(s), ${tokens.toLocaleString('en-US')} tokens (xml, `
    );
    expect(result.stderr).toContain('Redacted 1 secret(s): 1 aws-access-key-id');
    expect(result.stdout).not.toContain(FAKE_AWS_KEY);
  });

  it('prints its own help through the ctxman entry point', () => {
    const result = ctxman('--help');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: ctxman pack [path] [options]');
    expect(result.stdout).toContain('--max-tokens TOKENS');
    expect(run([CLI, '--help']).stdout).toContain('pack [path] [options]');
  });

  it('packs a path argument from another directory', () => {
    const result = run([PACK, root, '--style', 'plain', '--no-tree', '-q'], { cwd: os.tmpdir() });

    expect(result.status).toBe(0);
    expect(result.stdout.startsWith('=== README.md ===\n# Demo\n')).toBe(true);
    expect(result.stderr).toBe('');
  });

  it('writes -o FILE and leaves that file out of the next pack', () => {
    const first = pack('-o', 'context.xml');
    const second = pack('-o', 'context.xml');

    expect(first.status).toBe(0);
    expect(first.stdout).toBe('');
    expect(first.stderr).toContain('Written to context.xml');
    const written = fs.readFileSync(path.join(root, 'context.xml'), 'utf8');
    expect(written).toContain('<source>src/math.js</source>');
    expect(written).not.toContain('<source>context.xml</source>');
    expect(second.status).toBe(0);
    expect(fs.readFileSync(path.join(root, 'context.xml'), 'utf8')).toBe(written);
  });

  it('applies --style, --no-tree, --header, --instructions and --line-numbers', () => {
    fs.writeFileSync(path.join(root, 'task.md'), 'Explain scale().\n');
    const result = pack(
      '--style',
      'markdown',
      '--no-tree',
      '--header',
      'Demo project',
      '--instructions',
      'task.md',
      '--line-numbers',
      '--include',
      'src/math.js'
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        'Demo project',
        '',
        '## Files',
        '',
        '### src/math.js',
        '',
        '```javascript',
        '1 | export function add(a, b) {',
        '2 |   const sum = a + b;',
        '3 |   return sum;',
        '4 | }',
        '5 |',
        '6 | export function scale(values, factor) {',
        '7 |   return values.map((value) => value * factor);',
        '8 | }',
        '```',
        '',
        '## Instructions',
        '',
        'Explain scale().',
        '',
      ].join('\n')
    );
  });

  it('prints JSON with --json', () => {
    const result = pack('--json', '--include=*.md');
    const parsed = JSON.parse(result.stdout);

    expect(parsed.files).toEqual([
      { path: 'README.md', tokens: expect.any(Number), content: FILES['README.md'] },
    ]);
  });

  it('accepts repeated and comma-separated --include/--exclude globs', () => {
    const repeated = pack('--include', 'src/**', '--include', '*.md', '--exclude', '*.test.js');
    const commas = pack('--include=src/**,*.md', '--exclude', '*.test.js');
    const sources = (text) => [...text.matchAll(/<source>(.*)<\/source>/g)].map((m) => m[1]);

    expect(sources(repeated.stdout)).toEqual(['README.md', 'src/app.js', 'src/math.js']);
    expect(sources(commas.stdout)).toEqual(sources(repeated.stdout));
  });

  it('reads the file list from --stdin, relative to the current directory', () => {
    const result = run([PACK, '..', '--stdin', '--style', 'plain', '--no-tree'], {
      cwd: path.join(root, 'src'),
      input: 'math.js\n\n../README.md\r\n',
    });

    expect(result.status).toBe(0);
    expect(result.stdout.match(/^=== .* ===$/gm)).toEqual([
      '=== src/math.js ===',
      '=== README.md ===',
    ]);
  });

  it('reads NUL-separated lists with -0', () => {
    const nul = run([PACK, '--stdin', '--null', '--style', 'plain', '--no-tree', '-q'], {
      input: 'src/app.js\0README.md\0',
    });
    const short = run([PACK, '--stdin', '-0', '--style', 'plain', '--no-tree', '-q'], {
      input: 'src/app.js\0',
    });

    expect(nul.status).toBe(0);
    expect(nul.stdout.match(/^=== .* ===$/gm)).toEqual(['=== src/app.js ===', '=== README.md ===']);
    expect(short.stdout.match(/^=== .* ===$/gm)).toEqual(['=== src/app.js ===']);
    expect(pack('-0').stderr).toContain('-0/--null only applies to --stdin');
  });

  it('warns when no file is selected', () => {
    const result = run([PACK, '--stdin'], { input: '\n' });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Warning: no files to pack');
  });

  it('refuses --stdin paths outside the project and reports ignored ones', () => {
    fs.writeFileSync(path.join(root, '.gitignore'), 'README.md\n');
    const outside = run([PACK, '--stdin'], { input: '../../etc/passwd\n' });
    const ignored = run([PACK, '--stdin', '-o', 'out.xml'], { input: 'README.md\nsrc/app.js\n' });

    expect(outside.status).toBe(1);
    expect(outside.stdout).toBe('');
    expect(outside.stderr).toContain('Path is outside the project root: ../../etc/passwd');
    expect(ignored.status).toBe(0);
    expect(ignored.stderr).toContain('Skipped 1 file(s): 1 ignored');
  });

  it('exits with code 2 and writes nothing when --max-tokens is exceeded', () => {
    const over = pack('--max-tokens', '50', '-o', 'out.xml');
    const under = pack('--max-tokens', '100k', '-q');

    expect(over.status).toBe(2);
    expect(over.stdout).toBe('');
    expect(fs.existsSync(path.join(root, 'out.xml'))).toBe(false);
    expect(over.stderr).toMatch(/Error: the document has [\d,]+ tokens, more than --max-tokens 50/);
    expect(over.stderr).toMatch(/\d+ {2}src\/math\.js/);
    expect(under.status).toBe(0);
    expect(under.stdout).toContain('<documents>');
  });

  it('keeps the document within --budget and lists what was left out', () => {
    const result = pack('--budget', '200');

    expect(result.status).toBe(0);
    expect(TokenUtils.calculate(result.stdout, 'pack.xml')).toBeLessThanOrEqual(200);
    expect(result.stdout).toContain('<omitted_files');
    expect(result.stderr).toMatch(/Budget 200: \d+ used; \d+ file\(s\) left out \([\d,]+ tokens\)/);
  });

  it('writes numbered parts with --split and -o', () => {
    const result = pack('--split', '120', '-o', 'out/ctx.md', '--style', 'markdown', '--no-tree');
    const parts = fs.readdirSync(path.join(root, 'out')).sort();

    expect(result.status).toBe(0);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]).toBe('ctx.1.md');
    for (const part of parts) {
      const text = fs.readFileSync(path.join(root, 'out', part), 'utf8');
      expect(TokenUtils.calculate(text, part)).toBeLessThanOrEqual(120);
    }
    expect(result.stderr).toMatch(/Part 1: out[/\\]ctx\.1\.md \(\d+ tokens\)/);

    // Parts of this run are not packed again, and leftovers of a longer run are reported
    const rerun = pack('--split', '100k', '-o', 'out/ctx.md', '--style', 'markdown');
    expect(fs.readFileSync(path.join(root, 'out', 'ctx.1.md'), 'utf8')).not.toContain('ctx.2.md');
    expect(rerun.stderr).toContain('from an earlier run, not part of this output');
  });

  it('says when a file had to be split by lines', () => {
    fs.writeFileSync(
      path.join(root, 'big.txt'),
      Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')
    );
    const result = pack('--split', '400', '-o', 'parts.txt', '--style', 'plain');

    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/big\.txt alone exceeds a part: split by lines into \d+ pieces/);
  });

  it('rejects --split without -o and unknown options', () => {
    const split = pack('--split', '1000');
    const unknown = pack('--frobnicate');
    const badTokens = pack('--budget', 'lots');

    expect(split.status).toBe(1);
    expect(split.stderr).toContain('--split writes numbered files');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('Unknown option: --frobnicate');
    expect(badTokens.status).toBe(1);
    expect(badTokens.stderr).toContain('--budget needs a positive number of tokens');
  });

  it('reports the fit for --target-model', () => {
    const result = pack('--target-model', 'gpt-4o');
    const unknown = pack('--target-model', 'no-such-model');

    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(
      /GPT-4o \(gpt-4o\): [\d.]+% of the 128,000-token window, fits \((exact|approximate) count/
    );
    if (TokenUtils.isExact()) expect(result.stderr).toContain('(xml, o200k_base)');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('Unknown model "no-such-model"');
  });

  it('keeps secrets with --no-redact', () => {
    const result = pack('--no-redact', '--include', 'config/**');

    expect(result.stdout).toContain(FAKE_AWS_KEY);
    expect(result.stderr).not.toContain('Redacted');
  });

  it('compresses with --compress and reports the savings', () => {
    const result = pack('--compress', '--include', 'src/math.js');

    expect(result.stdout).toContain('export function add(a, b) { /* … 2 lines */ }');
    expect(result.stderr).toMatch(
      /Compressed 2 function bodies in 1 file\(s\): \d+ tokens saved \(\d+%\)/
    );
  });

  it('skips files over --max-file-size', () => {
    fs.writeFileSync(path.join(root, 'large.md'), 'x'.repeat(3000));
    const result = pack('--max-file-size', '2k');

    expect(result.stdout).not.toContain('large.md');
    expect(result.stderr).toContain('Skipped 1 file(s): 1 too-large');
  });

  it('is silent on stderr with -q', () => {
    const result = pack('-q');

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it.skipIf(process.platform !== 'linux')('copies to the clipboard with --copy', () => {
    // A stand-in xclip that stores what it receives
    const bin = path.join(root, 'bin');
    const store = path.join(root, 'clipboard.txt');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'xclip'), `#!/bin/sh\ncat > "${store}"\n`, { mode: 0o755 });
    const result = run([PACK, '--copy', '--exclude', 'bin/'], {
      env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(fs.readFileSync(store, 'utf8')).toContain('<source>src/math.js</source>');
  });

  it.skipIf(process.platform !== 'linux')('falls back to stdout when the clipboard fails', () => {
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    for (const tool of ['xclip', 'xsel']) {
      fs.writeFileSync(path.join(bin, tool), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    }
    const result = run([PACK, '--copy', '--exclude', 'bin/'], {
      env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('<documents>');
    expect(result.stderr).toContain('Clipboard unavailable; writing to stdout instead');
  });
});

describe('pack_context MCP tool', () => {
  let root;
  const callTool = (server, args) =>
    server.server._requestHandlers.get('tools/call')(
      { method: 'tools/call', params: { name: 'pack_context', arguments: args } },
      {}
    );

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pack-mcp-'));
    for (const [relativePath, content] of Object.entries(FILES)) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), content);
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('is listed with its input schema', async () => {
    const server = new MCPServer();
    const { tools } = await server.server._requestHandlers.get('tools/list')(
      { method: 'tools/list', params: {} },
      {}
    );
    const tool = tools.find((candidate) => candidate.name === 'pack_context');

    expect(Object.keys(tool.inputSchema.properties)).toEqual([
      'path',
      'include',
      'exclude',
      'files',
      'style',
      'compress',
      'lineNumbers',
      'tree',
      'instructions',
      'budget',
      'targetModel',
    ]);
    expect(tool.inputSchema.required).toEqual(['path']);
  });

  it('returns the redacted document and a summary', async () => {
    const result = await callTool(new MCPServer(), {
      path: root,
      include: ['src/**', 'config/**'],
      exclude: ['*.test.js'],
      style: 'markdown',
      instructions: 'What does scale do?',
    });

    expect(result.isError).toBeUndefined();
    const [document, summary] = result.content.map((item) => item.text);
    expect(document).toContain('### src/math.js');
    expect(document).not.toContain('app.test.js');
    expect(document).not.toContain(FAKE_AWS_KEY);
    expect(document.trimEnd().endsWith('What does scale do?')).toBe(true);
    expect(summary).toMatch(
      /^Packed 3 file\(s\), \d+ tokens \(markdown\); 1 secret\(s\) redacted\.$/
    );
  });

  it('applies a default budget and an explicit one', async () => {
    const big = Array.from({ length: 1500 }, (_, i) => `const value${i} = ${i} * 2;`).join('\n');
    for (const name of ['one', 'two', 'three']) {
      fs.writeFileSync(path.join(root, `${name}.js`), big);
    }
    const server = new MCPServer();
    const byDefault = await callTool(server, { path: root });
    const explicit = await callTool(server, { path: root, budget: 300, compress: true });

    expect(TokenUtils.calculate(byDefault.content[0].text, 'x')).toBeLessThanOrEqual(
      TOOL_DEFAULT_BUDGET
    );
    expect(byDefault.content[1].text).toMatch(/file\(s\) left out by the budget/);
    expect(TokenUtils.calculate(explicit.content[0].text, 'x')).toBeLessThanOrEqual(300);
  });

  it('packs a file list relative to the project and reports the model fit', async () => {
    const result = await callTool(new MCPServer(), {
      path: root,
      files: ['src/app.js'],
      lineNumbers: true,
      tree: false,
      targetModel: 'gpt-4o',
    });

    expect(result.content[0].text).toContain('1 | import { add } from');
    expect(result.content[1].text).toMatch(/% of gpt-4o's window, fits\.$/);
  });

  it('keeps files and paths inside the sandbox root', async () => {
    const server = new MCPServer({ root });
    const escape = await callTool(server, { path: root, files: ['../outside.js'] });
    const outsideRoot = await callTool(server, { path: os.tmpdir() });
    const relative = await callTool(server, { path: 'src', tree: false });

    expect(escape.isError).toBe(true);
    expect(escape.content[0].text).toContain('outside the project root');
    expect(outsideRoot.isError).toBe(true);
    expect(relative.isError).toBeUndefined();
    expect(relative.content[0].text).toContain('<source>math.js</source>');
  });

  it('reports invalid arguments as tool errors', async () => {
    const result = await callTool(new MCPServer(), { path: root, style: 'yaml' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown style "yaml"');
  });
});
