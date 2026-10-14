/**
 * Export audit log
 *
 * One JSON object per line, appended for every export (and every export the policy
 * refused) while the policy enables `audit`. A record names the files and carries a
 * SHA-256 of the exported text, never the text itself.
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { relativePathOf, loadPolicy, DEFAULT_AUDIT_PATH } from './policy.js';

const { version: CTXMAN_VERSION } = createRequire(import.meta.url)('../../package.json');

const defaultWarn = (message) => console.warn(message);

/**
 * SHA-256 of exported text; several parts (digest chunks) hash as their concatenation
 * @param {string|Buffer|Array<string|Buffer>} text
 * @returns {string} Hex digest
 */
export function sha256(text) {
  const hash = crypto.createHash('sha256');
  for (const part of Array.isArray(text) ? text : [text]) hash.update(part);
  return hash.digest('hex');
}

/**
 * Commit checked out in `dir`, or null outside a git repository
 * @param {string} dir
 * @returns {string|null}
 */
export function getGitHead(dir) {
  try {
    if (!dir || !fs.statSync(dir).isDirectory()) return null;
    const head = execFileSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
    return /^[0-9a-f]{40,64}$/.test(head) ? head : null;
  } catch (_error) {
    return null;
  }
}

function currentUser() {
  try {
    return os.userInfo().username;
  } catch (_error) {
    // No passwd entry (some containers)
    return process.env.USER || process.env.USERNAME || 'unknown';
  }
}

function countRedactions(redactions) {
  if (typeof redactions === 'number') return redactions;
  if (redactions && typeof redactions === 'object') {
    return Object.values(redactions).reduce((sum, count) => sum + (Number(count) || 0), 0);
  }
  return 0;
}

/**
 * Build the audit record for an export event
 * @param {import('./policy.js').Policy} policy
 * @param {AuditEvent} event
 * @returns {object}
 */
export function buildAuditRecord(policy, event = {}) {
  const files = (event.files ?? []).map(relativePathOf);
  const tokens =
    typeof event.tokens === 'number'
      ? event.tokens
      : (event.files ?? []).reduce((sum, file) => sum + (Number(file?.tokens) || 0), 0);
  const refused = event.outcome === 'refused';
  const root = event.root ?? policy.root;

  let digest = null;
  if (!refused) {
    if (event.sha256) digest = event.sha256;
    else if (event.text !== undefined && event.text !== null) digest = sha256(event.text);
  }

  const record = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    outcome: refused ? 'refused' : 'exported',
    command: event.command ?? null,
    root,
    user: currentUser(),
    host: os.hostname(),
    gitHead: event.gitHead !== undefined ? event.gitHead : getGitHead(root),
    targetModel: event.targetModel ?? null,
    format: event.format ?? null,
    destination: event.destination ?? null,
    fileCount: files.length,
    totalTokens: tokens,
    redactions: countRedactions(event.redactions),
    removedByPolicy: event.removedByPolicy ?? 0,
    files,
    sha256: digest,
    ctxmanVersion: CTXMAN_VERSION,
  };
  if (Array.isArray(event.outputFiles) && event.outputFiles.length > 0) {
    record.outputFiles = event.outputFiles;
  }
  if (refused) {
    record.violations = (event.violations ?? []).map(({ rule, message }) => ({ rule, message }));
  }
  return record;
}

/**
 * @typedef {object} AuditEvent
 * @property {string} command - What exported, e.g. "cli --context-export", "mcp generate_context"
 * @property {string} [root] - Exported project (default: the policy root)
 * @property {string|null} [targetModel]
 * @property {string|null} [format] - Output format or style (json, toon, gitingest, xml, ...)
 * @property {string} destination - "stdout", "clipboard", "mcp", "rest" or a file path
 * @property {string[]} [outputFiles] - Every file written, when there are several (chunks)
 * @property {Array<string|{relativePath?: string, path?: string, tokens?: number}>} [files]
 * @property {number} [tokens] - Token total (default: sum of files[].tokens)
 * @property {number|Object<string, number>} [redactions] - Count, or counts per secret type
 * @property {number} [removedByPolicy] - Files dropped by the deny rules
 * @property {string|Buffer|Array<string|Buffer>} [text] - Exported text; only its hash is kept
 * @property {string} [sha256] - Precomputed hash instead of `text`
 * @property {string|null} [gitHead] - Override the commit (default: HEAD of `root`)
 * @property {'exported'|'refused'} [outcome]
 * @property {Array<{rule: string, message: string}>} [violations] - For refused exports
 */

/**
 * Append an export event to the policy's audit log(s). Does nothing unless the policy
 * enables `audit`. Never throws: a log that cannot be written produces a warning.
 * @param {import('./policy.js').Policy} policy - From loadPolicy()
 * @param {AuditEvent} event
 * @param {object} [options]
 * @param {(message: string) => void} [options.warn=console.warn]
 * @returns {object|null} The record written, or null when auditing is off
 */
