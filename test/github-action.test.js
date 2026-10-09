/**
 * The ctxman GitHub Action (action.yml): input validation, summary and outputs of
 * scripts/action/run.mjs, and the script run end to end with fake GITHUB_OUTPUT /
 * GITHUB_STEP_SUMMARY files against a temporary git repository.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  InputError,
  buildCliArgs,
  codeCell,
  escapeCommandData,
  evaluate,
  isStrictRef,
  parseBoolean,
  parseInputs,
  readReport,
  renderSummary,
  writeOutputs,
} from '../scripts/action/run.mjs';

const RUN_SCRIPT = path.resolve('scripts/action/run.mjs');
const INSTALL_SCRIPT = path.resolve('scripts/action/install.sh');
const ACTION_FILE = path.resolve('action.yml');
const MODELS = ['claude-sonnet-4.5', 'gpt-4o'];

/** Parse a GITHUB_OUTPUT file written in the `name<<delimiter` form */
function parseOutputs(file) {
  const text = fs.readFileSync(file, 'utf8');
  const outputs = {};
  const pattern = /^([\w-]+)<<(\S+)\n([\s\S]*?)\n?\2$/gm;
  let match;
  while ((match = pattern.exec(text))) outputs[match[1]] = match[3];
  return outputs;
}

function git(cwd, ...args) {
  return spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

describe('isStrictRef', () => {
  test.each([
    '0123456789abcdef0123456789abcdef01234567',
    'main',
    'origin/main',
    'release/v3.1.0',
    'v3.0.0',
    'HEAD~1',
    'HEAD^2',
    'feature_x-y',
  ])('accepts %s', (ref) => {
    expect(isStrictRef(ref)).toBe(true);
  });

  test.each([
    '',
    '--output=/tmp/x',
    '-x',
    'main..feature',
    'main...feature',
    'main@{1}',
    'a b',
    '$(id)',
    'main;id',
    'main\n::warning::x',
    'refs/heads/',
    'branch.lock',
    'trailing.',
    'a//b',
  ])('rejects %j', (ref) => {
    expect(isStrictRef(ref)).toBe(false);
  });
});

describe('parseBoolean', () => {
  test('reads true/false in any case and treats empty as false', () => {
    expect(parseBoolean('x', 'TRUE')).toBe(true);
    expect(parseBoolean('x', 'false')).toBe(false);
    expect(parseBoolean('x', '')).toBe(false);
    expect(parseBoolean('x', undefined)).toBe(false);
    expect(() => parseBoolean('method-level', 'yes')).toThrow(/method-level must be true/);
  });
});

describe('parseInputs', () => {
  let workspace;

  beforeAll(() => {
    workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-action-inputs-')));
    fs.mkdirSync(path.join(workspace, 'sub'));
  });

  afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  const parse = (inputs) =>
    parseInputs({ GITHUB_WORKSPACE: workspace, ...inputs }, { knownModels: MODELS });

  test('defaults', () => {
    expect(parse({})).toEqual({
      workspace,
      projectDir: workspace,
      targetModel: null,
      maxTokens: null,
      changedSince: null,
      methodLevel: false,
      exportFormat: 'none',
    });
  });

  test('reads every input', () => {
    const inputs = parse({
      INPUT_PATH: 'sub',
      INPUT_TARGET_MODEL: 'gpt-4o',
      INPUT_MAX_TOKENS: '50000',
      INPUT_CHANGED_SINCE: 'origin/main',
      INPUT_METHOD_LEVEL: 'true',
      INPUT_EXPORT: 'TOON',
    });
    expect(inputs).toMatchObject({
      projectDir: path.join(workspace, 'sub'),
      targetModel: 'gpt-4o',
      maxTokens: 50000,
      changedSince: 'origin/main',
      methodLevel: true,
      exportFormat: 'toon',
    });
  });

  test.each([
    [{ INPUT_PATH: '..' }, /outside the workspace/],
    [{ INPUT_PATH: '/' }, /outside the workspace/],
    [{ INPUT_PATH: 'missing' }, /not a directory/],
    [{ INPUT_TARGET_MODEL: 'gpt-99' }, /Unknown target-model "gpt-99"/],
    [{ INPUT_MAX_TOKENS: '1e6' }, /max-tokens must be a positive whole number/],
    [{ INPUT_MAX_TOKENS: '0' }, /max-tokens must be a positive whole number/],
    [{ INPUT_MAX_TOKENS: '-5' }, /max-tokens must be a positive whole number/],
    [{ INPUT_CHANGED_SINCE: '--output=/tmp/x' }, /changed-since must be a commit SHA/],
    [{ INPUT_EXPORT: 'yaml' }, /export must be one of none, json, toon, markdown, xml/],
  ])('rejects %j', (inputs, message) => {
    expect(() => parse(inputs)).toThrow(InputError);
    expect(() => parse(inputs)).toThrow(message);
  });

  test('rejects a symlink that leads out of the workspace', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-action-outside-'));
    try {
      fs.symlinkSync(outside, path.join(workspace, 'escape'));
      expect(() => parse({ INPUT_PATH: 'escape' })).toThrow(/outside the workspace/);
    } finally {
      fs.rmSync(path.join(workspace, 'escape'), { force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('buildCliArgs', () => {
  test('always saves the report and never passes --cli', () => {
    expect(buildCliArgs({ exportFormat: 'none' })).toEqual(['--save-report']);
  });

  test('maps every option', () => {
    expect(
      buildCliArgs({
        methodLevel: true,
        targetModel: 'gpt-4o',
        changedSince: 'abc123',
        exportFormat: 'xml',
      })
    ).toEqual([
      '--save-report',
      '--method-level',
      '--target-model',
      'gpt-4o',
      '--changed-since',
      'abc123',
      '--context-export',
      '--output',
      'xml',
    ]);
  });
});

describe('evaluate and renderSummary', () => {
  const totals = {
    totalFiles: 12,
    totalTokens: 1500,
    files: Array.from({ length: 12 }, (_, i) => ({
      path: i === 0 ? 'src/a|b<script>.js' : `src/f${i}.js`,
      tokens: 200 - i * 10,
      lines: 10,
    })),
  };
  const model = { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 1000, maxRecommendedInput: 600 };

  test('compares with the budget and the model window', () => {
    const result = evaluate(totals, { maxTokens: 1000, model });
    expect(result.budget).toMatchObject({ maxTokens: 1000, exceeded: true, over: 500 });
    expect(result.fit).toMatchObject({ id: 'gpt-4o', fits: false, over: 500 });
    expect(result.topFiles).toHaveLength(10);

    const within = evaluate(totals, {
      maxTokens: 1500,
      model: { ...model, contextWindow: 2000 },
    });
    expect(within.budget.exceeded).toBe(false);
    expect(within.fit.fits).toBe(true);
  });

  test('leaves budget and fit out when not requested', () => {
    const result = evaluate(totals);
    expect(result.budget).toBeNull();
    expect(result.fit).toBeNull();
  });

  test('summary has the totals, the checks and the top 10 files, escaped', () => {
    const summary = renderSummary({
      ...evaluate(totals, { maxTokens: 1000, model }),
      exact: true,
      version: '3.0.0',
      methodLevel: true,
      contextFile: 'llm-context.toon',
      changedSince: null,
    });
    expect(summary).toContain(
      '**1,500 tokens** in **12 files** (all files, exact tiktoken counts)'
    );
    expect(summary).toContain(
      '| Token budget (max-tokens) | 1,000 | 150.0% | **Over budget** by 500'
    );
    expect(summary).toContain(
      '| <code>GPT-4o</code> context window | 1,000 | 150.0% | **Does not fit**'
    );
    expect(summary).toContain('### Top 10 files by tokens');
    expect(summary).toContain('| 1 | <code>src/a&#124;b&lt;script&gt;.js</code> | 200 | 13.3% |');
    expect(summary).not.toContain('src/f10.js');
    expect(summary).toContain('ctxman 3.0.0 · method-level analysis · context file');
  });

  test('summary notes a fit above the recommended input', () => {
    const summary = renderSummary({
      ...evaluate(totals, { model: { ...model, contextWindow: 2000 } }),
      changedSince: null,
    });
    expect(summary).toContain('| Fits |');
    expect(summary).toContain('Above the 600 tokens ctxman recommends');
  });

  test('summary for a change set without files', () => {
    const summary = renderSummary({
      ...evaluate({ totalFiles: 0, totalTokens: 0, files: [] }),
      changedSince: 'abc123',
    });
    expect(summary).toContain('No files changed since <code>abc123</code>');
    expect(summary).not.toContain('### Top');
  });

  test('codeCell keeps table cells intact', () => {
    expect(codeCell('a|b\nc&d')).toBe('<code>a&#124;b c&amp;d</code>');
  });
});

describe('outputs and workflow commands', () => {
  test('writeOutputs uses delimiters, so values cannot add outputs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-action-out-'));
    try {
      const file = path.join(dir, 'output');
      writeOutputs(file, { a: 1, b: 'x\nfits=true', c: null });
      expect(parseOutputs(file)).toEqual({ a: '1', b: 'x\nfits=true', c: '' });
      writeOutputs(undefined, { ignored: 1 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('escapeCommandData keeps a value on one line', () => {
    expect(escapeCommandData('a\n::warning::b\r50%')).toBe('a%0A::warning::b%0D50%25');
  });

  test('readReport takes totals and files sorted by tokens', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-action-report-'));
    try {
      const file = path.join(dir, 'report.json');
      fs.writeFileSync(
        file,
        JSON.stringify({
          summary: { totalFiles: 2, totalTokens: 30 },
          files: [
            { relativePath: 'b.js', tokens: 10, lines: 1 },
            { relativePath: 'a.js', tokens: 20, lines: 2 },
          ],
        })
      );
      expect(readReport(file)).toEqual({
        totalFiles: 2,
        totalTokens: 30,
        files: [
          { path: 'a.js', tokens: 20, lines: 2 },
          { path: 'b.js', tokens: 10, lines: 1 },
        ],
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('action.yml', () => {
  const text = fs.readFileSync(ACTION_FILE, 'utf8');
  const section = (name, next) =>
    text.slice(text.indexOf(`\n${name}:\n`), text.indexOf(`\n${next}:\n`));
  const keys = (block) => [...block.matchAll(/^ {2}([a-z-]+):$/gm)].map((m) => m[1]);

  test('declares the inputs and outputs the scripts use', () => {
    expect(keys(section('inputs', 'outputs'))).toEqual([
      'path',
      'target-model',
      'max-tokens',
      'changed-since',
      'method-level',
      'export',
      'upload-artifact',
      'artifact-name',
      'node-version',
      'version',
    ]);
    expect(keys(section('outputs', 'runs'))).toEqual([
      'total-tokens',
      'total-files',
      'fits',
      'report-path',
      'context-path',
    ]);
  });

  test('passes inputs through env, never into a run script', () => {
    const runLines = text.split('\n').filter((line) => /^\s+run: /.test(line));
    expect(runLines.length).toBeGreaterThan(0);
    for (const line of runLines) expect(line).not.toContain('${{');

    for (const name of ['path', 'target-model', 'max-tokens', 'changed-since', 'method-level']) {
      const variable = `INPUT_${name.toUpperCase().replace(/-/g, '_')}`;
      expect(text).toContain(`${variable}: \${{ inputs.${name} }}`);
    }
    expect(text).toContain('INPUT_EXPORT: ${{ inputs.export }}');
    expect(text).toContain('CTXMAN_VERSION: ${{ inputs.version }}');
  });
});

describe('install.sh', () => {
  test('is valid bash', () => {
    const result = spawnSync('bash', ['-n', INSTALL_SCRIPT], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });

  test('rejects a version that is not an npm version or tag before installing anything', () => {
    for (const version of ['1.0;rm -rf /', '--registry=https://example.com', '../x']) {
      const result = spawnSync('bash', [INSTALL_SCRIPT], {
        env: { ...process.env, CTXMAN_VERSION: version, GITHUB_ACTION_PATH: path.resolve('.') },
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('::error title=ctxman::version must be an npm version');
    }
  });
});

describe('run.mjs end to end', () => {
  let root;
  let workspace;
  let runnerTemp;

  /** Run the action script like the composite step does */
  function runAction(inputs = {}) {
    const outputFile = path.join(root, `output-${Math.random().toString(36).slice(2)}`);
    const summaryFile = `${outputFile}.md`;
    fs.writeFileSync(outputFile, '');
    fs.writeFileSync(summaryFile, '');
    const result = spawnSync(process.execPath, [RUN_SCRIPT], {
      cwd: workspace,
      env: {
        PATH: process.env.PATH,
        HOME: root,
        GITHUB_ACTIONS: 'true',
        GITHUB_WORKSPACE: workspace,
        GITHUB_OUTPUT: outputFile,
        GITHUB_STEP_SUMMARY: summaryFile,
        RUNNER_TEMP: runnerTemp,
        ...inputs,
      },
      encoding: 'utf8',
      timeout: 60000,
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      outputs: parseOutputs(outputFile),
      summary: fs.readFileSync(summaryFile, 'utf8'),
    };
  }

  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-action-e2e-')));
    workspace = path.join(root, 'workspace');
    runnerTemp = path.join(root, 'runner-temp');
    fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
    fs.mkdirSync(runnerTemp);
    for (let i = 1; i <= 12; i++) {
      fs.writeFileSync(
        path.join(workspace, `src/file${i}.js`),
        `export function f${i}(a, b) {\n  return a + b * ${i};\n}\n`
      );
    }
    fs.writeFileSync(path.join(workspace, 'README.md'), `# Fixture\n\n${'word '.repeat(300)}\n`);
    git(workspace, 'init', '-q');
    git(workspace, 'add', '-A');
    git(workspace, 'commit', '-qm', 'init');
    fs.writeFileSync(path.join(workspace, 'src/changed.js'), 'export const changed = () => 42;\n');
    git(workspace, 'add', '-A');
    git(workspace, 'commit', '-qm', 'change');
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('analyzes the project, writes outputs and summary, keeps the checkout clean', () => {
    const run = runAction({
      INPUT_TARGET_MODEL: 'claude-sonnet-4.5',
      INPUT_MAX_TOKENS: '100000',
      INPUT_EXPORT: 'toon',
      INPUT_METHOD_LEVEL: 'true',
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);

    const { outputs } = run;
    expect(Number(outputs['total-files'])).toBe(14);
    expect(Number(outputs['total-tokens'])).toBeGreaterThan(300);
    expect(outputs.fits).toBe('true');
    expect(path.dirname(outputs['report-path'])).toBe(outputs['output-dir']);
    expect(outputs['output-dir'].startsWith(runnerTemp)).toBe(true);
    expect(path.basename(outputs['context-path'])).toBe('llm-context.toon');

    const report = JSON.parse(fs.readFileSync(outputs['report-path'], 'utf8'));
    expect(report.summary.totalTokens).toBe(Number(outputs['total-tokens']));
    expect(fs.readFileSync(outputs['context-path'], 'utf8')).toContain('totalFiles: 14');

    // Moved out of the project, so a later step sees an unchanged checkout
    expect(fs.existsSync(path.join(workspace, 'token-analysis-report.json'))).toBe(false);
    expect(fs.existsSync(path.join(workspace, 'llm-context.toon'))).toBe(false);
    expect(git(workspace, 'status', '--porcelain').stdout).toBe('');

    expect(run.summary).toContain('## ctxman context check');
    expect(run.summary).toContain('in **14 files**');
    expect(run.summary).toContain('| Within budget |');
    expect(run.summary).toContain('<code>Claude Sonnet 4.5</code> context window | 200,000');
    expect(run.summary).toContain('### Top 10 files by tokens');
    expect(run.summary).toContain('| 1 | <code>README.md</code>');
    expect(run.summary).toContain('method-level analysis');

    // CLI output is grouped, with workflow commands off while it runs
    const token = run.stdout.match(/^::stop-commands::(\S+)$/m)?.[1];
    expect(token).toBeTruthy();
    expect(run.stdout).toContain(`::${token}::`);
    expect(run.stdout).toContain('PROJECT TOKEN ANALYSIS REPORT');
  });

  test('fails with exit code 1 over max-tokens, after writing outputs and summary', () => {
    const run = runAction({ INPUT_MAX_TOKENS: '50', INPUT_TARGET_MODEL: 'gpt-4o' });
    expect(run.status).toBe(1);
    expect(run.stdout).toMatch(
      /^::error title=ctxman token budget::[\d,]+ tokens exceed max-tokens 50 by/m
    );
    expect(Number(run.outputs['total-tokens'])).toBeGreaterThan(50);
    expect(run.outputs.fits).toBe('true');
    expect(run.summary).toContain('**Over budget**');
  });

  test('changed-since analyzes only the changed files', () => {
    const run = runAction({ INPUT_CHANGED_SINCE: 'HEAD~1', INPUT_EXPORT: 'json' });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.outputs['total-files']).toBe('1');
    expect(run.outputs.fits).toBe('');
    expect(path.basename(run.outputs['context-path'])).toBe('llm-context.json');
    expect(run.summary).toContain('in **1 file** (files changed since <code>HEAD~1</code>');
    expect(run.summary).toContain('<code>src/changed.js</code>');
    expect(git(workspace, 'status', '--porcelain').stdout).toBe('');
  });

  test('changed-since without changes reports zero and passes', () => {
    const run = runAction({ INPUT_CHANGED_SINCE: 'HEAD', INPUT_MAX_TOKENS: '10' });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.outputs).toMatchObject({
      'total-tokens': '0',
      'total-files': '0',
      'report-path': '',
    });
    expect(run.summary).toContain('No files changed since <code>HEAD</code>');
  });

  test.each([
    [{ INPUT_CHANGED_SINCE: '--output=/tmp/pwned' }, 'changed-since must be a commit SHA'],
    [{ INPUT_CHANGED_SINCE: 'a'.repeat(40) }, 'fetch-depth: 0'],
    [{ INPUT_PATH: '../' }, 'outside the workspace'],
    [{ INPUT_PATH: 'src', INPUT_CHANGED_SINCE: 'HEAD~1' }, 'root of the git checkout'],
    [{ INPUT_TARGET_MODEL: 'gpt-99' }, 'Unknown target-model'],
    [{ CTXMAN_CLI: '/nonexistent/cli.js' }, 'ctxman CLI not found'],
  ])('fails with exit code 2 on %j', (inputs, message) => {
    const run = runAction(inputs);
    expect(run.status).toBe(2);
    expect(run.stdout).toMatch(/^::error title=ctxman::/m);
    expect(run.stdout).toContain(message);
    expect(run.outputs).toEqual({});
    expect(fs.existsSync('/tmp/pwned')).toBe(false);
  });
});
