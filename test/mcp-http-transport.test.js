import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import MCPServer from '../lib/api/mcp/server.js';
import { HttpSseTransport } from '../lib/api/mcp/transports/HttpSseTransport.js';

// The real SDK transport behind the Express app (test/mcp-transport.test.js mocks it)
describe('MCP over HTTP', () => {
  let transport;

  afterEach(async () => {
    await transport?.close();
  });

  const connect = async (options = {}) => {
    transport = new HttpSseTransport(options);
    await new MCPServer().start(transport.transport);
    return transport.app;
  };

  const initialize = (app) =>
    request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });

  it('answers initialize with the server info and a session id', async () => {
    const response = await initialize(await connect());

    expect(response.status).toBe(200);
    expect(response.text).toContain('"name":"ctxman"');
    expect(response.headers['mcp-session-id']).toBeTruthy();
  });

  it('rejects a foreign Host header on the default loopback host', async () => {
    const response = await initialize(await connect()).set('Host', 'attacker.example');

    expect(response.status).toBe(403);
  });

  it('sends CORS headers only when enabled', async () => {
    const closed = await initialize(await connect()).set('Origin', 'https://site.example');
    expect(closed.headers['access-control-allow-origin']).toBeUndefined();
    await transport.close();

    const open = await initialize(await connect({ cors: true })).set(
      'Origin',
      'https://site.example'
    );
    expect(open.headers['access-control-allow-origin']).toBe('*');
  });
});
