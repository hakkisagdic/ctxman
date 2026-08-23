/**
 * McpClient - Connects Desktop App to MCP Server
 * Uses @modelcontextprotocol/sdk client
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { getLogger } from '../../lib/utils/logger.js';

const logger = getLogger('McpClient');

export class McpClient {
  constructor() {
    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  /**
   * Connect to MCP server
   * @param {Object} options - Connection options
   * @returns {Promise<void>}
   */
  async connect(options = {}) {
    try {
      logger.info('Connecting to MCP server...');

      // Spawn MCP server process
      const serverProcess = spawn('node', ['lib/api/mcp/server.js'], {
        cwd: options.cwd || process.cwd(),
      });

      // Create stdio transport
      this.transport = new StdioClientTransport({
        command: serverProcess,
      });

      // Create client
      this.client = new Client(
        {
          name: 'ctxman-desktop',
          version: '3.3.0',
        },
        {
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
        }
      );

      // Connect
      await this.client.connect(this.transport);
      this.connected = true;

      logger.info('Connected to MCP server');
    } catch (error) {
      logger.error(`Failed to connect to MCP server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.connected = false;
      logger.info('Disconnected from MCP server');
    }
  }

  /**
   * List available tools
   */
  async listTools() {
    if (!this.connected) throw new Error('Not connected to MCP server');
    return await this.client.request({ method: 'tools/list' }, {});
  }

  /**
   * Call a tool
   */
  async callTool(name, args = {}) {
    if (!this.connected) throw new Error('Not connected to MCP server');

    return await this.client.request(
      {
        method: 'tools/call',
        params: { name, arguments: args },
      },
      {}
    );
  }

  /**
   * List resources
   */
  async listResources(cursor = null) {
    if (!this.connected) throw new Error('Not connected to MCP server');

    return await this.client.request(
      {
        method: 'resources/list',
        params: cursor ? { cursor } : {},
      },
      {}
    );
  }

  /**
   * Read resource
   */
  async readResource(uri) {
    if (!this.connected) throw new Error('Not connected to MCP server');

    return await this.client.request(
      {
        method: 'resources/read',
        params: { uri },
      },
      {}
    );
  }

  /**
   * List prompts
   */
  async listPrompts() {
    if (!this.connected) throw new Error('Not connected to MCP server');

    return await this.client.request(
      {
        method: 'prompts/list',
      },
      {}
    );
  }

  /**
   * Get prompt
   */
  async getPrompt(name, args = {}) {
    if (!this.connected) throw new Error('Not connected to MCP server');

    return await this.client.request(
      {
        method: 'prompts/get',
        params: { name, arguments: args },
      },
      {}
    );
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }
}

export default McpClient;
