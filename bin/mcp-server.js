#!/usr/bin/env node

import MCPServer from '../lib/api/mcp/server.js';
import { HttpSseTransport } from '../lib/api/mcp/transports/HttpSseTransport.js';

const args = process.argv.slice(2);
const transportType = args.includes('--transport=sse') ? 'sse' : 'stdio';
const port = args.find((arg) => arg.startsWith('--port='))?.split('=')[1] || 3000;
const apiKey = args.find((arg) => arg.startsWith('--api-key='))?.split('=')[1];
const host = args.find((arg) => arg.startsWith('--host='))?.split('=')[1] || '127.0.0.1';
const corsEnabled = args.includes('--cors');

// With the stdio transport stdout is the JSON-RPC channel, so anything printed with
// console.log (logger lines, ignore-rule notices) would corrupt it; send it to stderr.
if (transportType === 'stdio') {
  console.log = console.info = console.debug = console.error;
}

const server = new MCPServer();

async function main() {
  try {
    if (transportType === 'sse') {
      if (!apiKey && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
        console.error(
          `Warning: listening on ${host} without --api-key; anyone who can reach it can read the project`
        );
      }
      const transport = new HttpSseTransport({
        port: parseInt(port),
        host,
        cors: corsEnabled,
        auth: apiKey ? { apiKey } : undefined,
      });
      await transport.start();
      await server.start(transport.transport);
    } else {
      await server.start();
    }
  } catch (error) {
    console.error('Fatal error running MCP server:', error);
    process.exit(1);
  }
}

main();
