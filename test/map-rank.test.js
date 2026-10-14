import { describe, it, expect } from 'vitest';
import { pageRank, rankFiles, resolveFocus, DEFAULT_WEIGHTS } from '../lib/map/index.js';

const sum = (scores) => [...scores.values()].reduce((total, value) => total + value, 0);
const edge = (from, to, weight = 1) => ({ from, to, weight });

/** A graph object as buildRepoGraph() returns it, without touching the disk */
const graphOf = (paths, edges, { counts = null, symbolRefs = {} } = {}) => ({
  root: '/project',
  nodes: paths.map((p) => ({ path: p, methods: [], symbolRefs: symbolRefs[p] || 0 })),
  edges,
  history: counts
    ? { available: true, requested: 300, commits: 10, counts }
    : { available: false, requested: 0, commits: 0, counts: {} },
});

describe('pageRank', () => {
  it('ranks the centre of a star highest and sums to 1', () => {
    const leaves = ['a', 'b', 'c', 'd', 'e'];
    const { scores, converged } = pageRank(
      ['hub', ...leaves],
      leaves.map((leaf) => edge(leaf, 'hub'))
    );

    expect(converged).toBe(true);
    expect(sum(scores)).toBeCloseTo(1, 12);
    for (const leaf of leaves) expect(scores.get('hub')).toBeGreaterThan(scores.get(leaf));
    // The leaves are symmetric
    expect(new Set(leaves.map((leaf) => scores.get(leaf).toFixed(12))).size).toBe(1);
  });

  it('matches the closed form for a → b with a dangling b', () => {
    // b has no out-edges, so its rank jumps uniformly:
    // a = 0.15/2 + 0.85·b/2,  b = 0.15/2 + 0.85·a + 0.85·b/2  ⇒  a = 0.5/1.425
    const { scores } = pageRank(['a', 'b'], [edge('a', 'b')]);

    expect(scores.get('a')).toBeCloseTo(0.5 / 1.425, 9);
    expect(scores.get('b')).toBeCloseTo(1 - 0.5 / 1.425, 9);
  });

  it('gives every node of a cycle the same rank', () => {
    const { scores } = pageRank(['a', 'b', 'c'], [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]);

    for (const id of ['a', 'b', 'c']) expect(scores.get(id)).toBeCloseTo(1 / 3, 12);
  });

  it('keeps the total at 1 with dangling nodes, self loops and unknown endpoints', () => {
    const { scores } = pageRank(
      ['a', 'b', 'c', 'd'],
      [edge('a', 'b'), edge('a', 'a'), edge('b', 'c'), edge('x', 'a'), edge('c', 'b', 0)]
    );

    expect(sum(scores)).toBeCloseTo(1, 12);
    expect(scores.get('c')).toBeGreaterThan(scores.get('d'));
  });

  it('follows edge weights', () => {
    const { scores } = pageRank(['a', 'b', 'c'], [edge('a', 'b', 3), edge('a', 'c', 1)]);

    expect(scores.get('b')).toBeGreaterThan(scores.get('c'));
  });

  it('moves rank toward the personalisation vector', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const edges = [edge('a', 'b'), edge('c', 'd')];
    const plain = pageRank(ids, edges).scores;
    const biased = pageRank(ids, edges, { personalization: { c: 1 } }).scores;

    expect(plain.get('b')).toBeCloseTo(plain.get('d'), 12);
    expect(biased.get('d')).toBeGreaterThan(biased.get('b'));
    expect(biased.get('c')).toBeGreaterThan(biased.get('a'));
    expect(sum(biased)).toBeCloseTo(1, 12);
  });

  it('is deterministic and handles the empty graph', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `f${i}`);
    const edges = ids.map((id, i) => edge(id, ids[(i * 7 + 3) % ids.length]));

    expect([...pageRank(ids, edges).scores]).toEqual([...pageRank(ids, edges).scores]);
    expect(pageRank([], []).scores.size).toBe(0);
    expect(() => pageRank(['a'], [], { damping: 1 })).toThrow('damping');
  });
});