export function recordExport(policy, event = {}, { warn = defaultWarn } = {}) {
  if (!policy?.audit?.enabled) return null;

  let record;
  try {
    record = buildAuditRecord(policy, event);
  } catch (error) {
    warn(`⚠️  Could not build the ctxman audit record: ${error.message}`);
    return null;
  }

  const line = `${JSON.stringify(record)}\n`;
  for (const file of policy.audit.paths) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, line, { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      warn(`⚠️  Could not write the ctxman audit log ${file}: ${error.message}`);
    }
  }
  return record;
}

/**
 * The audit logs of a project's policy, or the default location when the policy names none
 * @param {string} root - Project root
 * @param {Object} [options]
 * @param {object} [options.env=process.env] - Environment for loading the policy
 * @returns {{files: string[], error: Error|null}} `error` when the policy could not be
 *   loaded (the default location is returned then)
 */
export function auditLogFiles(root, { env = process.env } = {}) {
  try {
    const policy = loadPolicy(root, { env });
    if (policy.audit.paths.length > 0) return { files: policy.audit.paths, error: null };
    return { files: [path.join(root, DEFAULT_AUDIT_PATH)], error: null };
  } catch (error) {
    return { files: [path.join(root, DEFAULT_AUDIT_PATH)], error };
  }
}

/**
 * Read audit logs. Lines that are not JSON objects are skipped and counted; events that
 * appear in several logs (organisation and project) are listed once.
 * @param {string[]} files
 * @returns {{events: object[], skipped: number, missing: string[]}} Events oldest first
 */
export function readAuditLog(files) {
  const events = [];
  const seen = new Set();
  const missing = [];
  let skipped = 0;

  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (_error) {
      missing.push(file);
      continue;
    }

    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch (_error) {
        skipped++;
        continue;
      }
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        skipped++;
        continue;
      }
      if (event.id && seen.has(event.id)) continue;
      if (event.id) seen.add(event.id);
      events.push(event);
    }
  }

  events.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  return { events, skipped, missing };
}

/**
 * Parse a --since value: a date ("2026-10-01", ISO timestamp) or an age ("30m", "12h",
 * "7d", "2w")
 * @param {string} value
 * @param {Date} [now]
 * @returns {Date}
 * @throws {Error} For anything else
 */
export function parseSince(value, now = new Date()) {
  const relative = /^(\d+)\s*([mhdw])$/i.exec(String(value).trim());
  if (relative) {
    const unit = { m: 60e3, h: 3600e3, d: 86400e3, w: 7 * 86400e3 }[relative[2].toLowerCase()];
    return new Date(now.getTime() - Number(relative[1]) * unit);
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new Error(
      `Invalid --since value ${JSON.stringify(value)}: use a date (2026-10-01) or an age (7d, 12h)`
    );
  }
  return new Date(time);
}

/**
 * Keep events at or after `since`, then the last `limit` of them
 * @param {object[]} events - Oldest first
 * @param {{since?: Date|null, limit?: number|null}} [options]
 * @returns {object[]}
 */
export function filterAuditEvents(events, { since = null, limit = null } = {}) {
  let result = events;
  if (since) {
    result = result.filter((event) => Date.parse(event.timestamp) >= since.getTime());
  }
  if (limit && limit > 0 && result.length > limit) result = result.slice(-limit);
  return result;
}

const fit = (value, width, { keepEnd = false } = {}) => {
  const text = value === null || value === undefined || value === '' ? '-' : String(value);
  if (text.length <= width) return text.padEnd(width);
  return keepEnd ? `…${text.slice(-(width - 1))}` : `${text.slice(0, width - 1)}…`;
};

// A file destination inside the exported project is shown relative to it
const destinationOf = (event) => {
  const destination = event.destination;
  if (typeof destination !== 'string' || typeof event.root !== 'string') return destination;
  const relative = path.relative(event.root, destination);
  return path.isAbsolute(destination) && relative && !relative.startsWith('..')
    ? relative
    : destination;
};

/**
 * Render events as a fixed-width table
 * @param {object[]} events
 * @returns {string}
 */
export function formatAuditTable(events) {
  const columns = [
    ['TIME (UTC)', 20, (e) => String(e.timestamp ?? '').replace(/\.\d+Z$/, 'Z')],
    ['RESULT', 8, (e) => e.outcome],
    ['USER', 12, (e) => e.user],
    ['COMMAND', 26, (e) => e.command],
    ['DESTINATION', 28, destinationOf, { keepEnd: true }],
    ['MODEL', 16, (e) => e.targetModel],
    ['FILES', 6, (e) => e.fileCount],
    ['TOKENS', 10, (e) => (typeof e.totalTokens === 'number' ? e.totalTokens : null)],
    ['REDACT', 6, (e) => e.redactions],
    ['SHA256', 12, (e) => (e.sha256 ? e.sha256.slice(0, 12) : null)],
  ];

  const header = columns.map(([title, width]) => fit(title, width)).join(' ');
  const rows = events.map((event) =>
    columns.map(([, width, get, options]) => fit(get(event), width, options)).join(' ')
  );
  return [header, '-'.repeat(header.length), ...rows].map((line) => line.trimEnd()).join('\n');
}

export default { recordExport, readAuditLog, formatAuditTable, sha256 };
