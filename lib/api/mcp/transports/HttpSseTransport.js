import express from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';

export class HttpSseTransport {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.endpoint = options.endpoint || '/mcp';
    this.app = express();

    this.app.use(cors());
    this.app.use(express.json());

    // Authentication Middleware
    if (options.auth && options.auth.apiKey) {
      this.app.use((req, res, next) => {
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        if (!apiKey || apiKey !== options.auth.apiKey) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
      });
    }

    // Initialize StreamableHTTPServerTransport
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: false, // Prefer SSE
      ...options.transportOptions,
    });

    this.setupRoutes();
  }

  setupRoutes() {
    // Handle all requests to the endpoint via the transport
    this.app.all(this.endpoint, async (req, res) => {
      await this.transport.handleRequest(req, res);
    });

    // Support for separate messages endpoint if needed, but StreamableHTTPServerTransport handles it
    this.app.post(`${this.endpoint}/messages`, async (req, res) => {
      await this.transport.handleRequest(req, res);
    });
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.error(`MCP HTTP/SSE Server running on port ${this.port} at ${this.endpoint}`);
        resolve(this.transport);
      });
    });
  }

  async close() {
    if (this.server) {
      this.server.close();
    }
    await this.transport.close();
  }
}
