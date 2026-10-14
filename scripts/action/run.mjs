#!/usr/bin/env node
/**
 * Runner of the ctxman GitHub Action (action.yml in the repository root).
 *
 * The composite action hands its inputs over as INPUT_* environment variables, never by
 * interpolating them into a shell script. This script validates them, runs the ctxman CLI
 * with --save-report, and turns token-analysis-report.json into step outputs
 * ($GITHUB_OUTPUT), a job summary ($GITHUB_STEP_SUMMARY) and an exit code:
 *
 *   0  analysis done, within max-tokens (when set)
 *   1  the analyzed files exceed max-tokens
 *   2  invalid input, or the analysis failed
 *
 * Environment:
 *   INPUT_PATH, INPUT_TARGET_MODEL, INPUT_MAX_TOKENS, INPUT_CHANGED_SINCE,
 *   INPUT_METHOD_LEVEL, INPUT_EXPORT   the action inputs
 *   CTXMAN_CLI                         ctxman's bin/cli.js (default: this checkout's)
 *   GITHUB_WORKSPACE                   `path` is resolved against it and must stay inside
 *   RUNNER_TEMP                        the report and the context file are moved here
 *   GITHUB_OUTPUT, GITHUB_STEP_SUMMARY files the outputs and the summary are appended to
 *
 * Nothing here needs a runner, so tests point the GITHUB_* variables at temporary files.
 */

import { execFileSync, spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLI = path.resolve(SCRIPT_DIR, '../../bin/cli.js');

export const EXIT_OK = 0;
export const EXIT_OVER_BUDGET = 1;
export const EXIT_ERROR = 2;

/** Values of the `export` input, and the file the CLI writes for each */
export const EXPORT_FILES = {
  none: null,
  json: 'llm-context.json',
  toon: 'llm-context.toon',
  markdown: 'llm-context.md',
  xml: 'llm-context.xml',
};

const REPORT_FILE = 'token-analysis-report.json';
const TOP_FILES = 10;

// A commit SHA, branch or tag name, optionally followed by ~N / ^N. Stricter than git:
// no ranges (..), no reflog syntax (@{...}), nothing that starts like an option
const STRICT_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}(?:[~^][0-9]{0,3})*$/;

/** A problem with the action inputs, reported without a stack trace */
export class InputError extends Error {}

/**
 * Check a `changed-since` value against a strict allowlist of ref shapes
 * @param {string} ref
 * @returns {boolean}
 */
export function isStrictRef(ref) {
  if (typeof ref !== 'string' || !STRICT_REF.test(ref)) return false;
  const name = ref.replace(/(?:[~^][0-9]*)+$/, '');
  return (
    !ref.includes('..') &&
    !ref.includes('//') &&
    !name.endsWith('/') &&
    !name.endsWith('.') &&
    !name.endsWith('.lock')
  );
}

/**
 * Parse a boolean action input ('true'/'false', any case; empty means false)
 * @param {string} name - Input name, for the error message
 * @param {string|undefined} value
 * @returns {boolean}
 */
export function parseBoolean(name, value) {
  const text = (value ?? '').trim().toLowerCase();
  if (text === '' || text === 'false') return false;
  if (text === 'true') return true;
  throw new InputError(`${name} must be true or false, got ${JSON.stringify(value)}`);
}

/**
 * Validate the action inputs
 * @param {object} env - Environment holding the INPUT_* variables
 * @param {object} [options]
 * @param {string[]} [options.knownModels] - Model ids accepted for target-model
 * @returns {{workspace: string, projectDir: string, targetModel: string|null,
 *   maxTokens: number|null, changedSince: string|null, methodLevel: boolean,
 *   exportFormat: string}}
 * @throws {InputError}
 */
