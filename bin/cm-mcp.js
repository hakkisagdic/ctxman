#!/usr/bin/env node

/**
 * ctxman mcp: start the MCP server, or add it to an MCP client's configuration
 *
 *   ctxman mcp [--transport stdio|sse] [--port N] [--host H] [--api-key K] [--cors] [--root DIR]
 *   ctxman mcp install   --client NAME [--scope user|project] [--name N] [--dry-run] [--print]
 *   ctxman mcp uninstall --client NAME [--scope user|project] [--name N] [--dry-run]
 *   ctxman mcp config    --client NAME [--scope user|project] [--name N]
 */

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { parseServerArgs, startMcpServer } from '../lib/api/mcp/start.js';
import {
  CLIENTS,
  DEFAULT_SERVER_NAME,
  SCOPES,
  buildServerEntry,
  buildSnippet,
  getClient,
  installServer,
  manualCommands,
  resolveConfigPath,
  uninstallServer,
} from '../lib/api/mcp/install.js';

const SETUP_COMMANDS = ['install', 'uninstall', 'config'];

const SETUP_OPTIONS = {
  client: { type: 'string' },
  scope: { type: 'string' },
  name: { type: 'string' },
  project: { type: 'string' },
  file: { type: 'string' },
  root: { type: 'string' },
  npx: { type: 'boolean' },
  force: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  print: { type: 'boolean' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

// What to do after the config file changed
const NEXT_STEPS = {
  'claude-desktop': 'Restart Claude Desktop to load the server.',
  'claude-code':
    'Claude Code asks you to approve servers from .mcp.json on its next start; `claude mcp list` shows them.',
  cursor: 'Restart Cursor (or toggle the server in Settings > MCP) to load it.',
  vscode: 'Start the server from the .vscode/mcp.json editor or the "MCP: List Servers" command.',
  windsurf: 'Refresh the MCP servers in Cascade to load it.',
};

function printHelp() {
  const clientLines = Object.entries(CLIENTS).map(([id, info]) => {
    const scopes = SCOPES.filter((scope) => [...info.scopes, ...info.manualScopes].includes(scope))
      .map((scope) => {
        const mark = scope === info.defaultScope ? `${scope}*` : scope;
        return info.scopes.includes(scope) ? mark : `${mark} (prints instructions)`;
      })
      .join(', ');
    return `  ${id.padEnd(16)}${scopes}`;
  });

  console.log(`ctxman mcp - Model Context Protocol server for AI assistants

Usage:
  ctxman mcp [options]                      Start the server (stdio by default)
  ctxman mcp install --client <name>        Add the server to an MCP client's configuration
  ctxman mcp uninstall --client <name>      Remove it again
  ctxman mcp config --client <name>         Print the configuration snippet

Server options:
  --transport <stdio|sse>   Transport (default: stdio); sse serves streamable HTTP on /mcp
  --port <n>                HTTP port (default: 3000)
  --host <address>          HTTP address (default: 127.0.0.1)
  --api-key <key>           Require this key (x-api-key header) on HTTP
  --cors                    Send CORS headers on HTTP (off by default)
  --root <dir>              Confine every tool path to <dir> (or set CTXMAN_MCP_ROOT)

Client setup options:
  --client <name>           ${Object.keys(CLIENTS).join(', ')}
  --scope <user|project>    Which configuration (default: the starred scope below)
  --name <name>             Server name in the configuration (default: ${DEFAULT_SERVER_NAME})
  --project <dir>           Project directory for --scope project (default: current directory)
  --file <path>             Use this configuration file instead of the client's default
  --npx                     Run \`npx -y ctxman mcp\` instead of this installation
  --root <dir>              Start the server with --root <dir>
  --force                   Replace an existing, different entry of the same name
  --dry-run                 Show the result without writing anything
  --print                   Print the snippet instead of writing (same as \`config\`)
  --json                    Print the result as JSON (install, uninstall)

Clients and scopes:
${clientLines.join('\n')}

Before writing, the previous file is kept as <file>.bak. Other servers stay as they are.

Examples:
  ctxman mcp install --client claude-desktop
  ctxman mcp install --client claude-code --scope project --npx
  ctxman mcp install --client cursor --dry-run
  ctxman mcp config --client vscode
  ctxman mcp --transport sse --port 3333 --api-key secret
  ctxman mcp --root ~/code/my-project`);
}

class UsageError extends Error {}

/**
 * Describe where the entry goes when ctxman does not write the file itself
 */
function printManual(client, scope, name, entry, target, uninstall = false) {
  const info = getClient(client);
  console.error(`${info.label} (${scope} scope): ${target.reason}`);
  if (uninstall) {
    if (client === 'claude-code') {
      console.log(`claude mcp remove --scope user ${name}`);
    } else {
      console.error(`Remove the "${name}" entry under "${info.key}" by hand.`);
    }
    return;
  }
  const commands = manualCommands(client, scope, name, entry);
  if (commands.length > 0) {
    console.error('Run:');
    for (const command of commands) console.log(command);
    console.error('Or add this to the configuration:');
  } else {
    console.error('Add this to the configuration:');
  }
  console.log(JSON.stringify(buildSnippet(client, name, entry), null, 2));
}

function runSetup(command, argv) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: SETUP_OPTIONS, strict: true }));
  } catch (error) {
    throw new UsageError(error.message);
  }
  if (values.help) {
    printHelp();
    return 0;
  }
  if (!values.client) throw new UsageError('--client is required');
  let info;
  try {
    info = getClient(values.client);
  } catch (error) {
    throw new UsageError(error.message);
  }
  const client = values.client;
  const scope = values.scope ?? info.defaultScope;
  if (!SCOPES.includes(scope)) {
    throw new UsageError(`Unknown scope "${scope}" (expected user or project)`);
  }
  if (!values.file && ![...info.scopes, ...info.manualScopes].includes(scope)) {
    throw new UsageError(`${info.label} has no ${scope} configuration`);
  }
  const name = values.name ?? DEFAULT_SERVER_NAME;
  if (!/^[\w.-]+$/.test(name)) {
    throw new UsageError(`Invalid server name "${name}" (letters, digits, _ . - only)`);
  }
  const projectDir = path.resolve(values.project ?? process.cwd());
  if (scope === 'project' && !fs.statSync(projectDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new UsageError(`Project directory does not exist: ${projectDir}`);
  }
  let root;
  if (values.root) {
    root = path.resolve(values.root);
    if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
      throw new UsageError(`--root is not an existing directory: ${root}`);
    }
  }

  const entry = buildServerEntry(client, { npx: values.npx, root });
  const target = values.file
    ? { path: path.resolve(values.file) }
    : resolveConfigPath(client, scope, { projectDir });

  if (command === 'config' || values.print) {
    if (target.path) {
      console.error(`Add this to ${target.path} (${info.label}, ${scope} scope):`);
      console.log(JSON.stringify(buildSnippet(client, name, entry), null, 2));
    } else {
      printManual(client, scope, name, entry, target);
    }
    return 0;
  }

  if (!target.path) {
    printManual(client, scope, name, entry, target, command === 'uninstall');
    return 0;
  }

  const dryRun = values['dry-run'] === true;
  const result =
    command === 'install'
      ? installServer({ client, file: target.path, entry, name, force: values.force, dryRun })
      : uninstallServer({ client, file: target.path, name, dryRun });

  if (values.json) {
    console.log(JSON.stringify({ client, scope, name, dryRun, ...result }, null, 2));
    return result.status === 'conflict' ? 1 : 0;
  }

  const where = `${target.path} (${info.label}, ${scope} scope)`;
  switch (result.status) {
    case 'conflict':
      console.error(`${where} already has a different "${name}" entry:`);
      console.error(JSON.stringify(result.existing, null, 2));
      console.error('Use --force to replace it (the old file is kept as .bak), or --name.');
      return 1;
    case 'unchanged':
      console.log(`"${name}" is already set up in ${where}; nothing changed.`);
      return 0;
    case 'absent':
      console.log(`No "${name}" entry in ${where}; nothing changed.`);
      return 0;
    default:
      break;
  }

  const verb = { created: 'Created', added: 'Added', updated: 'Replaced', removed: 'Removed' }[
    result.status
  ];
  if (dryRun) {
    console.log(`Dry run: would write ${target.path}:`);
    console.log(result.content.trimEnd());
    return 0;
  }
  const subject = result.status === 'created' ? where : `"${name}" in ${where}`;
  console.log(`${verb} ${subject}`);
  if (result.backup) console.log(`Previous version: ${result.backup}`);
  if (command === 'install') {
    if (scope === 'project' && !values.npx) {
      console.log(
        'The entry holds absolute paths of this machine; use --npx for a file you commit.'
      );
    }
    console.log(NEXT_STEPS[client]);
  }
  return 0;
}

async function runServer(argv) {
  let options;
  try {
    options = parseServerArgs(argv, { strict: true });
  } catch (error) {
    throw new UsageError(error.message);
  }
  if (options.help) {
    printHelp();
    return;
  }
  try {
    await startMcpServer(options);
  } catch (error) {
    console.error('Fatal error running MCP server:', error.message);
    process.exit(1);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const [first, ...rest] = argv;
  try {
    if (first === 'help') {
      printHelp();
    } else if (SETUP_COMMANDS.includes(first)) {
      process.exitCode = runSetup(first, rest);
    } else if (first !== undefined && !first.startsWith('-')) {
      throw new UsageError(`Unknown mcp command "${first}"`);
    } else {
      await runServer(argv);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`Error: ${error.message}`);
      console.error('Run `ctxman mcp --help` for usage.');
      process.exitCode = 2;
      return;
    }
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
