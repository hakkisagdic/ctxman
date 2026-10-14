/**
 * Pack: file contents in one LLM-ready document
 *
 * Pipeline per file: read -> skip binary -> compress (optional) -> line numbers (optional)
 * -> redact secrets (default) -> count tokens. Then the budget picks files (optional), the
 * renderer for the style builds the document, and --split cuts it into parts (optional).
 *
 * Every count uses one tiktoken encoding: the target model's (o200k_base for recent OpenAI
 * models) when one is given, cl100k_base otherwise.
 */

import fs from 'fs';
import TokenUtils from '../utils/token-utils.js';
import { LLMDetector } from '../utils/llm-detector.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import { selectFiles, PackError } from './select.js';
import { compressCode } from './compress.js';
import { buildTree } from './tree.js';
import { rankEntries, fitToBudget } from './budget.js';
import { splitIntoParts } from './split.js';
import { getRenderer, STYLES } from './renderers/index.js';

export { PackError, STYLES };

/** Files larger than this are skipped unless `maxFileSize` says otherwise */
export const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;
/** Budget of the MCP tool when the client gives none: whole projects would flood its context */
export const TOOL_DEFAULT_BUDGET = 20000;
// Omitted files listed by name in the document; the rest are counted
const OMITTED_LISTED = 20;
// A NUL byte in the first bytes marks a binary file
const BINARY_SNIFF_BYTES = 8000;

/**
 * Prefix each line with its number, right-aligned
 * @param {string} text
 * @param {number[]|null} numbers - Number of each line (null: 1, 2, 3, ...)
 * @returns {string}
 */
export function addLineNumbers(text, numbers = null) {
  const lines = text.split('\n');
  const count = lines.length - (text.endsWith('\n') ? 1 : 0);
  const numberOf = (i) => (numbers ? numbers[i] : i + 1);
  let widest = 0;
  for (let i = 0; i < count; i++) widest = Math.max(widest, numberOf(i));
  const width = String(widest).length;
  return lines
    .map((line, i) => {
      if (i >= count) return line;
      const number = String(numberOf(i)).padStart(width);
      return line === '' || line === '\r' ? `${number} |${line}` : `${number} | ${line}`;
    })
    .join('\n');
}

const positiveInteger = (value, name) => {
  if (value === undefined || value === null) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new PackError('INVALID_OPTION', `${name} must be a positive integer, got ${value}`);
  }
  return number;
};

const stringList = (value, name) => {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  if (!list.every((item) => typeof item === 'string')) {
    throw new PackError('INVALID_OPTION', `${name} must be a list of strings`);
  }
  return list;
};

/** Profile of the target model, or null without one; unknown ids are an error */
function targetProfile(model) {
  if (model === undefined || model === null || model === '') return null;
  const id = LLMDetector.resolveModelId(String(model));
  if (!id) {
    throw new PackError(
      'UNKNOWN_MODEL',
      `Unknown model "${model}" (ctxman --list-llms lists the known ids)`
    );
  }
  return LLMDetector.getProfile(id);
}

function normalizeOptions(options) {
  const style = options.style ?? 'xml';
  if (!STYLES.includes(style)) {
    throw new PackError('INVALID_OPTION', `Unknown style "${style}" (use ${STYLES.join(', ')})`);
  }
  const profile = targetProfile(options.targetModel);
  return {
    style,
    include: stringList(options.include, 'include'),
    exclude: stringList(options.exclude, 'exclude'),
    files: options.files ? stringList(options.files, 'files') : null,
    cwd: options.cwd,
    excludeFiles: stringList(options.excludeFiles, 'excludeFiles'),
    maxFileSize: positiveInteger(options.maxFileSize, 'maxFileSize') ?? DEFAULT_MAX_FILE_SIZE,
    tree: options.tree !== false,
    header: options.header ? String(options.header).trimEnd() : null,
    instructions: options.instructions ? String(options.instructions).trimEnd() : null,
    lineNumbers: Boolean(options.lineNumbers),
    compress: Boolean(options.compress),
    redact: options.redact !== false,
    budget: positiveInteger(options.budget, 'budget'),
    split: positiveInteger(options.split, 'split'),
    profile,
    encoding: TokenUtils.encodingFor(profile?.id),
  };
}

