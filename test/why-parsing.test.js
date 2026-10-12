import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  closeMatches,
  isValidSymbol,
  mapRangeToOld,
  parseHunks,
  parseTargetSpec,
  resolveSymbol,
} from '../lib/why/target.js';
import { issueLink, mineReferences, parseRemote } from '../lib/why/references.js';
import { commentStart, findNotes } from '../lib/why/search.js';
import { classifyTextFile, isTestFile, resolveInsideRoot } from '../lib/why/paths.js';
import { parseLog, funcnamePattern } from '../lib/why/history.js';
import { utcDate } from '../lib/why/git.js';

describe('why: target syntax', () => {
  it('reads a plain file, a symbol and qualified symbols', () => {
    expect(parseTargetSpec('src/cart.js')).toEqual({ file: 'src/cart.js' });
    expect(parseTargetSpec('src/cart.js:total')).toEqual({ file: 'src/cart.js', symbol: 'total' });
    expect(parseTargetSpec('src/cart.js:Cart.total')).toEqual({
      file: 'src/cart.js',
      symbol: 'Cart.total',
    });
    expect(parseTargetSpec('src/lib.rs:Cart::total')).toEqual({
      file: 'src/lib.rs',
      symbol: 'Cart::total',
    });
    expect(parseTargetSpec('app/models/user.rb:User#valid?')).toEqual({
      file: 'app/models/user.rb',
      symbol: 'User#valid?',
    });
  });

  it('reads line ranges in GitHub and compiler styles', () => {
    expect(parseTargetSpec('src/cart.js#L10-L40')).toEqual({
      file: 'src/cart.js',
      startLine: 10,
      endLine: 40,
    });
    expect(parseTargetSpec('src/cart.js#L10-40')).toMatchObject({ startLine: 10, endLine: 40 });
    expect(parseTargetSpec('src/cart.js#L7')).toMatchObject({ startLine: 7, endLine: 7 });
    expect(parseTargetSpec('src/cart.js:12-20')).toMatchObject({ startLine: 12, endLine: 20 });
    expect(parseTargetSpec('src/cart.js:12')).toMatchObject({ startLine: 12, endLine: 12 });
  });

  it('keeps Windows drive letters and existing paths with colons intact', () => {
    expect(parseTargetSpec('C:\\repo\\cart.js')).toEqual({ file: 'C:\\repo\\cart.js' });
    expect(parseTargetSpec('C:\\repo\\cart.js:total')).toEqual({
      file: 'C:\\repo\\cart.js',
      symbol: 'total',
    });
    const exists = (file) => file === 'odd:name.js';
    expect(parseTargetSpec('odd:name.js', exists)).toEqual({ file: 'odd:name.js' });
    expect(parseTargetSpec('odd:name.js:run', exists)).toEqual({
      file: 'odd:name.js',
      symbol: 'run',
    });
  });

  it('rejects an empty target and odd symbol names', () => {
    expect(() => parseTargetSpec('')).toThrow(/target is required/);
    expect(isValidSymbol('total')).toBe(true);
    expect(isValidSymbol('$scope.init')).toBe(true);
    expect(isValidSymbol('a b')).toBe(false);
    expect(isValidSymbol('x:y')).toBe(false);
    expect(isValidSymbol('.*')).toBe(false);
  });
});

