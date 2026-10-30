import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as api from '../index.js';

describe('Public API surface (index.js & index.d.ts)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-api-')));
    fs.writeFileSync(
      path.join(tmpDir, 'math.js'),
      'export function add(a, b) {\n  return a + b;\n}\n',
      'utf-8'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exports all v2 and v3 core classes and functions', () => {
    const expectedClassesAndFunctions = [
      'TokenCalculator',
      'TokenAnalyzer',
      'MethodAnalyzer',
      'Scanner',
      'Analyzer',
      'ContextBuilder',
      'Reporter',
      'CacheManager',
      'resolveCacheManager',
      'GitIgnoreParser',
      'MethodFilterParser',
      'GitIngestFormatter',
      'ToonFormatter',
      'FormatRegistry',
      'TokenUtils',
      'FileUtils',
      'ClipboardUtils',
      'ConfigUtils',
      'FormatConverter',
      'ErrorHandler',
      'Logger',
      'getLogger',
      'createLogger',
      'Updater',
      'GitUtils',
      'generateDigestFromReport',
      'generateDigestFromContext',
      'buildRepoGraph',
      'rankFiles',
      'renderRepoMap',
      'buildPrContext',
      'explainHistory',
      'packContext',
      'focusContext',
      'describeFocus',
      'FocusError',
      'searchProject',
      'getSymbol',
      'countForModel',
      'askCodebase',
      'loadPolicy',
      'Policy',
      'PolicyConfigError',
      'PolicyViolationError',
    ];

    for (const name of expectedClassesAndFunctions) {
      expect(api[name], `Missing export: ${name}`).toBeTypeOf('function');
    }
  });

  it('declares every exported symbol in index.d.ts', () => {
    const dts = fs.readFileSync(path.resolve('index.d.ts'), 'utf-8');
    for (const name of Object.keys(api)) {
      expect(dts, `index.d.ts is missing declaration for ${name}`).toMatch(
        new RegExp(
          `export\\s+(?:(?:class|function|const|type|interface)\\s+|\\{[^}]*\\b)${name}\\b`
        )
      );
    }
  });

  it('supports running the v3 Scanner -> Analyzer -> ContextBuilder -> Reporter pipeline', async () => {
    const scanner = new api.Scanner(tmpDir);
    const files = scanner.scan();
    expect(files).toHaveLength(1);

    const cache = new api.CacheManager({ strategy: 'memory' });
    const analyzer = new api.Analyzer({ methodLevel: true, cache });
    const analysis = await analyzer.analyze(files);
    expect(analysis.stats.totalFiles).toBe(1);
    expect(analysis.stats.totalMethods).toBe(1);

    const builder = new api.ContextBuilder({ methodLevel: true });
    const context = builder.build(analysis);
    expect(context.metadata.totalFiles).toBe(1);

    const outPath = path.join(tmpDir, 'out.json');
    const reporter = new api.Reporter({ verbose: false, outputPath: outPath });
    await reporter.report(context, analysis.stats);
    expect(fs.existsSync(outPath)).toBe(true);

    const search = api.searchProject(tmpDir, 'add');
    expect(search.results[0].name).toBe('add');

    const symbol = api.getSymbol(tmpDir, 'add');
    expect(symbol.symbols[0].name).toBe('add');
  });
});