/**
 * Read and transform one file
 * @returns {object|{skipped: string}} Entry, or the reason it is skipped
 */
function prepareFile(file, options) {
  let buffer;
  try {
    buffer = fs.readFileSync(file.absolutePath);
  } catch (_error) {
    return { skipped: 'unreadable' };
  }
  if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { skipped: 'binary' };

  let content = buffer.toString('utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const totalLines = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
  const count = (text) => TokenUtils.calculate(text, file.path, options.encoding);

  let lineNumbers = null;
  let compression = null;
  if (options.compress) {
    const result = compressCode(content, file.path);
    if (result.elided > 0) {
      compression = {
        bodies: result.elided,
        originalTokens: count(content),
        compressedTokens: count(result.text),
      };
      content = result.text;
      lineNumbers = result.lineMap;
    }
  }

  // Numbers first, so a secret masked below cannot shift the numbers of later lines
  if (options.lineNumbers) content = addLineNumbers(content, lineNumbers);

  let findings = [];
  if (options.redact) {
    const redacted = redactSecrets(content);
    if (redacted.findings.length) {
      // A masked private key block becomes one line: line positions no longer line up
      if (redacted.text.split('\n').length !== content.split('\n').length) lineNumbers = null;
      content = redacted.text;
      findings = redacted.findings;
    }
  }

  return {
    path: file.path,
    absolutePath: file.absolutePath,
    modified: file.modified,
    content,
    tokens: count(content),
    totalLines,
    lineNumbers,
    compression,
    findings,
  };
}

/** Mask secrets in user text (header, instructions) and note what was found */
function redactText(text, options, findings) {
  if (!text || !options.redact) return text;
  const redacted = redactSecrets(text);
  findings.push(...redacted.findings);
  return redacted.text;
}

function omittedSection(omitted) {
  if (!omitted.length) return null;
  const rest = omitted.slice(OMITTED_LISTED);
  const sum = (entries) => entries.reduce((total, entry) => total + entry.tokens, 0);
  return {
    files: omitted.slice(0, OMITTED_LISTED).map(({ path, tokens }) => ({ path, tokens })),
    count: omitted.length,
    tokens: sum(omitted),
    more: rest.length,
    moreTokens: sum(rest),
  };
}

/** How the document compares with the target model's context window */
function modelFit(profile, tokens, encoding) {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    vendor: profile.vendor,
    encoding: TokenUtils.isExact() ? encoding : 'estimate',
    // tiktoken is the model's own tokenizer only for OpenAI models with a published encoding
    exact: TokenUtils.isExact() && profile.tokenizer?.exact === true,
    contextWindow: profile.contextWindow,
    maxRecommendedInput: profile.maxRecommendedInput ?? null,
    fits: tokens <= profile.contextWindow,
    percentOfWindow: (tokens / profile.contextWindow) * 100,
  };
}

/**
 * Pack the contents of a project's files into one document
 * @param {string} root - Project root
 * @param {object} [options]
 * @param {'xml'|'markdown'|'plain'|'json'} [options.style='xml']
 * @param {string[]} [options.include] - Gitignore-style globs: keep only matching files
 * @param {string[]} [options.exclude] - Gitignore-style globs: leave matching files out
 * @param {string[]} [options.files] - Explicit file list instead of scanning the root
 * @param {string} [options.cwd] - Base for relative `files` entries (default: root)
 * @param {string[]} [options.excludeFiles] - Absolute paths to leave out
 * @param {number} [options.maxFileSize=1048576] - Skip larger files (bytes)
 * @param {boolean} [options.tree=true] - Directory tree at the top
 * @param {string} [options.header] - Text at the top
 * @param {string} [options.instructions] - Text at the end, after the files
 * @param {boolean} [options.lineNumbers=false] - Number every line
 * @param {boolean} [options.compress=false] - Replace function bodies with placeholders
 * @param {boolean} [options.redact=true] - Mask secrets
 * @param {number} [options.budget] - Token limit for the document; highest-ranked files first
 * @param {number} [options.split] - Token limit per part; adds `parts` to the result
 * @param {string} [options.targetModel] - Count with this model's encoding and report fit
 * @returns {Promise<object>} {text, style, encoding, totalTokens, files, omitted, skipped,
 *   redactions, compression, budget, model, parts, splitFiles}
 */
