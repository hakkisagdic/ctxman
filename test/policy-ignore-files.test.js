import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Scanner } from '../lib/core/Scanner.js';
import TokenCalculator from '../lib/analyzers/token-calculator.js';
import {
  KNOWN_IGNORE_FILES,
  resolveIgnoreFileNames,
  loadIgnoreFileRules,
  loadPolicy,
} from '../lib/policy/index.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

describe('AI-tool ignore files', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-ignorefiles-'));
    const files = {
      'src/app.js': 'export const app = 1;\n',
      'src/generated/api.js': 'export const api = 1;\n',
      'src/generated/keep.js': 'export const keep = 1;\n',
      'notes/private.md': '# private\n',
      'README.md': '# readme\n',
      '.cursorignore': '# Cursor\nsrc/generated/\nnotes/\n',
      '.aiderignore': '*.md\n!README.md\n',
    };
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), content);
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const scan = (options = {}) =>
    new Scanner(root, { env: {}, ...options })
      .scan()
      .map((file) => file.relativePath.split(path.sep).join('/'))
      .filter((file) => !file.startsWith('.'))
      .sort();

  it('lists the known ignore files with their tools', () => {
    const names = KNOWN_IGNORE_FILES.map((entry) => entry.file);

    for (const name of [
      '.cursorignore',
      '.aiexclude',
      '.augmentignore',
      '.tabnineignore',
      '.devinignore',
      '.codeiumignore',
      '.aiderignore',
      '.repomixignore',
      '.gitingestignore',
    ]) {
      expect(names).toContain(name);
    }
    expect(KNOWN_IGNORE_FILES.every((entry) => entry.tool)).toBe(true);
  });

  it('resolves "all", comma lists and arrays, rejecting paths', () => {
    expect(resolveIgnoreFileNames('all')).toEqual(KNOWN_IGNORE_FILES.map((entry) => entry.file));
    expect(resolveIgnoreFileNames('.cursorignore, .aiexclude,.cursorignore')).toEqual([
      '.cursorignore',
      '.aiexclude',
    ]);
    expect(resolveIgnoreFileNames(['.myteamignore'])).toEqual(['.myteamignore']);
    expect(resolveIgnoreFileNames(null)).toEqual([]);
    expect(() => resolveIgnoreFileNames('../.cursorignore')).toThrow('Invalid ignore file name');
    expect(() => resolveIgnoreFileNames('sub/.cursorignore')).toThrow('Invalid ignore file name');
  });

  it('applies each file with .gitignore syntax', () => {
    const rules = loadIgnoreFileRules(root, ['.cursorignore', '.aiderignore', '.tabnineignore']);

    expect(rules.match('src/generated')).toBe('.cursorignore');
    expect(rules.match('src/generated/api.js')).toBe('.cursorignore');
    expect(rules.match('notes/private.md')).toBe('.cursorignore');
    expect(rules.match('docs/guide.md')).toBe('.aiderignore');
    expect(rules.isIgnored('README.md')).toBe(false);
    expect(rules.isIgnored('src/app.js')).toBe(false);
    expect(rules.describe()).toBe(
      '.cursorignore (2 patterns), .aiderignore (2 patterns), .tabnineignore (not found)'
    );
  });

  it('treats an empty .aiexclude as excluding everything, like Gemini Code Assist', () => {
    fs.writeFileSync(path.join(root, '.aiexclude'), '\n# nothing listed\n');

    expect(loadIgnoreFileRules(root, ['.aiexclude']).isIgnored('src/app.js')).toBe(true);
  });

  describe('Scanner', () => {
    it('does not read them unless asked (default unchanged)', () => {
      expect(scan()).toEqual([
        'README.md',
        'notes/private.md',
        'src/app.js',
        'src/generated/api.js',
        'src/generated/keep.js',
      ]);
    });

    it('honours the files named in respectIgnoreFiles', () => {
      expect(scan({ respectIgnoreFiles: '.cursorignore' })).toEqual(['README.md', 'src/app.js']);
      expect(scan({ respectIgnoreFiles: 'all' })).toEqual(['README.md', 'src/app.js']);
      expect(scan({ respectIgnoreFiles: ['.aiderignore'] })).toEqual([
        'README.md',
        'src/app.js',
        'src/generated/api.js',
        'src/generated/keep.js',
      ]);
    });

    it("honours the policy's ignoreFiles", () => {
      fs.mkdirSync(path.join(root, '.ctxman'));
      fs.writeFileSync(
        path.join(root, '.ctxman', 'policy.json'),
        JSON.stringify({ version: 1, ignoreFiles: ['.cursorignore'] })
      );

      expect(scan()).toEqual(['README.md', 'src/app.js']);
      expect(scan({ policy: loadPolicy(root, { env: {} }) })).toEqual(['README.md', 'src/app.js']);
    });
  });

  describe('TokenCalculator (legacy CLI path)', () => {
    const analyze = (options) =>
      new TokenCalculator(root, options)
        .analyze()
        .map((file) => file.relativePath.split(path.sep).join('/'))
        .filter((file) => !file.startsWith('.'))
        .sort();

    it('is unchanged without the option', () => {
      expect(analyze()).toContain('src/generated/api.js');
    });

    it('honours respectIgnoreFiles and counts what it filtered', () => {
      const calculator = new TokenCalculator(root, { respectIgnoreFiles: '.cursorignore' });
      const files = calculator.analyze().map((f) => f.relativePath.split(path.sep).join('/'));

      expect(files).not.toContain('src/generated/api.js');
      expect(files).not.toContain('notes/private.md');
      expect(files).toContain('src/app.js');
      expect(calculator.stats.ignoreFileIgnoredFiles).toBe(3);
    });

    it('adds no stats fields when nothing is configured', () => {
      const calculator = new TokenCalculator(root);
      calculator.analyze();

      expect(calculator.stats).not.toHaveProperty('ignoreFileIgnoredFiles');
      expect(calculator.stats).not.toHaveProperty('policyDeniedFiles');
    });
  });

  it('ctxman --cli --respect-ignore-files filters the analysis', () => {
    const env = { ...process.env, HOME: root, USERPROFILE: root };
    delete env.CTXMAN_POLICY;
    const run = (...args) =>
      spawnSync(process.execPath, [CLI, '--cli', '--simple', '--verbose', ...args], {
        cwd: root,
        encoding: 'utf8',
        env,
      });

    const filtered = run('--respect-ignore-files', '.cursorignore,.aiderignore');
    expect(filtered.status).toBe(0);
    expect(filtered.stdout).toContain('AI-tool ignore files: .cursorignore (2 patterns)');
    expect(filtered.stdout).toContain('Filtered 3 files due to AI-tool ignore files');
    expect(filtered.stdout).not.toContain('src/generated/api.js');
    expect(filtered.stdout).not.toContain('notes/private.md');

    const plain = run();
    expect(plain.status).toBe(0);
    expect(plain.stdout).not.toContain('AI-tool ignore files');
    expect(plain.stdout).toContain(path.join('src', 'generated', 'api.js'));
  });
});
