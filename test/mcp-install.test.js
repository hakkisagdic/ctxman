import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  CLI_PATH,
  CLIENTS,
  buildServerEntry,
  installServer,
  manualCommands,
  resolveConfigPath,
  shellQuote,
  uninstallServer,
} from '../lib/api/mcp/install.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

describe('resolveConfigPath', () => {
  const home = '/home/dev';
  const projectDir = '/work/app';

  it('finds the Claude Desktop config on each platform', () => {
    const at = (platform, env = {}) =>
      resolveConfigPath('claude-desktop', 'user', { platform, homeDir: home, env }).path;

    expect(at('darwin')).toBe(
      '/home/dev/Library/Application Support/Claude/claude_desktop_config.json'
    );
    expect(at('linux')).toBe('/home/dev/.config/Claude/claude_desktop_config.json');
    expect(at('linux', { XDG_CONFIG_HOME: '/cfg' })).toBe('/cfg/Claude/claude_desktop_config.json');
    expect(
      resolveConfigPath('claude-desktop', 'user', {
        platform: 'win32',
        homeDir: 'C:\\Users\\dev',
        env: { APPDATA: 'C:\\Users\\dev\\AppData\\Roaming' },
      }).path
    ).toBe('C:\\Users\\dev\\AppData\\Roaming\\Claude\\claude_desktop_config.json');
  });

  it('finds the project and user files of the other clients', () => {
    const at = (client, scope) =>
      resolveConfigPath(client, scope, { platform: 'linux', homeDir: home, projectDir });

    expect(at('claude-code', 'project').path).toBe('/work/app/.mcp.json');
    expect(at('cursor', 'user').path).toBe('/home/dev/.cursor/mcp.json');
    expect(at('cursor', 'project').path).toBe('/work/app/.cursor/mcp.json');
    expect(at('vscode', 'project').path).toBe('/work/app/.vscode/mcp.json');
  });

  it('gives a reason instead of a file where ctxman does not write', () => {
    const at = (client, scope) => resolveConfigPath(client, scope, { homeDir: home, projectDir });

    expect(at('claude-code', 'user')).toMatchObject({ path: null, reason: /claude CLI/ });
    expect(at('vscode', 'user')).toMatchObject({ path: null, reason: /--add-mcp/ });
    expect(at('windsurf', 'user')).toMatchObject({ path: null, reason: /--file/ });
    expect(at('claude-desktop', 'project').path).toBeNull();
  });

  it('rejects unknown clients and scopes', () => {
    expect(() => resolveConfigPath('emacs', 'user')).toThrow('Unknown client "emacs"');
    expect(() => resolveConfigPath('cursor', 'global')).toThrow('Unknown scope "global"');
  });
});

describe('buildServerEntry', () => {
  it('runs this installation with the absolute node binary', () => {
    expect(buildServerEntry('cursor')).toEqual({
      command: process.execPath,
      args: [CLI_PATH, 'mcp'],
    });
    expect(path.isAbsolute(CLI_PATH)).toBe(true);
    expect(fs.existsSync(CLI_PATH)).toBe(true);
  });

  it('adds the stdio type where the client documents it, and --root on request', () => {
    expect(buildServerEntry('claude-code', { root: '/srv/app' })).toEqual({
      type: 'stdio',
      command: process.execPath,
      args: [CLI_PATH, 'mcp', '--root', '/srv/app'],
    });
    expect(buildServerEntry('vscode').type).toBe('stdio');
    expect(buildServerEntry('claude-desktop').type).toBeUndefined();
  });

  it('uses npx when asked, through cmd on Windows', () => {
    expect(buildServerEntry('cursor', { npx: true, platform: 'linux' })).toEqual({
      command: 'npx',
      args: ['-y', 'ctxman', 'mcp'],
    });
    expect(buildServerEntry('cursor', { npx: true, platform: 'win32' })).toEqual({
      command: 'cmd',
      args: ['/c', 'npx', '-y', 'ctxman', 'mcp'],
    });
  });

  it('prints shell commands for the clients ctxman leaves alone', () => {
    const entry = { type: 'stdio', command: '/usr/bin/node', args: ['/opt/my app/cli.js', 'mcp'] };

    expect(manualCommands('claude-code', 'user', 'ctxman', entry, 'linux')).toEqual([
      "claude mcp add --scope user --transport stdio ctxman -- /usr/bin/node '/opt/my app/cli.js' mcp",
    ]);
    expect(manualCommands('vscode', 'user', 'ctxman', entry, 'linux')[0]).toMatch(
      /^code --add-mcp '\{"name":"ctxman","type":"stdio",/
    );
    expect(shellQuote('C:\\Program Files\\node.exe', 'win32')).toBe(
      '"C:\\Program Files\\node.exe"'
    );
  });
});

