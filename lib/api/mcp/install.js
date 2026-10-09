/**
 * MCP client configuration: where each client keeps its MCP servers, the entry that starts
 * ctxman, and merging that entry into (or removing it from) the client's JSON file.
 *
 * Locations follow the clients' documentation (see docs/commands/mcp.md). Everything that
 * depends on the machine (platform, home directory, environment, project directory) is
 * passed in, so tests never touch the real home directory.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

/** Absolute path of bin/cli.js, which `ctxman mcp` runs */
export const CLI_PATH = fileURLToPath(new URL('../../../bin/cli.js', import.meta.url));
export const DEFAULT_SERVER_NAME = 'ctxman';
export const SCOPES = ['user', 'project'];

/**
 * Supported clients.
 * - key: object in the config file that holds the servers
 * - scopes: scopes with a config file ctxman writes
 * - manualScopes: scopes for which ctxman prints a command or instructions instead
 * - stdioType: whether entries carry `"type": "stdio"`
 */
export const CLIENTS = {
  'claude-desktop': {
    label: 'Claude Desktop',
    key: 'mcpServers',
    defaultScope: 'user',
    scopes: ['user'],
    manualScopes: [],
    stdioType: false,
    docs: 'https://modelcontextprotocol.io/docs/develop/connect-local-servers',
  },
  'claude-code': {
    label: 'Claude Code',
    key: 'mcpServers',
    defaultScope: 'project',
    scopes: ['project'],
    manualScopes: ['user'],
    stdioType: true,
    docs: 'https://code.claude.com/docs/en/mcp',
  },
  cursor: {
    label: 'Cursor',
    key: 'mcpServers',
    defaultScope: 'user',
    scopes: ['user', 'project'],
    manualScopes: [],
    stdioType: false,
    docs: 'https://cursor.com/docs/mcp',
  },
  vscode: {
    label: 'VS Code',
    key: 'servers',
    defaultScope: 'project',
    scopes: ['project'],
    manualScopes: ['user'],
    stdioType: true,
    docs: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration',
  },
  windsurf: {
    label: 'Windsurf',
    key: 'mcpServers',
    defaultScope: 'user',
    // The documented location differs between the Cascade docs and the editor's discovery
    // file, so ctxman only writes it when given --file
    scopes: [],
    manualScopes: ['user'],
    stdioType: false,
    docs: 'https://docs.windsurf.com/windsurf/cascade/mcp',
  },
};

/**
 * Validate a client name
 * @param {string} client
 * @returns {Object} The client description
 * @throws {Error} For an unknown client
 */
export function getClient(client) {
  const info = CLIENTS[client];
  if (!info) {
    throw new Error(
      `Unknown client "${client ?? ''}" (expected one of: ${Object.keys(CLIENTS).join(', ')})`
    );
  }
  return info;
}

/**
 * Quote an argument for the user's shell when it needs quoting
 * @param {string} arg
 * @param {string} [platform=process.platform]
 * @returns {string}
 */
