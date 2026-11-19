import fs from 'node:fs';
import path from 'node:path';

export const DIGEST_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Error raised for invalid digest ids, missing files, or store boundary violations.
 */
export class DigestError extends Error {
  /**
   * @param {string} message
   * @param {string} [code='DIGEST_ERROR']
   */
  constructor(message, code = 'DIGEST_ERROR') {
    super(message);
    this.name = 'DigestError';
    this.code = code;
  }
}

/**
 * Validate a digest identifier against path traversal and character constraints.
 * @param {string} id
 * @returns {string}
 */
export function validateDigestId(id) {
  if (typeof id !== 'string' || id.length === 0 || id.includes('..') || !DIGEST_ID_REGEX.test(id)) {
    throw new DigestError(
      'Invalid digest id: must be 1-64 chars of [A-Za-z0-9._-] starting with an alphanumeric character and containing no ".."',
      'INVALID_ID'
    );
  }
  return id;
}

function realpathOrNearest(targetPath) {
  const abs = path.resolve(targetPath);
  const trailing = [];
  let current = abs;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return abs;
    }
    trailing.unshift(path.basename(current));
    current = parent;
  }
  const realBase = fs.realpathSync(current);
  return trailing.length > 0 ? path.join(realBase, ...trailing) : realBase;
}

/**
 * Assert that a resolved target path stays strictly inside the real digest store directory.
 * Rejects relative escapes, outside absolute paths, and symlinks pointing outside the store.
 * @param {string} resolved
 * @param {string} storeDir
 * @returns {string}
 */
export function assertInsideStore(resolved, storeDir) {
  if (typeof resolved !== 'string' || resolved.trim() === '') {
    throw new DigestError('Digest path must be a non-empty string', 'OUTSIDE_STORE');
  }
  if (typeof storeDir !== 'string' || storeDir.trim() === '') {
    throw new DigestError('Digest store directory must be a non-empty string', 'OUTSIDE_STORE');
  }

  const absResolved = path.resolve(resolved);
  const realStore = realpathOrNearest(storeDir);
  const lstat = fs.lstatSync(absResolved, { throwIfNoEntry: false });

  let realTarget;
  if (lstat?.isSymbolicLink()) {
    try {
      realTarget = fs.realpathSync(absResolved);
    } catch {
      throw new DigestError('Digest target is a broken symbolic link', 'OUTSIDE_STORE');
    }
  } else {
    realTarget = fs.existsSync(absResolved)
      ? fs.realpathSync(absResolved)
      : realpathOrNearest(absResolved);
  }

  const rel = path.relative(realStore, realTarget);
  const inside =
    rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);

  if (!inside) {
    throw new DigestError(`Path is outside digest store: ${resolved}`, 'OUTSIDE_STORE');
  }

  return realTarget;
}
