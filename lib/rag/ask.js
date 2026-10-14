/**
 * Semantic search over a project (`ctxman ask` and the MCP `ask_codebase` tool): an
 * embedding index under .ctxman/self-knowledge, built on first use, then the snippets
 * closest to the question. Needs the optional @xenova/transformers and @lancedb/lancedb
 * packages; the embedding model is downloaded on first use.
 *
 * Files left out by .gitignore, .contextignore, .contextinclude or the export policy are
 * not indexed, and results from an older index are checked against the policy again.
 */

import fs from 'fs/promises';
import path from 'path';
import { Scanner } from '../core/Scanner.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import { VectorStoreFactory } from './VectorStoreFactory.js';
import { TransformersEmbeddingProvider } from './EmbeddingProvider.js';
import { Indexer } from './Indexer.js';
import { FileDataSource } from './sources/FileDataSource.js';

export const ASK_STORE_DIR = path.join('.ctxman', 'self-knowledge');
export const DEFAULT_ASK_LIMIT = 5;

const INCLUDE = ['.js', '.md', '.ts', '.json'];
const EXCLUDE = ['node_modules', '.git', 'dist', 'coverage', '.ctxman'];
// Extra rows asked of the store, so results the policy removes still leave `limit`
const OVERFETCH = 10;

async function hasIndex(storePath) {
  try {
    return (await fs.readdir(storePath)).length > 0;
  } catch {
    return false;
  }
}

const toPosix = (p) => p.split(path.sep).join('/');

/**
 * @param {string} root - Project directory
 * @param {string} query - The question
 * @param {Object} [options]
 * @param {number} [options.limit=5] - Snippets to return
 * @param {boolean} [options.redact=true] - Redact secrets in the snippets
 * @param {number} [options.maxChars] - Cut each snippet to this many characters
 * @param {(event: 'indexing'|'indexed') => void} [options.onProgress]
 * @param {(storePath: string) => object} [options.createStore] - Vector store factory
 *   (tests); default: LanceDB with the local embedding model
 * @returns {Promise<{query: string, indexed: boolean, results: Array<{file: string,
 *   score: number|null, text: string, truncated: boolean}>, removedByPolicy: number,
 *   redactions: number}>}
 * @throws {Error} When the question is empty, the policy is invalid, the optional packages
 *   are missing or indexing fails
 */
export async function askCodebase(root, query, options = {}) {
  const question = typeof query === 'string' ? query.trim() : '';
  if (!question) throw new Error('A question is required');
  const limit =
    Number.isInteger(options.limit) && options.limit > 0 ? options.limit : DEFAULT_ASK_LIMIT;
  const projectRoot = path.resolve(root);
  const storePath = path.join(projectRoot, ASK_STORE_DIR);
  const onProgress = options.onProgress || (() => {});

  const scanner = new Scanner(projectRoot);
  // Load now: an invalid policy fails the command instead of being skipped
  scanner.getPolicy();
  const relative = (fullPath) => toPosix(path.relative(projectRoot, fullPath));
  const left = (fullPath) => {
    const rel = relative(fullPath);
    return rel.startsWith('../') || path.isAbsolute(rel);
  };

  const store = options.createStore
    ? options.createStore(storePath)
    : VectorStoreFactory.create('lancedb', new TransformersEmbeddingProvider(), {
        path: storePath,
      });

  let indexed = false;
  if (!(await hasIndex(storePath))) {
    onProgress('indexing');
    const indexer = new Indexer(store);
    indexer.registerSource(new FileDataSource());
    await indexer.index('local-files', {
      targetDir: projectRoot,
      include: INCLUDE,
      exclude: EXCLUDE,
      skip: (fullPath) =>
        scanner.shouldIgnore(path.relative(projectRoot, fullPath), fullPath) ||
        scanner.isDenied(relative(fullPath)),
    });
    indexed = true;
    onProgress('indexed');
  }

  const rows = await store.search(question, limit + OVERFETCH);
  const results = [];
  let removedByPolicy = 0;
  let redactions = 0;
  for (const row of rows) {
    const fullPath = row.metadata?.path;
    if (typeof fullPath !== 'string' || left(fullPath)) continue;
    const file = relative(fullPath);
    if (scanner.isDenied(file)) {
      removedByPolicy++;
      continue;
    }
    if (results.length === limit) continue;
    let text = String(row.text ?? '');
    if (options.redact !== false) {
      const redacted = redactSecrets(text);
      text = redacted.text;
      redactions += redacted.findings.length;
    }
    const truncated = Boolean(options.maxChars) && text.length > options.maxChars;
    if (truncated) text = text.slice(0, options.maxChars);
    results.push({ file, score: row.score ?? null, text, truncated });
  }

  return { query: question, indexed, results, removedByPolicy, redactions };
}

export default askCodebase;
