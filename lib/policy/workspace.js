/**
 * Multi-repository workspace policy inspection & audit log aggregation
 *
 * Unlike `resolveWorkspaceRepos()`, `resolvePolicyWorkspaceDirs()` does NOT abort on the
 * first invalid `.ctxman/policy.json` file so `ctxman policy check --repo ...` and MCP
 * `check_policy` / `audit_log` can inspect and report all repositories in one pass.
 */

import fs from 'fs';
import path from 'path';
import { loadPolicy, PolicyConfigError } from './policy.js';
import { auditLogFiles, readAuditLog, filterAuditEvents } from './audit.js';

function sanitizeAlias(raw) {
  const cleaned = String(raw || 'repo')
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/^\.+/, '');
  return cleaned || 'repo';
}

function buildWorkspaceInputs(primaryRoot, extraRepos = []) {
  const resolvedPrimary = path.resolve(primaryRoot || process.cwd());
  if (!Array.isArray(extraRepos) || extraRepos.length === 0) {
    return [resolvedPrimary];
  }
  const realPrimary = fs.existsSync(resolvedPrimary)
    ? fs.realpathSync(resolvedPrimary)
    : resolvedPrimary;
  const isContainerOfExtra = extraRepos.some((item) => {
    const raw = typeof item === 'string' ? item : item?.path;
    if (typeof raw !== 'string' || !raw.trim()) return false;
    const resolved = path.resolve(raw);
    const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
    return real !== realPrimary && real.startsWith(realPrimary + path.sep);
  });
  return isContainerOfExtra ? [...extraRepos] : [resolvedPrimary, ...extraRepos];
}

/**
 * Resolve, validate directory existence, deduplicate, and assign unique aliases without
 * failing on invalid policy files.
 *
 * @param {string} primaryRoot
 * @param {Array<string|{path: string, alias?: string}>} [extraRepos]
 * @returns {Array<{alias: string, root: string, realRoot: string}>}
 */
