/**
 * Export policy: loading, validation and merging
 *
 * A project keeps its policy in .ctxman/policy.json; an organisation can add one more file
 * through the CTXMAN_POLICY environment variable. Both apply at once and the stricter value
 * wins: deny lists are combined, limits take the lowest value, and a target model must be
 * allowed by every file that restricts models. This is a repository/organisation control
 * against accidental exports, not a security boundary against the local user.
 */

import fs from 'fs';
import path from 'path';
import GitIgnoreParser from '../parsers/gitignore-parser.js';
import { isValidIgnoreFileName, resolveIgnoreFileNames } from './ignore-files.js';

/** Project policy file, relative to the project root */
export const POLICY_FILE = '.ctxman/policy.json';
/** Environment variable naming the organisation policy file */
export const POLICY_ENV = 'CTXMAN_POLICY';
/** Audit log used when `audit.path` is not set, relative to the project root */
export const DEFAULT_AUDIT_PATH = '.ctxman/audit.log';
export const POLICY_DOCS_URL =
  'https://github.com/hakkisagdic/ctxman/blob/main/docs/commands/policy.md';

const POLICY_VERSION = 1;
const FIELDS = [
  'version',
  'deny',
  'requireRedaction',
  'maxExportTokens',
  'allowedTargetModels',
  'ignoreFiles',
  'audit',
];
const AUDIT_FIELDS = ['enabled', 'path'];

/**
 * A policy file that cannot be read or does not match the schema
 */
export class PolicyConfigError extends Error {
  /**
   * @param {string} file - Policy file
   * @param {Array<{field: string|null, message: string}>} errors
   */
  constructor(file, errors) {
    const describe = ({ field, message }) => (field ? `"${field}" ${message}` : message);
    const detail =
      errors.length === 1
        ? describe(errors[0])
        : errors.map((error) => `\n  - ${describe(error)}`).join('');
    super(`Invalid ctxman policy ${file}: ${detail}`);
    this.name = 'PolicyConfigError';
    this.code = 'POLICY_CONFIG';
    this.file = file;
    this.field = errors[0]?.field ?? null;
    this.errors = errors;
    // A broken policy is a server-side configuration problem, and a CLI usage error
    this.statusCode = 500;
    this.exitCode = 2;
  }
}

/**
 * Normalize a path for matching: forward slashes, no leading "./" or "/"
 * @param {string} relativePath
 * @returns {string}
 */
export function normalizeRelativePath(relativePath) {
  return String(relativePath ?? '')
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '');
}

/**
 * Project-relative path of a file entry: a string, or an object with relativePath or path
 * @param {string|{relativePath?: string, path?: string}} item
 * @returns {string}
 */
export function relativePathOf(item) {
  if (typeof item === 'string') return normalizeRelativePath(item);
  return normalizeRelativePath(item?.relativePath ?? item?.path ?? '');
}

/**
 * Compile a model glob (`*` any characters, `?` one character), case-insensitive
 * @param {string} glob
 * @returns {RegExp}
 */
