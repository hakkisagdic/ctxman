/**
 * MCP server startup shared by `ctxman mcp` (bin/cm-mcp.js) and bin/mcp-server.js
 */

import { parseArgs } from 'util';
import MCPServer from './server.js';
import { resolveRootDir } from './sandbox.js';

export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = '127.0.0.1';
export const TRANSPORTS = ['stdio', 'sse'];
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];

const SERVER_OPTIONS = {
  transport: { type: 'string' },
  port: { type: 'string' },
  host: { type: 'string' },
  'api-key': { type: 'string' },
  cors: { type: 'boolean' },
  root: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

/**
 * Parse the server options. Both `--port=3000` and `--port 3000` are accepted.
 *
 * @param {string[]} argv - Arguments after the command name
 * @param {Object} [options]
 * @param {boolean} [options.strict=true] - Reject unknown options, positionals and invalid
 *   values. bin/mcp-server.js passes false to keep its old tolerance: unknown options are
 *   ignored and an unknown transport means stdio.
 * @returns {{transport: string, port: number, host: string, apiKey?: string, cors: boolean,
 *   root?: string, help: boolean}}
 * @throws {Error} In strict mode, on unknown options or invalid values
 */
export function parseServerArgs(argv, { strict = true } = {}) {
  const { values } = parseArgs({
    args: argv,
    options: SERVER_OPTIONS,
    strict,
    allowPositionals: !strict,
  });
  // Lenient parsing turns a string option without a value into `true`
  const text = (value) => (typeof value === 'string' ? value : undefined);

  let transport = text(values.transport) ?? 'stdio';
  if (!TRANSPORTS.includes(transport)) {
    if (strict) {
      throw new Error(`Unknown transport "${transport}" (expected ${TRANSPORTS.join(' or ')})`);
    }
    transport = 'stdio';
  }

  const portText = text(values.port);
  let port = DEFAULT_PORT;
  // Like before, bin/mcp-server.js treats an empty `--port=` as the default
  if (portText !== undefined && (strict || portText)) {
    port = strict ? Number(portText) : parseInt(portText, 10);
    // Lenient mode only cares about the port when it is going to listen on it
    if (
      !(Number.isInteger(port) && port >= 0 && port <= 65535) &&
      (strict || transport === 'sse')
    ) {
      throw new Error(`Invalid port "${portText}"`);
    }
  }

  return {
    transport,
    port,
    host: text(values.host) ?? DEFAULT_HOST,
    apiKey: text(values['api-key']),
    cors: values.cors === true,
    root: text(values.root),
    help: values.help === true,
  };
}

/**
 * Start the MCP server.
 *
 * With the stdio transport stdout is the JSON-RPC channel, so console.log/info/debug (logger
 * lines, ignore-rule notices) are redirected to stderr for the rest of the process.
 *
 * @param {ReturnType<typeof parseServerArgs>} options
 * @param {Object} [context]
 * @param {Object} [context.env=process.env] - Read for CTXMAN_MCP_ROOT when --root is absent
 * @returns {Promise<{server: MCPServer, root: string|null, transport?: Object}>}
 */
export async function startMcpServer(options, { env = process.env } = {}) {
  const rootOption = options.root ?? (env.CTXMAN_MCP_ROOT || undefined);
  const root = rootOption ? resolveRootDir(rootOption) : null;

  if (options.transport !== 'sse') {
    console.log = console.info = console.debug = console.error;
  }

  const server = new MCPServer({ root });
  if (root) {
    console.error(`Ctxman MCP Server confined to ${root}`);
  }

  if (options.transport === 'sse') {
    const host = options.host ?? DEFAULT_HOST;
    if (!options.apiKey && !LOOPBACK_HOSTS.includes(host)) {
      console.error(
        `Warning: listening on ${host} without --api-key; anyone who can reach it can read the project`
      );
    }
    // Loaded only for this transport: it pulls in express
    const { HttpSseTransport } = await import('./transports/HttpSseTransport.js');
    const transport = new HttpSseTransport({
      port: options.port ?? DEFAULT_PORT,
      host,
      cors: options.cors,
      auth: options.apiKey ? { apiKey: options.apiKey } : undefined,
    });
    await transport.start();
    await server.start(transport.transport);
    return { server, root, transport };
  }

  await server.start();
  return { server, root };
}
