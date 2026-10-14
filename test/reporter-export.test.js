import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Reporter } from '../lib/core/Reporter.js';
import { ContextBuilder } from '../lib/core/ContextBuilder.js';

describe('Reporter.exportToFile on a real context', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-reporter-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const context = () =>
    new ContextBuilder().build({
      files: [{ relativePath: 'src/a.js', name: 'a.js', tokens: 12, size: 40 }],
      stats: { totalFiles: 1, totalTokens: 12, totalSize: 40 },
    });

  it('writes the text summary for .txt', async () => {
    const outputPath = path.join(dir, 'report.txt');

    await new Reporter().exportToFile(context(), outputPath);

    const text = fs.readFileSync(outputPath, 'utf-8');
    expect(text).toContain('Ctxman Analysis Summary');
    expect(text).toContain('Files: 1');
  });
});
