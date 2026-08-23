import { describe, test, expect } from 'vitest';
import Scanner from '../lib/core/Scanner.js';
import Analyzer from '../lib/core/Analyzer.js';
import ContextBuilder from '../lib/core/ContextBuilder.js';
import Reporter from '../lib/core/Reporter.js';
import PluginManager from '../lib/plugins/PluginManager.js';

describe('v3.0.0 Features', () => {
  describe('Scanner Module', () => {
    test('Should instantiate', () => {
      const scanner = new Scanner(process.cwd());
      expect(scanner).toBeDefined();
      expect(typeof scanner.scan).toBe('function');
    });

    test('Should scan current directory', () => {
      const scanner = new Scanner(process.cwd());
      const files = scanner.scan();
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0].relativePath).toBeDefined();
    });

    test('Should provide statistics', () => {
      const scanner = new Scanner(process.cwd());
      scanner.scan();
      const stats = scanner.getStats();
      expect(stats.filesScanned).toBeGreaterThan(0);
      expect(stats.directoriesTraversed).toBeGreaterThan(0);
    });
  });

  describe('Analyzer Module', () => {
    test('Should instantiate', () => {
      const analyzer = new Analyzer();
      expect(analyzer).toBeDefined();
      expect(typeof analyzer.analyze).toBe('function');
    });

    test('Should analyze files', async () => {
      const scanner = new Scanner(process.cwd());
      const files = scanner.scan().slice(0, 5);

      const analyzer = new Analyzer();
      const result = await analyzer.analyze(files);

      expect(result.files).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.stats.totalFiles).toBeGreaterThan(0);
      expect(result.stats.totalTokens).toBeGreaterThan(0);
    });

    test('Should detect languages', async () => {
      const scanner = new Scanner(process.cwd());
      const files = scanner.scan().slice(0, 10);

      const analyzer = new Analyzer();
      const result = await analyzer.analyze(files);

      const distribution = analyzer.getLanguageDistribution();
      expect(Array.isArray(distribution)).toBe(true);
      expect(distribution.length).toBeGreaterThan(0);
      expect(distribution[0].language).toBeDefined();
    });
  });

  describe('ContextBuilder Module', () => {
    test('Should instantiate', () => {
      const builder = new ContextBuilder();
      expect(builder).toBeDefined();
      expect(typeof builder.build).toBe('function');
    });

    test('Should build context', async () => {
      const scanner = new Scanner(process.cwd());
      const files = scanner.scan().slice(0, 5);

      const analyzer = new Analyzer();
      const result = await analyzer.analyze(files);

      const builder = new ContextBuilder();
      const context = builder.build(result);

      expect(context.metadata).toBeDefined();
      expect(context.files).toBeDefined();
      expect(context.statistics).toBeDefined();
      expect(context.metadata.totalFiles).toBeGreaterThan(0);
    });

    test('Should optimize for target LLM', async () => {
      const scanner = new Scanner(process.cwd());
      const files = scanner.scan().slice(0, 5);

      const analyzer = new Analyzer();
      const result = await analyzer.analyze(files);

      const builder = new ContextBuilder({ targetModel: 'claude-sonnet-4.5' });
      const context = builder.build(result);

      expect(context.metadata.targetLLM).toBeDefined();
      expect(context.metadata.targetLLM.name).toBe('Claude Sonnet 4.5');
      expect(context.metadata.recommendedFormat).toBeDefined();
    });
  });

  describe('Reporter Module', () => {
    test('Should instantiate', () => {
      const reporter = new Reporter();
      expect(reporter).toBeDefined();
      expect(typeof reporter.report).toBe('function');
    });
  });

  describe('PluginManager Module', () => {
    test('Should instantiate', () => {
      const manager = new PluginManager({ autoLoad: false });
      expect(manager).toBeDefined();
      expect(typeof manager.load).toBe('function');
    });

    test('Should discover plugins', async () => {
      const manager = new PluginManager({ autoLoad: false });
      await manager.initialize();
      const plugins = manager.list();
      expect(Array.isArray(plugins)).toBe(true);
    });
  });
});
