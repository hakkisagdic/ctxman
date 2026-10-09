/**
 * Symbol lookup: the full source of a named method, function or class.
 *
 * Names are matched exactly first, then ignoring case; when neither finds anything, similar
 * names are suggested. `Class.method` (also `Class::method`, `Class#method`) narrows the
 * lookup to methods of that class.
 */

import path from 'path';
import TokenUtils from '../utils/token-utils.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import { compareStrings, fitToTokenBudget, getProjectIndex, sliceLines } from './bm25.js';

export const DEFAULT_SYMBOL_LIMIT = 10;
export const DEFAULT_SYMBOL_MAX_TOKENS = 20000;
const MAX_SUGGESTIONS = 10;

/**
 * Name without an accessor prefix: `get value` -> `value`
 * @param {string} name
 * @returns {string}
 */
function bareName(name) {
  return name.replace(/^(?:get|set)\s+/, '');
}

/**
 * Edit distance between two strings, or `max + 1` once it is certain to exceed `max`
 * @param {string} a
 * @param {string} b
 * @param {number} [max=Infinity]
 * @returns {number}
 */
export function editDistance(a, b, max = Infinity) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * Split a qualified name: `Store.get`, `Store::get` and `Store#get` give
 * `{ parent: 'Store', name: 'get' }`
 * @param {string} query
 * @returns {{parent: string|null, name: string}}
 */
export function parseSymbolQuery(query) {
  const match = /^(.+?)(?:\.|::|#)([^.:#]+)$/.exec(query);
  return match ? { parent: match[1], name: match[2] } : { parent: null, name: query };
}

/**
 * Similar names for a query that matched nothing
 * @private
 */
function suggest(candidates, name) {
  const query = name.toLowerCase();
  const threshold = Math.max(2, Math.floor(query.length / 3));
  const best = new Map();
  for (const { entry, unit } of candidates) {
    const candidate = bareName(unit.name);
    const lower = candidate.toLowerCase();
    let distance = editDistance(lower, query, threshold);
    // `user` suggests `getUserName`: containment counts as close
    const shorter = Math.min(lower.length, query.length);
    if (shorter >= 3 && (lower.includes(query) || query.includes(lower))) {
      distance = Math.min(distance, 1);
    }
    if (distance > threshold || best.has(candidate)) continue;
    best.set(candidate, {
      name: unit.name,
      kind: unit.kind,
      ...(unit.parent ? { parent: unit.parent } : {}),
      file: entry.relativePath,
      startLine: unit.startLine,
      distance,
    });
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        Math.abs(a.name.length - query.length) - Math.abs(b.name.length - query.length) ||
        compareStrings(a.name, b.name)
    )
    .slice(0, MAX_SUGGESTIONS)
    .map(({ distance: _distance, ...rest }) => rest);
}

/**
 * Find the units named by a query
 * @param {Array<{entry: Object, unit: Object}>} candidates - Units with their file entries
 * @param {string} query - `name` or `Parent.name`
 * @returns {{match: 'exact'|'case-insensitive'|'none', found: Array, suggestions: Array}}
 */
export function lookupSymbols(candidates, query) {
  const { parent, name } = parseSymbolQuery(query);
  const tiers = [
    ['exact', (a, b) => a === b],
    ['case-insensitive', (a, b) => a.toLowerCase() === b.toLowerCase()],
  ];

  for (const [match, same] of tiers) {
    const named = (unitName, wanted) => same(unitName, wanted) || same(bareName(unitName), wanted);
    const found = candidates.filter(
      ({ unit }) =>
        named(unit.name, query) ||
        (parent !== null && unit.parent && same(unit.parent, parent) && named(unit.name, name))
    );
    if (found.length > 0) return { match, found, suggestions: [] };
  }
  return { match: 'none', found: [], suggestions: suggest(candidates, name) };
}

/**
 * Source of the methods, functions or classes with a given name in a project.
 *
 * @param {string} root - Project directory (files found with the Scanner, so the ignore
 *   rules apply)
 * @param {string} query - Symbol name, or `Class.method`
 * @param {Object} [options]
 * @param {string} [options.file] - Only this project-relative file
 * @param {number} [options.limit=10] - Maximum number of symbols returned with source
 * @param {number} [options.maxTokens=20000] - Token budget for the sources; sources past it
 *   are cut (`truncated: true`)
 * @param {boolean} [options.redact=true] - Redact secrets in the sources
 * @returns {{query: string, match: string, total: number, symbols: Array,
 *   suggestions?: Array}}
 * @throws {Error} When the query is empty or `file` is not a project file
 */
export function getSymbol(
  root,
  query,
  { file, limit = DEFAULT_SYMBOL_LIMIT, maxTokens = DEFAULT_SYMBOL_MAX_TOKENS, redact = true } = {}
) {
  const wanted = typeof query === 'string' ? query.trim() : '';
  if (!wanted) throw new Error('The symbol name is empty');

  const project = getProjectIndex(root);
  let entries = [...project.files.values()];
  if (file) {
    const target = path.normalize(file);
    entries = entries.filter((entry) => path.normalize(entry.relativePath) === target);
    if (entries.length === 0) throw new Error(`File not found in project: ${file}`);
  }

  const candidates = entries.flatMap((entry) => entry.units.map((unit) => ({ entry, unit })));
  const { match, found, suggestions } = lookupSymbols(candidates, wanted);

  let used = 0;
  const symbols = found.slice(0, Math.max(0, limit)).map(({ entry, unit }) => {
    const raw = sliceLines(entry.content, unit.startLine, unit.endLine);
    let source = redact ? redactSecrets(raw).text : raw;
    let tokens = TokenUtils.calculate(source, entry.path);
    const symbol = {
      name: unit.name,
      kind: unit.kind,
      ...(unit.parent ? { parent: unit.parent } : {}),
      file: entry.relativePath,
      startLine: unit.startLine,
      endLine: unit.endLine,
    };
    if (used + tokens > maxTokens) {
      source = fitToTokenBudget(source, maxTokens - used, entry.path);
      tokens = source ? TokenUtils.calculate(source, entry.path) : 0;
      symbol.truncated = true;
    }
    used += tokens;
    return { ...symbol, tokens, source };
  });

  return {
    query: wanted,
    match,
    total: found.length,
    symbols,
    ...(match === 'none' ? { suggestions } : {}),
  };
}
