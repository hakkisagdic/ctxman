#!/usr/bin/env node

// Kept for existing client configurations; `ctxman mcp` starts the same server
import { parseServerArgs, startMcpServer } from '../lib/api/mcp/start.js';

async function main() {
  try {
    await startMcpServer(parseServerArgs(process.argv.slice(2), { strict: false }));
  } catch (error) {
    console.error('Fatal error running MCP server:', error);
    process.exit(1);
  }
}

main();