export function modelGlobToRegex(glob) {
  const source = glob
    .split('')
    .map((char) => {
      if (char === '*') return '.*';
      if (char === '?') return '.';
      return char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`, 'i');
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const show = (value) => JSON.stringify(value);

/**
 * Validate one parsed policy document and return its rules in normal form
 * @param {*} doc - Parsed JSON
 * @param {object} context
 * @param {string} context.file - Policy file, for messages
 * @param {'organisation'|'project'} context.scope - Who owns the file
 * @param {string} context.root - Project root, for the audit path
 * @returns {{deny: string[], requireRedaction: boolean, maxExportTokens: number|null,
 *   allowedTargetModels: string[]|null, ignoreFiles: string[],
 *   audit: {enabled: boolean, path: string|null}}}
 * @throws {PolicyConfigError}
 */
export function validatePolicyDocument(doc, { file, scope, root }) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });

  if (!isPlainObject(doc)) {
    throw new PolicyConfigError(file, [
      { field: null, message: `must contain a JSON object (got ${show(doc)})` },
    ]);
  }

  // Keys starting with "$" ($comment, $schema) are free-form notes: JSON has no comments
  for (const key of Object.keys(doc)) {
    if (!key.startsWith('$') && !FIELDS.includes(key)) {
      fail(key, `is not a policy field (known fields: ${FIELDS.join(', ')})`);
    }
  }

  if (!('version' in doc)) {
    fail('version', `is required (use ${POLICY_VERSION})`);
  } else if (doc.version !== POLICY_VERSION) {
    fail('version', `must be ${POLICY_VERSION} (got ${show(doc.version)})`);
  }

  const deny = validateStringList(doc.deny, 'deny', fail, { allowNull: false }) ?? [];
  deny.forEach((pattern, index) => {
    const body = pattern.replace(/^!/, '');
    if (!body || body === '/') {
      fail(`deny[${index}]`, `is not a usable pattern (got ${show(pattern)})`);
    } else if (/(^|[/\\])\.\.([/\\]|$)/.test(body)) {
      fail(`deny[${index}]`, `must not contain ".." (patterns are relative to the project root)`);
    }
  });

  let requireRedaction = false;
  if (doc.requireRedaction !== undefined) {
    if (typeof doc.requireRedaction === 'boolean') requireRedaction = doc.requireRedaction;
    else fail('requireRedaction', `must be true or false (got ${show(doc.requireRedaction)})`);
  }

  let maxExportTokens = null;
  if (doc.maxExportTokens !== undefined && doc.maxExportTokens !== null) {
    if (Number.isInteger(doc.maxExportTokens) && doc.maxExportTokens > 0) {
      maxExportTokens = doc.maxExportTokens;
    } else {
      fail(
        'maxExportTokens',
        `must be a positive integer or null (got ${show(doc.maxExportTokens)})`
      );
    }
  }

  const allowedTargetModels = validateStringList(
    doc.allowedTargetModels,
    'allowedTargetModels',
    fail,
    { allowNull: true }
  );
  if (Array.isArray(allowedTargetModels) && allowedTargetModels.length === 0) {
    fail('allowedTargetModels', 'must list at least one model pattern; omit it to allow any model');
  }

  const ignoreFiles = validateStringList(doc.ignoreFiles, 'ignoreFiles', fail, {
    allowNull: false,
  });
  (ignoreFiles ?? []).forEach((name, index) => {
    if (name !== 'all' && !isValidIgnoreFileName(name)) {
      fail(
        `ignoreFiles[${index}]`,
        `must be a file name in the project root or "all" (got ${show(name)})`
      );
    }
  });

  const audit = validateAudit(doc.audit, { scope, root, fail });

  if (errors.length > 0) throw new PolicyConfigError(file, errors);

  return {
    deny,
    requireRedaction,
    maxExportTokens,
    allowedTargetModels: allowedTargetModels ?? null,
    ignoreFiles: resolveIgnoreFileNames(ignoreFiles ?? []),
    audit,
  };
}

function validateStringList(value, field, fail, { allowNull }) {
  if (value === undefined || (allowNull && value === null)) return null;
  if (!Array.isArray(value)) {
    fail(field, `must be an array of strings${allowNull ? ' or null' : ''} (got ${show(value)})`);
    return null;
  }
  const valid = [];
  value.forEach((item, index) => {
    if (typeof item === 'string' && item.trim()) valid.push(item.trim());
    else fail(`${field}[${index}]`, `must be a non-empty string (got ${show(item)})`);
  });
  return valid;
}

function validateAudit(audit, { scope, root, fail }) {
  if (audit === undefined || audit === null) return { enabled: false, path: null };
  if (!isPlainObject(audit)) {
    fail('audit', `must be an object like {"enabled": true} (got ${show(audit)})`);
    return { enabled: false, path: null };
  }

  for (const key of Object.keys(audit)) {
    if (!AUDIT_FIELDS.includes(key)) {
      fail(`audit.${key}`, `is not an audit field (known fields: ${AUDIT_FIELDS.join(', ')})`);
    }
  }

  let enabled = true;
  if (audit.enabled !== undefined) {
    if (typeof audit.enabled === 'boolean') enabled = audit.enabled;
    else fail('audit.enabled', `must be true or false (got ${show(audit.enabled)})`);
  }

  let logPath = DEFAULT_AUDIT_PATH;
  if (audit.path !== undefined) {
    if (typeof audit.path === 'string' && audit.path.trim()) logPath = audit.path.trim();
    else fail('audit.path', `must be a non-empty string (got ${show(audit.path)})`);
  }

  // A project file travels with the repository, so it may only write inside it; the
  // organisation file comes from the user's environment and may name any absolute path
  if (path.isAbsolute(logPath)) {
    if (scope !== 'organisation') {
      fail('audit.path', 'must be relative to the project root in a project policy');
      return { enabled: false, path: null };
    }
    return { enabled, path: path.resolve(logPath) };
  }

  const resolved = path.resolve(root, logPath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('audit.path', `must stay inside the project root (got ${show(audit.path)})`);
    return { enabled: false, path: null };
  }
  return { enabled, path: resolved };
}

/**
 * Read and validate one policy file
 * @returns {{scope: string, file: string, rules: object}|null} Null when the file is absent
 */
function readPolicySource(file, scope, root, { required }) {
  if (!fs.existsSync(file)) {
    if (!required) return null;
    throw new PolicyConfigError(file, [
      { field: null, message: `was not found (named by ${POLICY_ENV})` },
    ]);
  }

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new PolicyConfigError(file, [
      { field: null, message: `cannot be read: ${error.message}` },
    ]);
  }

  let doc;
  try {
    doc = JSON.parse(text);
  } catch (error) {
    throw new PolicyConfigError(file, [
      { field: null, message: `is not valid JSON: ${error.message}` },
    ]);
  }

  return { scope, file, rules: validatePolicyDocument(doc, { file, scope, root }) };
}

/**
 * Load the effective policy for a project: CTXMAN_POLICY (organisation) plus
 * <root>/.ctxman/policy.json (project). Without either file the result is a permissive
 * policy whose `active` is false.
 * @param {string} [root=process.cwd()] - Project root
 * @param {object} [options]
 * @param {object} [options.env=process.env] - Environment to read CTXMAN_POLICY from
 * @returns {Policy}
 * @throws {PolicyConfigError} When a policy file is invalid, or CTXMAN_POLICY names a
 *   missing file
 */
export function loadPolicy(root = process.cwd(), { env = process.env } = {}) {
  const absRoot = path.resolve(root);
  const sources = [];

  const orgSetting = typeof env?.[POLICY_ENV] === 'string' ? env[POLICY_ENV].trim() : '';
  const orgFile = orgSetting ? path.resolve(orgSetting) : null;
  if (orgFile) {
    sources.push(readPolicySource(orgFile, 'organisation', absRoot, { required: true }));
  }

  const projectFile = path.join(absRoot, POLICY_FILE);
  if (projectFile !== orgFile) {
    const project = readPolicySource(projectFile, 'project', absRoot, { required: false });
    if (project) sources.push(project);
  }

  return new Policy({ root: absRoot, sources });
}

/**
 * The effective (merged) policy of a project
 */
export class Policy {
  /**
   * @param {object} params
   * @param {string} params.root - Project root
   * @param {Array<{scope: string, file: string, rules: object}>} [params.sources] - Validated
   *   files, organisation first
   */
  constructor({ root, sources = [] }) {
    const parser = new GitIgnoreParser(null, null, null);
    this.root = path.resolve(root);
    this.sources = sources.map(({ scope, file }) => ({ scope, file }));
    this.active = sources.length > 0;

    this.denyRules = sources
      .filter((source) => source.rules.deny.length > 0)
      .map(({ scope, file, rules }) => ({
        scope,
        file,
        patterns: rules.deny,
        compiled: rules.deny.map((pattern) => parser.convertToRegex(pattern)),
      }));

    this.requireRedaction = sources.some((source) => source.rules.requireRedaction);
    this.requireRedactionSources = sources
      .filter((source) => source.rules.requireRedaction)
      .map((source) => source.file);

    const limits = sources.filter((source) => source.rules.maxExportTokens !== null);
    const strictest = limits.reduce(
      (best, source) =>
        !best || source.rules.maxExportTokens < best.rules.maxExportTokens ? source : best,
      null
    );
    this.maxExportTokens = strictest ? strictest.rules.maxExportTokens : null;
    this.maxExportTokensSource = strictest ? strictest.file : null;

    this.modelRules = sources
      .filter((source) => source.rules.allowedTargetModels)
      .map(({ scope, file, rules }) => ({
        scope,
        file,
        patterns: rules.allowedTargetModels,
        regexes: rules.allowedTargetModels.map(modelGlobToRegex),
      }));

    this.ignoreFiles = [...new Set(sources.flatMap((source) => source.rules.ignoreFiles))];

    const auditPaths = sources
      .filter((source) => source.rules.audit.enabled && source.rules.audit.path)
      .map((source) => source.rules.audit.path);
    this.audit = { enabled: auditPaths.length > 0, paths: [...new Set(auditPaths)] };
  }

  /**
   * Whether a file may never be exported. Each policy file is evaluated on its own with
   * .gitignore syntax (the last matching line wins, `!` re-allows, `dir/` covers everything
   * below); the path is denied when any file denies it, so a project file cannot re-allow
   * what the organisation file denies.
   * @param {string} relativePath - Path relative to the project root
   * @returns {boolean}
   */
  isDenied(relativePath) {
    return this.deniedBy(relativePath) !== null;
  }

  /**
   * @param {string} relativePath
   * @returns {string|null} The policy file whose deny rules match, or null
   */
  deniedBy(relativePath) {
    const rel = normalizeRelativePath(relativePath);
    if (!rel) return null;

    for (const rule of this.denyRules) {
      let denied = false;
      for (const pattern of rule.compiled) {
        if (pattern.regex.test(rel)) denied = !pattern.isNegation;
      }
      if (denied) return rule.file;
    }
    return null;
  }

  /**
   * Split file entries into the ones that may be exported and the denied ones
   * @template T
   * @param {T[]} items - Paths or objects with relativePath/path
   * @returns {{kept: T[], removed: T[]}}
   */
  filterFiles(items) {
    const kept = [];
    const removed = [];
    for (const item of items) {
      (this.isDenied(relativePathOf(item)) ? removed : kept).push(item);
    }
    return { kept, removed };
  }

  /**
   * Whether exports may target this model; true when no file restricts models or no
   * model was named
   * @param {string|null|undefined} model
   * @returns {boolean}
   */
  isModelAllowed(model) {
    if (!model) return true;
    return this.modelRules.every((rule) => rule.regexes.some((regex) => regex.test(model)));
  }

  /**
   * Whether a project-relative path is one of ctxman's audit logs, which must never be
   * exported themselves
   * @param {string} relativePath
   * @returns {boolean}
   */
  isAuditLog(relativePath) {
    const rel = normalizeRelativePath(relativePath);
    if (!rel) return false;
    if (rel === DEFAULT_AUDIT_PATH) return true;
    const absolute = path.resolve(this.root, rel);
    return this.audit.paths.includes(absolute);
  }

  /**
   * Plain-object view of the effective policy (for `ctxman policy check --json`)
   * @returns {object}
   */
  toJSON() {
    return {
      active: this.active,
      root: this.root,
      sources: this.sources,
      deny: this.denyRules.map(({ scope, file, patterns }) => ({ scope, file, patterns })),
      requireRedaction: this.requireRedaction,
      maxExportTokens: this.maxExportTokens,
      allowedTargetModels:
        this.modelRules.length > 0
          ? this.modelRules.map(({ scope, file, patterns }) => ({ scope, file, patterns }))
          : null,
      ignoreFiles: this.ignoreFiles,
      audit: this.audit,
    };
  }
}

/**
 * Starter policy written by `ctxman policy init`
 * @returns {object}
 */
export function createStarterPolicy() {
  return {
    $comment: `ctxman export policy. Files matching "deny" are never exported; set a field to null or remove it to lift that limit. Reference: ${POLICY_DOCS_URL}`,
    version: POLICY_VERSION,
    deny: ['.env', '.env.*', '!.env.example', '**/*.pem', '**/*.key', '**/id_rsa*', 'secrets/'],
    requireRedaction: true,
    maxExportTokens: null,
    allowedTargetModels: null,
    ignoreFiles: [],
    audit: { enabled: true, path: DEFAULT_AUDIT_PATH },
  };
}
