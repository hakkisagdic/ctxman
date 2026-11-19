import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { validateDigestId, assertInsideStore, DigestError } from '../lib/context/gate.js';
import { resolveStoreDir, ensureStore, digestPath } from '../lib/context/store.js';
import { writeDigest, readDigest, listDigests, summarize } from '../lib/context/digest.js';
import MCPServer from '../lib/api/mcp/server.js';

function makeLinesText(count, replacements = {}) {
  const lines = [];
  for (let i = 1; i <= count; i++) {
    lines.push(replacements[i] ?? `Line ${i}: payload item ${i}`);
  }
  return `${lines.join('\n')}\n`;
}

function runWorkerScript(scriptRelPath, argv, { stdinText, env } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve(scriptRelPath), {
      argv,
      env: env ?? process.env,
      stdin: true,
      stdout: true,
      stderr: true,
    });
    const out = [];
    const err = [];
    worker.stdout.on('data', (chunk) => out.push(Buffer.from(chunk)));
    worker.stderr.on('data', (chunk) => err.push(Buffer.from(chunk)));
    worker.on('error', reject);
    worker.on('exit', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
    if (stdinText !== undefined) {
      worker.stdin.end(stdinText);
    } else {
      worker.stdin.end();
    }
  });
}

describe('ctxman digest (slice 1)', () => {
  let tempDir;
  let storeDir;
  let outsideDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-digest-test-'));
    storeDir = path.join(tempDir, 'store');
    outsideDir = path.join(tempDir, 'outside');
    fs.mkdirSync(outsideDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes and reads a 400-line digest byte-identically with 700/600 modes', async () => {
    const content = makeLinesText(400, {
      7: 'Line 7: MARKER_ALPHA early note',
      300: 'Line 300: MARKER_ALPHA late note',
    });

    const res = await runWorkerScript(
      'bin/cm-digest.js',
      ['write', '--id', 't1', '--store', storeDir],
      { stdinText: content }
    );
    expect(res.code).toBe(0);
    expect(res.stderr).toBe('');

    const outLines = res.stdout.trimEnd().split('\n');
    expect(outLines.length).toBeLessThanOrEqual(7);
    expect(outLines).toContain('id: t1');
    const savedPath = path.join(storeDir, 't1.md');
    expect(outLines).toContain(`path: ${savedPath}`);

    expect(fs.readFileSync(savedPath, 'utf8')).toBe(content);
    expect(fs.statSync(storeDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(savedPath).mode & 0o777).toBe(0o600);

    // Also test --file input through bin/cli.js dispatch
    const inputFile = path.join(outsideDir, 'source.md');
    fs.writeFileSync(inputFile, content, 'utf8');
    const cliWrite = await runWorkerScript('bin/cli.js', [
      'digest',
      'write',
      '--id',
      't1-file',
      '--file',
      inputFile,
      '--store',
      storeDir,
    ]);
    expect(cliWrite.code).toBe(0);
    expect(fs.readFileSync(path.join(storeDir, 't1-file.md'), 'utf8')).toBe(content);

    // Force overwrite restores 0o600 even if permissions drifted
    fs.chmodSync(savedPath, 0o644);
    const updated = writeDigest('t1', 'Replacement line 1\nReplacement line 2\n', {
      storeDir,
      force: true,
    });
    expect(updated.id).toBe('t1');
    expect(fs.statSync(savedPath).mode & 0o777).toBe(0o600);
  });

  it('resolves store directory precedence (--store > env > os.homedir)', () => {
    const envOnly = resolveStoreDir({
      env: { CTXMAN_DIGEST_DIR: path.join(tempDir, 'env-store') },
    });
    expect(envOnly).toBe(path.resolve(tempDir, 'env-store'));

    const explicitWins = resolveStoreDir({
      storeDir,
      env: { CTXMAN_DIGEST_DIR: path.join(tempDir, 'env-store') },
    });
    expect(explicitWins).toBe(path.resolve(storeDir));

    const fallbackDefault = resolveStoreDir({ env: {} });
    expect(fallbackDefault).toBe(path.join(os.homedir(), '.ctxman', 'digests'));

    const created = ensureStore({ storeDir });
    expect(fs.statSync(created).mode & 0o777).toBe(0o700);
    expect(digestPath('abc_1-2.3', { storeDir })).toBe(
      path.join(path.resolve(storeDir), 'abc_1-2.3.md')
    );
  });

  it('validates digest ids strictly', () => {
    for (const invalid of ['..', 'a..b', 'a/b', 'a\\b', '', '.hidden', '-bad', 'a'.repeat(65)]) {
      expect(() => validateDigestId(invalid)).toThrow(DigestError);
      expect(() => writeDigest(invalid, 'hello\n', { storeDir })).toThrow(DigestError);
    }

    for (const valid of ['t1', 'run_2026-11.1', 'a'.repeat(64)]) {
      expect(validateDigestId(valid)).toBe(valid);
    }
  });

  it('enforces store path containment including symlink escapes', async () => {
    ensureStore({ storeDir });
    const content = makeLinesText(20);
    writeDigest('t1', content, { storeDir });

    const outsideFile = path.join(outsideDir, 'secret-note.md');
    fs.writeFileSync(outsideFile, 'outside content\n', 'utf8');

    const escapeLink = path.join(storeDir, 'evil.md');
    fs.symlinkSync(outsideFile, escapeLink);

    expect(() => assertInsideStore(outsideFile, storeDir)).toThrow(DigestError);
    expect(() => assertInsideStore(escapeLink, storeDir)).toThrow(DigestError);

    for (const badRef of ['../x', '/etc/hosts', outsideFile, 'evil', escapeLink]) {
      expect(() => readDigest({ ref: badRef, storeDir })).toThrow(DigestError);
      const cliRes = await runWorkerScript('bin/cm-digest.js', [
        'read',
        badRef,
        '--store',
        storeDir,
      ]);
      expect(cliRes.code).toBe(1);
      expect(cliRes.stdout).toBe('');
      expect(cliRes.stderr.length).toBeGreaterThan(0);
    }

    // Valid path inside the store works identically to id
    const byId = readDigest({ ref: 't1', storeDir });
    const byPath = readDigest({ ref: path.join(storeDir, 't1.md'), storeDir });
    expect(byPath.text).toBe(byId.text);
  });

  it('supports --lines ranges, single line, out-of-range, and --grep matching/caps', async () => {
    const content = makeLinesText(400, {
      7: 'Line 7: MARKER_ALPHA first',
      300: 'Line 300: MARKER_ALPHA second',
    });
    writeDigest('t1', content, { storeDir });

    const rangeRes = await runWorkerScript('bin/cm-digest.js', [
      'read',
      't1',
      '--lines',
      '120-130',
      '--store',
      storeDir,
    ]);
    expect(rangeRes.code).toBe(0);
    const rangeLines = rangeRes.stdout.trimEnd().split('\n');
    expect(rangeLines).toHaveLength(11);
    expect(rangeLines[0]).toBe('120: Line 120: payload item 120');
    expect(rangeLines[10]).toBe('130: Line 130: payload item 130');

    const singleLine = readDigest({ ref: 't1', lines: '5', storeDir });
    expect(singleLine.text).toBe('5: Line 5: payload item 5\n');

    const partialEnd = readDigest({ ref: 't1', lines: '395-450', storeDir });
    expect(partialEnd.matches).toHaveLength(6);
    expect(partialEnd.matches[0].line).toBe(395);
    expect(partialEnd.matches[5].line).toBe(400);

    const pastEnd = readDigest({ ref: 't1', lines: '450-500', storeDir });
    expect(pastEnd.text).toBe('');
    expect(pastEnd.matches).toHaveLength(0);

    for (const badLines of ['10-5', '0-3', '0', 'abc', '1-']) {
      expect(() => readDigest({ ref: 't1', lines: badLines, storeDir })).toThrow(DigestError);
    }

    const grepMarker = await runWorkerScript('bin/cm-digest.js', [
      'read',
      't1',
      '--grep',
      'MARKER_ALPHA',
      '--store',
      storeDir,
    ]);
    expect(grepMarker.code).toBe(0);
    expect(grepMarker.stdout).toBe(
      '7: Line 7: MARKER_ALPHA first\n300: Line 300: MARKER_ALPHA second\n'
    );

    const grepRegex = readDigest({ ref: 't1', grep: '^Line (7|300):', storeDir });
    expect(grepRegex.matches.map((m) => m.line)).toEqual([7, 300]);

    // Invalid regex falls back to literal substring match
    writeDigest('lit', 'alpha [unclosed( beta\ngamma\n', { storeDir });
    const grepInvalid = readDigest({ ref: 'lit', grep: '[unclosed(', storeDir });
    expect(grepInvalid.matches).toEqual([{ line: 1, content: 'alpha [unclosed( beta' }]);

    // Pattern > 200 chars is rejected
    expect(() => readDigest({ ref: 't1', grep: 'x'.repeat(201), storeDir })).toThrow(DigestError);

    // Grep output caps at 500 matching lines
    writeDigest('many', makeLinesText(620), { storeDir });
    const capped = readDigest({ ref: 'many', grep: 'payload item', storeDir });
    expect(capped.matches).toHaveLength(500);
    expect(capped.truncated).toBe(true);
  });

  it('prints writer summary fields or fallback summary, rejects empty input, and guards overwrites', async () => {
    const withFields = await runWorkerScript(
      'bin/cm-digest.js',
      [
        'write',
        '--id',
        'w1',
        '--store',
        storeDir,
        '--done',
        'a',
        '--result',
        'b',
        '--open',
        'c',
        '--needs',
        'd',
      ],
      { stdinText: 'Body line 1\nBody line 2\n' }
    );
    expect(withFields.code).toBe(0);
    const fieldLines = withFields.stdout.trimEnd().split('\n');
    expect(fieldLines.length).toBeLessThanOrEqual(7);
    expect(fieldLines).toContain('done: a');
    expect(fieldLines).toContain('result: b');
    expect(fieldLines).toContain('open: c');
    expect(fieldLines).toContain('needs: d');

    const longLine = 'x'.repeat(220);
    const derived = summarize(
      `\n${longLine}\nSecond result line\nTODO: finish docs\nQuestion: confirm default?\n`
    );
    expect(derived.done).toHaveLength(160);
    expect(derived.result).toBe('Second result line');
    expect(derived.open).toBe('TODO: finish docs');
    expect(derived.needs).toBe('Question: confirm default?');

    const noMatchesFallback = await runWorkerScript(
      'bin/cm-digest.js',
      ['write', '--id', 'w2', '--store', storeDir],
      { stdinText: 'Only first line\nOnly second line\nThird normal line\n' }
    );
    expect(noMatchesFallback.code).toBe(0);
    const fallbackLines = noMatchesFallback.stdout.trimEnd().split('\n');
    expect(fallbackLines.length).toBeLessThanOrEqual(7);
    expect(fallbackLines).toContain('done: Only first line');
    expect(fallbackLines).toContain('result: Only second line');
    expect(fallbackLines.some((l) => l.startsWith('open:'))).toBe(false);
    expect(fallbackLines.some((l) => l.startsWith('needs:'))).toBe(false);

    // Empty stdin exits non-zero and creates no file
    const emptyRes = await runWorkerScript(
      'bin/cm-digest.js',
      ['write', '--id', 'empty-id', '--store', storeDir],
      { stdinText: '   \n\t\n' }
    );
    expect(emptyRes.code).toBe(1);
    expect(fs.existsSync(path.join(storeDir, 'empty-id.md'))).toBe(false);

    // Overwrite without --force is refused and preserves existing contents
    const dupRes = await runWorkerScript(
      'bin/cm-digest.js',
      ['write', '--id', 'w1', '--store', storeDir],
      { stdinText: 'Should not overwrite\n' }
    );
    expect(dupRes.code).toBe(1);
    expect(fs.readFileSync(path.join(storeDir, 'w1.md'), 'utf8')).toBe(
      'Body line 1\nBody line 2\n'
    );
  });

  it('lists digests on empty and populated stores with text and json output', async () => {
    const emptyList = await runWorkerScript('bin/cm-digest.js', ['list', '--store', storeDir]);
    expect(emptyList.code).toBe(0);
    expect(emptyList.stdout.toLowerCase()).toContain('no digests');

    const content = makeLinesText(400);
    writeDigest('t1', content, { storeDir });

    const textList = await runWorkerScript('bin/cm-digest.js', ['list', '--store', storeDir]);
    expect(textList.code).toBe(0);
    expect(textList.stdout).toContain('t1');
    expect(textList.stdout).toContain('400 lines');
    expect(textList.stdout).toContain(`${Buffer.byteLength(content, 'utf8')} bytes`);

    const jsonList = await runWorkerScript('bin/cm-digest.js', [
      'list',
      '--json',
      '--store',
      storeDir,
    ]);
    expect(jsonList.code).toBe(0);
    const parsed = JSON.parse(jsonList.stdout);
    expect(parsed).toEqual([
      expect.objectContaining({
        id: 't1',
        path: path.join(storeDir, 't1.md'),
        lines: 400,
        bytes: Buffer.byteLength(content, 'utf8'),
      }),
    ]);
    expect(listDigests({ storeDir })).toHaveLength(1);
  });

  it('dispatches ctxman digest and documents it in --help via bin/cli.js', async () => {
    const helpRes = await runWorkerScript('bin/cli.js', ['--help']);
    expect(helpRes.code).toBe(0);
    expect(helpRes.stdout).toContain('digest');

    const badReadRes = await runWorkerScript('bin/cli.js', [
      'digest',
      'read',
      '../x',
      '--store',
      storeDir,
    ]);
    expect(badReadRes.code).toBe(1);
  });

  it('exposes MCP digest_read tool (20 total) and enforces store containment', async () => {
    const content = makeLinesText(400);
    writeDigest('t1', content, { storeDir });

    const handlers = new Map();
    const mcp = new MCPServer();
    mcp.server = {
      setRequestHandler: (schema, fn) => {
        handlers.set(schema, fn);
      },
      onerror: null,
    };
    mcp.setupHandlers();

    const handlerValues = [...handlers.values()];
    const listToolsHandler = handlerValues[0];
    const callToolHandler = handlerValues[6];

    const { tools } = await listToolsHandler({});
    expect(tools).toHaveLength(20);
    const digestTool = tools.find((t) => t.name === 'digest_read');
    expect(digestTool).toBeDefined();
    expect(digestTool.inputSchema.properties).toHaveProperty('ref');
    expect(digestTool.inputSchema.properties).toHaveProperty('lines');
    expect(digestTool.inputSchema.properties).toHaveProperty('grep');
    expect(digestTool.inputSchema.properties).toHaveProperty('storeDir');
    expect(digestTool.inputSchema.properties).toHaveProperty('repos');

    const okCall = await callToolHandler({
      params: {
        name: 'digest_read',
        arguments: { ref: 't1', lines: '120-130', storeDir },
      },
    });
    expect(okCall.isError).toBeFalsy();
    const mcpLines = okCall.content[0].text.trimEnd().split('\n');
    expect(mcpLines).toHaveLength(11);
    expect(mcpLines[0]).toBe('120: Line 120: payload item 120');
    expect(mcpLines[10]).toBe('130: Line 130: payload item 130');

    const badCall = await callToolHandler({
      params: {
        name: 'digest_read',
        arguments: { ref: '../x', storeDir },
      },
    });
    expect(badCall.isError).toBe(true);
  });

  it('keeps lib/context and bin/cm-digest.js free of network or subprocess imports', () => {
    const allowedContextImports = new Set([
      'node:fs',
      'node:os',
      'node:path',
      './gate.js',
      './store.js',
      './digest.js',
    ]);
    const allowedBinImports = new Set([
      'node:util',
      'node:fs',
      'node:path',
      '../lib/utils/logger.js',
      '../lib/utils/cli-output.js',
      '../lib/context/digest.js',
    ]);

    const extractSpecifiers = (src) => {
      const specs = [];
      for (const m of src.matchAll(/\bimport\s+[^'"]*['"]([^'"]+)['"]/g)) {
        specs.push(m[1]);
      }
      for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        specs.push(m[1]);
      }
      return specs;
    };

    const contextFiles = ['gate.js', 'store.js', 'digest.js'];
    for (const file of contextFiles) {
      const src = fs.readFileSync(path.resolve('lib/context', file), 'utf8');
      const specs = extractSpecifiers(src);
      expect(specs.length).toBeGreaterThan(0);
      for (const spec of specs) {
        expect(allowedContextImports.has(spec), `Unexpected import ${spec} in ${file}`).toBe(true);
      }
      expect(src).not.toMatch(/\bcreateRequire\b|\bglobalThis\b/);
    }

    const binSrc = fs.readFileSync(path.resolve('bin/cm-digest.js'), 'utf8');
    const binSpecs = extractSpecifiers(binSrc);
    expect(binSpecs.length).toBeGreaterThan(0);
    for (const spec of binSpecs) {
      expect(allowedBinImports.has(spec), `Unexpected import ${spec} in bin/cm-digest.js`).toBe(
        true
      );
    }
    expect(binSrc).not.toMatch(/\bcreateRequire\b|\bglobalThis\b/);
  });
});