describe('installServer and uninstallServer', () => {
  let dir;
  let file;
  const entry = { command: '/usr/bin/node', args: ['/opt/ctxman/bin/cli.js', 'mcp'] };
  const other = { command: 'other-server', args: ['--flag'] };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-install-'));
    file = path.join(dir, 'nested', 'config', 'mcp.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const read = () => JSON.parse(fs.readFileSync(file, 'utf-8'));
  const seed = (config) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(config));
  };

  it('creates the file and its directories', () => {
    const result = installServer({ client: 'cursor', file, entry });

    expect(result).toMatchObject({ status: 'created', backup: null });
    expect(read()).toEqual({ mcpServers: { ctxman: entry } });
    expect(fs.readFileSync(file, 'utf-8')).toBe(
      `${JSON.stringify({ mcpServers: { ctxman: entry } }, null, 2)}\n`
    );
  });

  it('merges into an existing file, keeping other servers and settings, with a backup', () => {
    seed({ theme: 'dark', mcpServers: { other } });
    const original = fs.readFileSync(file, 'utf-8');

    const result = installServer({ client: 'cursor', file, entry });

    expect(result.status).toBe('added');
    expect(read()).toEqual({ theme: 'dark', mcpServers: { other, ctxman: entry } });
    expect(result.backup).toBe(`${file}.bak`);
    expect(fs.readFileSync(`${file}.bak`, 'utf-8')).toBe(original);
  });

  it('uses the "servers" key for VS Code', () => {
    installServer({ client: 'vscode', file, entry });

    expect(read()).toEqual({ servers: { ctxman: entry } });
  });

  it('does nothing when the same entry is already there', () => {
    installServer({ client: 'cursor', file, entry });
    const before = fs.statSync(file).mtimeMs;

    const result = installServer({ client: 'cursor', file, entry: { ...entry } });

    expect(result.status).toBe('unchanged');
    expect(fs.existsSync(`${file}.bak`)).toBe(false);
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });

  it('refuses to replace a different entry without force, then replaces it in place', () => {
    seed({ mcpServers: { ctxman: other, after: other } });

    const refused = installServer({ client: 'cursor', file, entry });
    expect(refused).toMatchObject({ status: 'conflict', existing: other });
    expect(read().mcpServers.ctxman).toEqual(other);

    const forced = installServer({ client: 'cursor', file, entry, force: true });
    expect(forced.status).toBe('updated');
    expect(Object.keys(read().mcpServers)).toEqual(['ctxman', 'after']);
    expect(read().mcpServers.ctxman).toEqual(entry);
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf-8')).mcpServers.ctxman).toEqual(other);
  });

  it('writes nothing on a dry run', () => {
    const created = installServer({ client: 'cursor', file, entry, dryRun: true });
    expect(created.status).toBe('created');
    expect(JSON.parse(created.content)).toEqual({ mcpServers: { ctxman: entry } });
    expect(fs.existsSync(path.dirname(file))).toBe(false);

    seed({ mcpServers: { other } });
    installServer({ client: 'cursor', file, entry, dryRun: true });
    expect(read()).toEqual({ mcpServers: { other } });
    expect(fs.existsSync(`${file}.bak`)).toBe(false);
  });

  it('refuses files that are not plain JSON objects and leaves them alone', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{\n  // comment\n  "servers": {}\n}\n');
    expect(() => installServer({ client: 'vscode', file, entry })).toThrow('not valid JSON');
    expect(fs.readFileSync(file, 'utf-8')).toContain('// comment');

    fs.writeFileSync(file, '[]');
    expect(() => installServer({ client: 'cursor', file, entry })).toThrow('JSON object');

    fs.writeFileSync(file, '{"mcpServers": []}');
    expect(() => installServer({ client: 'cursor', file, entry })).toThrow('not an object');

    fs.writeFileSync(file, '  \n');
    expect(installServer({ client: 'cursor', file, entry }).status).toBe('added');
  });

  it('removes only the ctxman entry, and is a no-op the second time', () => {
    seed({ mcpServers: { other, ctxman: entry } });

    expect(uninstallServer({ client: 'cursor', file, dryRun: true }).status).toBe('removed');
    expect(read().mcpServers.ctxman).toEqual(entry);

    expect(uninstallServer({ client: 'cursor', file }).status).toBe('removed');
    expect(read()).toEqual({ mcpServers: { other } });
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf-8')).mcpServers.ctxman).toEqual(entry);

    expect(uninstallServer({ client: 'cursor', file })).toMatchObject({ status: 'absent' });
    expect(uninstallServer({ client: 'cursor', file: `${file}.missing` }).status).toBe('absent');
  });
});

