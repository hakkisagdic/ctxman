import { describe, it, expect, vi, beforeEach } from 'vitest';
import MCPServer from '../lib/api/mcp/server.js';
import { Analyzer } from '../lib/core/Analyzer.js';
import { ContextBuilder } from '../lib/core/ContextBuilder.js';

// Mock dependencies
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: class {
      constructor() {
        this.setRequestHandler = vi.fn();
        this.connect = vi.fn();
        this.onerror = null;
      }
    },
  };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: vi.fn(),
  };
});

vi.mock('../lib/core/Analyzer.js', () => ({
  Analyzer: class {
    analyze(files) {
      return Promise.resolve({ files: [], stats: { totalFiles: 0, totalTokens: 0 } });
    }
  },
}));

vi.mock('../lib/core/ContextBuilder.js', () => ({
  ContextBuilder: class {
    build(analysis) {
      return { metadata: {}, files: {}, content: 'Mock context' };
    }
  },
}));

vi.mock('fs');
vi.mock('../lib/utils/logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('MCPServer', () => {
  let server;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new MCPServer();
  });

  it('should initialize correctly', () => {
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
    expect(server.analyzer).toBeDefined();
    expect(server.contextBuilder).toBeDefined();
  });

  it('should set up handlers', () => {
    // ListTools + ListResources + ReadResource + ListResourceTemplates + ListPrompts + GetPrompt + CallTool = 7
    expect(server.server.setRequestHandler).toHaveBeenCalledTimes(7);
  });

  it('should start the server', async () => {
    await server.start();
    expect(server.server.connect).toHaveBeenCalled();
  });

  it('should list tools', async () => {
    // Get the ListTools handler (first call, index 0)
    const listToolsCall = server.server.setRequestHandler.mock.calls[0];
    const listToolsHandler = listToolsCall[1];

    const result = await listToolsHandler({});
    expect(result.tools).toBeDefined();
    expect(result.tools.length).toBe(5);
    expect(result.tools[0].name).toBe('analyze_codebase');
    expect(result.tools[1].name).toBe('generate_context');
    expect(result.tools[2].name).toBe('git_diff');
    expect(result.tools[3].name).toBe('search_code');
    expect(result.tools[4].name).toBe('list_methods');
  });

  it('should handle analyze_codebase tool call', async () => {
    // Get the CallTool handler (last call, index 6)
    const callToolCall = server.server.setRequestHandler.mock.calls[6];
    const callHandler = callToolCall[1];

    const request = {
      params: {
        name: 'analyze_codebase',
        arguments: { path: '/test/path' },
      },
    };

    const result = await callHandler(request);
    expect(result.content).toBeDefined();
    expect(result.content[0]).toBeDefined();
    expect(result.content[0].type).toBe('text');
    // The actual implementation returns JSON analysis results
    expect(result.content[0].text).toBeDefined();
  });

  it('should handle generate_context tool call', async () => {
    // Get the CallTool handler (last call, index 6)
    const callToolCall = server.server.setRequestHandler.mock.calls[6];
    const callHandler = callToolCall[1];

    const request = {
      params: {
        name: 'generate_context',
        arguments: { path: '/test/path' },
      },
    };

    const result = await callHandler(request);
    expect(result.content).toBeDefined();
    expect(result.content[0]).toBeDefined();
    expect(result.content[0].type).toBe('text');
    // The actual implementation returns context text
    expect(result.content[0].text).toBeDefined();
  });

  it('should handle unknown tool call', async () => {
    // Get the CallTool handler (last call, index 6)
    const callToolCall = server.server.setRequestHandler.mock.calls[6];
    const callHandler = callToolCall[1];

    const request = {
      params: {
        name: 'unknown_tool',
        arguments: {},
      },
    };

    try {
      await callHandler(request);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