export function parseInputs(env, { knownModels = [] } = {}) {
  const workspace = fs.realpathSync(path.resolve(env.GITHUB_WORKSPACE || process.cwd()));

  const rawPath = (env.INPUT_PATH ?? '').trim() || '.';
  const requested = path.resolve(workspace, rawPath);
  if (!fs.existsSync(requested) || !fs.statSync(requested).isDirectory()) {
    throw new InputError(`path ${JSON.stringify(rawPath)} is not a directory in the workspace`);
  }
  // Compare real paths so a symlink cannot lead out of the workspace either
  const projectDir = fs.realpathSync(requested);
  const relative = path.relative(workspace, projectDir);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new InputError(`path ${JSON.stringify(rawPath)} is outside the workspace ${workspace}`);
  }

  const targetModel = (env.INPUT_TARGET_MODEL ?? '').trim() || null;
  if (targetModel && !knownModels.includes(targetModel)) {
    throw new InputError(
      `Unknown target-model ${JSON.stringify(targetModel)}; use one of: ${knownModels.join(', ')}`
    );
  }

  const rawMax = (env.INPUT_MAX_TOKENS ?? '').trim();
  if (rawMax && !/^[1-9][0-9]{0,14}$/.test(rawMax)) {
    throw new InputError(
      `max-tokens must be a positive whole number, got ${JSON.stringify(rawMax)}`
    );
  }
  const maxTokens = rawMax ? Number(rawMax) : null;

  const changedSince = (env.INPUT_CHANGED_SINCE ?? '').trim() || null;
  if (changedSince && !isStrictRef(changedSince)) {
    throw new InputError(
      `changed-since must be a commit SHA, branch or tag, got ${JSON.stringify(changedSince)}`
    );
  }

  const methodLevel = parseBoolean('method-level', env.INPUT_METHOD_LEVEL);

  const exportFormat = ((env.INPUT_EXPORT ?? '').trim() || 'none').toLowerCase();
  if (!Object.hasOwn(EXPORT_FILES, exportFormat)) {
    throw new InputError(
      `export must be one of ${Object.keys(EXPORT_FILES).join(', ')}, got ${JSON.stringify(exportFormat)}`
    );
  }

  return { workspace, projectDir, targetModel, maxTokens, changedSince, methodLevel, exportFormat };
}

/**
 * CLI arguments for the validated inputs. Every run saves the JSON report; no --cli, so the
 * run does not record a context version under .ctxman/ in the checkout
 * @param {object} inputs - Result of parseInputs()
 * @returns {string[]}
 */
export function buildCliArgs({ methodLevel, targetModel, changedSince, exportFormat }) {
  const args = ['--save-report'];
  if (methodLevel) args.push('--method-level');
  if (targetModel) args.push('--target-model', targetModel);
  if (changedSince) args.push('--changed-since', changedSince);
  if (exportFormat && exportFormat !== 'none') {
    args.push('--context-export', '--output', exportFormat);
  }
  return args;
}

/**
 * Model profiles of the ctxman being run (.ctxman/llm-profiles.json next to its bin/),
 * falling back to this checkout's
 * @param {string} cliPath
 * @returns {Record<string, {name: string, contextWindow: number, maxRecommendedInput: number}>}
 */
export function loadModelProfiles(cliPath) {
  const candidates = [
    path.resolve(path.dirname(cliPath), '../.ctxman/llm-profiles.json'),
    path.resolve(SCRIPT_DIR, '../../.ctxman/llm-profiles.json'),
  ];
  for (const file of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const profiles = { ...data.profiles };
      // Aliases (older ctxman ids such as claude-sonnet-4.5) resolve like the CLI does
      for (const [alias, id] of Object.entries(data.aliases ?? {})) {
        if (profiles[id] && !profiles[alias]) profiles[alias] = profiles[id];
      }
      return profiles;
    } catch (_error) {
      // Try the next location
    }
  }
  return {};
}

/**
 * Read the totals and the largest files from token-analysis-report.json
 * @param {string} reportPath
 * @returns {{totalFiles: number, totalTokens: number,
 *   files: Array<{path: string, tokens: number, lines: number}>}}
 */
export function readReport(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const files = (report.files ?? [])
    .filter((file) => !file.error && Number.isFinite(file.tokens))
    .map((file) => ({
      path: String(file.relativePath ?? file.path)
        .split(path.sep)
        .join('/'),
      tokens: file.tokens,
      lines: file.lines ?? 0,
    }))
    .sort((a, b) => b.tokens - a.tokens || a.path.localeCompare(b.path));
  return {
    totalFiles: report.summary?.totalFiles ?? files.length,
    totalTokens: report.summary?.totalTokens ?? files.reduce((sum, f) => sum + f.tokens, 0),
    files,
  };
}

/**
 * Compare the totals with the budget and the model's context window
 * @param {{totalFiles: number, totalTokens: number, files: Array<object>}} totals
 * @param {object} [limits]
 * @param {number|null} [limits.maxTokens]
 * @param {{id: string, name?: string, contextWindow: number,
 *   maxRecommendedInput?: number}|null} [limits.model]
 * @returns {object} Totals, top files, `budget` and `fit` (null when not requested)
 */