export function resolvePolicyWorkspaceDirs(primaryRoot, extraRepos = []) {
  const inputs = buildWorkspaceInputs(primaryRoot, extraRepos);
  const rawEntries = [];
  const seenRealRoots = new Set();

  for (const item of inputs) {
    const rawPath = typeof item === 'string' ? item : item?.path;
    const explicitAlias = typeof item === 'object' && item !== null ? item.alias : undefined;
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      throw new Error('Repository path must be a non-empty string');
    }
    const resolved = path.resolve(rawPath);
    if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Not a directory: ${rawPath}`);
    }
    const realRoot = fs.realpathSync(resolved);
    if (seenRealRoots.has(realRoot)) continue;
    seenRealRoots.add(realRoot);

    rawEntries.push({
      root: resolved,
      realRoot,
      explicitAlias: explicitAlias ? sanitizeAlias(explicitAlias) : null,
      baseName: sanitizeAlias(path.basename(resolved) || path.basename(realRoot) || 'repo'),
      parentName: sanitizeAlias(path.basename(path.dirname(resolved))),
    });
  }

  const baseCounts = new Map();
  for (const entry of rawEntries) {
    const candidate = entry.explicitAlias ?? entry.baseName;
    baseCounts.set(candidate, (baseCounts.get(candidate) ?? 0) + 1);
  }

  const usedAliases = new Set();
  return rawEntries.map((entry) => {
    let candidate = entry.explicitAlias ?? entry.baseName;
    if (!entry.explicitAlias && (baseCounts.get(candidate) ?? 0) > 1 && entry.parentName) {
      candidate = `${entry.parentName}-${entry.baseName}`;
    }
    let unique = candidate;
    let suffix = 2;
    while (usedAliases.has(unique)) {
      unique = `${candidate}-${suffix++}`;
    }
    usedAliases.add(unique);
    return {
      alias: unique,
      root: entry.root,
      realRoot: entry.realRoot,
    };
  });
}

/**
 * Validate and summarize export policies across a multi-repository workspace.
 *
 * @param {string} primaryRoot
 * @param {Array<string|{path: string, alias?: string}>} [extraRepos]
 * @param {object} [options]
 * @param {object} [options.env=process.env]
 * @returns {object}
 */
export function checkWorkspacePolicies(primaryRoot, extraRepos = [], { env = process.env } = {}) {
  const dirs = resolvePolicyWorkspaceDirs(primaryRoot, extraRepos);
  const repoResults = [];
  const validPolicies = [];

  for (const { alias, root } of dirs) {
    try {
      const policy = loadPolicy(root, { env });
      validPolicies.push({ alias, policy });
      repoResults.push({
        alias,
        valid: true,
        ...policy.toJSON(),
      });
    } catch (error) {
      if (!(error instanceof PolicyConfigError)) throw error;
      repoResults.push({
        alias,
        root,
        valid: false,
        file: error.file,
        errors: error.errors,
        message: error.message,
      });
    }
  }

  const valid = repoResults.every((r) => r.valid);
  const active = validPolicies.some(({ policy }) => policy.active);
  const requireRedaction = validPolicies.some(({ policy }) => policy.requireRedaction);
  const tokenLimits = validPolicies
    .map(({ policy }) => policy.maxExportTokens)
    .filter((n) => typeof n === 'number');
  const maxExportTokens = tokenLimits.length > 0 ? Math.min(...tokenLimits) : null;

  const modelRules = validPolicies.flatMap(({ alias, policy }) =>
    policy.modelRules.map(({ scope, file, patterns }) => ({
      repo: alias,
      scope,
      file,
      patterns,
    }))
  );
  const ignoreFiles = [...new Set(validPolicies.flatMap(({ policy }) => policy.ignoreFiles))];

  return {
    valid,
    active,
    requireRedaction,
    maxExportTokens,
    allowedTargetModels: modelRules.length > 0 ? modelRules : null,
    ignoreFiles,
    repos: repoResults,
  };
}

/**
 * Read, tag with `repo`, deduplicate, and chronologically merge export audit logs across
 * a multi-repository workspace.
 *
 * @param {string} primaryRoot
 * @param {Array<string|{path: string, alias?: string}>} [extraRepos]
 * @param {object} [options]
 * @param {Date|null} [options.since=null]
 * @param {number|null} [options.limit=null]
 * @param {object} [options.env=process.env]
 * @returns {object}
 */
export function readWorkspaceAuditLogs(
  primaryRoot,
  extraRepos = [],
  { since = null, limit = null, env = process.env } = {}
) {
  const dirs = resolvePolicyWorkspaceDirs(primaryRoot, extraRepos);
  const aliasByRoot = new Map();
  for (const dir of dirs) {
    aliasByRoot.set(dir.root, dir.alias);
    aliasByRoot.set(dir.realRoot, dir.alias);
  }

  const seenEventIds = new Set();
  const seenFiles = new Set();
  const allFiles = [];
  const existingFiles = [];
  const missingFiles = [];
  const policyErrors = [];
  const mergedEvents = [];
  let skippedLines = 0;

  for (const { alias, root } of dirs) {
    const { files, error } = auditLogFiles(root, { env });
    if (error) {
      policyErrors.push({ repo: alias, root, message: error.message });
    }

    const unreadFiles = files.filter((file) => {
      const resolvedFile = path.resolve(file);
      if (seenFiles.has(resolvedFile)) return false;
      seenFiles.add(resolvedFile);
      allFiles.push(file);
      return true;
    });
    if (unreadFiles.length === 0) continue;

    const { events, skipped, missing } = readAuditLog(unreadFiles);
    skippedLines += skipped;
    for (const file of unreadFiles) {
      if (missing.includes(file)) missingFiles.push(file);
      else existingFiles.push(file);
    }

    for (const event of events) {
      if (event.id && seenEventIds.has(event.id)) continue;
      if (event.id) seenEventIds.add(event.id);
      let eventRepo = event.repo ?? null;
      if (!eventRepo && typeof event.root === 'string') {
        const resolvedEventRoot = path.resolve(event.root);
        const realEventRoot = fs.existsSync(resolvedEventRoot)
          ? fs.realpathSync(resolvedEventRoot)
          : resolvedEventRoot;
        eventRepo = aliasByRoot.get(resolvedEventRoot) ?? aliasByRoot.get(realEventRoot) ?? null;
      }
      mergedEvents.push({
        repo: eventRepo ?? alias,
        ...event,
      });
    }
  }

  mergedEvents.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const matching = filterAuditEvents(mergedEvents, { since });
  const selected = filterAuditEvents(matching, { limit });

  return {
    repos: dirs.map(({ alias, root }) => ({ alias, root })),
    files: existingFiles,
    allFiles,
    missing: missingFiles,
    total: matching.length,
    events: selected,
    skippedLines,
    policyErrors,
  };
}
