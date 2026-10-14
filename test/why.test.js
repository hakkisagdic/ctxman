import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { explainHistory } from '../lib/why/index.js';
import * as API from '../index.js';
import TokenUtils from '../lib/utils/token-utils.js';
import MCPServer from '../lib/api/mcp/server.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const AWS_KEY = 'AKIAABCDEFGHIJKLMNOP';

/**
 * A small shop with a history worth explaining:
 *   A  2024-01-01 Alice  feat: add cart and pricing
 *   B  2024-01-02 Alice  fix(cart): round totals to cents (#12)   Fixes #12, ABC-34, trailers
 *   C  2024-01-03 Bob    docs: record the rounding decision         ADR, test, changelog
 *   D  2024-01-04 Dave   feat(shipping): add shipping costs (#45)  touches cart + pricing
 *   E  2024-01-05 Alice  refactor: rename pricing to price         git mv
 *   F  2024-01-06 Erin   chore: regenerate fixtures                 60 files + price.js
 */
function createShop(dir) {
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
      encoding: 'utf-8',
    });
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  };
  let day = 0;
  const commit = (author, message) => {
    day++;
    const date = `2024-01-0${day}T10:00:00Z`;
    git('add', '-A');
    execFileSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-q',
        '--author',
        author,
        '-m',
        message,
      ],
      { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } }
    );
  };

  git('init', '-q');
  git('remote', 'add', 'origin', 'git@github.com:acme/shop.git');

  write(
    'src/cart.js',
    [
      "import { applyDiscount } from './pricing.js';",
      '',
      'export function subtotal(items) {',
      '  return items.reduce((sum, item) => sum + item.price * item.qty, 0);',
      '}',
      '',
      'export function total(items, code) {',
      '  const value = applyDiscount(subtotal(items), code);',
      '  return value;',
      '}',
      '',
    ].join('\n')
  );
  write('src/pricing.js', 'export function applyDiscount(value, code) {\n  return value;\n}\n');
  write('README.md', '# Shop\n');
  commit('Alice <alice@example.com>', 'feat: add cart and pricing');

  write(
    'src/cart.js',
    fs
      .readFileSync(path.join(dir, 'src/cart.js'), 'utf-8')
      .replace(
        'export function total(items, code) {\n',
        '/**\n * Total in cents, rounded once at the end\n */\nexport function total(items, code) {\n  // TODO: support multiple currencies\n'
      )
      .replace('  return value;', '  return Math.round(value);')
  );
  write(
    'src/pricing.js',
    'export function applyDiscount(value, code) {\n  return code ? value * 0.9 : value;\n}\n'
  );
  commit(
    'Alice <alice@example.com>',
    [
      'fix(cart): round totals to cents (#12)',
      '',
      'Floating point totals showed 0.30000000000000004 to customers.',
      'Fixes #12, see ABC-34 and https://example.com/rounding-notes.',
      '',
      'Co-authored-by: Bob <bob@example.com>',
      'Reviewed-by: Carol <carol@example.com>',
    ].join('\n')
  );

  write(
    'docs/adr/0003-rounding.md',
    '# ADR 3: Round once\n\n## Decision\n\nWe round in `total()` only, never in helpers.\n'
  );
  write(
    'test/cart.test.js',
    "import { total } from '../src/cart.js';\n\ntest('total rounds', () => {\n  expect(total([{ price: 0.1, qty: 3 }])).toBe(0);\n});\n"
  );
  write('CHANGELOG.md', '# Changelog\n\n## 1.1.0\n\n- `total` now rounds to cents (#12)\n');
  write('docs/excluded.md', 'This mentions total() but .contextignore hides it.\n');
  write('.contextignore', 'docs/excluded.md\nsecret-config.js\n');
  write('src/notes.js', '// total() must run after applyDiscount\nexport const x = 1;\n');
  commit('Bob <bob@example.com>', 'docs: record the rounding decision');

  write(
    'src/shipping.py',
    [
      'class Shipping:',
      '    """Shipping costs."""',
      '',
      '    def __init__(self, rate):',
      '        self.rate = rate',
      '',
      '    @staticmethod',
      '    def flat_fee(weight):',
      '        # NOTE: weights are in grams',
      '        return 5 if weight < 1000 else 9',
      '',
      '    def cost(self, weight):',
      '        return self.rate * weight + Shipping.flat_fee(weight)',
      '',
    ].join('\n')
  );
  write(
    'src/cart.js',
    fs
      .readFileSync(path.join(dir, 'src/cart.js'), 'utf-8')
      .replace('  return Math.round(value);', '  return Math.round(value); // cents')
  );
  write(
    'src/pricing.js',
    'export function applyDiscount(value, code) {\n  // codes come from the CMS\n  return code ? value * 0.9 : value;\n}\n'
  );
  write('assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
  write('secret-config.js', 'export const region = "eu";\n');
  commit(
    'Dave <dave@example.com>',
    `feat(shipping): add shipping costs (#45)\n\nThe old key ${AWS_KEY} was rotated.\nRefs GH-7.`
  );

  git('mv', 'src/pricing.js', 'src/price.js');
  write(
    'src/cart.js',
    fs
      .readFileSync(path.join(dir, 'src/cart.js'), 'utf-8')
      .replace("'./pricing.js'", "'./price.js'")
  );
  commit('Alice <alice@example.com>', 'refactor: rename pricing to price');

  for (let i = 0; i < 60; i++) write(`fixtures/f${i}.txt`, `${i}\n`);
  write('src/price.js', fs.readFileSync(path.join(dir, 'src/price.js'), 'utf-8') + '// end\n');
  commit('Erin <erin@example.com>', 'chore: regenerate fixtures');
}

