import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { redactSecrets } from '../utils/secret-redactor.js';

export const DEFAULT_ANALYZER_DB_REL = path.join('.plansmith', 'analyzer.sqlite');

/**
 * Resolves the path to the analyzer SQLite database.
 * @param {string} rootOrDbPath
 * @returns {string|null} Absolute path to analyzer.sqlite, or null if not found
 */
export function resolveAnalyzerDbPath(rootOrDbPath) {
  if (!rootOrDbPath) return null;
  const p = path.resolve(rootOrDbPath);
  if (p.endsWith('.sqlite') || p.endsWith('.db')) {
    return fs.existsSync(p) ? p : null;
  }
  const candidate = path.join(p, DEFAULT_ANALYZER_DB_REL);
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Extracts a concise snippet from the document body centered around the match term.
 */
function extractSnippet(body, term, maxChars = 240) {
  if (!body) return '';
  if (!term) return body.slice(0, maxChars);

  const idx = body.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) {
    return body.slice(0, maxChars).trim();
  }

  const start = Math.max(0, idx - 60);
  const end = Math.min(body.length, idx + term.length + 140);
  let snippet = body.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snippet = `...${snippet}`;
  if (end < body.length) snippet = `${snippet}...`;
  return snippet;
}

/**
 * Query @plansmithai/analyzer's SQLite documents table for matching institutional citations
 * (commits, PRs, issues, Slack, Linear, Jira, incidents, architectural docs).
 *
 * @param {string} rootOrDbPath - Path to analyzer.sqlite or project root directory
 * @param {Object} [options]
 * @param {string} [options.file] - Target file relative path
 * @param {string} [options.symbol] - Target symbol name
 * @param {string[]} [options.commits] - Commit SHAs from history
 * @param {number} [options.limit=10] - Max citations to return
 * @param {boolean} [options.redact=true] - Redact secrets
 * @returns {Array<{
 *   id: string,
 *   kind: string,
 *   title: string,
 *   snippet: string,
 *   url: string|null,
 *   author: string|null,
 *   timestamp: string|null,
 *   refs: string[],
 *   score: number
 * }>}
 */
export function queryAnalyzerCitations(rootOrDbPath, options = {}) {
  const dbPath = resolveAnalyzerDbPath(rootOrDbPath);
  if (!dbPath) return [];

  const file = options.file ? String(options.file).trim() : null;
  const symbol = options.symbol ? String(options.symbol).trim() : null;
  const commits = Array.isArray(options.commits) ? options.commits : [];
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 10;
  const redact = options.redact !== false;

  let db = null;
  try {
    db = new DatabaseSync(dbPath, { open: true, readOnly: true });

    // Check if documents table exists
    const tableCheck = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'")
      .get();
    if (!tableCheck) {
      db.close();
      return [];
    }

    const rows = db
      .prepare('SELECT id, kind, title, body, path, url, author, timestamp, refs FROM documents')
      .all();
    const scored = [];

    const fileBase = file ? path.basename(file) : null;
    const searchTerms = [file, fileBase, symbol, ...commits].filter(Boolean);

    for (const r of rows) {
      let score = 0;
      let matchedTerm = null;

      const rPath = r.path ? String(r.path) : '';
      const rTitle = r.title ? String(r.title) : '';
      const rBody = r.body ? String(r.body) : '';
      const rRefs = r.refs ? String(r.refs) : '';

      // Check path match
      if (
        file &&
        (rPath === file ||
          rPath.endsWith(`/${file}`) ||
          (fileBase && rPath.endsWith(`/${fileBase}`)))
      ) {
        score = Math.max(score, 1.0);
        matchedTerm = file;
      }

      // Check refs match
      for (const c of commits) {
        if (c && rRefs.includes(c)) {
          score = Math.max(score, 0.95);
          matchedTerm = c;
          break;
        }
      }

      if (file && rRefs.includes(file)) {
        score = Math.max(score, 0.9);
        matchedTerm = file;
      }

      // Check symbol match
      if (symbol) {
        if (rTitle.includes(symbol)) {
          score = Math.max(score, 0.85);
          matchedTerm = symbol;
        } else if (rBody.includes(symbol)) {
          score = Math.max(score, 0.7);
          matchedTerm = symbol;
        }
      }

      // Check general text search
      if (score === 0) {
        for (const term of searchTerms) {
          if (rTitle.toLowerCase().includes(term.toLowerCase())) {
            score = Math.max(score, 0.6);
            matchedTerm = term;
            break;
          }
          if (rBody.toLowerCase().includes(term.toLowerCase())) {
            score = Math.max(score, 0.4);
            matchedTerm = term;
            break;
          }
        }
      }

      if (score > 0) {
        let title = rTitle;
        let snippet = extractSnippet(rBody, matchedTerm);

        if (redact) {
          title = redactSecrets(title).text;
          snippet = redactSecrets(snippet).text;
        }

        let parsedRefs = [];
        try {
          parsedRefs = JSON.parse(rRefs);
        } catch {
          parsedRefs = [];
        }

        scored.push({
          id: r.id,
          kind: r.kind,
          title,
          snippet,
          url: r.url ?? null,
          author: r.author ?? null,
          timestamp: r.timestamp ?? null,
          refs: parsedRefs,
          score,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  } catch (_err) {
    return [];
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore close errors
      }
    }
  }
}

export default queryAnalyzerCitations;
