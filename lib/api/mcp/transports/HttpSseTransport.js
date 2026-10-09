import cors from 'cors';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';

export class HttpSseTransport {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.host = options.host || '127.0.0.1';
    this.endpoint = options.endpoint || '/mcp';

    // JSON body parser plus, on a loopback host, Host header validation against DNS rebinding
    this.app = createMcpExpressApp({ host: this.host });

    // Off by default: with `Access-Control-Allow-Origin: *` any web page the user opens
    // could call the tools and read the project
    if (options.cors) {
      this.app.use(cors({ exposedHeaders: ['Mcp-Session-Id'] }));
    }

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
    // express.json() has already consumed the request stream, so hand over the parsed body
    this.app.all(this.endpoint, async (req, res) => {
      await this.transport.handleRequest(req, res, req.body);
    });

    // Support for separate messages endpoint if needed, but StreamableHTTPServerTransport handles it
    this.app.post(`${this.endpoint}/messages`, async (req, res) => {
      await this.transport.handleRequest(req, res, req.body);
    });
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, this.host, () => {
        console.error(
          `MCP HTTP/SSE Server running at http://${this.host}:${this.port}${this.endpoint}`
        );
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
