/**
 * The VS Code extension (ide/vscode/extension.js) drives the CLI. Load it with a stand-in
 * `vscode` module and route its `npx ctxman ...` spawn to bin/cli.js, so the extension's real
 * arguments and spawn options run against the real CLI.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import childProcess from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Module, { createRequire } from 'module';

const CLI = path.resolve('bin/cli.js');
const EXTENSION = path.resolve('ide/vscode/extension.js');
// The extension waits up to 60 s for the CLI; give up well before the test timeout
const KILL_AFTER_MS = 10000;

function loadExtension(fakeVscode, onSpawn) {
  const fakeChildProcess = {
    ...childProcess,
    spawn(command, args, options) {
      expect(command).toBe('npx');
      expect(args[0]).toBe('ctxman');
      // Editor file paths are arguments: no shell may interpret them
      expect(options.shell).toBe(process.platform === 'win32');
      const child = childProcess.spawn(process.execPath, [CLI, ...args.slice(1)], {
        cwd: options.cwd,
        stdio: options.stdio,
        env: { ...process.env, HOME: options.cwd },
      });
      const timer = setTimeout(() => child.kill(), KILL_AFTER_MS);
      const run = { args: args.slice(1), exit: null };
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        run.exit = { code, signal };
      });
      onSpawn(run);
      return child;
    },
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (parent?.filename === EXTENSION) {
      if (request === 'vscode') return fakeVscode;
      if (request === 'child_process') return fakeChildProcess;
    }
    return originalLoad.call(this, request, parent, ...rest);
  };
  try {
    const require = createRequire(import.meta.url);
    delete require.cache[EXTENSION];
    return require(EXTENSION);
  } finally {
    Module._load = originalLoad;
  }
}

describe('VS Code extension -> CLI contract', () => {
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-vscode-'));
    fs.mkdirSync(path.join(dir, 'src'));
    // Over 1,000 tokens, so the CLI prints the total with digit grouping
    const values = Array.from({ length: 800 }, (_, i) => i * 7).join(', ');
    fs.writeFileSync(path.join(dir, 'src/data.js'), `export const data = [${values}];\n`);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('generate context runs the CLI to completion with the configured model', async () => {
    const messages = [];
    const commands = new Map();
    const runs = [];
    let preview = null;
    const settings = { outputFormat: 'json', targetModel: 'gpt-4-turbo', showStatusBar: true };

    const fakeVscode = {
      window: {
        createStatusBarItem: () => ({ show() {}, hide() {} }),
        withProgress: (_options, task) => task({ report() {} }),
        showInformationMessage: async (message, ...items) => {
          messages.push(message);
          return items.includes('Open Preview') ? 'Open Preview' : undefined;
        },
        showWarningMessage: async (message) => messages.push(message),
        showErrorMessage: async (message) => messages.push(message),
        showTextDocument: async () => {},
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: dir } }],
        getConfiguration: () => ({ get: (key) => settings[key], update: async () => {} }),
        onDidChangeActiveTextEditor: () => ({ dispose() {} }),
        onDidSaveTextDocument: () => ({ dispose() {} }),
        openTextDocument: async ({ content }) => {
          preview = content;
          return {};
        },
      },
      commands: {
        registerCommand: (id, handler) => {
          commands.set(id, handler);
          return { dispose() {} };
        },
      },
      StatusBarAlignment: { Right: 2 },
      ProgressLocation: { Notification: 15 },
      ConfigurationTarget: { Workspace: 2 },
    };

    const extension = loadExtension(fakeVscode, (run) => runs.push(run));
    extension.activate({ subscriptions: [] });
    await commands.get('ctxman.generateProject')();

    expect(runs).toHaveLength(1);
    // Finished by itself instead of waiting at the interactive export prompt
    expect(runs[0].exit).toEqual({ code: 0, signal: null });
    expect(messages.filter((m) => m.startsWith('Failed'))).toEqual([]);

    // The model reaches the CLI under its flag name and drives the context-fit analysis
    expect(runs[0].args).toEqual(expect.arrayContaining(['--target-model', 'gpt-4-turbo']));
    expect(preview).toContain('GPT-4 Turbo');

    // The reported count is the CLI's total, not the digits before the first separator
    const printed = preview.match(/Total tokens: (\d[^\n]*)/)[1];
    const total = Number(printed.replace(/\D/g, ''));
    expect(total).toBeGreaterThan(999);
    expect(messages).toContain(`Generated ${total.toLocaleString()} tokens`);
  }, 30000);
});

describe('VS Code extension command line', () => {
  const { npxCommand } = loadExtension({}, () => {});

  test('passes arguments without a shell outside Windows', () => {
    const file = '/work/a$(touch pwned).js';

    expect(npxCommand(['--cli', '--file', file], 'linux')).toEqual({
      command: 'npx',
      args: ['ctxman', '--cli', '--file', file],
      shell: false,
    });
  });

  test('quotes paths with spaces and refuses cmd.exe metacharacters on Windows', () => {
    expect(npxCommand(['--file', 'C:\\My Project\\a.js'], 'win32').args).toEqual([
      'ctxman',
      '--file',
      '"C:\\My Project\\a.js"',
    ]);
    expect(() => npxCommand(['--file', 'a&calc.js'], 'win32')).toThrow('Cannot pass');
  });
});