describe('why: symbol resolution', () => {
  const js = `import x from 'y';

/**
 * Cart of items
 */
export class Cart {
  constructor(items) {
    this.items = items;
  }

  // Sum of the prices
  total() {
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }
}

export function total(items) {
  return items.length;
}

const format = (value) => {
  return value.toFixed(2);
};
`;

  it('finds functions, classes, methods and arrow functions in JavaScript', () => {
    expect(resolveSymbol(js, 'cart.js', 'Cart')).toMatchObject({
      kind: 'class',
      line: 6,
      startLine: 3,
      endLine: 15,
    });
    expect(resolveSymbol(js, 'cart.js', 'Cart.total')).toMatchObject({
      line: 12,
      startLine: 11,
      endLine: 14,
      matches: 1,
    });
    expect(resolveSymbol(js, 'cart.js', 'format')).toMatchObject({ line: 21, endLine: 23 });
  });

  it('picks the first of several definitions and reports how many matched', () => {
    expect(resolveSymbol(js, 'cart.js', 'total')).toMatchObject({ line: 12, matches: 2 });
  });

  it('finds Python functions, methods and classes, decorators included', () => {
    const py = `import math


class Shipping:
    """Shipping costs."""

    def __init__(self, rate):
        self.rate = rate

    @staticmethod
    def flat_fee(weight):
        return 5 if weight < 1000 else 9

    def cost(self, weight):
        return self.rate * weight


def helper():
    return math.pi
`;
    expect(resolveSymbol(py, 'ship.py', 'Shipping')).toMatchObject({ line: 4, endLine: 15 });
    expect(resolveSymbol(py, 'ship.py', 'flat_fee')).toMatchObject({
      line: 11,
      startLine: 10,
      endLine: 12,
    });
    expect(resolveSymbol(py, 'ship.py', 'Shipping.cost')).toMatchObject({
      line: 14,
      endLine: 15,
    });
    expect(resolveSymbol(py, 'ship.py', 'helper')).toMatchObject({ line: 18, endLine: 19 });
  });

  it('finds definitions the analyzers miss and members defined outside the type', () => {
    const go = `package cart

type Cart struct {
\titems []int
}

func (c *Cart) total() int {
\treturn len(c.items)
}

func helper() int {
\treturn 1
}
`;
    expect(resolveSymbol(go, 'cart.go', 'helper')).toMatchObject({ line: 11, endLine: 13 });
    expect(resolveSymbol(go, 'cart.go', 'Cart.total')).toMatchObject({ line: 7, endLine: 9 });
    expect(resolveSymbol(go, 'cart.go', 'Cart')).toMatchObject({ line: 3, endLine: 5 });
  });

  it('returns null for unknown symbols and suggests close names', () => {
    expect(resolveSymbol(js, 'cart.js', 'totl')).toBeNull();
    expect(resolveSymbol(js, 'cart.js', 'Basket.total')).toBeNull();
    expect(closeMatches(js, 'cart.js', 'totl')).toContain('total');
    expect(closeMatches(js, 'cart.js', 'Cart.totl')).toContain('Cart.total');
  });
});

describe('why: working tree to HEAD line mapping', () => {
  const diff = [
    'diff --git a/x b/x',
    '@@ -2,0 +3,2 @@ context',
    '@@ -5,2 +6,0 @@',
    '@@ -10,3 +10,5 @@',
  ].join('\n');

  it('parses hunk headers, with omitted counts meaning one line', () => {
    expect(parseHunks('@@ -4 +4 @@\n')).toEqual([
      { oldStart: 4, oldCount: 1, newStart: 4, newCount: 1 },
    ]);
    expect(parseHunks(diff)).toHaveLength(3);
  });

  it('shifts lines around added and deleted blocks', () => {
    const hunks = parseHunks(diff);
    // Before every hunk
    expect(mapRangeToOld(hunks, 1, 2)).toEqual({ startLine: 1, endLine: 2 });
    // After two added lines: shifted back by two
    expect(mapRangeToOld(hunks, 5, 5)).toEqual({ startLine: 3, endLine: 3 });
    // After the deletion of old lines 5-6
    expect(mapRangeToOld(hunks, 7, 7)).toEqual({ startLine: 7, endLine: 7 });
    // A changed block widens to the whole old block
    expect(mapRangeToOld(hunks, 11, 12)).toEqual({ startLine: 10, endLine: 12 });
  });

  it('has no committed counterpart for lines that are only additions', () => {
    expect(mapRangeToOld(parseHunks(diff), 3, 4)).toBeNull();
  });
});