describe('ctxman mcp install / uninstall / config', () => {
  let home;
  let project;
  let env;

  beforeEach(() => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-home-')));
    project = path.join(home, 'work', 'app');
    fs.mkdirSync(project, { recursive: true });
    env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      APPDATA: path.join(home, 'AppData', 'Roaming'),
    };
    delete env.XDG_CONFIG_HOME;
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  const run = (...args) =>
    spawnSync(process.execPath, [CLI, 'mcp', ...args], { cwd: project, encoding: 'utf-8', env });
  const configPath = (client, scope) =>
    resolveConfigPath(client, scope, { homeDir: home, env, projectDir: project }).path;
  const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));
  const expectedEntry = (client) => buildServerEntry(client);

  it.each([
    ['claude-desktop', 'user'],
    ['claude-code', 'project'],
    ['cursor', 'user'],
    ['cursor', 'project'],
    ['vscode', 'project'],
  ])('installs for %s (%s scope) and uninstalls again', (client, scope) => {
    const file = configPath(client, scope);
    const key = CLIENTS[client].key;

    const installed = run('install', '--client', client, '--scope', scope);
    expect(installed.status).toBe(0);
    expect(installed.stdout).toContain(`Created ${file}`);
    expect(readJson(file)).toEqual({ [key]: { ctxman: expectedEntry(client) } });
    expect(file.startsWith(home)).toBe(true);

    const again = run('install', '--client', client, '--scope', scope);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('nothing changed');

    const removed = run('uninstall', '--client', client, '--scope', scope);
    expect(removed.status).toBe(0);
    expect(readJson(file)).toEqual({ [key]: {} });
    expect(fs.existsSync(`${file}.bak`)).toBe(true);
  });

  it('uses the default scope of each client', () => {
    expect(run('install', '--client', 'claude-code').status).toBe(0);
    expect(fs.existsSync(path.join(project, '.mcp.json'))).toBe(true);

    expect(run('install', '--client', 'cursor').status).toBe(0);
    expect(fs.existsSync(path.join(home, '.cursor', 'mcp.json'))).toBe(true);
  });

  it('merges into an existing config, refuses a different entry and replaces it with --force', () => {
    const file = path.join(project, '.mcp.json');
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { other: { command: 'x' } } }));

    expect(run('install', '--client', 'claude-code').status).toBe(0);
    expect(Object.keys(readJson(file).mcpServers)).toEqual(['other', 'ctxman']);

    const conflict = run('install', '--client', 'claude-code', '--npx');
    expect(conflict.status).toBe(1);
    expect(conflict.stderr).toContain('already has a different "ctxman" entry');
    expect(readJson(file).mcpServers.ctxman.command).toBe(process.execPath);

    const forced = run('install', '--client', 'claude-code', '--npx', '--force');
    expect(forced.status).toBe(0);
    expect(forced.stdout).toContain(`Previous version: ${file}.bak`);
    expect(readJson(file).mcpServers.ctxman).toEqual({
      type: 'stdio',
      command: process.platform === 'win32' ? 'cmd' : 'npx',
      args: [...(process.platform === 'win32' ? ['/c', 'npx'] : []), '-y', 'ctxman', 'mcp'],
    });
    expect(readJson(`${file}.bak`).mcpServers.ctxman.command).toBe(process.execPath);
  });

  it('writes nothing with --dry-run or --print', () => {
    const file = configPath('claude-desktop', 'user');

    const dry = run('install', '--client', 'claude-desktop', '--dry-run');
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain(`Dry run: would write ${file}`);

    const printed = run('install', '--client', 'claude-desktop', '--print');
    expect(printed.status).toBe(0);
    expect(JSON.parse(printed.stdout)).toEqual({
      mcpServers: { ctxman: expectedEntry('claude-desktop') },
    });
    expect(fs.existsSync(file)).toBe(false);
  });

  it('prints the snippet with config, honouring --name and --root', () => {
    const result = run('config', '--client', 'vscode', '--name', 'ctx', '--root', project);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(path.join(project, '.vscode', 'mcp.json'));
    expect(JSON.parse(result.stdout)).toEqual({
      servers: {
        ctx: {
          type: 'stdio',
          command: process.execPath,
          args: [CLI_PATH, 'mcp', '--root', project],
        },
      },
    });
  });

  it('prints the claude command for Claude Code user scope instead of editing ~/.claude.json', () => {
    const result = run('install', '--client', 'claude-code', '--scope', 'user');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('claude mcp add --scope user --transport stdio ctxman --');
    expect(fs.existsSync(path.join(home, '.claude.json'))).toBe(false);

    const removal = run('uninstall', '--client', 'claude-code', '--scope', 'user');
    expect(removal.stdout).toContain('claude mcp remove --scope user ctxman');
  });

  it('prints instructions for Windsurf, and writes the file given with --file', () => {
    const printed = run('install', '--client', 'windsurf');
    expect(printed.status).toBe(0);
    expect(printed.stderr).toContain('Open MCP config file');
    expect(fs.existsSync(path.join(home, '.codeium'))).toBe(false);

    const file = path.join(home, '.codeium', 'windsurf', 'mcp_config.json');
    const written = run('install', '--client', 'windsurf', '--file', file);
    expect(written.status).toBe(0);
    expect(readJson(file)).toEqual({ mcpServers: { ctxman: expectedEntry('windsurf') } });
  });

  it('reports --json results and usage errors', () => {
    const json = JSON.parse(run('install', '--client', 'cursor', '--json').stdout);
    expect(json).toMatchObject({ client: 'cursor', scope: 'user', status: 'created' });

    expect(run('install').status).toBe(2);
    expect(run('install', '--client', 'emacs').stderr).toContain('Unknown client "emacs"');
    expect(run('install', '--client', 'claude-desktop', '--scope', 'project').status).toBe(2);
    expect(run('install', '--client', 'cursor', '--name', 'bad name').status).toBe(2);
    expect(run('install', '--client', 'cursor', '--bogus').status).toBe(2);
  });

  it('shows the setup help for each command', () => {
    const result = run('install', '--help');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--dry-run');
  });
});
