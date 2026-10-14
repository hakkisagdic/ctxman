import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Scanner from '../lib/core/Scanner.js';
import TokenCalculator from '../lib/analyzers/token-calculator.js';

describe('Scanner built-in directory skips', () => {
  let projectDir;

  const write = (relativePath, content = 'export const x = 1;\n') => {
    const fullPath = path.join(projectDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  };

  beforeEach(() => {
    // No .gitignore: the skips must not depend on the project's ignore files
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-scanner-skips-'));
    write('src/app.js');
    write('node_modules/left-pad/index.js');
    write('packages/lib/node_modules/dep/index.js');
    write('.git/hooks/pre-commit.sh', '#!/bin/sh\n');
    write('dist/bundle.js');
    write('coverage/report.json', '{}\n');
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('skips dependency, VCS and build directories without a .gitignore', () => {
    const files = new Scanner(projectDir).scan().map((f) => f.relativePath);

    expect(files).toEqual([path.join('src', 'app.js')]);
  });

  it('scans the same files as the CLI analyzer', () => {
    const scanned = new Scanner(projectDir)
      .scan()
      .map((f) => f.relativePath)
      .sort();
    const calculator = new TokenCalculator(projectDir);
    const cliFiles = calculator
      .scanDirectory(projectDir)
      .map((f) => path.relative(projectDir, f))
      .sort();

    expect(scanned).toEqual(cliFiles);
  });
});
