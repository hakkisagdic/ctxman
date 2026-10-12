import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { buildPrContext } from '../lib/pr/pr-context.js';
import {
  parseNameStatus,
  parseNumstat,
  parseHunks,
  splitDiff,
  unquoteGitPath,
  syntheticAddedDiff,
} from '../lib/pr/diff-parser.js';
import { findTouchedMethods, findDeletedMethods } from '../lib/pr/method-mapper.js';
import { isTestFile, testStem, sourceStem } from '../lib/pr/related-tests.js';
import { PrGit, bufferToText } from '../lib/pr/pr-git.js';
import * as API from '../index.js';
import { createPrRepo, FAKE_AWS_KEY } from './fixtures/pr-repo.js';

describe('buildPrContext on a feature branch', () => {
  let repo;
  let result;

  beforeAll(async () => {
    repo = createPrRepo();
    result = await buildPrContext(repo.dir, { base: 'main', head: 'feature' });
  });

  afterAll(() => {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  });

  it('is exported from the package entry point', () => {
    expect(API.buildPrContext).toBe(buildPrContext);
  });

  it('compares the head with the merge base and summarises the range', () => {
    const mergeBase = repo.git('merge-base', 'main', 'feature').trim();

    expect(result.mode).toBe('range');
    expect(result.base.ref).toBe('main');
    expect(result.head.ref).toBe('feature');
    expect(result.mergeBase.sha).toBe(mergeBase);
    expect(result.stats).toMatchObject({ commits: 2, files: 7, changedMethods: 4 });
    expect(result.output).toContain(`- Merge base: ${result.mergeBase.short}`);
    expect(result.output).toContain('- Commits: 2');
    expect(result.output).toMatch(/- Tokens: ~[\d,]+ total; summary \d+, commits \d+/);
  });

  it('writes the sections in long-context order', () => {
    const order = [
      '## Summary',
      '## Commits (2)',
      '## Changed files (7)',
      '## Changed methods (4)',
      '## Diff',
      '## Related tests (3)',
    ].map((heading) => result.output.indexOf(heading));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(Object.keys(result.sections)).toEqual([
      'summary',
      'commits',
      'files',
      'methods',
      'diff',
      'tests',
    ]);
  });

  it('lists the commit log with subjects, bodies, authors and dates', () => {
    expect(result.commits.map((c) => c.subject)).toEqual([
      'feat: validate add input',
      'feat: default request path',
    ]);
    expect(result.output).toContain('> Callers passed strings and got concatenation.');
    expect(result.output).toMatch(/Test Author, \d{4}-\d{2}-\d{2}/);
  });

  it('lists every changed file with its status and line counts', () => {
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));

    expect(byPath['src/config.js']).toMatchObject({ status: 'A', additions: 1, deletions: 0 });
    expect(byPath['src/calc.js']).toMatchObject({ status: 'M', additions: 3, deletions: 6 });
    expect(byPath['obsolete.txt']).toMatchObject({ status: 'D', deletions: 1 });
    expect(byPath['docs/handbook.md']).toMatchObject({ status: 'R', oldPath: 'docs/guide.md' });
    expect(byPath['src/label.js']).toMatchObject({ status: 'R', oldPath: 'src/format.js' });
    expect(result.output).toContain('| renamed (90%) | `src/format.js` → `src/label.js` | 1 | 1 |');
  });

  it('maps diff hunks to the JavaScript, Python and Go functions that contain them', () => {
    const changed = result.methods.changed.map((m) => [m.file, m.name, m.start, m.end, m.change]);

    expect(changed).toEqual([
      ['lib/store.py', 'greet', 1, 2, 'modified'],
      ['server/server.go', 'HandleRequest', 5, 10, 'modified'],
      ['src/calc.js', 'add', 1, 6, 'modified'],
      ['src/label.js', 'formatLabel', 1, 6, 'modified'],
    ]);
    // Untouched neighbours stay out
    expect(changed.map((m) => m[1])).not.toContain('subtract');
    expect(changed.map((m) => m[1])).not.toContain('put_item');
  });

  it("includes each touched method's full current source", () => {
    const add = result.methods.changed.find((m) => m.name === 'add');

    expect(add.source).toBe(
      "export function add(a, b) {\n  if (typeof a !== 'number' || typeof b !== 'number') {\n" +
        "    throw new TypeError('add expects numbers');\n  }\n  return a + b;\n}"
    );
    expect(result.output).toContain('### `src/calc.js`: `add` (lines 1-6, modified)');
    expect(result.output).toContain("throw new TypeError('add expects numbers');");
  });

  it('lists methods that exist at the base but not at the head', () => {
    expect(result.methods.deleted).toEqual([
      { file: 'src/calc.js', name: 'legacyMultiply', start: 9, end: 13 },
    ]);
    expect(result.output).toContain('- `src/calc.js`: `legacyMultiply` (lines 9-13 at base)');
  });

  it('includes the unified diff with the requested context', () => {
    expect(result.output).toContain('diff --git a/src/calc.js b/src/calc.js');
    expect(result.output).toContain('-export function legacyMultiply(a, b) {');
    expect(result.output).toContain('rename from src/format.js');
  });

  it('finds related tests by name, import and package', () => {
    const reasons = Object.fromEntries(result.relatedTests.map((t) => [t.path, t.reasons]));

    expect(reasons['src/calc.test.js']).toEqual(
      expect.arrayContaining(['named after src/calc.js', 'imports src/calc.js'])
    );
    expect(reasons['tests/test_store.py']).toEqual(
      expect.arrayContaining(['imports lib/store.py', 'calls greet()'])
    );
    expect(reasons['server/server_test.go']).toContain('same Go package as server/server.go');
    // Paths only unless asked for contents
    expect(result.output).not.toContain("test('subtract'");
  });

  it('redacts secrets in the diff by default', () => {
    expect(result.output).not.toContain(FAKE_AWS_KEY);
    expect(result.output).toContain('[REDACTED:aws-access-key-id]');
    expect(result.redactions).toEqual({ 'aws-access-key-id': 1 });
  });

  it('keeps secrets with redact: false', async () => {
    const raw = await buildPrContext(repo.dir, { base: 'main', redact: false });

    expect(raw.output).toContain(FAKE_AWS_KEY);
    expect(raw.redactions).toEqual({});
  });

  it('defaults to HEAD against main, and prefers origin/HEAD when it is set', async () => {
    const byDefault = await buildPrContext(repo.dir);
    expect(byDefault.base.ref).toBe('main');
    expect(byDefault.head.ref).toBe('feature');

    const mainSha = repo.git('rev-parse', 'main').trim();
    repo.git('update-ref', 'refs/remotes/origin/trunk', mainSha);
    repo.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
    try {
      const withRemote = await buildPrContext(repo.dir);
      expect(withRemote.base.ref).toBe('origin/trunk');
    } finally {
      repo.git('symbolic-ref', '--delete', 'refs/remotes/origin/HEAD');
      repo.git('update-ref', '-d', 'refs/remotes/origin/trunk');
    }
  });

  it('adds related test contents, full files and the question when asked', async () => {
    const full = await buildPrContext(repo.dir, {
      base: 'main',
      withTests: true,
      withFiles: true,
      instructions: 'Review for input validation.',
      ask: 'Is add() safe now?',
    });

    expect(full.output).toContain("test('subtract', () => expect(subtract(3, 2)).toBe(1));");
    expect(full.output).toContain('## Changed file contents (6)');
    expect(full.output).toContain('### `src/label.js`');
    expect(full.output).toMatch(
      /## Instructions\n\nReview for input validation\.\n\n## Question\n\nIs add\(\) safe now\?\n$/
    );
    expect(full.output.indexOf('## Changed file contents')).toBeGreaterThan(
      full.output.indexOf('## Related tests')
    );
  });

  it('leaves the diff out with diff: false and changes the context with unified', async () => {
    const noDiff = await buildPrContext(repo.dir, { base: 'main', diff: false });
    expect(noDiff.output).not.toContain('## Diff');
    expect(noDiff.output).toContain('- Diff: not included (--no-diff)');
    expect(noDiff.methods.changed).toHaveLength(4);

    const wide = await buildPrContext(repo.dir, { base: 'main', unified: 10 });
    // lib/store.py: one changed line, 3 lines of context by default
    expect(result.output).toContain('@@ -1,5 +1,5 @@');
    expect(wide.output).toContain('@@ -1,12 +1,12 @@');
  });

  describe('styles', () => {
    it('xml wraps method and file bodies in numbered documents', async () => {
      const xml = await buildPrContext(repo.dir, {
        base: 'main',
        style: 'xml',
        withTests: true,
        ask: 'Anything risky?',
      });

      expect(xml.output.startsWith('<pr_context>\n<summary>\n')).toBe(true);
      expect(xml.output).toContain('<commits count="2">');
      expect(xml.output).toContain(
        '<file status="modified" path="src/calc.js" additions="3" deletions="6"/>'
      );
      expect(xml.output).toMatch(
        /<documents>\n<document index="1">\n<source>lib\/store.py:1-2 \(greet, modified\)<\/source>\n<document_content>\ndef greet\(name\):/
      );
      expect(xml.output).toContain(
        '<method file="src/calc.js" name="legacyMultiply" base_lines="9-13"/>'
      );
      expect(xml.output).toContain('<diff>\ndiff --git');
      // Indices keep counting across the method and test documents
      const indices = [...xml.output.matchAll(/<document index="(\d+)">/g)].map((m) => +m[1]);
      expect(indices).toEqual(indices.map((_, i) => i + 1));
      expect(indices.length).toBe(4 + 3);
      expect(xml.output.endsWith('<question>\nAnything risky?\n</question>\n</pr_context>\n')).toBe(
        true
      );
    });

    it('json is a parseable object with the sections in order', async () => {
      const json = await buildPrContext(repo.dir, { base: 'main', style: 'json', ask: 'Why?' });
      const data = JSON.parse(json.output);

      expect(Object.keys(data)).toEqual([
        'summary',
        'commits',
        'files',
        'methods',
        'diff',
        'relatedTests',
        'request',
      ]);
      expect(data.summary.stats.changedMethods).toBe(4);
      expect(data.methods.deleted[0].name).toBe('legacyMultiply');
      expect(data.diff.find((d) => d.path === 'src/config.js').diff).toContain('[REDACTED:');
      expect(data.request.question).toBe('Why?');
    });

    it('rejects an unknown style', async () => {
      await expect(buildPrContext(repo.dir, { style: 'yaml' })).rejects.toThrow('Unknown style');
    });
  });

  describe('token budget', () => {
    const budgetRun = (budget) =>
      buildPrContext(repo.dir, { base: 'main', withTests: true, withFiles: true, budget });

    it('changes nothing when the output already fits', async () => {
      const roomy = await budgetRun(1_000_000);

      expect(roomy.budget).toEqual({ limit: 1_000_000, dropped: [], over: false });
      expect(roomy.output).toContain('## Changed file contents');
    });

    it('drops full files first, keeping the diff and the methods', async () => {
      const lean = await buildPrContext(repo.dir, { base: 'main', withTests: true });
      const fitted = await budgetRun(lean.tokens + 150);

      expect(fitted.tokens).toBeLessThanOrEqual(fitted.budget.limit);
      expect(fitted.budget.dropped).toHaveLength(1);
      expect(fitted.budget.dropped[0]).toMatch(/^full contents of \d+ file\(s\)/);
      expect(fitted.output).toContain('## Diff');
      expect(fitted.output).toContain('### `src/calc.js`: `add` (lines 1-6, modified)');
      expect(fitted.output).toContain("test('subtract'");
      expect(fitted.output).toContain('- Budget: ');
    });

    it('follows the priority order at every budget', async () => {
      const full = await budgetRun(null);
      const kinds = ['full contents', 'contents of', 'related test path', 'diff of', 'source of'];

      for (const fraction of [0.9, 0.7, 0.5, 0.35, 0.2]) {
        const budget = Math.floor(full.tokens * fraction);
        const run = await budgetRun(budget);
        const dropped = run.budget.dropped.join('\n');
        const present = kinds.map((kind) => dropped.includes(kind));

        if (!run.budget.over) expect(run.tokens).toBeLessThanOrEqual(budget);
        // A kind is dropped only once every lower-priority kind is gone
        const firstKept = present.indexOf(false);
        if (firstKept !== -1) expect(present.slice(firstKept).every((p) => !p)).toBe(true);
        // The summary is never dropped
        expect(run.output).toContain('## Summary');
      }
    });

    it('drops method sources only after every diff, and keeps listing the methods', async () => {
      const noDiffNoExtras = await buildPrContext(repo.dir, { base: 'main', diff: false });
      const run = await budgetRun(noDiffNoExtras.tokens - 40);

      expect(run.budget.dropped.join('\n')).toMatch(/diff of 7 file\(s\)/);
      expect(run.output).not.toContain('## Diff');
      expect(run.output).toMatch(/### Changed methods, source omitted to fit the token budget/);
      expect(run.tokens).toBeLessThanOrEqual(run.budget.limit);
    });

    it('reports when even the summary does not fit', async () => {
      const tiny = await budgetRun(20);

      expect(tiny.budget.over).toBe(true);
      expect(tiny.output).toContain('## Summary');
      expect(tiny.output).toContain('still over');
      expect(tiny.warnings.join('\n')).toContain('over the 20-token budget');
    });
  });

  describe('git references', () => {
    const marker = () => path.join(repo.dir, 'pwned');

    it.each([
      ['--output=/tmp/ctxman-pr-x'],
      ['$(touch pwned)'],
      ['main`touch pwned`'],
      ['main;touch pwned'],
      ['main\ntouch pwned'],
    ])('rejects %j before running git', async (ref) => {
      await expect(buildPrContext(repo.dir, { base: ref })).rejects.toThrow(
        'Invalid git reference'
      );
      await expect(buildPrContext(repo.dir, { head: ref })).rejects.toThrow(
        'Invalid git reference'
      );
      expect(fs.existsSync(marker())).toBe(false);
      expect(fs.existsSync('/tmp/ctxman-pr-x')).toBe(false);
    });

    it('reports a revision that does not exist', async () => {
      await expect(buildPrContext(repo.dir, { base: 'no-such-branch' })).rejects.toThrow(
        'Unknown base revision "no-such-branch"'
      );
    });

    it('refuses a directory outside any repository', async () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pr-norepo-'));
      try {
        await expect(buildPrContext(outside)).rejects.toThrow('Not inside a git repository');
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    it('rejects conflicting modes', async () => {
      await expect(buildPrContext(repo.dir, { staged: true, working: true })).rejects.toThrow(
        'cannot be used together'
      );
      await expect(buildPrContext(repo.dir, { working: true, head: 'main' })).rejects.toThrow(
        '--head cannot be used'
      );
    });
  });

  describe('context filters', () => {
    it('lists excluded files but leaves out their diff and methods', async () => {
      fs.writeFileSync(path.join(repo.dir, '.contextignore'), 'src/calc.js\n');
      try {
        const filtered = await buildPrContext(repo.dir, { base: 'main', withFiles: true });
        const calc = filtered.files.find((f) => f.path === 'src/calc.js');

        expect(calc.excluded).toBe('.contextignore');
        expect(filtered.output).toContain('`src/calc.js` (content excluded by .contextignore)');
        expect(filtered.output).not.toContain('diff --git a/src/calc.js');
        expect(filtered.methods.changed.map((m) => m.name)).not.toContain('add');
        expect(filtered.methods.deleted).toEqual([]);
        expect(filtered.output).not.toContain('### `src/calc.js`\n');
      } finally {
        fs.rmSync(path.join(repo.dir, '.contextignore'));
      }
    });

    it('honours .contextinclude', async () => {
      fs.writeFileSync(path.join(repo.dir, '.contextinclude'), 'lib/**\n');
      try {
        const included = await buildPrContext(repo.dir, { base: 'main' });

        expect(included.methods.changed.map((m) => m.name)).toEqual(['greet']);
        expect(included.files.find((f) => f.path === 'src/calc.js').excluded).toBe(
          '.contextinclude'
        );
      } finally {
        fs.rmSync(path.join(repo.dir, '.contextinclude'));
      }
    });

    it('limits the change to a subdirectory', async () => {
      const sub = await buildPrContext(path.join(repo.dir, 'lib'), { base: 'main' });

      expect(sub.scope).toBe('lib');
      expect(sub.files.map((f) => f.path)).toEqual(['lib/store.py']);
      expect(sub.stats.commits).toBe(1);
      expect(sub.output).toContain('- Scope: lib');
    });
  });

  describe('uncommitted changes', () => {
    it('compares the working tree, untracked files included, with HEAD', async () => {
      repo.write({
        'src/calc.js': `${fs.readFileSync(path.join(repo.dir, 'src/calc.js'), 'utf8')}
export function multiply(a, b) {
  return a * b;
}
`,
        'src/scratch.js': 'export const scratchValue = () => 42;\n',
      });
      fs.writeFileSync(path.join(repo.dir, 'logo.bin'), Buffer.from([0x89, 0x50, 0, 1, 2]));
      try {
        const working = await buildPrContext(repo.dir, { working: true });

        expect(working.mode).toBe('working');
        expect(working.base.ref).toBe('HEAD');
        expect(working.stats.commits).toBe(0);
        expect(working.files.map((f) => [f.path, f.status, f.untracked, f.binary])).toEqual([
          ['logo.bin', 'A', true, true],
          ['src/calc.js', 'M', false, false],
          ['src/scratch.js', 'A', true, false],
        ]);
        expect(working.output).toContain('| added (untracked) | `logo.bin` | binary |  |');
        expect(working.output).toContain('Binary files /dev/null and b/logo.bin differ');
        expect(working.methods.changed.map((m) => [m.name, m.change])).toEqual([
          ['multiply', 'added'],
          ['scratchValue', 'added'],
        ]);
        expect(working.output).toContain('+export const scratchValue = () => 42;');

        repo.git('add', 'src/scratch.js');
        const staged = await buildPrContext(repo.dir, { staged: true });
        expect(staged.files.map((f) => f.path)).toEqual(['src/scratch.js']);
        expect(staged.output).toContain('# Change context: staged changes');
      } finally {
        repo.git('reset', '-q', 'HEAD', '--', 'src/scratch.js');
        repo.git('checkout', '-q', '--', 'src/calc.js');
        fs.rmSync(path.join(repo.dir, 'src/scratch.js'));
        fs.rmSync(path.join(repo.dir, 'logo.bin'));
      }
    });
  });
});

describe('PrGit.readBlobs', () => {
  let repo;

  beforeAll(() => {
    repo = createPrRepo();
  });

  afterAll(() => {
    fs.rmSync(repo.dir, { recursive: true, force: true });
  });

  it('reads several files in one batch and reports what it could not read', () => {
    const git = new PrGit(repo.dir);
    const [calc, missing, tree, newline] = git.readBlobs([
      'main:src/calc.js',
      'main:no/such/file.js',
      'main:src',
      'main:bad\nname',
    ]);

    expect(calc.status).toBe('ok');
    expect(calc.text).toContain('legacyMultiply');
    expect(missing).toEqual({ status: 'missing' });
    expect(tree).toEqual({ status: 'not-blob' });
    expect(newline).toEqual({ status: 'missing' });
  });

  it('skips objects over the per-file and the overall size limit', () => {
    const git = new PrGit(repo.dir);
    const specs = ['main:src/calc.js', 'main:lib/store.py', 'main:obsolete.txt'];

    expect(git.readBlobs(specs, { maxBytes: 100 }).map((r) => r.status)).toEqual([
      'too-large',
      'too-large',
      'ok',
    ]);
    const sizes = git.readBlobs(specs).map((r) => r.size);
    expect(
      git.readBlobs(specs, { maxTotalBytes: sizes[0] + sizes[2] }).map((r) => r.status)
    ).toEqual(['ok', 'too-large', 'ok']);
  });

  it('treats content with NUL bytes as binary', () => {
    expect(bufferToText(Buffer.from('plain text'))).toBe('plain text');
    expect(bufferToText(Buffer.from([0x50, 0x4b, 0x00, 0x03]))).toBeNull();
  });
});

describe('diff parsing', () => {
  it('reads -z name-status and numstat output, renames included', () => {
    expect(parseNameStatus('M\0a.js\0R087\0old.js\0new.js\0A\0b.js\0D\0c.js\0')).toEqual([
      { status: 'M', path: 'a.js', oldPath: 'a.js', similarity: null },
      { status: 'R', path: 'new.js', oldPath: 'old.js', similarity: 87 },
      { status: 'A', path: 'b.js', oldPath: null, similarity: null },
      { status: 'D', path: 'c.js', oldPath: 'c.js', similarity: null },
    ]);
    const stats = parseNumstat('3\t1\ta.js\0' + '1\t1\t\0old.js\0new.js\0' + '-\t-\tlogo.png\0');
    expect(stats.get('a.js')).toEqual({ additions: 3, deletions: 1, binary: false });
    expect(stats.get('new.js')).toEqual({ additions: 1, deletions: 1, binary: false });
    expect(stats.get('logo.png')).toEqual({ additions: 0, deletions: 0, binary: true });
  });

  it('maps hunks to new-side lines and deletion points', () => {
    const diff = [
      'diff --git a/f.js b/f.js',
      '--- a/f.js',
      '+++ b/f.js',
      '@@ -1,6 +1,6 @@',
      ' line1',
      '-line2',
      '+line2 changed',
      ' line3',
      '-line4',
      '-line5',
      ' line6',
      '+line7',
      '@@ -20,0 +21,1 @@',
      '+added at 21',
    ].join('\n');

    expect(parseHunks(diff)).toEqual({ addedLines: [2, 5, 21], deletionAnchors: [2, 4] });
  });

  it('splits a diff per file and reads quoted and binary paths', () => {
    const blocks = splitDiff(
      [
        'diff --git "a/sp ace\\303\\244.js" "b/sp ace\\303\\244.js"',
        'index 1..2 100644',
        '--- "a/sp ace\\303\\244.js"',
        '+++ "b/sp ace\\303\\244.js"',
        '@@ -1 +1 @@',
        '-a',
        '+b',
        'diff --git a/logo.png b/logo.png',
        'new file mode 100644',
        'Binary files /dev/null and b/logo.png differ',
        '',
      ].join('\n')
    );

    expect(blocks.map((b) => [b.oldPath, b.newPath])).toEqual([
      ['sp aceä.js', 'sp aceä.js'],
      [null, 'logo.png'],
    ]);
    expect(unquoteGitPath('"tab\\there"')).toBe('tab\there');
  });

  it('builds an all-added diff for untracked files', () => {
    expect(syntheticAddedDiff('n.js', 'a\nb\n')).toBe(
      'diff --git a/n.js b/n.js\nnew file mode 100644\n--- /dev/null\n+++ b/n.js\n@@ -0,0 +1,2 @@\n+a\n+b'
    );
    expect(parseHunks(syntheticAddedDiff('n.js', 'a\nb\n')).addedLines).toEqual([1, 2]);
  });
});

describe('method mapping', () => {
  const method = (name, start, end) => ({ name, start, end, source: `${name} source` });

  it('credits a line to the innermost method and folds nested ones into the outer', () => {
    const methods = [method('outer', 1, 20), method('inner', 5, 8), method('other', 22, 30)];

    expect(
      findTouchedMethods(methods, { addedLines: [6], deletionAnchors: [] }).map((m) => m.name)
    ).toEqual(['inner']);
    expect(
      findTouchedMethods(methods, { addedLines: [6, 15], deletionAnchors: [] }).map((m) => [
        m.name,
        m.changedLines,
      ])
    ).toEqual([['outer', 2]]);
  });

  it('counts a deletion inside a method but not one just before it', () => {
    const methods = [method('a', 10, 20)];

    expect(findTouchedMethods(methods, { addedLines: [], deletionAnchors: [10] })).toEqual([]);
    expect(
      findTouchedMethods(methods, { addedLines: [], deletionAnchors: [20] }).map((m) => m.name)
    ).toEqual(['a']);
  });

  it('reports removed names and removed overloads', () => {
    const base = [method('keep', 1, 3), method('gone', 5, 7), method('twice', 9, 10)];
    base.push({ name: 'twice', start: 12, end: 14, source: 'twice second' });
    const head = [method('keep', 1, 3), method('twice', 5, 6)];

    expect(findDeletedMethods(base, head, 'twice source').map((m) => [m.name, m.start])).toEqual([
      ['gone', 5],
      ['twice', 12],
    ]);
  });
});

describe('test file detection', () => {
  it.each([
    'src/calc.test.js',
    'src/calc.spec.ts',
    'tests/test_store.py',
    'pkg/server_test.go',
    'src/test/java/com/acme/FooTest.java',
    'src/__tests__/calc.js',
    'spec/models/user_spec.rb',
  ])('treats %s as a test', (file) => {
    expect(isTestFile(file)).toBe(true);
  });

  it.each(['src/latest.js', 'src/contest.py', 'test/fixtures/sample.js', 'docs/test.md'])(
    'does not treat %s as a test',
    (file) => {
      expect(isTestFile(file)).toBe(false);
    }
  );

  it('matches tests to the files they are named after', () => {
    expect(testStem('src/calc.test.js')).toBe(sourceStem('src/calc.js'));
    expect(testStem('tests/test_user_store.py')).toBe(sourceStem('lib/user_store.py'));
    expect(testStem('src/test/FooServiceTest.java')).toBe(sourceStem('src/main/FooService.java'));
    expect(testStem('src/auth/__tests__/index.test.js')).toBe(sourceStem('src/auth/index.js'));
  });
});

describe('buildPrContext under an export policy', () => {
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pr-policy-'));
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    const write = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    write('src/app.js', 'export const a = 1;\n');
    write('secrets/db.txt', 'old-password\n');
    write('.ctxman/policy.json', JSON.stringify({ version: 1, deny: ['secrets/**'] }));
    git('add', '-A');
    git('commit', '-qm', 'init');
    git('checkout', '-qb', 'feature');
    write('src/app.js', 'export const a = 2;\n');
    write('secrets/db.txt', 'NEW-PASSWORD-VALUE\n');
    git('commit', '-qam', 'change');
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('leaves denied files out of the file list, the diff and the contents', async () => {
    const result = await buildPrContext(dir, { base: 'main', head: 'feature', withFiles: true });

    expect(result.stats.files).toBe(1);
    expect(result.output).toContain('src/app.js');
    expect(result.output).not.toContain('secrets/db.txt');
    expect(result.output).not.toContain('PASSWORD');
    expect(result.warnings).toContain(
      '1 changed file(s) denied by the export policy were left out'
    );
  });
});
