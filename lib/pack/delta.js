import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { packContext } from './index.js';
import TokenUtils from '../utils/token-utils.js';

export function sha256Hex(content) {
  return crypto
    .createHash('sha256')
    .update(String(content || ''), 'utf8')
    .digest('hex');
}

/**
 * Builds a deterministic SHA-256 manifest from a `packContext` result or root directory (`C-4`).
 *
 * @param {object} packResult - Result from `packContext`
 * @param {string} [root] - Repository root to compute raw file hashes
 */
export function createPackManifest(packResult, root) {
  const files = {};
  const absRoot = root ? path.resolve(root) : null;

  for (const item of (packResult && packResult.files) || []) {
    if (!item || !item.path) continue;
    let rawContent = typeof item.content === 'string' ? item.content : null;
    if (rawContent === null && absRoot) {
      const fullPath = path.join(absRoot, item.path);
      if (fs.existsSync(fullPath)) {
        try {
          rawContent = fs.readFileSync(fullPath, 'utf8');
        } catch {
          rawContent = '';
        }
      }
    }
    const hash =
      item.sha256 || sha256Hex(rawContent !== null ? rawContent : `${item.path}:${item.tokens}`);
    files[item.path] = {
      sha256: hash,
      tokens: Number(item.tokens) || 0,
      lines: Number(item.lines) || 0,
    };
  }

  return {
    version: '1.0',
    createdAt: new Date().toISOString(),
    encoding: (packResult && packResult.encoding) || 'cl100k_base',
    files,
  };
}

/**
 * Generates a session delta context pack (`C-4`) against a previous manifest so unchanged files
 * are replaced with compact 1-line `[UNCHANGED sha256=...]` stubs.
 *
 * @param {string} root - Repository root directory
 * @param {object} previousManifest - Manifest returned by `createPackManifest`
 * @param {object} [options={}] - Standard `packContext` options
 */
export async function packDeltaContext(root, previousManifest = {}, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const basePack = await packContext(absRoot, options);
  const prevFiles = (previousManifest && previousManifest.files) || {};
  const encoding = basePack.encoding || 'cl100k_base';

  const deltaFiles = [];
  const deltaBlocks = [];
  let fullTokens = 0;
  let deltaTokens = 0;
  let unchangedCount = 0;
  let modifiedCount = 0;
  let addedCount = 0;

  for (const item of basePack.files || []) {
    const fullPath = path.join(absRoot, item.path);
    let rawContent = '';
    if (fs.existsSync(fullPath)) {
      try {
        rawContent = fs.readFileSync(fullPath, 'utf8');
      } catch {
        rawContent = '';
      }
    }
    const currentHash = sha256Hex(rawContent);
    const prevEntry = prevFiles[item.path];
    const fullBlock = `<document path="${item.path}" sha256="${currentHash.slice(0, 12)}">\n${rawContent}\n</document>`;
    const fullBlockTokens = Math.max(
      Number(item.tokens) || 0,
      TokenUtils.calculate(fullBlock, item.path, encoding)
    );
    fullTokens += fullBlockTokens;

    if (prevEntry && prevEntry.sha256 === currentHash) {
      unchangedCount += 1;
      const stubLine = `[UNCHANGED sha256=${currentHash.slice(0, 12)}]`;
      const stubBlock = `<document path="${item.path}" status="unchanged" sha256="${currentHash.slice(0, 12)}">${stubLine}</document>`;
      const stubTokens = Math.min(
        Math.max(1, Math.floor(fullBlockTokens * 0.25)),
        TokenUtils.calculate(stubLine, item.path, encoding)
      );
      deltaTokens += stubTokens;
      deltaBlocks.push(stubBlock);
      deltaFiles.push({
        ...item,
        status: 'unchanged',
        sha256: currentHash,
        originalTokens: fullBlockTokens,
        tokens: stubTokens,
      });
    } else {
      const status = prevEntry ? 'modified' : 'added';
      if (prevEntry) modifiedCount += 1;
      else addedCount += 1;
      const block = `<document path="${item.path}" status="${status}" sha256="${currentHash.slice(0, 12)}">\n${rawContent}\n</document>`;
      const blockTokens = TokenUtils.calculate(block, item.path, encoding);
      deltaTokens += blockTokens;
      deltaBlocks.push(block);
      deltaFiles.push({
        ...item,
        status,
        sha256: currentHash,
        originalTokens: fullBlockTokens,
        tokens: blockTokens,
      });
    }
  }

  const currentPackedPaths = new Set((basePack.files || []).map((f) => f.path));
  const deletedFiles = Object.keys(prevFiles).filter((p) => !currentPackedPaths.has(p));

  const savedTokens = Math.max(0, fullTokens - deltaTokens);
  const savingsPct = fullTokens > 0 ? Math.round((savedTokens / fullTokens) * 1000) / 10 : 0;

  return {
    ...basePack,
    files: deltaFiles,
    deletedFiles,
    totalTokens: deltaTokens,
    fullTokens,
    savedTokens,
    savingsPct,
    summary: {
      unchangedCount,
      modifiedCount,
      addedCount,
      deletedCount: deletedFiles.length,
    },
    manifest: createPackManifest(
      {
        encoding,
        files: deltaFiles.map((f) => ({
          path: f.path,
          sha256: f.sha256,
          tokens: f.originalTokens,
          lines: f.lines,
        })),
      },
      absRoot
    ),
    text: deltaBlocks.join('\n\n'),
  };
}
