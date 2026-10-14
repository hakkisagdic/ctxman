import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IncrementalAnalyzer } from '../lib/watch/IncrementalAnalyzer.js';

describe('IncrementalAnalyzer', () => {
  let tempDir;
  let filePath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-incremental-'));
    filePath = path.join(tempDir, 'sample.js');
    fs.writeFileSync(filePath, 'export function add(a, b) {\n  return a + b;\n}\n');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('analyzes a changed file and emits analysis:complete', async () => {
    const analyzer = new IncrementalAnalyzer();
    const events = { complete: [], error: [] };
    analyzer.on('analysis:complete', (event) => events.complete.push(event));
    analyzer.on('analysis:error', (event) => events.error.push(event));

    const stat = fs.statSync(filePath);
    await analyzer.analyzeChange({
      path: filePath,
      relativePath: 'sample.js',
      exists: true,
      size: stat.size,
      modified: stat.mtime,
    });

    expect(events.error).toEqual([]);
    expect(events.complete).toHaveLength(1);
    expect(events.complete[0].analysis).toMatchObject({
      name: 'sample.js',
      extension: '.js',
    });
    expect(events.complete[0].analysis.tokens).toBeGreaterThan(0);
  });
});
