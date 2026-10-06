import { describe, it, expect, vi, beforeEach } from 'vitest';
import MCPServer from '../lib/api/mcp/server.js';
import { Scanner } from '../lib/core/Scanner.js';
import { Analyzer } from '../lib/core/Analyzer.js';
import { ContextBuilder } from '../lib/core/ContextBuilder.js';
import { GitClient } from '../lib/integrations/git/GitClient.js';
import { CallToolRequestSchema as _CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';

// Mock fs to prevent side effects in constructors
vi.mock('fs', () => {
  return {
    readFileSync: vi.fn().mockReturnValue(''),
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
      size: 100,
      mtime: new Date(),
      birthtime: new Date(),
    }),
    readdirSync: vi.fn().mockReturnValue([]),
    default: {
      readFileSync: vi.fn().mockReturnValue(''),
      existsSync: vi.fn().mockReturnValue(true),
      statSync: vi.fn().mockReturnValue({
        isDirectory: () => false,
        isFile: () => true,
        size: 100,
        mtime: new Date(),
        birthtime: new Date(),
      }),
      readdirSync: vi.fn().mockReturnValue([]),
    },
  };
});

vi.mock('../lib/utils/logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class {
    constructor() {
      this.setRequestHandler = vi.fn();
      this.connect = vi.fn();
      this.onerror = null;
    }
  },
}));

describe('MCPServer Tool Logic', () => {
  let server;

  beforeEach(() => {
    vi.clearAllMocks();

    // Spy on prototypes
    vi.spyOn(Scanner.prototype, 'scan').mockReturnValue([
      { path: '/test/file.js', relativePath: 'file.js' },
    ]);
    vi.spyOn(Analyzer.prototype, 'analyze').mockResolvedValue({ files: [], stats: {} });
    vi.spyOn(ContextBuilder.prototype, 'build').mockReturnValue({ metadata: {}, files: {} });
    vi.spyOn(GitClient.prototype, 'exec').mockReturnValue('diff output');

    // Mock GitClient checkIsGitRepository to avoid error
    vi.spyOn(GitClient.prototype, 'checkIsGitRepository').mockReturnValue(true);

    server = new MCPServer();
  });

  it('should handle analyze_codebase', async () => {
    // CallTool handler is at index 6 (last handler)
    const handler = server.server.setRequestHandler.mock.calls[6][1];

    const result = await handler({
      params: { name: 'analyze_codebase', arguments: { path: '/test' } },
    });

    expect(Scanner.prototype.scan).toHaveBeenCalled();
    expect(Analyzer.prototype.analyze).toHaveBeenCalled();
    expect(JSON.parse(result.content[0].text)).toEqual({ files: [], stats: {} });
  });

  it('should handle generate_context', async () => {
    // CallTool handler is at index 6 (last handler)
    const handler = server.server.setRequestHandler.mock.calls[6][1];
    const _result = await handler({
      params: { name: 'generate_context', arguments: { path: '/test', maxTokens: 1000 } },
    });

    expect(ContextBuilder.prototype.build).toHaveBeenCalled();
  });

  it('should handle git_diff', async () => {
    // CallTool handler is at index 6 (last handler)
    const handler = server.server.setRequestHandler.mock.calls[6][1];
    const result = await handler({
      params: { name: 'git_diff', arguments: { path: '/test', branch: 'dev' } },
    });

    expect(GitClient.prototype.exec).toHaveBeenCalledWith(['diff', 'dev', '--']);
    expect(result.content[0].text).toBe('diff output');
  });

  it('should reject an unsafe git_diff branch without running git', async () => {
    const handler = server.server.setRequestHandler.mock.calls[6][1];
    const result = await handler({
      params: { name: 'git_diff', arguments: { path: '/test', branch: 'main; touch x' } },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid branch or ref');
    expect(GitClient.prototype.exec).not.toHaveBeenCalled();
  });

  it('should handle search_code', async () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('line 1\nmatch line\nline 3');
    // CallTool handler is at index 6 (last handler)
    const handler = server.server.setRequestHandler.mock.calls[6][1];

    const result = await handler({
      params: { name: 'search_code', arguments: { path: '/test', query: 'match', type: 'regex' } },
    });

    const searchResults = JSON.parse(result.content[0].text);
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].content).toBe('match line');
  });

  it('should handle list_methods', async () => {
    // Mock Analyzer for method extraction
    const methodAnalysis = {
      files: [
        {
          relativePath: 'file.js',
          methods: [{ name: 'testMethod', line: 10 }],
        },
      ],
    };
    Analyzer.prototype.analyze.mockResolvedValueOnce(methodAnalysis);

    // CallTool handler is at index 6 (last handler)
    const handler = server.server.setRequestHandler.mock.calls[6][1];
    const result = await handler({
      params: { name: 'list_methods', arguments: { path: '/test/file.js' } },
    });

    const methods = JSON.parse(result.content[0].text);
    expect(methods).toHaveLength(1);
    expect(methods[0].methods[0].name).toBe('testMethod');
  });
});

// Note: mcp-tools integration tests complete.
// All tools (analyze_codebase, generate_context, git_diff, search_code, list_methods)
// now tested with correct handler index for new server structure with Resources and Prompts.