export function evaluate(totals, { maxTokens = null, model = null } = {}) {
  const { totalFiles, totalTokens } = totals;
  const budget = maxTokens
    ? {
        maxTokens,
        exceeded: totalTokens > maxTokens,
        over: Math.max(0, totalTokens - maxTokens),
        percentage: (totalTokens / maxTokens) * 100,
      }
    : null;
  const fit = model
    ? {
        id: model.id,
        name: model.name || model.id,
        contextWindow: model.contextWindow,
        maxRecommendedInput: model.maxRecommendedInput ?? null,
        fits: totalTokens <= model.contextWindow,
        over: Math.max(0, totalTokens - model.contextWindow),
        percentage: (totalTokens / model.contextWindow) * 100,
      }
    : null;
  return {
    totalFiles,
    totalTokens,
    topFiles: totals.files.slice(0, TOP_FILES),
    budget,
    fit,
  };
}

const formatNumber = (value) => Math.round(value).toLocaleString('en-US');
const formatPercent = (value) => `${value.toFixed(1)}%`;
const plural = (count, noun) => `${formatNumber(count)} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Inline code for a Markdown table cell. File names come from the analyzed repository, so
 * HTML-escape them and keep '|' and line breaks from breaking the table
 * @param {string} text
 * @returns {string}
 */
export function codeCell(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;')
    .replace(/[\r\n]+/g, ' ');
  return `<code>${escaped}</code>`;
}

/**
 * Markdown job summary
 * @param {object} result - evaluate() result plus changedSince, methodLevel, exact,
 *   version and contextFile
 * @returns {string}
 */
export function renderSummary(result) {
  const { totalFiles, totalTokens, topFiles, budget, fit, changedSince } = result;
  const lines = ['## ctxman context check', ''];

  const scope = changedSince ? `files changed since ${codeCell(changedSince)}` : 'all files';
  const counting = result.exact ? 'exact tiktoken counts' : 'estimated counts';
  if (changedSince && totalFiles === 0) {
    lines.push(`No files changed since ${codeCell(changedSince)}: nothing to count.`, '');
  } else {
    lines.push(
      `**${plural(totalTokens, 'token')}** in **${plural(totalFiles, 'file')}** (${scope}, ${counting}).`,
      ''
    );
  }

  if (budget || fit) {
    lines.push('| Check | Limit | Usage | Result |', '| --- | ---: | ---: | --- |');
    if (budget) {
      const verdict = budget.exceeded
        ? `**Over budget** by ${formatNumber(budget.over)} tokens`
        : 'Within budget';
      lines.push(
        `| Token budget (max-tokens) | ${formatNumber(budget.maxTokens)} | ${formatPercent(budget.percentage)} | ${verdict} |`
      );
    }
    if (fit) {
      const verdict = fit.fits
        ? 'Fits'
        : `**Does not fit** (over by ${formatNumber(fit.over)} tokens)`;
      lines.push(
        `| ${codeCell(fit.name)} context window | ${formatNumber(fit.contextWindow)} | ${formatPercent(fit.percentage)} | ${verdict} |`
      );
    }
    lines.push('');
    if (fit?.fits && fit.maxRecommendedInput && totalTokens > fit.maxRecommendedInput) {
      lines.push(
        `Above the ${formatNumber(fit.maxRecommendedInput)} tokens ctxman recommends as input for ${codeCell(fit.name)}, which leaves room for instructions and the answer.`,
        ''
      );
    }
  }

  if (topFiles.length > 0) {
    lines.push(
      `### Top ${plural(topFiles.length, changedSince ? 'changed file' : 'file')} by tokens`,
      '',
      '| # | File | Tokens | Share |',
      '| ---: | --- | ---: | ---: |'
    );
    topFiles.forEach((file, index) => {
      const share = totalTokens > 0 ? formatPercent((file.tokens / totalTokens) * 100) : '-';
      lines.push(
        `| ${index + 1} | ${codeCell(file.path)} | ${formatNumber(file.tokens)} | ${share} |`
      );
    });
    lines.push('');
  }

  const details = [`ctxman ${result.version || 'unknown version'}`];
  if (result.methodLevel) details.push('method-level analysis');
  if (result.contextFile) details.push(`context file ${codeCell(result.contextFile)}`);
  lines.push(`<sub>${details.join(' · ')}</sub>`, '');

  return lines.join('\n');
}

/**
 * Append step outputs in the multi-line-safe `name<<delimiter` form
 * @param {string|undefined} outputFile - $GITHUB_OUTPUT
 * @param {Record<string, string|number|boolean|null>} outputs
 */
