/**
 * Git access for `ctxman pr`
 *
 * GitClient.exec() trims output and keeps execFileSync's 1 MB output limit, which a
 * pull-request diff or a batch of file contents easily exceeds, so this runner keeps the
 * same rules (argument arrays, no shell, refs checked with isValidGitRef) with a larger
 * buffer, raw (untrimmed) output and a batch reader for file contents.
 */

import { execFileSync } from 'child_process';
import { isValidGitRef } from '../integrations/git/GitClient.js';

const MAX_BUFFER = 1024 * 1024 * 1024;
// Paths in --name-status/--numstat/diff headers stay readable UTF-8 instead of octal escapes
const BASE_ARGS = ['-c', 'core.quotePath=false'];
const BINARY_SNIFF_BYTES = 8000;

export class PrGit {
  /**
   * @param {string} repoRoot - Top level of the work tree
   */
  constructor(repoRoot) {
    this.cwd = repoRoot;
  }

  /**
   * Find the top level of the work tree that contains `dir`
   * @param {string} dir
   * @returns {string|null} Absolute path, or null outside a git work tree
   */
  static findRepoRoot(dir) {
    try {
      const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return out.trim() || null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Run git with an argument list
   * @param {string[]} args - Arguments after `git`
   * @param {{input?: string, buffer?: boolean, allowFail?: boolean}} [options]
   * @returns {string|Buffer|null} Output; null when the command fails and allowFail is set
   */
  run(args, { input, buffer = false, allowFail = false } = {}) {
    try {
      const execOptions = { cwd: this.cwd, input, maxBuffer: MAX_BUFFER, stdio: 'pipe' };
      // Without an encoding execFileSync returns a Buffer
      if (!buffer) execOptions.encoding = 'utf8';
      return execFileSync('git', [...BASE_ARGS, ...args], execOptions);
    } catch (error) {
      if (allowFail) return null;
      const stderr = error.stderr ? error.stderr.toString().trim() : '';
      throw new Error(`git ${args[0]} failed: ${stderr || error.message}`);
    }
  }

  /**
   * Commit id of a user-supplied revision, or null when it does not name a commit
   * @param {string} ref - Already checked with isValidGitRef
   * @returns {string|null}
   */
  resolveCommit(ref) {
    if (!isValidGitRef(ref)) return null;
    const out = this.run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      allowFail: true,
    });
    return out ? out.trim() : null;
  }

  /**
   * Read several objects (`<rev>:<path>`, `:<path>` for the index) with two git processes:
   * sizes first, then the contents of those within the size limit
   * @param {string[]} specs - Object names
   * @param {{maxBytes?: number, maxTotalBytes?: number}} [options] - Per-object and overall
   *   size limits; objects past either count as too large
   * @returns {Array<{status: 'ok', text: string|null, size: number}|{status: 'missing'|'too-large'|'not-blob', size?: number}>}
   *   One entry per spec; `text` is null for binary content
   */
  readBlobs(specs, { maxBytes = Infinity, maxTotalBytes = Infinity } = {}) {
    const results = specs.map(() => ({ status: 'missing' }));
    // A newline would end the request line early, so such paths cannot be asked for
    const asked = specs
      .map((spec, index) => ({ spec, index }))
      .filter(({ spec }) => typeof spec === 'string' && spec && !/[\n\r]/.test(spec));
    if (asked.length === 0) return results;

    const check = this.run(['cat-file', '--batch-check'], {
      input: asked.map(({ spec }) => spec).join('\n') + '\n',
    }).split('\n');

    const wanted = [];
    let total = 0;
    asked.forEach(({ index }, k) => {
      const match = /^([0-9a-f]{40,64}) (\S+) (\d+)$/.exec(check[k] || '');
      if (!match) return; // "<spec> missing" / "ambiguous"
      const [, oid, type, sizeText] = match;
      const size = Number(sizeText);
      if (type !== 'blob') results[index] = { status: 'not-blob' };
      else if (size > maxBytes || total + size > maxTotalBytes) {
        results[index] = { status: 'too-large', size };
      } else {
        total += size;
        wanted.push({ index, oid, size });
      }
    });
    if (wanted.length === 0) return results;

    const out = this.run(['cat-file', '--batch'], {
      input: wanted.map(({ oid }) => oid).join('\n') + '\n',
      buffer: true,
    });
    let pos = 0;
    for (const { index, size } of wanted) {
      const headerEnd = out.indexOf(0x0a, pos);
      if (headerEnd === -1) break;
      const header = out.toString('utf8', pos, headerEnd);
      const match = /^[0-9a-f]+ blob (\d+)$/.exec(header);
      if (!match) {
        pos = headerEnd + 1;
        continue;
      }
      const length = Number(match[1]);
      const content = out.subarray(headerEnd + 1, headerEnd + 1 + length);
      pos = headerEnd + 1 + length + 1; // content is followed by a newline
      results[index] = { status: 'ok', text: bufferToText(content), size };
    }
    return results;
  }
}

/**
 * Decode file content, or null when it looks binary (a NUL byte near the start, as git
 * decides)
 * @param {Buffer} buffer
 * @returns {string|null}
 */
export function bufferToText(buffer) {
  const sniff = buffer.subarray(0, BINARY_SNIFF_BYTES);
  if (sniff.includes(0)) return null;
  return buffer.toString('utf8');
}

export default PrGit;
