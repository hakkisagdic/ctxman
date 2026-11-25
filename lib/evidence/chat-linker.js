/**
 * Chat-to-code linker (`lib/evidence/chat-linker.js`)
 *
 * Links normalized chat evidence parts to real repository files, indexed code symbols,
 * verified git commits, and (weakly) nearby commit timestamps. Ambiguity always yields
 * no link.
 */

import { execFile as nodeExecFile } from 'node:child_process';
import path from 'node:path';
import { lookupSymbols, parseSymbolQuery } from '../search/symbols.js';

export const STRONG_LINK_TYPES = Object.freeze(['path', 'symbol', 'sha']);
export const WEAK_LINK_TYPES = Object.freeze(['time']);
export const TIME_WINDOW_MS = 24 * 60 * 60 * 1000;

const TYPE_ORDER = { path: 0, sha: 1, symbol: 2, time: 3 };
const DEFAULT_CAT_FILE_TIMEOUT_MS = 2000;

const URL_REGEX = /https?:\/\/[^\s"'<>)\]]+/gi;
const PATH_WITH_SEP_REGEX =
  /(?<![A-Za-z0-9_@.-])(\.?[\\/]?(?:[A-Za-z0-9._@-]+[\\/])+[A-Za-z0-9._@-]+)((?:#L\d+(?:-L?\d+)?)?(?::\d+(?:-\d+)?)?)/g;
const BARE_FILENAME_REGEX =
  /(?<![A-Za-z0-9_./\\-])([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)(?![A-Za-z0-9_./\\-])/g;
const QUALIFIED_SYMBOL_REGEX =
  /(?<![A-Za-z0-9_$])([A-Za-z_$][A-Za-z0-9_$]*(?:\.|::|#)[A-Za-z_$][A-Za-z0-9_$]*)(?![A-Za-z0-9_$])/g;
const BACKTICK_SYMBOL_REGEX = /`([A-Za-z_$][A-Za-z0-9_$]*)`/g;
const CALL_SYMBOL_REGEX = /(?<![A-Za-z0-9_$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
const BARE_IDENT_REGEX = /(?<![A-Za-z0-9_$])([A-Za-z_$][A-Za-z0-9_$]*)(?![A-Za-z0-9_$])/g;
const SHA_TOKEN_REGEX = /(?<![0-9a-fA-F_])([0-9a-f]{7,40})(?![0-9a-fA-F_])/g;

const COMMON_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'all',
  'also',
  'always',
  'among',
  'and',
  'another',
  'any',
  'are',
  'around',
  'async',
  'await',
  'back',
  'base',
  'been',
  'before',
  'being',
  'between',
  'both',
  'break',
  'build',
  'call',
  'case',
  'catch',
  'change',
  'check',
  'class',
  'clean',
  'code',
  'commit',
  'const',
  'continue',
  'copy',
  'could',
  'create',
  'data',
  'date',
  'debug',
  'default',
  'delete',
  'does',
  'done',
  'down',
  'each',
  'else',
  'empty',
  'enable',
  'error',
  'eval',
  'even',
  'every',
  'exist',
  'exists',
  'export',
  'false',
  'file',
  'files',
  'filter',
  'find',
  'first',
  'fixed',
  'for',
  'from',
  'function',
  'get',
  'git',
  'good',
  'great',
  'handle',
  'have',
  'help',
  'helper',
  'here',
  'high',
  'hour',
  'hours',
  'http',
  'import',
  'index',
  'info',
  'init',
  'input',
  'inside',
  'into',
  'item',
  'items',
  'just',
  'keep',
  'kind',
  'know',
  'last',
  'late',
  'left',
  'length',
  'less',
  'like',
  'line',
  'lines',
  'link',
  'links',
  'list',
  'load',
  'local',
  'logic',
  'long',
  'look',
  'main',
  'make',
  'many',
  'match',
  'maybe',
  'merge',
  'method',
  'more',
  'most',
  'move',
  'much',
  'must',
  'name',
  'need',
  'never',
  'next',
  'node',
  'none',
  'note',
  'notes',
  'null',
  'number',
  'object',
  'once',
  'only',
  'open',
  'order',
  'other',
  'output',
  'over',
  'part',
  'parts',
  'pass',
  'path',
  'paths',
  'plan',
  'point',
  'post',
  'print',
  'push',
  'query',
  'read',
  'real',
  'record',
  'reduce',
  'refs',
  'remove',
  'repo',
  'report',
  'reset',
  'result',
  'return',
  'right',
  'root',
  'route',
  'rule',
  'rules',
  'runs',
  'same',
  'save',
  'scan',
  'schema',
  'score',
  'search',
  'seen',
  'select',
  'send',
  'set',
  'setup',
  'shared',
  'short',
  'should',
  'show',
  'since',
  'size',
  'skip',
  'some',
  'sort',
  'source',
  'sources',
  'start',
  'state',
  'static',
  'status',
  'step',
  'still',
  'stop',
  'store',
  'string',
  'such',
  'super',
  'sure',
  'switch',
  'symbol',
  'sync',
  'system',
  'take',
  'target',
  'test',
  'tests',
  'text',
  'than',
  'that',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'throw',
  'time',
  'title',
  'today',
  'token',
  'tokens',
  'tool',
  'tools',
  'total',
  'true',
  'type',
  'types',
  'undefined',
  'unit',
  'units',
  'until',
  'update',
  'updated',
  'used',
  'user',
  'uses',
  'using',
  'value',
  'values',
  'void',
  'wait',
  'want',
  'watch',
  'well',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'whole',
  'will',
  'with',
  'within',
  'without',
  'work',
  'write',
  'year',
  'your',
  'zero',
]);

/**
 * Whether a link is a strong code link (`path`, `symbol`, or `sha`).
 * @param {object} link
 * @returns {boolean}
 */
export function isStrongLink(link) {
  return Boolean(link && STRONG_LINK_TYPES.includes(link.type));
}

/**
 * Whether a chat part has at least one strong link.
 * @param {object} part
 * @returns {boolean}
 */
export function hasStrongLink(part) {
  return Boolean(Array.isArray(part?.links) && part.links.some(isStrongLink));
}

/**
 * Whether a chat part has links and every link is weak (`time`).
 * @param {object} part
 * @returns {boolean}
 */
export function isTimeOnlyPart(part) {
  return Boolean(
    Array.isArray(part?.links) &&
    part.links.length > 0 &&
    part.links.every((link) => link.type === 'time')
  );
}

function normalizePosixPath(rawPath) {
  return String(rawPath ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function bareUnitName(name) {
  return String(name ?? '').replace(/^(?:get|set)\s+/, '');
}

function parseTimestampMs(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value > 1e9 && value < 1e11 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const ms = Date.parse(trimmed);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function buildFileIndex(filesInput) {
  const fileSet = new Set();
  if (filesInput) {
    const iterable = filesInput instanceof Map ? filesInput.keys() : filesInput;
    for (const item of iterable) {
      const raw = typeof item === 'string' ? item : (item?.relativePath ?? item?.path ?? '');
      const normalized = normalizePosixPath(raw);
      if (normalized) fileSet.add(normalized);
    }
  }

  const basenameCounts = new Map();
  const basenameTarget = new Map();
  for (const relPath of fileSet) {
    const base = path.posix.basename(relPath);
    if (!base) continue;
    basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1);
    if (!basenameTarget.has(base)) basenameTarget.set(base, relPath);
  }

  const uniqueBasenameToPath = new Map();
  for (const [base, count] of basenameCounts.entries()) {
    if (count === 1) {
      uniqueBasenameToPath.set(base, basenameTarget.get(base));
    }
  }

  return { fileSet, uniqueBasenameToPath };
}

function addSymbolBucket(buckets, key, candidate) {
  if (!key) return;
  let list = buckets.get(key);
  if (!list) {
    list = [];
    buckets.set(key, list);
  }
  list.push(candidate);
}

function normalizeSymbolCandidates(symbolsInput) {
  const candidates = [];
  if (!symbolsInput) return candidates;

  for (const item of symbolsInput) {
    if (!item) continue;
    if (typeof item === 'string') {
      const name = item.trim();
      if (name) {
        candidates.push({ entry: { relativePath: '' }, unit: { name } });
      }
      continue;
    }
    if (item.unit && typeof item.unit.name === 'string') {
      candidates.push(item);
      continue;
    }
    if (typeof item.name === 'string' && item.name.trim()) {
      candidates.push({
        entry: { relativePath: item.file ?? '' },
        unit: {
          name: item.name.trim(),
          ...(item.parent ? { parent: item.parent } : {}),
          ...(item.kind ? { kind: item.kind } : {}),
          ...(item.startLine !== undefined ? { startLine: item.startLine } : {}),
        },
      });
    }
  }
  return candidates;
}

function buildSymbolIndex(symbolsInput) {
  const candidates = normalizeSymbolCandidates(symbolsInput);
  const exactBuckets = new Map();

  for (const candidate of candidates) {
    const unitName = candidate.unit.name;
    const bare = bareUnitName(unitName);
    addSymbolBucket(exactBuckets, unitName, candidate);
    if (bare !== unitName) addSymbolBucket(exactBuckets, bare, candidate);

    if (candidate.unit.parent) {
      addSymbolBucket(exactBuckets, `${candidate.unit.parent}.${unitName}`, candidate);
      if (bare !== unitName) {
        addSymbolBucket(exactBuckets, `${candidate.unit.parent}.${bare}`, candidate);
      }
    }
  }

  return exactBuckets;
}

function matchExactSymbol(exactBuckets, query) {
  const { parent, name } = parseSymbolQuery(query);
  const lookupKey = parent !== null ? `${parent}.${name}` : query;
  const bucket = exactBuckets.get(lookupKey) ?? exactBuckets.get(query);
  if (!bucket || bucket.length === 0) return null;

  const { match, found } = lookupSymbols(bucket, query);
  if (match !== 'exact' || found.length === 0) return null;

  const firstUnit = found[0].unit;
  const canonicalName = bareUnitName(firstUnit.name);
  return parent !== null && firstUnit.parent
    ? `${firstUnit.parent}.${canonicalName}`
    : canonicalName;
}

function buildCommitIndex(commitsInput) {
  const commits = [];
  const byPrefix7 = new Map();
  if (!Array.isArray(commitsInput)) return { commits, byPrefix7 };

  for (const item of commitsInput) {
    if (!item) continue;
    const rawSha = typeof item === 'string' ? item : item.sha;
    const sha = typeof rawSha === 'string' ? rawSha.trim() : '';
    const shaLower = sha.toLowerCase();
    const shortSha =
      typeof item?.shortSha === 'string' && item.shortSha.trim()
        ? item.shortSha.trim().toLowerCase()
        : shaLower.slice(0, 7);
    const date = typeof item === 'object' ? (item.date ?? item.timestamp ?? null) : null;
    const dateMs = parseTimestampMs(date);

    const record = {
      sha: sha || shortSha,
      shaLower,
      shortSha,
      date: typeof date === 'string' ? date : null,
      dateMs,
    };
    commits.push(record);

    if (/^[0-9a-f]{7,40}$/.test(shaLower)) {
      const prefix = shaLower.slice(0, 7);
      let list = byPrefix7.get(prefix);
      if (!list) {
        list = [];
        byPrefix7.set(prefix, list);
      }
      list.push(record);
    }
  }

  return { commits, byPrefix7 };
}

function createDefaultGitCatFile(repoRoot, envOverride) {
  if (!repoRoot) return null;
  const effectiveEnv = {
    ...(envOverride ?? process.env),
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
  };

  return (sha) =>
    new Promise((resolve) => {
      nodeExecFile(
        'git',
        ['cat-file', '-e', `${sha}^{commit}`],
        {
          cwd: repoRoot,
          env: effectiveEnv,
          timeout: DEFAULT_CAT_FILE_TIMEOUT_MS,
          windowsHide: true,
        },
        (error) => {
          resolve(!error);
        }
      );
    });
}

function maskRange(chars, start, end) {
  for (let i = start; i < end; i += 1) {
    chars[i] = ' ';
  }
}

function extractPartText(part) {
  const pieces = [];
  if (typeof part?.title === 'string' && part.title.trim()) pieces.push(part.title);
  const body = part?.excerpt ?? part?.snippet ?? part?.text ?? '';
  if (typeof body === 'string' && body.trim()) pieces.push(body);
  return pieces.join('\n');
}

function addBestLink(linkMap, link) {
  const key = `${link.type}\0${link.value}`;
  const existing = linkMap.get(key);
  if (!existing || link.confidence > existing.confidence) {
    linkMap.set(key, link);
  }
}

function sortLinks(links) {
  return links.sort(
    (a, b) =>
      (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99) ||
      b.confidence - a.confidence ||
      (a.value < b.value ? -1 : a.value > b.value ? 1 : 0)
  );
}

/**
 * Link normalized chat evidence parts to repository files, indexed symbols, git commits,
 * and nearby commit timestamps.
 *
 * @param {Array<object>} parts
 * @param {object} [options]
 * @param {string} [options.repoRoot]
 * @param {Iterable<string>|Map<string, object>} [options.files]
 * @param {Array<object|string>} [options.symbols]
 * @param {Array<object|string>} [options.commits]
 * @param {(sha: string) => boolean|Promise<boolean>} [options.gitCatFile]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {Promise<Array<object>>}
 */
export async function linkChatToCode(parts, options = {}) {
  if (!Array.isArray(parts) || parts.length === 0) return [];

  const { fileSet, uniqueBasenameToPath } = buildFileIndex(options.files);
  const exactBuckets = buildSymbolIndex(options.symbols);
  const { commits, byPrefix7 } = buildCommitIndex(options.commits);

  const catFileFn =
    typeof options.gitCatFile === 'function'
      ? options.gitCatFile
      : createDefaultGitCatFile(options.repoRoot, options.env);
  const catFileCache = new Map();

  const verifyShaWithGit = async (token) => {
    if (!catFileFn) return false;
    if (catFileCache.has(token)) return catFileCache.get(token);
    let ok = false;
    try {
      ok = Boolean(await catFileFn(token));
    } catch {
      ok = false;
    }
    catFileCache.set(token, ok);
    return ok;
  };

  const results = [];

  for (const part of parts) {
    const rawText = extractPartText(part);
    const linkMap = new Map();

    if (rawText) {
      const maskedChars = Array.from(rawText);

      // Mask URLs first so host/path components inside URLs do not trigger file/symbol links.
      for (const match of rawText.matchAll(URL_REGEX)) {
        maskRange(maskedChars, match.index, match.index + match[0].length);
      }

      const urlSafeText = maskedChars.join('');

      // 1a. Path tokens containing `/` or `\`
      for (const match of urlSafeText.matchAll(PATH_WITH_SEP_REGEX)) {
        let rawPath = match[1];
        let normalized = normalizePosixPath(rawPath);
        if (normalized.endsWith('.') && !fileSet.has(normalized)) {
          rawPath = rawPath.slice(0, -1);
          normalized = normalized.slice(0, -1);
        }

        // Mask the path (and any #L / :line suffix) so basename/symbol passes ignore it.
        const fullMatchEnd = match.index + rawPath.length + (match[2]?.length ?? 0);
        maskRange(maskedChars, match.index, fullMatchEnd);

        if (normalized && fileSet.has(normalized)) {
          addBestLink(linkMap, { type: 'path', value: normalized, confidence: 1 });
        }
      }

      const pathMaskedText = maskedChars.join('');

      // 1b. Bare filenames (linked only when basename is unique in the repository)
      if (uniqueBasenameToPath.size > 0) {
        for (const match of pathMaskedText.matchAll(BARE_FILENAME_REGEX)) {
          const resolved = uniqueBasenameToPath.get(match[1]);
          if (resolved) {
            addBestLink(linkMap, { type: 'path', value: resolved, confidence: 0.85 });
            maskRange(maskedChars, match.index, match.index + match[0].length);
          }
        }
      }

      const symbolScanText = maskedChars.join('');

      // 2. Symbol links (exact matches against indexed units via lookupSymbols)
      if (exactBuckets.size > 0) {
        const symbolMaskedChars = Array.from(symbolScanText);

        for (const match of symbolScanText.matchAll(QUALIFIED_SYMBOL_REGEX)) {
          const matched = matchExactSymbol(exactBuckets, match[1]);
          if (matched) {
            addBestLink(linkMap, { type: 'symbol', value: matched, confidence: 0.95 });
            maskRange(symbolMaskedChars, match.index, match.index + match[0].length);
          }
        }

        const afterQualifiedText = symbolMaskedChars.join('');

        for (const match of afterQualifiedText.matchAll(BACKTICK_SYMBOL_REGEX)) {
          const token = match[1];
          if (token.length < 2) continue;
          const matched = matchExactSymbol(exactBuckets, token);
          if (matched) {
            addBestLink(linkMap, { type: 'symbol', value: matched, confidence: 0.9 });
            maskRange(symbolMaskedChars, match.index, match.index + match[0].length);
          }
        }

        for (const match of afterQualifiedText.matchAll(CALL_SYMBOL_REGEX)) {
          const token = match[1];
          if (token.length < 2) continue;
          const matched = matchExactSymbol(exactBuckets, token);
          if (matched) {
            addBestLink(linkMap, { type: 'symbol', value: matched, confidence: 0.9 });
            maskRange(symbolMaskedChars, match.index, match.index + token.length);
          }
        }

        const bareIdentText = symbolMaskedChars.join('');
        for (const match of bareIdentText.matchAll(BARE_IDENT_REGEX)) {
          const token = match[1];
          if (token.length < 3) continue;
          const isPlainLower = /^[a-z]+$/.test(token);
          if (isPlainLower && (token.length < 4 || COMMON_STOPWORDS.has(token))) continue;
          const matched = matchExactSymbol(exactBuckets, token);
          if (matched) {
            const isCodeShaped = /[a-z][A-Z]|[A-Z][a-z]|_|[0-9]|\$/.test(token);
            addBestLink(linkMap, {
              type: 'symbol',
              value: matched,
              confidence: isCodeShaped ? 0.85 : 0.8,
            });
          }
        }
      }

      // 3. Commit SHA links (commit list first, git cat-file -e fallback)
      for (const match of pathMaskedText.matchAll(SHA_TOKEN_REGEX)) {
        const token = match[1];
        const prefix7 = token.slice(0, 7);
        const candidates = byPrefix7.get(prefix7) ?? [];
        const prefixMatches = candidates.filter((c) => c.shaLower.startsWith(token));

        if (prefixMatches.length > 1) {
          continue;
        }
        if (prefixMatches.length === 1) {
          addBestLink(linkMap, {
            type: 'sha',
            value: prefixMatches[0].sha,
            confidence: token.length === 40 ? 1 : 0.95,
          });
          continue;
        }

        if (await verifyShaWithGit(token)) {
          addBestLink(linkMap, {
            type: 'sha',
            value: token,
            confidence: token.length === 40 ? 1 : 0.95,
          });
        }
      }
    }

    // 4. Time proximity (weak signal, <= 24 h of a commit touching the target)
    const partMs = parseTimestampMs(part?.timestamp ?? part?.updatedAt ?? part?.ts ?? null);
    if (partMs !== null && commits.length > 0) {
      let bestCommit = null;
      let bestDelta = Infinity;
      for (const commit of commits) {
        if (commit.dateMs === null) continue;
        const delta = Math.abs(partMs - commit.dateMs);
        if (delta <= TIME_WINDOW_MS && delta < bestDelta) {
          bestDelta = delta;
          bestCommit = commit;
        }
      }
      if (bestCommit) {
        const confidence = Number((0.4 - 0.2 * (bestDelta / TIME_WINDOW_MS)).toFixed(2));
        addBestLink(linkMap, {
          type: 'time',
          value: bestCommit.sha || bestCommit.shortSha || bestCommit.date || 'nearby-commit',
          confidence,
        });
      }
    }

    results.push({
      ...part,
      links: sortLinks([...linkMap.values()]),
    });
  }

  return results;
}

export default {
  STRONG_LINK_TYPES,
  WEAK_LINK_TYPES,
  TIME_WINDOW_MS,
  isStrongLink,
  hasStrongLink,
  isTimeOnlyPart,
  linkChatToCode,
};