export function writeOutputs(outputFile, outputs) {
  if (!outputFile) return;
  let text = '';
  for (const [name, value] of Object.entries(outputs)) {
    const delimiter = `ghadelimiter_${randomUUID()}`;
    text += `${name}<<${delimiter}\n${value ?? ''}\n${delimiter}\n`;
  }
  fs.appendFileSync(outputFile, text);
}

/**
 * Escape the message of a workflow command so input values cannot start a new command
 * @param {string} text
 * @returns {string}
 */
export function escapeCommandData(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

// fs.writeSync keeps these lines in order with the output of the CLI child process
function writeLine(line) {
  fs.writeSync(1, `${line}\n`);
}

function annotate(level, title, message) {
  writeLine(`::${level} title=${title}::${escapeCommandData(message)}`);
}

/**
 * Modification time of a file, or null when it does not exist
 * @param {string} file
 * @returns {number|null}
 */
function mtimeOf(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (_error) {
    return null;
  }
}

/**
 * Modification times of the context files (llm-context.*) in a directory
 * @param {string} dir
 * @returns {Map<string, number>}
 */
function contextFileTimes(dir) {
  const times = new Map();
  for (const name of fs.readdirSync(dir)) {
    if (/^llm-context\.\w+$/.test(name)) times.set(name, mtimeOf(path.join(dir, name)));
  }
  return times;
}

/**
 * Move a file the CLI wrote into the project into the output directory, so the checkout
 * stays clean. A file that existed before the run is copied and left in place
 * @param {string} file
 * @param {number|null} mtimeBefore - mtimeOf(file) before the run
 * @param {string} outDir
 * @returns {string|null} New path, or null when the run did not write the file
 */
function collectOutput(file, mtimeBefore, outDir) {
  const mtimeAfter = mtimeOf(file);
  if (mtimeAfter === null || mtimeAfter === mtimeBefore) return null;

  const target = path.join(outDir, path.basename(file));
  if (mtimeBefore !== null) {
    fs.copyFileSync(file, target);
    return target;
  }
  try {
    fs.renameSync(file, target);
  } catch (_error) {
    // Different file systems (EXDEV)
    fs.copyFileSync(file, target);
    fs.unlinkSync(file);
  }
  return target;
}

/**
 * Check that changed-since passes ctxman's own ref validation and resolves in the checkout
 * @param {string} projectDir
 * @param {string} ref
 * @returns {Promise<string|null>} Problem description, or null
 */
async function checkChangedSince(projectDir, ref) {
  // Imported here: modules with a logger create .ctxman/logs in the working directory
  const { isValidGitRef } = await import('../../lib/integrations/git/GitClient.js');
  if (!isValidGitRef(ref)) {
    return `changed-since ${JSON.stringify(ref)} is not a valid git ref`;
  }
  if (!fs.existsSync(path.join(projectDir, '.git'))) {
    return 'changed-since needs path to be the root of the git checkout (the directory with .git)';
  }
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (_error) {
    return (
      `changed-since ${JSON.stringify(ref)} is not a commit in this checkout; ` +
      'check it out with history (actions/checkout with fetch-depth: 0)'
    );
  }
  return null;
}

/**
 * Run the CLI with its output in the log. In Actions the output is grouped, and workflow
 * commands are switched off while it runs: it prints file names from the repository
 * @returns {number} Exit status
 */
function runCli(cliPath, args, cwd, env) {
  const inActions = env.GITHUB_ACTIONS === 'true';
  const resumeToken = `ctxman-${randomUUID()}`;
  if (inActions) {
    writeLine('::group::ctxman analysis');
    writeLine(`::stop-commands::${resumeToken}`);
  }
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    // ctxman's info-level log lines repeat its report, and go to .ctxman/logs/ in the checkout
    env: { ...env, LOG_LEVEL: env.LOG_LEVEL || 'warn' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (inActions) {
    writeLine(`::${resumeToken}::`);
    writeLine('::endgroup::');
  }
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/**
 * Whether the ctxman being run can load tiktoken (exact counts) or falls back to estimates
 * @param {string} cliPath
 * @returns {boolean}
 */
function hasExactCounting(cliPath) {
  try {
    createRequire(cliPath).resolve('tiktoken');
    return true;
  } catch (_error) {
    return false;
  }
}

function readVersion(cliPath) {
  try {
    const pkgPath = path.resolve(path.dirname(cliPath), '../package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? null;
  } catch (_error) {
    return null;
  }
}

/**
 * Run the action. Changes the working directory to the analyzed project, so call it from
 * its own process (the action does; tests spawn this file)
 * @param {object} [env]
 * @returns {Promise<number>} Exit code
 */
export async function main(env = process.env) {
  const cliPath = path.resolve(env.CTXMAN_CLI || DEFAULT_CLI);
  if (!fs.existsSync(cliPath)) {
    annotate('error', 'ctxman', `ctxman CLI not found at ${cliPath}`);
    return EXIT_ERROR;
  }

  const profiles = loadModelProfiles(cliPath);
  let inputs;
  try {
    inputs = parseInputs(env, { knownModels: Object.keys(profiles) });
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    annotate('error', 'ctxman', error.message);
    return EXIT_ERROR;
  }
  const { projectDir, changedSince, exportFormat } = inputs;
  process.chdir(projectDir);

  if (changedSince) {
    const problem = await checkChangedSince(projectDir, changedSince);
    if (problem) {
      annotate('error', 'ctxman', problem);
      return EXIT_ERROR;
    }
  }

  const reportFile = path.join(projectDir, REPORT_FILE);
  const before = { report: mtimeOf(reportFile), context: contextFileTimes(projectDir) };

  const status = runCli(cliPath, buildCliArgs(inputs), projectDir, env);
  if (status !== 0) {
    annotate('error', 'ctxman', `ctxman exited with code ${status}; see the log above`);
    return EXIT_ERROR;
  }

  const outDir = fs.mkdtempSync(path.join(env.RUNNER_TEMP || os.tmpdir(), 'ctxman-'));
  const reportPath = collectOutput(reportFile, before.report, outDir);
  // Take every context file the run wrote: the published ctxman 3.0.0 (`version` input)
  // writes llm-context.json whatever the format
  const contextPaths = [];
  if (EXPORT_FILES[exportFormat]) {
    for (const name of contextFileTimes(projectDir).keys()) {
      const file = path.join(projectDir, name);
      const collected = collectOutput(file, before.context.get(name) ?? null, outDir);
      if (collected) contextPaths.push(collected);
    }
  }
  const contextPath =
    contextPaths.find((file) => path.basename(file) === EXPORT_FILES[exportFormat]) ??
    contextPaths[0] ??
    null;

  let totals;
  if (reportPath) {
    totals = readReport(reportPath);
  } else if (changedSince) {
    // Nothing changed: the CLI stops before analyzing and writes no report
    totals = { totalFiles: 0, totalTokens: 0, files: [] };
  } else {
    annotate('error', 'ctxman', `ctxman did not write ${REPORT_FILE}`);
    return EXIT_ERROR;
  }

  const model = inputs.targetModel
    ? { id: inputs.targetModel, ...profiles[inputs.targetModel] }
    : null;
  const result = {
    ...evaluate(totals, { maxTokens: inputs.maxTokens, model }),
    changedSince,
    methodLevel: inputs.methodLevel,
    exact: hasExactCounting(cliPath),
    version: readVersion(cliPath),
    contextFile: contextPath && path.basename(contextPath),
  };

  writeOutputs(env.GITHUB_OUTPUT, {
    'total-tokens': result.totalTokens,
    'total-files': result.totalFiles,
    fits: result.fit ? String(result.fit.fits) : '',
    'report-path': reportPath ?? '',
    'context-path': contextPath ?? '',
    'output-dir': outDir,
  });

  const summary = renderSummary(result);
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  } else {
    writeLine(`\n${summary}`);
  }

  writeLine(
    `ctxman: ${formatNumber(result.totalTokens)} tokens in ${formatNumber(result.totalFiles)} files`
  );
  if (result.fit && !result.fit.fits) {
    annotate(
      'warning',
      'ctxman context window',
      `${formatNumber(result.totalTokens)} tokens do not fit the ${formatNumber(result.fit.contextWindow)}-token window of ${result.fit.name}`
    );
  }
  if (result.budget?.exceeded) {
    annotate(
      'error',
      'ctxman token budget',
      `${formatNumber(result.totalTokens)} tokens exceed max-tokens ${formatNumber(result.budget.maxTokens)} by ${formatNumber(result.budget.over)}`
    );
    return EXIT_OVER_BUDGET;
  }
  return EXIT_OK;
}

function isEntryPoint() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch (_error) {
    return false;
  }
}

if (isEntryPoint()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      annotate('error', 'ctxman', error.stack || error.message);
      process.exitCode = EXIT_ERROR;
    }
  );
}
