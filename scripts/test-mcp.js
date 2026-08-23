import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mcpServerPath = path.resolve(__dirname, '../bin/mcp-server.js');

console.log('Starting MCP server at:', mcpServerPath);

const server = spawn('node', [mcpServerPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

const request = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {},
};

server.stdout.on('data', (data) => {
  console.log('Received:', data.toString());
  try {
    const response = JSON.parse(data.toString());
    if (response.result && response.result.tools) {
      console.log('✅ Success: Received tools list');
      console.log(
        'Tools:',
        response.result.tools.map((t) => t.name)
      );
      process.exit(0);
    }
  } catch (_e) {
    // Ignore partial chunks
  }
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Send request
console.log('Sending request:', JSON.stringify(request));
server.stdin.write(JSON.stringify(request) + '\n');