describe('why: remotes and references', () => {
  it('turns GitHub, GitLab and Bitbucket remotes into https web URLs', () => {
    expect(parseRemote('git@github.com:acme/shop.git')).toMatchObject({
      provider: 'github',
      webUrl: 'https://github.com/acme/shop',
    });
    expect(parseRemote('https://user:secret@github.com/acme/shop.git').webUrl).toBe(
      'https://github.com/acme/shop'
    );
    expect(parseRemote('ssh://git@ssh.github.com:443/acme/shop.git').webUrl).toBe(
      'https://github.com/acme/shop'
    );
    expect(parseRemote('git@gitlab.com:group/sub/shop.git')).toMatchObject({
      provider: 'gitlab',
      webUrl: 'https://gitlab.com/group/sub/shop',
    });
    expect(parseRemote('https://gitlab.example.com:8443/team/shop')).toMatchObject({
      provider: 'gitlab',
      webUrl: 'https://gitlab.example.com:8443/team/shop',
    });
    expect(parseRemote('git@bitbucket.org:acme/shop.git').provider).toBe('bitbucket');
    expect(parseRemote('https://git.example.com/acme/shop.git').provider).toBeNull();
    expect(parseRemote('/srv/git/shop.git')).toBeNull();
    expect(parseRemote('C:\\repos\\shop')).toBeNull();
    expect(parseRemote('file:///srv/git/shop.git')).toBeNull();
    expect(parseRemote(null)).toBeNull();
  });

  it('links issues and pull / merge requests per provider', () => {
    const github = parseRemote('git@github.com:acme/shop.git');
    const gitlab = parseRemote('git@gitlab.com:acme/shop.git');
    const bitbucket = parseRemote('git@bitbucket.org:acme/shop.git');
    expect(issueLink(github, null, 12, 'issue')).toBe('https://github.com/acme/shop/issues/12');
    expect(issueLink(github, null, 45, 'pr')).toBe('https://github.com/acme/shop/pull/45');
    expect(issueLink(github, 'acme/other', 5, 'issue')).toBe(
      'https://github.com/acme/other/issues/5'
    );
    expect(issueLink(gitlab, null, 7, 'mr')).toBe(
      'https://gitlab.com/acme/shop/-/merge_requests/7'
    );
    expect(issueLink(bitbucket, null, 3, 'pr')).toBe(
      'https://bitbucket.org/acme/shop/pull-requests/3'
    );
    expect(issueLink(null, null, 3, 'issue')).toBeNull();
  });

  it('mines issues, pull requests, tickets, CVEs, URLs and trailers', () => {
    const commits = [
      {
        shortSha: 'aaa1111',
        subject: 'fix(cart): round totals (#45)',
        body: [
          'Fixes #12 and relates to acme/other#5, GH-7, ABC-34 and PROJ-1000.',
          'Not refs: UTF-8, SHA-256, ISO-8601, &#123;, color #000000, abc#99.',
          'See https://user:pw@example.com/notes#3. and CVE-2021-44228.',
          '',
          'Co-authored-by: Bob <bob@example.com>',
          'Reviewed-by: Carol <carol@example.com>',
        ].join('\n'),
      },
      { shortSha: 'bbb2222', subject: 'chore: follow-up for #12', body: '' },
    ];
    const refs = mineReferences(commits, parseRemote('git@github.com:acme/shop.git'));

    const byId = Object.fromEntries(refs.issues.map((entry) => [entry.id, entry]));
    expect(Object.keys(byId).sort()).toEqual(['#12', '#45', '#7', 'acme/other#5']);
    expect(byId['#45']).toMatchObject({ kind: 'pr', url: 'https://github.com/acme/shop/pull/45' });
    expect(byId['#12']).toMatchObject({
      kind: 'issue',
      closes: true,
      url: 'https://github.com/acme/shop/issues/12',
      commits: ['aaa1111', 'bbb2222'],
    });
    expect(byId['acme/other#5'].url).toBe('https://github.com/acme/other/issues/5');
    expect(refs.tickets.map((entry) => entry.id)).toEqual(['ABC-34', 'PROJ-1000']);
    expect(refs.cves.map((entry) => entry.id)).toEqual(['CVE-2021-44228']);
    expect(refs.urls.map((entry) => entry.url)).toEqual(['https://example.com/notes#3']);
    expect(refs.coAuthors[0].value).toBe('Bob <bob@example.com>');
    expect(refs.reviewers[0].value).toBe('Carol <carol@example.com>');
  });

  it('reads GitLab merge requests', () => {
    const refs = mineReferences(
      [{ shortSha: 'c', subject: 'Merge branch x', body: 'See merge request group/shop!17' }],
      parseRemote('https://gitlab.com/group/shop.git')
    );
    expect(refs.issues[0]).toMatchObject({
      kind: 'mr',
      url: 'https://gitlab.com/group/shop/-/merge_requests/17',
    });
  });
});

