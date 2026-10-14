import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Scanner } from '../lib/core/Scanner.js';
import { FileWatcher } from '../lib/watch/FileWatcher.js';
import { IncrementalAnalyzer } from '../lib/watch/IncrementalAnalyzer.js';
import TokenCalculator from '../lib/analyzers/token-calculator.js';

// Real files on disk: Scanner and FileWatcher both go through GitIgnoreParser,
// whose include mode needs to stat the path it is given.
describe('ignore rules on a real project', () => {
  let root;

  const write = (relativePath, content = 'export const x = 1;\n') => {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-ignore-'));
    write('src/app.js');
    write('src/lib/util.js');
    write('docs/guide.md', '# Guide\n');
    write('build/out.js');
    fs.writeFileSync(path.join(root, '.gitignore'), 'build/\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const scannedPaths = () =>
    new Scanner(root)
      .scan()
      .map((file) => file.relativePath.split(path.sep).join('/'))
      .sort();

  it('Scanner applies .gitignore', () => {
    expect(scannedPaths()).toEqual(['docs/guide.md', 'src/app.js', 'src/lib/util.js']);
  });

  it('Scanner honours .contextinclude, with ** reaching nested directories', () => {
    fs.writeFileSync(path.join(root, '.contextinclude'), 'src/**\n');

    expect(scannedPaths()).toEqual(['src/app.js', 'src/lib/util.js']);
  });

  it('TokenCalculator counts .gitignore and .contextignore exclusions separately', () => {
    fs.writeFileSync(path.join(root, '.contextignore'), 'docs/\n');
    const calculator = new TokenCalculator(root);

    calculator.analyze();

    expect(calculator.stats.ignoredFiles).toBe(1); // build/out.js
    expect(calculator.stats.calculatorIgnoredFiles).toBe(1); // docs/guide.md
  });

  it('FileWatcher.shouldIgnore applies the same rules, including for deleted files', () => {
    fs.writeFileSync(path.join(root, '.contextinclude'), 'src/**\n');
    const watcher = new FileWatcher(root);

    expect(watcher.shouldIgnore(path.join('src', 'app.js'))).toBe(false);
    expect(watcher.shouldIgnore(path.join('docs', 'guide.md'))).toBe(true);
    expect(watcher.shouldIgnore(path.join('build', 'out.js'))).toBe(true);
    expect(watcher.shouldIgnore(path.join('src', 'gone.js'))).toBe(false);
  });

  it('FileWatcher.shouldIgnore skips node_modules and build output without a .gitignore', () => {
    fs.rmSync(path.join(root, '.gitignore'));
    const watcher = new FileWatcher(root);

    expect(watcher.shouldIgnore(path.join('node_modules', 'pkg', 'index.js'))).toBe(true);
    expect(watcher.shouldIgnore(path.join('dist', 'bundle.js'))).toBe(true);
    expect(watcher.shouldIgnore(path.join('src', 'app.js'))).toBe(false);
  });

  it('watch mode analyzes a changed file end to end', async () => {
    const watcher = new FileWatcher(root, { debounce: 50 });
    const analyzer = new IncrementalAnalyzer();
    const completed = new Promise((resolve, reject) => {
      analyzer.on('analysis:complete', resolve);
      analyzer.on('analysis:error', (event) => reject(event.error));
      setTimeout(() => reject(new Error('no analysis within 5 s')), 5000);
    });
    watcher.on('file:changed', (event) => analyzer.analyzeChange(event));

    watcher.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      write('src/app.js', 'export const x = 2;\nexport const y = 3;\n');

      const event = await completed;
      expect(event.file.split(path.sep).join('/')).toBe('src/app.js');
      expect(event.analysis.tokens).toBeGreaterThan(0);
    } finally {
      watcher.stop();
    }
  });
});