export function shellQuote(arg, platform = process.platform) {
  if (/^[\w@%+=:,./\\-]+$/.test(arg)) return arg;
  if (platform === 'win32') return `"${arg.replace(/"/g, '\\"')}"`;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * The server entry for a client's config file.
 *
 * @param {string} client
 * @param {Object} [options]
 * @param {boolean} [options.npx=false] - Start with `npx -y ctxman mcp` instead of this install
 * @param {string} [options.execPath=process.execPath] - Absolute path of node
 * @param {string} [options.cliPath=CLI_PATH] - Absolute path of bin/cli.js
 * @param {string} [options.root] - Pass `--root <dir>` to the server
 * @param {string} [options.platform=process.platform] - npx goes through `cmd /c` on Windows
 * @returns {{type?: string, command: string, args: string[]}}
 */
export function buildServerEntry(
  client,
  {
    npx = false,
    execPath = process.execPath,
    cliPath = CLI_PATH,
    root,
    platform = process.platform,
  } = {}
) {
  const info = getClient(client);
  let command;
  let args;
  if (!npx) {
    command = execPath;
    args = [cliPath, 'mcp'];
  } else if (platform === 'win32') {
    // npx is a .cmd script on Windows, which clients cannot spawn directly
    command = 'cmd';
    args = ['/c', 'npx', '-y', 'ctxman', 'mcp'];
  } else {
    command = 'npx';
    args = ['-y', 'ctxman', 'mcp'];
  }
  if (root) args.push('--root', root);
  return info.stdioType ? { type: 'stdio', command, args } : { command, args };
}

/**
 * Where a client keeps its MCP servers for a scope.
 *
 * @param {string} client
 * @param {string} scope - 'user' or 'project'
 * @param {Object} [context]
 * @param {string} [context.platform=process.platform]
 * @param {string} [context.homeDir=os.homedir()]
 * @param {Object} [context.env=process.env] - APPDATA (Windows), XDG_CONFIG_HOME (Linux)
 * @param {string} [context.projectDir=process.cwd()]
 * @returns {{path: string|null, reason?: string}} `path` is null when ctxman does not write
 *   that configuration; `reason` then says why
 */
export function resolveConfigPath(
  client,
  scope,
  {
    platform = process.platform,
    homeDir = os.homedir(),
    env = process.env,
    projectDir = process.cwd(),
  } = {}
) {
  getClient(client);
  if (!SCOPES.includes(scope)) {
    throw new Error(`Unknown scope "${scope}" (expected user or project)`);
  }
  const p = platform === 'win32' ? path.win32 : path.posix;

  switch (client) {
    case 'claude-desktop': {
      if (scope === 'project') {
        return { path: null, reason: 'Claude Desktop has no project configuration.' };
      }
      let dir;
      if (platform === 'darwin') {
        dir = p.join(homeDir, 'Library', 'Application Support', 'Claude');
      } else if (platform === 'win32') {
        dir = p.join(env.APPDATA || p.join(homeDir, 'AppData', 'Roaming'), 'Claude');
      } else {
        dir = p.join(env.XDG_CONFIG_HOME || p.join(homeDir, '.config'), 'Claude');
      }
      return { path: p.join(dir, 'claude_desktop_config.json') };
    }
    case 'claude-code':
      if (scope === 'project') return { path: p.join(projectDir, '.mcp.json') };
      return {
        path: null,
        reason:
          'Claude Code keeps user-scope servers in ~/.claude.json together with its other ' +
          'state; ctxman does not edit that file. Add the server with the claude CLI instead.',
      };
    case 'cursor':
      return {
        path:
          scope === 'project'
            ? p.join(projectDir, '.cursor', 'mcp.json')
            : p.join(homeDir, '.cursor', 'mcp.json'),
      };
    case 'vscode':
      if (scope === 'project') return { path: p.join(projectDir, '.vscode', 'mcp.json') };
      return {
        path: null,
        reason:
          'VS Code keeps user-level MCP servers in the user profile; add the server with ' +
          '`code --add-mcp` or the "MCP: Open User Configuration" command.',
      };
    case 'windsurf':
    default:
      if (scope === 'project') {
        return { path: null, reason: 'Windsurf has no project configuration.' };
      }
      return {
        path: null,
        reason:
          'The Windsurf docs name ~/.config/devin/mcp_config.json ($XDG_CONFIG_HOME/devin, ' +
          '%APPDATA%\\devin on Windows) for Cascade, while the editor reads ' +
          '~/.codeium/windsurf/mcp_config.json; open the file from Cascade > MCPs > ' +
          '"Open MCP config file", or pass it with --file.',
      };
  }
}

/**
 * The fragment of a config file that holds the entry: `{ [key]: { [name]: entry } }`
 * @param {string} client
 * @param {string} name
 * @param {Object} entry
 * @returns {Object}
 */
export function buildSnippet(client, name, entry) {
  return { [getClient(client).key]: { [name]: entry } };
}

/**
 * Commands that add the server where ctxman does not write the file itself
 * @param {string} client
 * @param {string} scope
 * @param {string} name
 * @param {Object} entry
 * @param {string} [platform=process.platform]
 * @returns {string[]} Shell commands (empty when there is none)
 */
export function manualCommands(client, scope, name, entry, platform = process.platform) {
  const q = (arg) => shellQuote(arg, platform);
  if (client === 'claude-code' && scope === 'user') {
    return [
      [
        'claude mcp add --scope user --transport stdio',
        q(name),
        '--',
        q(entry.command),
        ...entry.args.map(q),
      ].join(' '),
    ];
  }
  if (client === 'vscode' && scope === 'user') {
    return [`code --add-mcp ${q(JSON.stringify({ name, ...entry }))}`];
  }
  return [];
}

/**
 * Key-order-independent equality of JSON values
 * @private
 */
function sameJson(a, b) {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((k) => [k, canonical(value[k])])
      );
    }
    return value;
  };
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Read a client config file
 * @param {string} file
 * @param {string} key - Object that holds the servers
 * @returns {{exists: boolean, config: Object}}
 * @throws {Error} When the file is not a JSON object (comments are not supported)
 */