describe('rankFiles', () => {
  // Two clusters: lib/core.js is imported by four files, app/view.js by one
  const paths = [
    'app/main.js',
    'app/view.js',
    'lib/a.js',
    'lib/b.js',
    'lib/c.js',
    'lib/core.js',
    'lib/d.js',
  ];
  const edges = [
    edge('lib/a.js', 'lib/core.js'),
    edge('lib/b.js', 'lib/core.js'),
    edge('lib/c.js', 'lib/core.js'),
    edge('lib/d.js', 'lib/core.js'),
    edge('app/main.js', 'app/view.js'),
  ];

  it('orders by score with ranks from 1 and normalised components', () => {
    const ranked = rankFiles(graphOf(paths, edges));

    expect(ranked[0]).toMatchObject({ path: 'lib/core.js', rank: 1, score: 1 });
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const row of ranked) {
      expect(row.score).toBeGreaterThanOrEqual(0);
      expect(row.score).toBeLessThanOrEqual(1);
      expect(row.components.pagerank).toBeLessThanOrEqual(1);
    }
    // Equal scores are ordered by path
    const leaves = ranked.filter((row) => ['lib/a.js', 'lib/b.js'].includes(row.path));
    expect(leaves.map((row) => row.path)).toEqual(['lib/a.js', 'lib/b.js']);
  });

  it('personalises toward focus files and their neighbours', () => {
    const plain = rankFiles(graphOf(paths, edges));
    const focused = rankFiles(graphOf(paths, edges), { focus: ['app/main.js'] });
    const rankOf = (rows, file) => rows.find((row) => row.path === file).rank;

    expect(rankOf(plain, 'app/view.js')).toBeGreaterThan(1);
    expect(rankOf(focused, 'app/view.js')).toBe(1);
    expect(rankOf(focused, 'app/main.js')).toBe(2);
    expect(focused.find((row) => row.path === 'app/main.js').focus).toBe(true);
  });

  it('accepts a folder as focus and rejects paths outside the project', () => {
    const graph = graphOf(paths, edges);

    expect(resolveFocus(graph, ['app', 'missing.js'])).toEqual({
      files: ['app/main.js', 'app/view.js'],
      unmatched: ['missing.js'],
    });
    expect(resolveFocus(graph, ['/project/lib/a.js']).files).toEqual(['lib/a.js']);
    expect(() => rankFiles(graph, { focus: ['../etc/passwd'] })).toThrow('outside the project');
  });

  it('blends git change frequency with its documented weight', () => {
    // Same PageRank for both; only b.js changed
    const graph = graphOf(['a.js', 'b.js'], [], { counts: { 'b.js': 7 } });
    const ranked = rankFiles(graph);
    const b = ranked.find((row) => row.path === 'b.js');
    const a = ranked.find((row) => row.path === 'a.js');

    expect(ranked[0].path).toBe('b.js');
    expect(b.changes).toBe(7);
    expect(b.components.history).toBe(1);
    // No symbol references anywhere: that component drops out of the divisor
    const total = DEFAULT_WEIGHTS.pagerank + DEFAULT_WEIGHTS.history;
    expect(b.score).toBeCloseTo(1, 12);
    expect(a.score).toBeCloseTo(DEFAULT_WEIGHTS.pagerank / total, 12);
  });

  it('scores with all three components by the documented formula', () => {
    const graph = graphOf(['a.js', 'b.js', 'c.js'], [edge('a.js', 'c.js')], {
      counts: { 'a.js': 3, 'b.js': 1 },
      symbolRefs: { 'b.js': 4, 'c.js': 1 },
    });
    const ranked = rankFiles(graph);
    const { scores } = pageRank(['a.js', 'b.js', 'c.js'], graph.edges);
    const maxRank = Math.max(...scores.values());
    const w = DEFAULT_WEIGHTS;

    for (const row of ranked) {
      const changes = graph.history.counts[row.path] || 0;
      const refs = graph.nodes.find((node) => node.path === row.path).symbolRefs;
      const expected =
        (w.pagerank * (scores.get(row.path) / maxRank) +
          w.history * (Math.log1p(changes) / Math.log1p(3)) +
          w.symbols * (Math.log1p(refs) / Math.log1p(4))) /
        (w.pagerank + w.history + w.symbols);
      expect(row.score).toBeCloseTo(expected, 12);
    }
  });

  it('breaks PageRank ties with symbol references', () => {
    const graph = graphOf(['a.js', 'b.js', 'c.js'], [], { symbolRefs: { 'c.js': 3, 'b.js': 1 } });

    expect(rankFiles(graph).map((row) => row.path)).toEqual(['c.js', 'b.js', 'a.js']);
  });

  it('lets custom weights switch a component off', () => {
    const graph = graphOf(['a.js', 'b.js'], [edge('b.js', 'a.js')], { counts: { 'b.js': 50 } });

    expect(rankFiles(graph)[0].path).toBe('a.js');
    expect(rankFiles(graph, { weights: { pagerank: 0, symbols: 0 } })[0].path).toBe('b.js');
  });
});
