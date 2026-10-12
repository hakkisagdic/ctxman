import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { selectFiles, PackError } from '../lib/pack/select.js';
import { packContext } from '../lib/pack/index.js';

describe('pack file selection', () => {
  let root;
  const write = (relativePath, content = 'x\n') => {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  const paths = (selection) => selection.files.map((file) => file.path);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pack-select-'));
    write('src/app.js', 'export const app = 1;\n');
    write('src/util.js', 'export const util = 2;\n');
    write('src/app.test.js', 'test();\n');
    write('docs/guide.md', '# Guide\n');
    write('README.md', '# Project\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('scan', () => {
    it('returns the scanned files in path order with posix paths', () => {
      expect(paths(selectFiles(root))).toEqual([
        'README.md',
        'docs/guide.md',
        'src/app.js',
        'src/app.test.js',
        'src/util.js',
      ]);
    });

    it('respects .gitignore and skipped directories', () => {
      write('.gitignore', 'docs/\n');
      write('node_modules/lib/index.js', 'module.exports = 1;\n');

      expect(paths(selectFiles(root))).not.toContain('docs/guide.md');
      expect(paths(selectFiles(root)).some((file) => file.startsWith('node_modules'))).toBe(false);
    });

    it('respects .contextignore', () => {
      write('.contextignore', '**/*.test.js\n');

      expect(paths(selectFiles(root))).not.toContain('src/app.test.js');
    });

    it('uses .contextinclude as an allow list', () => {
      write('.contextinclude', 'src/**\n');

      expect(paths(selectFiles(root))).toEqual(['src/app.js', 'src/app.test.js', 'src/util.js']);
    });

    it('throws ROOT_NOT_FOUND for a missing directory', () => {
      expect(() => selectFiles(path.join(root, 'missing'))).toThrow(PackError);
      try {
        selectFiles(path.join(root, 'missing'));
      } catch (error) {
        expect(error.code).toBe('ROOT_NOT_FOUND');
      }
    });
  });

  describe('--include / --exclude', () => {
    it('keeps only files matching an include glob', () => {
      expect(paths(selectFiles(root, { include: ['src/**/*.js'] }))).toEqual([
        'src/app.js',
        'src/app.test.js',
        'src/util.js',
      ]);
    });

    it('accepts several include globs', () => {
      expect(paths(selectFiles(root, { include: ['*.md', 'src/util.js'] }))).toEqual([
        'README.md',
        'docs/guide.md',
        'src/util.js',
      ]);
    });

    it('leaves out files matching an exclude glob', () => {
      expect(paths(selectFiles(root, { exclude: ['**/*.test.js', 'docs/'] }))).toEqual([
        'README.md',
        'src/app.js',
        'src/util.js',
      ]);
    });

    it('combines include and exclude', () => {
      const selection = selectFiles(root, { include: ['src/**'], exclude: ['*.test.js'] });

      expect(paths(selection)).toEqual(['src/app.js', 'src/util.js']);
    });

    it('leaves out excludeFiles (the output file)', () => {
      const output = write('context.md', 'old output\n');

      expect(paths(selectFiles(root, { excludeFiles: [output] }))).not.toContain('context.md');
    });

    it('skips files over maxFileSize', () => {
      write('big.txt', 'y'.repeat(2000));
      const selection = selectFiles(root, { maxFileSize: 1000 });

      expect(paths(selection)).not.toContain('big.txt');
      expect(selection.skipped).toEqual([{ path: 'big.txt', reason: 'too-large' }]);
    });
  });

  describe('explicit list (--stdin)', () => {
    it('keeps the given order and resolves entries against cwd', () => {
      const selection = selectFiles(root, {
        files: ['util.js', 'app.js', './util.js'],
        cwd: path.join(root, 'src'),
      });

      expect(paths(selection)).toEqual(['src/util.js', 'src/app.js']);
    });

    it('accepts absolute paths inside the root', () => {
      const selection = selectFiles(root, { files: [path.join(root, 'README.md')] });

      expect(paths(selection)).toEqual(['README.md']);
    });

    it('rejects paths that leave the root', () => {
      const outside = path.join(os.tmpdir(), 'outside.txt');
      for (const entry of ['../outside.txt', outside, 'src/../../outside.txt']) {
        expect(() => selectFiles(root, { files: [entry] })).toThrow(/outside the project root/);
      }
    });

    it('accepts a file whose name starts with two dots', () => {
      write('..config', 'a = 1\n');

      expect(paths(selectFiles(root, { files: ['..config'] }))).toEqual(['..config']);
    });

    it.skipIf(process.platform === 'win32')('rejects a symlink that points out of the root', () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pack-outside-'));
      try {
        fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret\n');
        fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(root, 'link.txt'));

        expect(() => selectFiles(root, { files: ['link.txt'] })).toThrow(PackError);
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it('applies the ignore files and skipped directories to the list', () => {
      write('.gitignore', 'secret.env\n');
      write('.contextignore', 'docs/\n');
      write('secret.env', 'TOKEN=1\n');
      write('node_modules/pkg/index.js', 'x\n');
      const selection = selectFiles(root, {
        files: ['secret.env', 'docs/guide.md', 'node_modules/pkg/index.js', 'src/app.js'],
      });

      expect(paths(selection)).toEqual(['src/app.js']);
      expect(selection.skipped.map((file) => file.reason)).toEqual([
        'ignored',
        'ignored',
        'ignored',
      ]);
    });

    it('reports missing entries and directories', () => {
      const selection = selectFiles(root, { files: ['nope.js', 'src'] });

      expect(selection.files).toEqual([]);
      expect(selection.skipped).toEqual([
        { path: 'nope.js', reason: 'missing' },
        { path: 'src', reason: 'not-a-file' },
      ]);
    });

    it('takes files with any extension, unlike the scan', () => {
      write('tool.mjs', 'export {};\n');

      expect(paths(selectFiles(root))).not.toContain('tool.mjs');
      expect(paths(selectFiles(root, { files: ['tool.mjs'] }))).toEqual(['tool.mjs']);
    });

    it('applies --include and --exclude to the list', () => {
      const selection = selectFiles(root, {
        files: ['README.md', 'src/app.js', 'src/app.test.js'],
        include: ['src/**'],
        exclude: ['*.test.js'],
      });

      expect(paths(selection)).toEqual(['src/app.js']);
    });
  });

  describe('content checks in packContext', () => {
    it('skips binary files and reports them', async () => {
      fs.writeFileSync(path.join(root, 'image.svg'), Buffer.from([60, 115, 0, 1, 2, 3]));
      const result = await packContext(root, { tree: false });

      expect(result.files.map((file) => file.path)).not.toContain('image.svg');
      expect(result.skipped).toContainEqual({ path: 'image.svg', reason: 'binary' });
    });

    it('skips files over maxFileSize', async () => {
      write('big.md', 'z '.repeat(1000));
      const result = await packContext(root, { maxFileSize: 500 });

      expect(result.skipped).toEqual([{ path: 'big.md', reason: 'too-large' }]);
    });

    it('strips a byte order mark', async () => {
      write('bom.md', '﻿# Title\n');
      const result = await packContext(root, { files: ['bom.md'], style: 'plain', tree: false });

      expect(result.text).toBe('=== bom.md ===\n# Title\n');
    });

    it('rejects invalid options', async () => {
      await expect(packContext(root, { style: 'yaml' })).rejects.toThrow(/Unknown style/);
      await expect(packContext(root, { budget: 0 })).rejects.toThrow(/positive integer/);
      await expect(packContext(root, { include: [1] })).rejects.toThrow(/list of strings/);
    });
  });
});