export async function packContext(root, options = {}) {
  const opts = normalizeOptions(options);
  const renderer = getRenderer(opts.style);
  const count = (text) => TokenUtils.calculate(text, `pack${renderer.extension}`, opts.encoding);

  const selection = selectFiles(root, opts);
  const skipped = [...selection.skipped];
  const entries = [];
  for (const file of selection.files) {
    const entry = prepareFile(file, opts);
    if (entry.skipped) skipped.push({ path: file.path, reason: entry.skipped });
    else entries.push(entry);
  }

  const textFindings = [];
  const header = redactText(opts.header, opts, textFindings);
  const instructions = redactText(opts.instructions, opts, textFindings);

  const docFor = (packed, omitted) => ({
    header,
    partLabel: null,
    part: null,
    tree: opts.tree ? buildTree(packed.map((entry) => entry.path)) : null,
    files: packed,
    firstIndex: 1,
    omitted: omittedSection(omitted),
    instructions,
  });
  const measure = (packed, omitted) => {
    const text = renderer.render(docFor(packed, omitted));
    return { text, tokens: count(text) };
  };

  let packed = entries;
  let omitted = [];
  let rendered;
  if (opts.budget) {
    const { ranked } = rankEntries(selection.root, entries);
    const separator = count('\n\n');
    const wrapperCost = (entry) =>
      opts.style === 'json'
        ? count(renderer.renderFile(entry, entries.length))
        : entry.tokens + count(renderer.renderFile({ ...entry, content: '' }, entries.length));
    const cost = (entry) =>
      (entry.cost ??= wrapperCost(entry) + separator + (opts.tree ? count(entry.path) + 1 : 0));
    ({ packed, omitted, ...rendered } = fitToBudget(entries, ranked, opts.budget, {
      measure,
      cost,
    }));
  } else {
    rendered = measure(entries, []);
  }

  let parts = null;
  let splitFiles = [];
  if (opts.split) {
    const doc = docFor(packed, omitted);
    ({ parts, splitFiles } = splitIntoParts(packed, opts.split, { renderer, count, doc }));
  }

  const redactionCounts = {};
  const findings = [...textFindings, ...packed.flatMap((entry) => entry.findings)];
  for (const type of findings) redactionCounts[type] = (redactionCounts[type] ?? 0) + 1;

  const compressed = packed.filter((entry) => entry.compression);
  const sum = (key) => compressed.reduce((total, entry) => total + entry.compression[key], 0);
  const compression = opts.compress
    ? {
        files: compressed.length,
        bodies: sum('bodies'),
        originalTokens: sum('originalTokens'),
        compressedTokens: sum('compressedTokens'),
        savedTokens: sum('originalTokens') - sum('compressedTokens'),
      }
    : null;

  return {
    text: rendered.text,
    style: opts.style,
    encoding: TokenUtils.isExact() ? opts.encoding : 'estimate',
    totalTokens: rendered.tokens,
    files: packed.map((entry) => ({
      path: entry.path,
      tokens: entry.tokens,
      lines: entry.totalLines,
      compressed: Boolean(entry.compression),
    })),
    omitted: omitted.map(({ path, tokens }) => ({ path, tokens })),
    skipped,
    redactions: { total: findings.length, byType: redactionCounts },
    compression,
    budget: opts.budget ? { limit: opts.budget, used: rendered.tokens } : null,
    model: modelFit(opts.profile, rendered.tokens, opts.encoding),
    parts,
    splitFiles,
  };
}

/**
 * One sentence about a pack result: size, files left out, compression, redactions, model fit
 * @param {object} result - From packContext()
 * @returns {string}
 */
export function describePack(result) {
  const parts = [`${result.files.length} file(s), ${result.totalTokens} tokens (${result.style})`];
  if (result.omitted.length) parts.push(`${result.omitted.length} file(s) left out by the budget`);
  if (result.compression) {
    parts.push(`${result.compression.savedTokens} tokens saved by compression`);
  }
  if (result.redactions.total) parts.push(`${result.redactions.total} secret(s) redacted`);
  if (result.model) {
    const fit = result.model.fits ? 'fits' : "doesn't fit";
    parts.push(
      `${result.model.percentOfWindow.toFixed(1)}% of ${result.model.id}'s window, ${fit}`
    );
  }
  return `Packed ${parts.join('; ')}.`;
}

export default packContext;
