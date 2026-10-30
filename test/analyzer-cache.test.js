import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Scanner } from '../lib/core/Scanner.js';
import { Analyzer } from '../lib/core/Analyzer.js';
import { CacheManager } from '../lib/cache/CacheManager.js';
import TokenCalculator from '../lib/analyzers/token-calculator.js';

describe('CacheManager integration with Analyzer and TokenCalculator', () => {
  let tmpDir;
  let sampleFile;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-cache-')));
    sampleFile = path.join(tmpDir, 'service.js');
    fs.writeFileSync(
      sampleFile,
      'export function computeTotal(items) {\n  return items.reduce((a, b) => a + b, 0);\n}\n',
      'utf-8'
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('caches Analyzer results in memory and skips disk reads on cache hit', async () => {
    const cache = new CacheManager({ strategy: 'memory' });
    const scanner = new Scanner(tmpDir);
    const analyzer = new Analyzer({ methodLevel: true, cache });

    const files1 = scanner.scan();
    const first = await analyzer.analyze(files1);
    expect(first.stats.cacheMisses).toBe(1);
    expect(first.stats.cacheHits).toBe(0);

    const readSpy = vi.spyOn(fs, 'readFileSync');
    const files2 = new Scanner(tmpDir).scan();
    const second = await analyzer.analyze(files2);

    expect(second.stats.cacheHits).toBe(1);
    expect(second.stats.cacheMisses).toBe(0);
    expect(readSpy).not.toHaveBeenCalled();
    expect(second.files[0].tokens).toBe(first.files[0].tokens);
    expect(second.files[0].methods).toEqual(first.files[0].methods);
  });

  it('invalidates cache when file mtime or byte size changes (including revert to older mtime)', async () => {
    const cacheDir = path.join(tmpDir, '.context-cache');
    const cache = new CacheManager({ strategy: 'disk', path: cacheDir });
    const analyzer = new Analyzer({ cache });

    const first = await analyzer.analyze(new Scanner(tmpDir).scan());
    expect(first.stats.cacheMisses).toBe(1);

    // Ensure .context-cache itself is never scanned as project content
    const scannedPaths = new Scanner(tmpDir).scan().map((f) => f.relativePath);
    expect(scannedPaths).toEqual(['service.js']);

    // Modify content and set an OLDER mtime (e.g. git checkout to an older commit)
    fs.writeFileSync(
      sampleFile,
      'export function computeTotal(items) {\n  return items.length * 42 + 100;\n}\n',
      'utf-8'
    );
    const olderDate = new Date(Date.now() - 60_000);
    fs.utimesSync(sampleFile, olderDate, olderDate);

    const afterChange = await analyzer.analyze(new Scanner(tmpDir).scan());
    expect(afterChange.stats.cacheMisses).toBe(1);
    expect(afterChange.stats.cacheHits).toBe(0);

    // Next run without changes hits disk cache
    const third = await analyzer.analyze(new Scanner(tmpDir).scan());
    expect(third.stats.cacheHits).toBe(1);
    expect(third.files[0].tokens).toBe(afterChange.files[0].tokens);
  });

  it('separates cache entries by methodLevel and tokenizer encoding', async () => {
    const cache = new CacheManager({ strategy: 'memory' });
    const files = new Scanner(tmpDir).scan();

    const basic = await new Analyzer({ methodLevel: false, cache }).analyze(files);
    expect(basic.files[0].methods).toBeUndefined();

    const withMethods = await new Analyzer({ methodLevel: true, cache }).analyze(files);
    expect(withMethods.stats.cacheMisses).toBe(1);
    expect(withMethods.files[0].methods).toHaveLength(1);

    const o200k = await new Analyzer({
      methodLevel: true,
      targetModel: 'gpt-4o',
      cache,
    }).analyze(files);
    expect(o200k.stats.cacheMisses).toBe(1);
  });

  it('supports caching in TokenCalculator including methodStats replay', () => {
    const cache = new CacheManager({ strategy: 'memory' });

    const calc1 = new TokenCalculator(tmpDir, { simple: true, methodLevel: true, cache });
    const res1 = calc1.analyze();
    expect(calc1.stats.cacheMisses).toBe(1);
    expect(calc1.stats.cacheHits).toBe(0);

    const calc2 = new TokenCalculator(tmpDir, { simple: true, methodLevel: true, cache });
    const res2 = calc2.analyze();
    expect(calc2.stats.cacheHits).toBe(1);
    expect(calc2.stats.cacheMisses).toBe(0);
    expect(res2[0].tokens).toBe(res1[0].tokens);
    expect(calc2.methodStats).toEqual(calc1.methodStats);
  });
});
