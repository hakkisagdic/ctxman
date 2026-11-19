import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIGEST_ID_REGEX, DigestError, validateDigestId, assertInsideStore } from './gate.js';

/**
 * Split text into lines, dropping the trailing empty segment after a final newline.
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  if (!text) return [];
  const raw = text.split(/\r?\n/);
  if (raw.length > 0 && raw[raw.length - 1] === '') {
    raw.pop();
  }
  return raw;
}

/**
 * Resolve the digest store directory in precedence order:
 * explicit storeDir -> env.CTXMAN_DIGEST_DIR -> ~/.ctxman/digests.
 * @param {Object|string} [options={}]
 * @returns {string}
 */
export function resolveStoreDir(options = {}) {
  const opts = typeof options === 'string' ? { storeDir: options } : options || {};
  const { storeDir, env = process.env } = opts;

  if (typeof storeDir === 'string' && storeDir.trim() !== '') {
    return path.resolve(storeDir.trim());
  }
  if (typeof env?.CTXMAN_DIGEST_DIR === 'string' && env.CTXMAN_DIGEST_DIR.trim() !== '') {
    return path.resolve(env.CTXMAN_DIGEST_DIR.trim());
  }
  return path.join(os.homedir(), '.ctxman', 'digests');
}

/**
 * Ensure the digest store directory exists with 0700 permissions.
 * @param {Object|string} [options={}]
 * @returns {string}
 */
export function ensureStore(options = {}) {
  const dir = resolveStoreDir(options);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  return dir;
}

/**
 * Compute the store file path for a validated digest identifier.
 * @param {string} id
 * @param {Object|string} [options={}]
 * @returns {string}
 */
export function digestPath(id, options = {}) {
  validateDigestId(id);
  return path.join(resolveStoreDir(options), `${id}.md`);
}

/**
 * Persist verbatim digest text to `<store>/<id>.md` with 0600 permissions.
 * @param {string} id
 * @param {string} text
 * @param {Object|string} [options={}]
 * @returns {{ id: string, path: string, bytes: number, lines: number }}
 */
export function writeDigest(id, text, options = {}) {
  const opts = typeof options === 'string' ? { storeDir: options } : options || {};
  validateDigestId(id);

  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new DigestError('Digest content cannot be empty', 'EMPTY_CONTENT');
  }

  const dir = ensureStore(opts);
  const filePath = path.join(dir, `${id}.md`);
  const existing = fs.lstatSync(filePath, { throwIfNoEntry: false });

  if (existing?.isSymbolicLink()) {
    throw new DigestError('Refusing to write through symbolic link', 'OUTSIDE_STORE');
  }
  if (existing && !opts.force) {
    throw new DigestError(
      `Digest "${id}" already exists (use --force to overwrite)`,
      'ALREADY_EXISTS'
    );
  }

  assertInsideStore(filePath, dir);

  try {
    fs.writeFileSync(filePath, text, {
      encoding: 'utf8',
      mode: 0o600,
      flag: opts.force ? 'w' : 'wx',
    });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new DigestError(
        `Digest "${id}" already exists (use --force to overwrite)`,
        'ALREADY_EXISTS'
      );
    }
    throw error;
  }

  fs.chmodSync(filePath, 0o600);

  return {
    id,
    path: filePath,
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: splitLines(text).length,
  };
}

/**
 * Resolve a digest id or path inside the store and verify containment.
 * @param {string} refOrId
 * @param {Object|string} [options={}]
 * @returns {string}
 */
export function resolveDigestRef(refOrId, options = {}) {
  if (typeof refOrId !== 'string' || refOrId.trim() === '') {
    throw new DigestError('Digest reference must be a non-empty id or path', 'INVALID_REF');
  }

  if (refOrId.split(/[\\/]/).includes('..')) {
    throw new DigestError(`Path traversal ("..") is not allowed: ${refOrId}`, 'OUTSIDE_STORE');
  }

  const dir = resolveStoreDir(options);
  let candidate;

  if (refOrId.includes('/') || refOrId.includes('\\') || path.isAbsolute(refOrId)) {
    candidate = path.resolve(refOrId);
  } else if (refOrId.endsWith('.md')) {
    const stem = refOrId.slice(0, -3);
    validateDigestId(stem);
    const doubleMd =
      DIGEST_ID_REGEX.test(refOrId) && !refOrId.includes('..')
        ? path.join(dir, `${refOrId}.md`)
        : null;
    const doubleMdExists = doubleMd && Boolean(fs.lstatSync(doubleMd, { throwIfNoEntry: false }));
    candidate = doubleMdExists ? doubleMd : path.join(dir, refOrId);
  } else {
    validateDigestId(refOrId);
    candidate = path.join(dir, `${refOrId}.md`);
  }

  const realTarget = assertInsideStore(candidate, dir);
  const stat = fs.statSync(realTarget, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) {
    throw new DigestError(`Digest not found: ${refOrId}`, 'NOT_FOUND');
  }

  return realTarget;
}

/**
 * List stored digests in the configured digest store directory.
 * @param {Object|string} [options={}]
 * @returns {Array<{ id: string, path: string, lines: number, bytes: number, updatedAt: string }>}
 */
export function listDigests(options = {}) {
  const dir = resolveStoreDir(options);
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const digests = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name.startsWith('.')) {
      continue;
    }
    const filePath = path.join(dir, entry.name);
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    digests.push({
      id: entry.name.slice(0, -3),
      path: filePath,
      lines: splitLines(content).length,
      bytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
    });
  }

  digests.sort((a, b) => a.id.localeCompare(b.id));
  return digests;
}
