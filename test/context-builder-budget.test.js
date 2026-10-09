import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ContextBuilder } from '../lib/core/ContextBuilder.js';
import { Analyzer } from '../lib/core/Analyzer.js';
import { Scanner } from '../lib/core/Scanner.js';

const file = (relativePath, tokens) => ({
  relativePath,
  name: path.basename(relativePath),
  tokens,
});

describe('ContextBuilder token budget', () => {
  const tokensOf = (files) => files.reduce((sum, f) => sum + f.tokens, 0);

  it('never exceeds the target, even when the top file is larger than the budget', () => {
    const files = [file('src/core/big.js', 15000), file('src/a.js', 3000), file('src/b.js', 2000)];

    const selected = new ContextBuilder().applySmartFiltering(files, 10000);

    expect(tokensOf(selected)).toBeLessThanOrEqual(10000);
    expect(selected.map((f) => f.relativePath).sort()).toEqual(['src/a.js', 'src/b.js']);
  });

  it('fills the remaining budget with smaller files after one that does not fit', () => {
    const files = [file('src/x.js', 6000), file('src/y.js', 5000), file('src/z.js', 3000)];

    const selected = new ContextBuilder({ priorityStrategy: 'core-first' }).applySmartFiltering(
      files,
      9000
    );

    expect(selected.map((f) => f.relativePath)).toEqual(['src/x.js', 'src/z.js']);
  });

  it("keeps the caller's file order", () => {
    const files = [file('docs/a.md', 10), file('src/core/b.js', 10), file('test/c.js', 10)];
    const before = files.map((f) => f.relativePath);

    new ContextBuilder({ targetTokens: 15 }).build({ files, stats: {} });

    expect(files.map((f) => f.relativePath)).toEqual(before);
  });
});

describe('ContextBuilder changed-first on analyzed files', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-budget-'));
    const now = Date.now() / 1000;
    ['old.js', 'mid.js', 'new.js'].forEach((name, i) => {
      const filePath = path.join(root, name);
      fs.writeFileSync(filePath, 'export const value = 1;\n');
      fs.utimesSync(filePath, now - 3000 + i * 1000, now - 3000 + i * 1000);
    });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('puts the most recently modified file first', async () => {
    const { files } = await new Analyzer().analyze(new Scanner(root).scan());

    const sorted = new ContextBuilder({ priorityStrategy: 'changed-first' }).prioritizeFiles(files);

    expect(sorted.map((f) => f.relativePath)).toEqual(['new.js', 'mid.js', 'old.js']);
  });
});
