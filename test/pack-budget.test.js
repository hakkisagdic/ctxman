import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { packContext, PackError } from '../lib/pack/index.js';
import { rankEntries } from '../lib/pack/budget.js';
import TokenUtils from '../lib/utils/token-utils.js';

// A leaf with `count` small functions, so sizes are easy to tune
const filler = (name, count) =>
  Array.from(
    { length: count },
    (_, i) => `export function ${name}${i}(value) {\n  return value * ${i} + ${i};\n}\n`
  ).join('');

describe('pack --budget', () => {
  let root;
  const write = (relativePath, content) => {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pack-budget-'));
    // core/store.js is imported by every other module: it ranks first
    write('core/store.js', filler('store', 4));
    for (const name of ['alpha', 'beta', 'gamma', 'delta']) {
      write(
        `features/${name}.js`,
        `import { store0 } from '../core/store.js';\n${filler(name, 12)}`
      );
    }
    write('README.md', `# Project\n\n${'Some documentation text. '.repeat(40)}\n`);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('never exceeds the budget, measured on the rendered document', async () => {
    for (const style of ['xml', 'markdown', 'plain', 'json']) {
      for (const budget of [250, 600, 1200, 2500]) {
        const result = await packContext(root, { style, budget, instructions: 'Review.' });
        const counted = TokenUtils.calculate(result.text, 'pack.txt');

        expect(counted).toBe(result.totalTokens);
        expect(result.totalTokens).toBeLessThanOrEqual(budget);
        expect(result.budget).toEqual({ limit: budget, used: result.totalTokens });
        expect(result.files.length + result.omitted.length).toBe(6);
      }
    }
  });

  it('packs the highest-ranked file first (repository-map ranking)', async () => {
    const storeTokens = (await packContext(root, { files: ['core/store.js'] })).totalTokens;
    const result = await packContext(root, { budget: storeTokens + 150 });

    expect(result.files.map((file) => file.path)).toEqual(['core/store.js']);
    expect(result.omitted.map((file) => file.path)).toHaveLength(5);
  });

  it('ranks files outside the import graph after the code, in path order', () => {
    const entries = ['README.md', 'features/beta.js', 'core/store.js', 'docs/a.md'].map((p) => ({
      path: p,
    }));
    const { ranked, scores } = rankEntries(root, entries);

    expect(ranked.map((entry) => entry.path)).toEqual([
      'core/store.js',
      'features/beta.js',
      'README.md',
      'docs/a.md',
    ]);
    expect(scores.get('core/store.js')).toBe(1);
    expect(scores.has('README.md')).toBe(false);
  });

  it('lists the omitted files with their token counts at the end of the document', async () => {
    const result = await packContext(root, { budget: 900, instructions: 'Last.' });

    expect(result.omitted.length).toBeGreaterThan(0);
    const section = result.text.slice(result.text.indexOf('<omitted_files'));
    expect(section).toMatch(/^<omitted_files count="\d+" tokens="\d+">\n/);
    for (const file of result.omitted) {
      expect(section).toContain(`${file.path} (${file.tokens.toLocaleString('en-US')} tokens)`);
    }
    expect(result.text.endsWith('<instructions>\nLast.\n</instructions>\n')).toBe(true);
  });

  it('counts the files beyond the first 20 omitted ones instead of naming them', async () => {
    for (let i = 0; i < 25; i++)
      write(`data/item${String(i).padStart(2, '0')}.md`, `# Item ${i}\n`);
    const result = await packContext(root, { budget: 450, style: 'markdown' });

    expect(result.omitted.length).toBeGreaterThan(20);
    const more = result.omitted.length - 20;
    expect(result.text).toMatch(new RegExp(`- … and ${more} more files \\(\\d+ tokens\\)`));
  });

  it('fits more files with --compress', async () => {
    const plain = await packContext(root, { budget: 1200 });
    const compressed = await packContext(root, { budget: 1200, compress: true });

    expect(compressed.files.length).toBeGreaterThan(plain.files.length);
    expect(compressed.totalTokens).toBeLessThanOrEqual(1200);
    expect(compressed.compression.savedTokens).toBeGreaterThan(0);
  });

  it('packs everything when the budget is large enough', async () => {
    const result = await packContext(root, { budget: 1000000 });

    expect(result.omitted).toEqual([]);
    expect(result.text).not.toContain('<omitted_files');
  });

  it('rejects a budget smaller than the document without files', async () => {
    const error = await packContext(root, { budget: 10 }).catch((e) => e);

    expect(error).toBeInstanceOf(PackError);
    expect(error.code).toBe('BUDGET_TOO_SMALL');
  });
});

describe('pack --target-model', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pack-model-'));
    fs.writeFileSync(path.join(root, 'a.js'), filler('fn', 30));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.skipIf(!TokenUtils.isExact())(
    'counts with the model encoding and reports the fit',
    async () => {
      const result = await packContext(root, { targetModel: 'gpt-4o' });

      expect(result.encoding).toBe('o200k_base');
      expect(result.totalTokens).toBe(TokenUtils.calculate(result.text, 'x', 'o200k_base'));
      expect(result.model).toEqual({
        id: 'gpt-4o',
        name: 'GPT-4o',
        vendor: 'OpenAI',
        encoding: 'o200k_base',
        exact: true,
        contextWindow: 128000,
        maxRecommendedInput: expect.any(Number),
        fits: true,
        percentOfWindow: (result.totalTokens / 128000) * 100,
      });
    }
  );

  it('uses cl100k_base, marked approximate, for models with their own tokenizer', async () => {
    const result = await packContext(root, { targetModel: 'claude-sonnet-4-5' });

    expect(result.model.id).toBe('claude-sonnet-4-5');
    expect(result.model.exact).toBe(false);
    expect(result.model.contextWindow).toBe(200000);
    expect(result.encoding).toBe(TokenUtils.isExact() ? 'cl100k_base' : 'estimate');
  });

  it('resolves aliases and applies the encoding to the budget', async () => {
    const result = await packContext(root, { targetModel: 'claude-sonnet-4.5', budget: 100000 });

    expect(result.model.id).toBe('claude-sonnet-4-5');
    expect(result.budget.used).toBe(result.totalTokens);
  });

  it('reports a document that does not fit the window', async () => {
    // Over 128,000 tokens counted or estimated, under the 1 MiB file size limit
    const big = Array.from({ length: 30000 }, (_, i) => `x${i} = ${i} + ${i}`).join('\n');
    fs.writeFileSync(path.join(root, 'big.txt'), big);
    const result = await packContext(root, { targetModel: 'deepseek-chat' });

    expect(result.model.contextWindow).toBe(128000);
    expect(result.totalTokens).toBeGreaterThan(128000);
    expect(result.model.fits).toBe(false);
    expect(result.model.percentOfWindow).toBeGreaterThan(100);
  });

  it('rejects unknown models', async () => {
    const error = await packContext(root, { targetModel: 'gpt-0-imaginary' }).catch((e) => e);

    expect(error.code).toBe('UNKNOWN_MODEL');
    expect(error.message).toContain('--list-llms');
  });
});
