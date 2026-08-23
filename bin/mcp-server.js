#!/usr/bin/env node

import MCPServer from '../lib/api/mcp/server.js';
import { HttpSseTransport } from '../lib/api/mcp/transports/HttpSseTransport.js';

const args = process.argv.slice(2);
const transportType = args.includes('--transport=sse') ? 'sse' : 'stdio';
const port = args.find((arg) => arg.startsWith('--port='))?.split('=')[1] || 3000;
const apiKey = args.find((arg) => arg.startsWith('--api-key='))?.split('=')[1];

const server = new MCPServer();

async function main() {
  try {
    if (transportType === 'sse') {
      const transport = new HttpSseTransport({
        port: parseInt(port),
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
