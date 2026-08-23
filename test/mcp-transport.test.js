import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { HttpSseTransport } from '../lib/api/mcp/transports/HttpSseTransport.js';
import express from 'express';
import request from 'supertest';

// Mock StreamableHTTPServerTransport
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
  return {
    StreamableHTTPServerTransport: class {
      constructor(options) {
        this.options = options;
        this.handleRequest = vi.fn(async (req, res) => {
          res.status(200).send('Mock MCP Response');
        });
        this.close = vi.fn();
      }
    },
  };
});

describe('HttpSseTransport', () => {
  let transport;

  afterEach(async () => {
    if (transport) {
      await transport.close();
    }
  });

  it('should initialize with default options', () => {
    transport = new HttpSseTransport();
    expect(transport.port).toBe(3000);
    expect(transport.endpoint).toBe('/mcp');
  });

  it('should initialize with custom options', () => {
    transport = new HttpSseTransport({ port: 4000, endpoint: '/api/mcp' });
    expect(transport.port).toBe(4000);
    expect(transport.endpoint).toBe('/api/mcp');
  });

  it('should handle requests without auth', async () => {
    transport = new HttpSseTransport();
    const response = await request(transport.app).get('/mcp');
    expect(response.status).toBe(200);
    expect(response.text).toBe('Mock MCP Response');
  });

  it('should enforce authentication when configured', async () => {
    transport = new HttpSseTransport({ auth: { apiKey: 'secret-key' } });

    // No key
    let response = await request(transport.app).get('/mcp');
    expect(response.status).toBe(401);

    // Wrong key
    response = await request(transport.app).get('/mcp').set('x-api-key', 'wrong-key');
    expect(response.status).toBe(401);

    // Correct key via header
    response = await request(transport.app).get('/mcp').set('x-api-key', 'secret-key');
    expect(response.status).toBe(200);

    // Correct key via query param
    response = await request(transport.app).get('/mcp?apiKey=secret-key');
    expect(response.status).toBe(200);
  });
});
