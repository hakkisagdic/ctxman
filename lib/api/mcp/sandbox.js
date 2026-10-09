/**
 * Path checks for MCP tool and prompt arguments.
 *
 * Every `path` a client passes must name an existing directory. When the server runs with a
 * root (`ctxman mcp --root <dir>` or CTXMAN_MCP_ROOT), the path must also lie inside that
 * root once symlinks are resolved, and relative paths are taken relative to the root.
 */

import fs from 'fs';
import path from 'path';

/**
 * Resolve the sandbox root to its real path
 * @param {string} root - Directory given with --root or CTXMAN_MCP_ROOT
 * @returns {string} Absolute real path of the directory
 * @throws {Error} When the directory does not exist
 */
export function resolveRootDir(root) {
  const resolved = path.resolve(root);
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) {
    throw new Error(`MCP root is not an existing directory: ${resolved}`);
  }
  return fs.realpathSync(resolved);
}

/**
 * Whether `target` is `root` itself or lies below it (both absolute and already resolved)
 * @param {string} root
 * @param {string} target
 * @returns {boolean}
 */
export function isInsideRoot(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

/**
 * Check a client-supplied path.
 *
 * Without a root the value is returned as given, so tools behave as before; it only has to
 * exist. With a root, a missing value means the root itself, and the real path is returned.
 *
 * @param {string|undefined} value - The `path` (or `projectPath`, `filePath`) argument
 * @param {Object} [options]
 * @param {string|null} [options.root] - Real path of the sandbox root, if any
 * @param {'directory'|'file'|'any'} [options.expect='directory'] - What the path must name
 * @param {string} [options.name='path'] - Argument name, for error messages
 * @returns {string} Path to hand to the tool
 * @throws {Error} When the path is missing, has the wrong type or lies outside the root
 */
export function resolveSandboxPath(
  value,
  { root = null, expect = 'directory', name = 'path' } = {}
) {
  if (value === undefined || value === null || value === '') {
    if (root && expect !== 'file') return root;
    throw new Error(`Missing required argument: ${name}`);
  }
  if (typeof value !== 'string') {
    throw new Error(`Argument "${name}" must be a string`);
  }

  const candidate = root ? path.resolve(root, value) : path.resolve(value);
  const stat = fs.statSync(candidate, { throwIfNoEntry: false });
  if (!stat) {
    throw new Error(`${name} does not exist: ${value}`);
  }
  if (expect === 'directory' && !stat.isDirectory()) {
    throw new Error(`${name} is not a directory: ${value}`);
  }
  if (expect === 'file' && !stat.isFile()) {
    throw new Error(`${name} is not a file: ${value}`);
  }
  if (expect === 'any' && !stat.isDirectory() && !stat.isFile()) {
    throw new Error(`${name} is neither a file nor a directory: ${value}`);
  }

  if (!root) return value;

  const real = fs.realpathSync(candidate);
  if (!isInsideRoot(root, real)) {
    throw new Error(`${name} is outside the MCP root ${root}: ${value}`);
  }
  return real;
}