export function readConfigFile(file, key) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, config: {} };
    throw error;
  }
  if (!text.trim()) return { exists: true, config: {} };

  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${file} is not valid JSON (${error.message}); ctxman does not rewrite files with ` +
        'comments or syntax errors. Fix it, or add the entry by hand (ctxman mcp config).'
    );
  }
  if (!isPlainObject(config)) {
    throw new Error(`${file} does not hold a JSON object`);
  }
  if (config[key] !== undefined && !isPlainObject(config[key])) {
    throw new Error(`"${key}" in ${file} is not an object`);
  }
  return { exists: true, config };
}

/**
 * Write a config file as 2-space JSON: back up the previous version to `<file>.bak`, create
 * missing directories, replace the file in one rename
 * @param {string} file
 * @param {Object} config
 * @param {boolean} existed - Whether there is a previous version to back up
 * @returns {string|null} Path of the backup
 */
export function writeConfigFile(file, config, existed) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let backup = null;
  // Keep the permissions of the file being replaced
  let mode = 0o644;
  if (existed) {
    backup = `${file}.bak`;
    fs.copyFileSync(file, backup);
    mode = fs.statSync(file).mode & 0o777;
  }
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode });
  fs.renameSync(temp, file);
  return backup;
}

/**
 * Add the ctxman entry to a client config file.
 *
 * @param {Object} options
 * @param {string} options.client
 * @param {string} options.file - Config file to change
 * @param {Object} options.entry - From buildServerEntry()
 * @param {string} [options.name='ctxman']
 * @param {boolean} [options.force=false] - Replace a different existing entry of that name
 * @param {boolean} [options.dryRun=false] - Report without writing
 * @returns {{status: 'created'|'added'|'updated'|'unchanged'|'conflict', file: string,
 *   content: string, backup: string|null, existing?: Object}} `content` is the file as it
 *   is (or would be) written; `conflict` means an entry exists and force was not given
 */
export function installServer({
  client,
  file,
  entry,
  name = DEFAULT_SERVER_NAME,
  force = false,
  dryRun = false,
}) {
  const { key } = getClient(client);
  const { exists, config } = readConfigFile(file, key);
  const servers = config[key] ?? {};
  const existing = servers[name];

  let status;
  if (existing === undefined) status = exists ? 'added' : 'created';
  else if (sameJson(existing, entry)) status = 'unchanged';
  else if (force) status = 'updated';
  else status = 'conflict';

  if (status === 'unchanged' || status === 'conflict') {
    return {
      status,
      file,
      content: `${JSON.stringify(config, null, 2)}\n`,
      backup: null,
      ...(existing !== undefined ? { existing } : {}),
    };
  }

  // Assigning to an existing key keeps its position among the other servers
  const next = { ...config, [key]: { ...servers, [name]: entry } };
  const content = `${JSON.stringify(next, null, 2)}\n`;
  const backup = dryRun ? null : writeConfigFile(file, next, exists);
  return { status, file, content, backup };
}

/**
 * Remove the ctxman entry from a client config file.
 *
 * @param {Object} options
 * @param {string} options.client
 * @param {string} options.file
 * @param {string} [options.name='ctxman']
 * @param {boolean} [options.dryRun=false]
 * @returns {{status: 'removed'|'absent', file: string, content: string|null,
 *   backup: string|null}}
 */
export function uninstallServer({ client, file, name = DEFAULT_SERVER_NAME, dryRun = false }) {
  const { key } = getClient(client);
  const { exists, config } = readConfigFile(file, key);
  if (!exists || !config[key] || !(name in config[key])) {
    return { status: 'absent', file, content: null, backup: null };
  }
  const { [name]: _removed, ...servers } = config[key];
  const next = { ...config, [key]: servers };
  const content = `${JSON.stringify(next, null, 2)}\n`;
  const backup = dryRun ? null : writeConfigFile(file, next, true);
  return { status: 'removed', file, content, backup };
}
