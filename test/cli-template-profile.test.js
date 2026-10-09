/**
 * --template and --profile must apply their include/exclude patterns to the analysed files.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CLI = path.resolve('bin/cli.js');
const FILES = {
  'README.md': '# Project\n',
  'package.json': '{ "name": "fixture" }\n',
  'docs/guide.md': '# Guide\n',
  'test/app.test.js': 'test("x", () => {});\n',
  'src/app.js': 'export function start() {\n  return 1;\n}\n',
  'src/app.spec.js': 'it("y", () => {});\n',
  'src/core/server.js': 'export function serve() {\n  return 2;\n}\n',
  'src/core/server.test.js': 'test("z", () => {});\n',
  'lib/math.py': 'def add(a, b):\n    return a + b\n',
  'lib/util/math.js': 'export const add = (a, b) => a + b;\n',
};

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, HOME: cwd },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 30000,
  });
}

function analysedFiles(cwd, args) {
  const r = runCli(cwd, [...args, '--save-report']);
  expect(r.status, r.stderr).toBe(0);
  const report = JSON.parse(fs.readFileSync(path.join(cwd, 'token-analysis-report.json'), 'utf8'));
  return { stdout: r.stdout, files: report.files.map((f) => f.relativePath) };
}

describe('CLI --template / --profile patterns', () => {
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-template-'));
    for (const [file, content] of Object.entries(FILES)) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), content);
    }
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('without a template every file is analysed', () => {
    const { files } = analysedFiles(dir, ['--cli']);
    expect(files.sort()).toEqual(Object.keys(FILES).sort());
  });

  test('--template bug-fix keeps its source files and drops docs, config and tests', () => {
    const { stdout, files } = analysedFiles(dir, ['--cli', '--template', 'bug-fix']);
    expect(stdout).toContain('Using template: Bug Fix Context');
    expect(files).toEqual(expect.arrayContaining(['src/core/server.js', 'lib/util/math.js']));
    for (const excluded of [
      'README.md',
      'package.json',
      'docs/guide.md',
      'test/app.test.js',
      'src/core/server.test.js', // negated include and **/*.test.js exclude
      'lib/math.py', // include lists only *.js
    ]) {
      expect(files).not.toContain(excluded);
    }
  });

  test('--profile default keeps src/ and lib/ and drops tests and specs', () => {
    const { stdout, files } = analysedFiles(dir, ['--cli', '--profile', 'default']);
    expect(stdout).toContain('Using profile: Default Profile');
    expect(files).toEqual(expect.arrayContaining(['src/app.js', 'lib/math.py']));
    for (const excluded of [
      'README.md',
      'package.json',
      'docs/guide.md',
      'test/app.test.js',
      'src/app.spec.js',
      'src/core/server.test.js',
    ]) {
      expect(files).not.toContain(excluded);
    }
  });
});