describe('why: paths', () => {
  it('keeps targets inside the root, also for names that start with two dots', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-why-paths-')));
    try {
      fs.writeFileSync(path.join(root, '..notes.md'), 'x\n');
      expect(resolveInsideRoot(root, root, '..notes.md').relative).toBe('..notes.md');
      for (const file of ['..', '../x.md', '.', root]) {
        expect(() => resolveInsideRoot(root, root, file)).toThrow(/outside the repository/);
      }
      expect(() =>
        resolveInsideRoot(root, root, '../x.md', { label: 'the project directory' })
      ).toThrow('Path is outside the project directory: ../x.md');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('why: comments, notes and file kinds', () => {
  it('finds where comments start, ignoring markers inside strings', () => {
    expect(commentStart('const url = "http://x"; // real', 'a.js')).toBe(24);
    expect(commentStart('const url = "http://x";', 'a.js')).toBe(-1);
    expect(commentStart(' * continued block', 'a.js')).toBe(1);
    expect(commentStart("x = '#'  # note", 'a.py')).toBe(9);
    expect(commentStart('SELECT 1; -- why', 'a.sql')).toBe(10);
    expect(commentStart('Any prose line', 'README.md')).toBe(0);
  });

  it('lists TODO-style notes inside a range, from comments only', () => {
    const lines = [
      'function f() {',
      '  // TODO: handle currency',
      "  const s = 'TODO not a note';",
      '  /* FIXME(alice): overflow */',
      '  return 1; // HACK - temporary',
      '}',
    ];
    expect(findNotes(lines, 1, 6, 'a.js')).toEqual([
      { line: 2, tag: 'TODO', text: 'handle currency' },
      { line: 4, tag: 'FIXME', text: 'overflow', author: 'alice' },
      { line: 5, tag: 'HACK', text: 'temporary' },
    ]);
    expect(findNotes(lines, 3, 4, 'a.js').map((note) => note.line)).toEqual([4]);
  });

  it('classifies tests, ADRs, changelogs and docs', () => {
    expect(isTestFile('test/cart.js')).toBe(true);
    expect(isTestFile('src/cart.test.ts')).toBe(true);
    expect(isTestFile('pkg/cart_test.go')).toBe(true);
    expect(isTestFile('tests/test_cart.py')).toBe(true);
    expect(isTestFile('src/CartTest.java')).toBe(true);
    expect(isTestFile('src/contest.js')).toBe(false);
    expect(classifyTextFile('docs/adr/0003-rounding.md')).toBe('adr');
    expect(classifyTextFile('docs/decisions/use-postgres.md')).toBe('adr');
    expect(classifyTextFile('notes/ADR-12.md')).toBe('adr');
    expect(classifyTextFile('CHANGELOG.md')).toBe('changelog');
    expect(classifyTextFile('docs/guide.rst')).toBe('doc');
    expect(classifyTextFile('docs/guide.adoc')).toBe('doc');
    expect(classifyTextFile('src/padre.js')).toBeNull();
  });
});

describe('why: git log parsing', () => {
  it('splits records into fields and keeps patches only when asked', () => {
    const output =
      '\x1eabc\x1fa\x1f2024-01-02T10:00:00+00:00\x1fAlice\x1fa@x\x1fp1 p2\x1fsubject one\x1fbody\nline\x1d\n\ndiff --git a/x b/x\n+x\n' +
      '\x1edef\x1fd\x1f2024-01-01T10:00:00+00:00\x1fBob\x1fb@x\x1f\x1fsubject two\x1f\x1d\n';
    const [first, second] = parseLog(output, true);
    expect(first).toMatchObject({
      sha: 'abc',
      shortSha: 'a',
      author: 'Alice',
      merge: true,
      subject: 'subject one',
      body: 'body\nline',
      patch: 'diff --git a/x b/x\n+x',
    });
    expect(second).toMatchObject({ sha: 'def', merge: false, body: '' });
    expect(second.patch).toBeUndefined();
    expect(parseLog(output, false)[0].patch).toBeUndefined();
  });

  it('writes commit and blame dates in UTC, to the second', () => {
    const record = (date) => `\x1eabc\x1fa\x1f${date}\x1fA\x1fa@x\x1f\x1fs\x1f\x1d\n`;
    expect(parseLog(record('2024-01-02T10:00:00+02:00'), false)[0].date).toBe(
      '2024-01-02T08:00:00Z'
    );
    expect(parseLog(record('2024-01-02T23:30:00-05:00'), false)[0].date).toBe(
      '2024-01-03T04:30:00Z'
    );
    expect(utcDate(1704189600)).toBe('2024-01-02T10:00:00Z');
    expect(utcDate(0)).toBeNull();
    expect(utcDate('not a date')).toBeNull();
  });

  it('escapes regex characters for git funcname patterns', () => {
    expect(funcnamePattern('$scope.init')).toBe('\\$scope\\.init');
  });
});