describe('ctxman why', () => {
  let repo;
  let outside;

  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf-8' });
  const why = (target, options) => explainHistory(repo, target, options);
  const rejects = async (promise, code) => {
    const error = await promise.then(
      () => null,
      (caught) => caught
    );
    expect(error, `expected ${code}`).not.toBeNull();
    expect(error.code).toBe(code);
    return error;
  };

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-why-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-why-outside-'));
    createShop(repo);
  });

  afterAll(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  describe('a JavaScript function', () => {
    let result;
    beforeAll(async () => {
      result = await why('src/cart.js:total');
    });

    it('resolves the symbol to its line range, doc comment included', () => {
      const { target } = result.data;
      expect(target).toMatchObject({
        path: 'src/cart.js',
        symbol: 'total',
        kind: 'function',
        line: 10,
        startLine: 7,
        endLine: 14,
        wholeFile: false,
      });
      expect(target.source).toContain('return Math.round(value); // cents');
      expect(target.source.split('\n')[0]).toBe('/**');
      expect(result.text).toContain('```javascript\n/**');
    });

    it('lists the commits that changed the lines, newest first, with full bodies', () => {
      const { history } = result.data;
      expect(history.mode).toBe('range');
      expect(history.commits.map((commit) => commit.subject)).toEqual([
        'feat(shipping): add shipping costs (#45)',
        'fix(cart): round totals to cents (#12)',
        'feat: add cart and pricing',
      ]);
      const fix = history.commits[1];
      expect(fix).toMatchObject({ author: 'Alice', date: '2024-01-02T10:00:00Z' });
      expect(fix.date.startsWith('2024-01-02')).toBe(true);
      expect(fix.body).toContain('Floating point totals showed 0.30000000000000004');
      expect(fix.body).toContain('Co-authored-by: Bob <bob@example.com>');
      expect(fix.shortSha).toMatch(/^[0-9a-f]{7,}$/);
      expect(fix.refs).toEqual(['#12', 'ABC-34']);
      expect(fix.patch).toBeUndefined();
    });

    it('mines references with GitHub links and trailers', () => {
      const { references } = result.data;
      const issue12 = references.issues.find((entry) => entry.id === '#12');
      expect(issue12).toMatchObject({ closes: true, url: 'https://github.com/acme/shop/pull/12' });
      expect(references.issues.find((entry) => entry.id === '#45').url).toBe(
        'https://github.com/acme/shop/pull/45'
      );
      expect(references.issues.find((entry) => entry.id === '#7').url).toBe(
        'https://github.com/acme/shop/issues/7'
      );
      expect(references.tickets.map((entry) => entry.id)).toEqual(['ABC-34']);
      expect(references.urls.map((entry) => entry.url)).toEqual([
        'https://example.com/rounding-notes',
      ]);
      expect(references.coAuthors.map((entry) => entry.value)).toEqual(['Bob <bob@example.com>']);
      expect(references.reviewers.map((entry) => entry.value)).toEqual([
        'Carol <carol@example.com>',
      ]);
      expect(result.text).toContain('Ticket ABC-34');
      expect(result.text).toContain('Co-authored-by: Bob <bob@example.com>');
    });

    it('summarizes blame ownership of the range', () => {
      const { ownership } = result.data;
      expect(ownership).toMatchObject({ startLine: 7, endLine: 14, totalLines: 8 });
      expect(ownership.authors.map((a) => [a.name, a.lines])).toEqual([
        ['Alice', 7],
        ['Dave', 1],
      ]);
      expect(ownership.authors[1].lastTouched.startsWith('2024-01-04')).toBe(true);
      expect(result.text).toContain('| Alice | 7 | 88% |');
    });

    it('reports files that change together with the target file', () => {
      const { coupling } = result.data;
      expect(coupling.targetChanges).toBe(4);
      const byPath = Object.fromEntries(coupling.files.map((file) => [file.path, file]));
      expect(byPath['src/pricing.js']).toMatchObject({ count: 3, confidence: 0.75, exists: false });
      expect(byPath['src/price.js']).toMatchObject({ count: 1, confidence: 0.25, exists: true });
      expect(byPath['src/shipping.py'].count).toBe(1);
      // .contextignore applies to coupling too
      expect(byPath['secret-config.js']).toBeUndefined();
      expect(coupling.files[0].path).toBe('src/pricing.js');
    });

    it('finds the ADR, the changelog entry and code comments that mention it', () => {
      const related = result.data.related;
      expect(related[0]).toMatchObject({
        path: 'docs/adr/0003-rounding.md',
        line: 5,
        kind: 'adr',
        heading: 'Decision',
        mentions: 'symbol',
      });
      expect(related.find((entry) => entry.kind === 'changelog')).toMatchObject({
        path: 'CHANGELOG.md',
        heading: '1.1.0',
      });
      expect(related.find((entry) => entry.kind === 'comment')).toMatchObject({
        path: 'src/notes.js',
        line: 1,
      });
      // Excluded by .contextignore, and test files are listed separately
      expect(related.map((entry) => entry.path)).not.toContain('docs/excluded.md');
      expect(related.map((entry) => entry.path)).not.toContain('test/cart.test.js');
    });

    it('lists TODO notes inside the range and the tests that reference it', () => {
      expect(result.data.notes).toEqual([
        { line: 11, tag: 'TODO', text: 'support multiple currencies' },
      ]);
      expect(result.data.tests).toHaveLength(1);
      expect(result.data.tests[0]).toMatchObject({
        path: 'test/cart.test.js',
        references: 'symbol',
      });
      expect(result.data.tests[0].matches.map((match) => match.line)).toEqual([1, 3, 4]);
    });

    it('masks secrets found in commit messages', () => {
      expect(result.text).not.toContain(AWS_KEY);
      expect(result.text).toContain('[REDACTED:aws-access-key-id]');
      expect(result.warnings.join('\n')).toContain('1 aws-access-key-id');
    });

    it('writes Markdown sections in order', () => {
      const headings = result.text.match(/^## .+$/gm);
      expect(headings).toEqual([
        '## Target',
        '## History',
        '## References',
        '## Ownership',
        '## Co-change coupling',
        '## Related text',
        '## Notes in the target',
        '## Tests',
      ]);
      expect(result.tokens).toBe(TokenUtils.calculate(result.text, 'why.md'));
    });
  });

  it('keeps secrets with redact: false', async () => {
    const result = await why('src/cart.js:total', { redact: false });
    expect(result.text).toContain(AWS_KEY);
  });

  describe('Python symbols', () => {
    it('resolves a decorated static method and a Class.method', async () => {
      const fee = await why('src/shipping.py:flat_fee');
      expect(fee.data.target).toMatchObject({ startLine: 7, endLine: 10, line: 8 });
      expect(fee.data.target.source.split('\n')[0]).toBe('    @staticmethod');
      expect(fee.data.notes).toEqual([{ line: 9, tag: 'NOTE', text: 'weights are in grams' }]);
      expect(fee.data.history.commits.map((c) => c.subject)).toEqual([
        'feat(shipping): add shipping costs (#45)',
      ]);

      const cost = await why('src/shipping.py:Shipping.cost');
      expect(cost.data.target).toMatchObject({ startLine: 12, endLine: 13 });
      expect(cost.data.target.source).toContain('def cost(self, weight):');
    });

    it('resolves a class to its whole body', async () => {
      const result = await why('src/shipping.py:Shipping');
      expect(result.data.target).toMatchObject({ kind: 'class', startLine: 1, endLine: 13 });
    });
  });

  describe('line ranges and whole files', () => {
    it('accepts #L syntax and the compiler-style suffix', async () => {
      const hash = await why('src/cart.js#L3-L5');
      expect(hash.data.target).toMatchObject({
        startLine: 3,
        endLine: 5,
        symbolsInRange: ['subtotal'],
      });
      expect(hash.data.history).toMatchObject({ mode: 'range', startLine: 3, endLine: 5 });
      expect(hash.data.history.commits.map((c) => c.subject)).toEqual([
        'feat: add cart and pricing',
      ]);
      expect(hash.text).toContain('# Why: `src/cart.js` lines 3-5');

      const colon = await why('src/cart.js:3-5');
      expect(colon.data.target.source).toBe(hash.data.target.source);
    });

    it('clamps a range that runs past the end of the file', async () => {
      const result = await why('src/cart.js#L12-L99');
      expect(result.data.target).toMatchObject({ startLine: 12, endLine: 14 });
      expect(result.warnings.join('\n')).toContain('the range ends at line 14');
    });

    it('follows renames for a whole file and skips huge commits for coupling', async () => {
      const result = await why('src/price.js');
      expect(result.data.history.mode).toBe('file');
      expect(result.data.history.commits.map((c) => c.subject)).toEqual([
        'chore: regenerate fixtures',
        'refactor: rename pricing to price',
        'feat(shipping): add shipping costs (#45)',
        'fix(cart): round totals to cents (#12)',
        'feat: add cart and pricing',
      ]);
      expect(result.data.coupling).toMatchObject({ targetChanges: 4, skippedLargeCommits: 1 });
      expect(result.data.coupling.files[0]).toMatchObject({ path: 'src/cart.js', count: 4 });
      // The file's own former name is not a co-change
      expect(result.data.coupling.files.map((file) => file.path)).not.toContain('src/pricing.js');
      expect(result.data.target.wholeFile).toBe(true);
      expect(result.data.target.source).toContain('applyDiscount');
    });

    it('limits history with limit and since', async () => {
      const limited = await why('src/price.js', { limit: 2 });
      expect(limited.data.history.commits).toHaveLength(2);
      expect(limited.data.history.limitReached).toBe(true);
      expect(limited.text).toContain('raise --limit');

      // Exactly as many commits as the limit: nothing older to point at
      const exact = await why('src/price.js', { limit: 5 });
      expect(exact.data.history.commits).toHaveLength(5);
      expect(exact.data.history.limitReached).toBe(false);
      expect(exact.text).not.toContain('raise --limit');

      const recent = await why('src/price.js', { since: '2024-01-04T00:00:00Z' });
      expect(recent.data.history.commits.map((c) => c.subject)).toEqual([
        'chore: regenerate fixtures',
        'refactor: rename pricing to price',
        'feat(shipping): add shipping costs (#45)',
      ]);
    });

    it('includes patches only on request', async () => {
      const result = await why('src/cart.js:total', { patches: true });
      expect(result.data.history.commits[0].patch).toContain(
        '+  return Math.round(value); // cents'
      );
      expect(result.text).toContain('```diff');
    });

    it('explains the code as of another revision', async () => {
      const result = await why('src/cart.js:total', { rev: 'HEAD~4' });
      expect(result.data.target.revision).toBe('HEAD~4');
      expect(result.data.target.source).toContain('return Math.round(value);');
      expect(result.data.target.source).not.toContain('// cents');
      expect(result.data.history.commits.map((c) => c.subject)).toEqual([
        'fix(cart): round totals to cents (#12)',
        'feat: add cart and pricing',
      ]);
    });
  });

  describe('uncommitted changes', () => {
    it('maps the range onto HEAD before reading history', async () => {
      const file = path.join(repo, 'src/cart.js');
      const original = fs.readFileSync(file, 'utf-8');
      try {
        fs.writeFileSync(file, `// local note\n// another\n${original}`);
        const result = await why('src/cart.js:total');
        expect(result.data.target).toMatchObject({ startLine: 9, endLine: 16 });
        expect(result.data.history).toMatchObject({ startLine: 7, endLine: 14 });
        expect(result.data.history.commits).toHaveLength(3);
        expect(result.warnings.join('\n')).toContain('uncommitted changes');

        const fresh = await why('src/cart.js#L1-L2');
        expect(fresh.data.history.mode).toBe('none');
        expect(fresh.data.ownership.authors[0].name).toBe('(uncommitted)');
      } finally {
        fs.writeFileSync(file, original);
      }
    });
  });

  describe('output styles, question and budget', () => {
    it('renders JSON and XML with the question last', async () => {
      const question = 'Why do we round in total() and not in applyDiscount?';
      const json = await why('src/cart.js:total', { style: 'json', ask: question });
      const parsed = JSON.parse(json.text);
      expect(Object.keys(parsed).at(-1)).toBe('question');
      expect(parsed.question).toBe(question);
      expect(parsed.history.commits).toHaveLength(3);

      const xml = await why('src/cart.js:total', { style: 'xml', ask: question });
      expect(xml.text.trimEnd()).toMatch(/<question>.*<\/question>\n<\/why_context>$/);
      expect(xml.text).toContain('<issue id="#12" kind="pr" closes="true"');
      expect(xml.text).toContain('&lt;bob@example.com&gt;');

      const markdown = await why('src/cart.js:total', { ask: question });
      const tail = markdown.text.slice(markdown.text.indexOf('## Question'));
      expect(tail).toContain(question);
      expect(markdown.text.indexOf('## Question')).toBeGreaterThan(
        markdown.text.indexOf('## Tests')
      );
    });

    it('never exceeds the budget and drops material in priority order', async () => {
      const full = await why('src/cart.js:total', { patches: true, ask: 'Why?' });
      const order = ['patches', 'related', 'tests', 'coupling', 'commits'];
      for (const budget of [full.tokens, full.tokens - 40, 700, 500, 350]) {
        const result = await why('src/cart.js:total', { patches: true, ask: 'Why?', budget });
        expect(result.tokens).toBeLessThanOrEqual(budget);
        expect(TokenUtils.calculate(result.text, 'why.md')).toBeLessThanOrEqual(budget);
        expect(
          result.text.trimEnd().endsWith('say so when the history does not explain something.')
        ).toBe(true);

        // A section loses items only once every earlier section is gone
        const counts = {
          patches: 3,
          related: full.data.related.length,
          tests: full.data.tests.length,
          coupling: full.data.coupling.files.length,
        };
        const dropped = order.filter((key) => result.omitted[key]);
        for (const key of dropped) {
          for (const earlier of order.slice(0, order.indexOf(key))) {
            if (earlier !== 'commits') expect(result.omitted[earlier]).toBe(counts[earlier]);
          }
        }
      }
      const tight = await why('src/cart.js:total', { patches: true, budget: full.tokens - 40 });
      expect(Object.keys(tight.omitted)).toEqual(['patches']);
      expect(tight.text).toContain('> Trimmed to fit');
    });

    it('fails clearly when the budget cannot hold the document core', async () => {
      const error = await rejects(why('src/cart.js:total', { budget: 20 }), 'BUDGET_TOO_SMALL');
      expect(error.minimum).toBeGreaterThan(20);
    });
  });

  describe('validation', () => {
    it('refuses paths outside the repository', async () => {
      fs.writeFileSync(path.join(outside, 'x.js'), 'export const x = 1;\n');
      await rejects(why('../x.js'), 'PATH_OUTSIDE_ROOT');
      await rejects(why(path.join(outside, 'x.js')), 'PATH_OUTSIDE_ROOT');
      await rejects(why('.git/config'), 'PATH_OUTSIDE_ROOT');

      const link = path.join(repo, 'link.js');
      fs.symlinkSync(path.join(outside, 'x.js'), link);
      try {
        await rejects(why('link.js'), 'PATH_OUTSIDE_ROOT');
      } finally {
        fs.rmSync(link);
      }
    });

    it('rejects missing, untracked and directory targets', async () => {
      const missing = await rejects(why('src/missing.js'), 'FILE_NOT_FOUND');
      expect(missing.message).toBe('File not found: src/missing.js');
      const renamed = await rejects(why('src/pricing.js'), 'FILE_NOT_FOUND');
      expect(renamed.message).toMatch(/\(deleted or renamed in [0-9a-f]+; use --rev [0-9a-f]+~1/);
      const sha = renamed.message.match(/--rev ([0-9a-f]+~1)/)[1];
      const before = await why('src/pricing.js', { rev: sha });
      expect(before.data.target.source).toContain('applyDiscount');
      await rejects(why('src'), 'NOT_A_FILE');
      fs.writeFileSync(path.join(repo, 'src/untracked.js'), 'export const y = 2;\n');
      try {
        const error = await rejects(why('src/untracked.js'), 'NOT_TRACKED');
        expect(error.message).toContain('not tracked by git');
      } finally {
        fs.rmSync(path.join(repo, 'src/untracked.js'));
      }
    });

    it('validates revisions with the shared git ref check', async () => {
      for (const ref of ['--output=/tmp/x', 'HEAD;rm -rf /', 'HEAD $(id)', '-p']) {
        await rejects(why('src/cart.js', { rev: ref }), 'INVALID_REF');
      }
      await rejects(why('src/cart.js', { rev: 'no-such-branch' }), 'UNKNOWN_REF');
      await rejects(why('src/shipping.py', { rev: 'HEAD~3' }), 'FILE_NOT_FOUND');
    });

    it('validates options and ranges', async () => {
      await rejects(why('src/cart.js', { limit: 0 }), 'INVALID_OPTION');
      await rejects(why('src/cart.js', { limit: 'many' }), 'INVALID_OPTION');
      await rejects(why('src/cart.js', { style: 'html' }), 'INVALID_OPTION');
      await rejects(why('src/cart.js', { since: '--all' }), 'INVALID_OPTION');
      await rejects(why('src/cart.js#L40-L50'), 'INVALID_RANGE');
      await rejects(why('src/cart.js#L5-L2'), 'INVALID_RANGE');
      await rejects(why({ file: 'src/cart.js', symbol: 'a b' }), 'INVALID_SYMBOL');
    });

    it('lists close matches for an unknown symbol', async () => {
      const error = await rejects(why('src/cart.js:totl'), 'SYMBOL_NOT_FOUND');
      expect(error.candidates).toContain('total');
      expect(error.message).toContain('Did you mean: total');
    });

    it('fails clearly outside a git repository', async () => {
      const previous = process.env.GIT_CEILING_DIRECTORIES;
      process.env.GIT_CEILING_DIRECTORIES = path.dirname(outside);
      try {
        const error = await rejects(explainHistory(outside, 'x.js'), 'NOT_A_GIT_REPO');
        expect(error.message).toContain('Not a git repository');
      } finally {
        if (previous === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
        else process.env.GIT_CEILING_DIRECTORIES = previous;
      }
    });
  });

  describe('special files', () => {
    it('gives whole-file history for a binary file and refuses ranges in it', async () => {
      const result = await why('assets/logo.png');
      expect(result.data.target).toMatchObject({ binary: true, source: null });
      expect(result.data.history.commits).toHaveLength(1);
      expect(result.text).toContain('- Content: binary file');
      await rejects(why('assets/logo.png#L1-L2'), 'BINARY_TARGET');
    });

    it('does not print files the ignore rules exclude', async () => {
      const result = await why('secret-config.js');
      expect(result.data.target.source).toBeNull();
      expect(result.data.target.contentOmitted).toContain('.contextignore');
      expect(result.data.history.commits).toHaveLength(1);
    });

    it('falls back to git funcname matching for names no analyzer knows', async () => {
      fs.writeFileSync(
        path.join(repo, 'schema.sql'),
        'CREATE TABLE t (id int);\n\nCREATE FUNCTION compute_total(a int) RETURNS int\n  AS 1;\n\nCREATE INDEX i ON t (id);\n'
      );
      git('add', 'schema.sql');
      execFileSync(
        'git',
        ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'feat: add schema'],
        { cwd: repo }
      );
      try {
        const result = await why('schema.sql:compute_total');
        expect(result.data.history.mode).toBe('funcname');
        expect(result.data.history.commits.map((c) => c.subject)).toEqual(['feat: add schema']);
        expect(result.data.target).toMatchObject({ startLine: 3, endLine: 4 });
        expect(result.warnings.join('\n')).toContain('funcname');
      } finally {
        git('reset', '-q', '--hard', 'HEAD~1');
      }
    });

    it('warns that a shallow clone truncates history and marks the boundary commit', async () => {
      // Depth 3 keeps F, E and D: of the four commits that changed src/cart.js (A, B, D, E)
      // only E and D are left, and D looks like it created the file
      const shallow = path.join(outside, 'shallow');
      execFileSync('git', ['clone', '-q', '--depth', '3', `file://${repo}`, shallow]);
      const result = await explainHistory(shallow, 'src/cart.js');
      expect(result.data.repository.shallow).toBe(true);
      expect(result.warnings[0]).toContain('shallow clone');
      const { commits } = result.data.history;
      expect(commits.map((c) => [c.subject, c.shallowBoundary ?? false])).toEqual([
        ['refactor: rename pricing to price', false],
        ['feat(shipping): add shipping costs (#45)', true],
      ]);
      expect(result.text).toContain('shallow clone boundary');
      const xml = await explainHistory(shallow, 'src/cart.js', { style: 'xml' });
      expect(xml.text).toContain('shallow_boundary="true"');

      // A full clone has no boundary
      const full = await why('src/cart.js');
      expect(full.data.history.commits.some((c) => c.shallowBoundary)).toBe(false);
    });
  });

  describe('library and MCP entry points', () => {
    it('is exported from the package root', () => {
      expect(API.explainHistory).toBe(explainHistory);
    });

    it('serves the explain_history MCP tool', async () => {
      const server = new MCPServer();
      const list = await server.server._requestHandlers.get('tools/list')(
        { method: 'tools/list', params: {} },
        {}
      );
      const tool = list.tools.find((entry) => entry.name === 'explain_history');
      expect(tool.inputSchema.required).toEqual(['path', 'target']);
      expect(Object.keys(tool.inputSchema.properties)).toEqual([
        'path',
        'target',
        'limit',
        'budget',
        'since',
        'patches',
      ]);

      const call = (args) =>
        server.server._requestHandlers.get('tools/call')(
          { method: 'tools/call', params: { name: 'explain_history', arguments: args } },
          {}
        );
      const result = await call({ path: repo, target: 'src/cart.js:total', limit: 1, budget: 600 });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('# Why: `total` in `src/cart.js`');
      expect(result.content[0].text).not.toContain(AWS_KEY);
      expect(TokenUtils.calculate(result.content[0].text, 'why.md')).toBeLessThanOrEqual(600);

      const refused = await call({ path: repo, target: '../../etc/passwd' });
      expect(refused.isError).toBe(true);
      expect(refused.content[0].text).toContain('outside the repository');

      const withPatches = await call({
        path: repo,
        target: 'src/cart.js:total',
        since: '2024-01-03',
        patches: true,
        budget: 5000.7,
      });
      expect(withPatches.isError).toBeUndefined();
      expect(withPatches.content[0].text).toContain('```diff');
      expect(withPatches.content[0].text).toContain('1 commit since 2024-01-03');
    });

    it('keeps explain_history inside the MCP root', async () => {
      const server = new MCPServer({ root: path.join(repo, 'src') });
      const call = (args) =>
        server.server._requestHandlers.get('tools/call')(
          { method: 'tools/call', params: { name: 'explain_history', arguments: args } },
          {}
        );
      const inside = await call({ path: '.', target: 'cart.js:total', limit: 1 });
      expect(inside.isError).toBeUndefined();
      expect(inside.content[0].text).toContain('# Why: `total` in `cart.js`');

      const escape = await call({ path: '.', target: '../README.md' });
      expect(escape.isError).toBe(true);
      expect(escape.content[0].text).toContain('outside the project directory');

      const rootEscape = await call({ path: repo, target: 'README.md' });
      expect(rootEscape.isError).toBe(true);
      expect(rootEscape.content[0].text).toContain('outside the MCP root');
    });
  });

  describe('CLI', () => {
    const run = (args, cwd = repo, env = {}) =>
      spawnSync(process.execPath, [CLI, 'why', ...args], {
        cwd,
        encoding: 'utf-8',
        env: { ...process.env, ...env },
      });

    it('prints its own help', () => {
      const result = run(['--help']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage: ctxman why <target> [options]');
    });

    it('writes the document to stdout and a summary to stderr', () => {
      const result = run(['src/cart.js:total']);
      expect(result.status).toBe(0);
      expect(result.stdout.startsWith('# Why: `total` in `src/cart.js`')).toBe(true);
      expect(result.stdout).not.toContain('[INFO]');
      expect(result.stderr).toContain('ctxman why: src/cart.js:total (lines 7-14): 3 commits');
    });

    it('resolves paths from the current directory', () => {
      const result = run(
        ['shipping.py:flat_fee', '--json', '--limit', '1'],
        path.join(repo, 'src')
      );
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.target.path).toBe('src/shipping.py');
      expect(parsed.history.commits).toHaveLength(1);
    });

    it('accepts a budget written as 1k', () => {
      const result = run(['src/cart.js:total', '--budget', '1k']);
      expect(result.status).toBe(0);
      expect(TokenUtils.calculate(result.stdout, 'why.md')).toBeLessThanOrEqual(1000);
      expect(result.stderr).toContain('of 1,000 tokens');
    });

    it('writes a file with -o and keeps stdout empty', () => {
      const out = path.join(outside, 'why.xml');
      const result = run(['src/cart.js#L3-L5', '--style', 'xml', '-o', out, '--budget', '2000']);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(fs.readFileSync(out, 'utf-8')).toContain('<why_context generator="ctxman why">');
      expect(result.stderr).toContain('Wrote');
    });

    it('reports errors with exit codes', () => {
      const outsideRepo = run(['../x.js']);
      expect(outsideRepo.status).toBe(1);
      expect(outsideRepo.stderr).toContain('outside the repository');

      const unknownOption = run(['src/cart.js', '--bogus']);
      expect(unknownOption.status).toBe(2);

      const badRef = run(['src/cart.js', '--rev=--output=/tmp/x']);
      expect(badRef.status).toBe(2);
      expect(badRef.stderr).toContain('Invalid git reference');

      const notRepo = run(['x.js'], outside, { GIT_CEILING_DIRECTORIES: path.dirname(outside) });
      expect(notRepo.status).toBe(1);
      expect(notRepo.stderr).toContain('Not a git repository');
      expect(notRepo.stdout).toBe('');
    });
  });
});

describe('explainHistory under an export policy', () => {
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-why-policy-'));
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    const write = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    write('.ctxman/policy.json', JSON.stringify({ version: 1, deny: ['secrets/**'] }));
    write('src/app.js', 'export const a = 1;\n');
    write('secrets/db.txt', 'password-one\n');
    git('add', '-A');
    git('commit', '-qm', 'init');
    write('src/app.js', 'export const a = 2;\n');
    write('secrets/db.txt', 'password-two\n');
    git('commit', '-qam', 'change both');
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a denied target and leaves denied files out of the rest', async () => {
    await expect(explainHistory(dir, 'secrets/db.txt')).rejects.toMatchObject({
      code: 'POLICY_DENIED',
    });

    const result = await explainHistory(dir, 'src/app.js');
    expect(result.text).not.toContain('secrets/db.txt');
    expect(result.text).not.toContain('password');
  });

  it('exits with code 3 from the CLI', () => {
    const run = spawnSync(process.execPath, [CLI, 'why', 'secrets/db.txt'], {
      cwd: dir,
      encoding: 'utf8',
    });

    expect(run.status).toBe(3);
    expect(run.stderr).toContain('denied by the export policy');
  });
});
