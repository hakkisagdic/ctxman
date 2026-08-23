import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptProvider } from '../lib/api/mcp/prompts.js';
import fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
}));

// Mock logger
vi.mock('../lib/utils/logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock Scanner
vi.mock('../lib/core/Scanner.js', () => ({
  Scanner: class {
    scan() {
      return [{ relativePath: 'src/index.js', path: '/test/src/index.js' }];
    }
  },
}));

// Mock Analyzer
const mockAnalyzer = {
  analyze: vi.fn().mockResolvedValue({
    stats: {
      totalFiles: 10,
      totalLines: 1000,
      totalTokens: 5000,
      byLanguage: { javascript: { files: 10 } },
    },
  }),
};

describe('PromptProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new PromptProvider(mockAnalyzer);
    vi.clearAllMocks();
    fs.readFileSync.mockReturnValue('function test() { return 42; }');
  });

  describe('initialization', () => {
    it('should initialize with default templates', () => {
      expect(provider.templates).toBeDefined();
      expect(Object.keys(provider.templates).length).toBe(5);
      expect(provider.templates).toHaveProperty('code_review');
      expect(provider.templates).toHaveProperty('refactor_code');
      expect(provider.templates).toHaveProperty('explain_codebase');
      expect(provider.templates).toHaveProperty('debug_issue');
      expect(provider.templates).toHaveProperty('write_tests');
    });

    it('should use provided analyzer and contextBuilder', () => {
      const customAnalyzer = { test: true };
      const customBuilder = { test: true };
      const customProvider = new PromptProvider(customAnalyzer, customBuilder);

      expect(customProvider.analyzer).toBe(customAnalyzer);
      expect(customProvider.contextBuilder).toBe(customBuilder);
    });
  });

  describe('listPrompts', () => {
    it('should return list of all prompts', () => {
      const result = provider.listPrompts();

      expect(result.prompts).toBeDefined();
      expect(result.prompts.length).toBe(5);
    });

    it('should include proper prompt metadata', () => {
      const result = provider.listPrompts();

      result.prompts.forEach((prompt) => {
        expect(prompt).toHaveProperty('name');
        expect(prompt).toHaveProperty('title');
        expect(prompt).toHaveProperty('description');
        expect(prompt).toHaveProperty('arguments');
      });
    });

    it('should include argument details', () => {
      const result = provider.listPrompts();
      const codeReview = result.prompts.find((p) => p.name === 'code_review');

      expect(codeReview.arguments).toBeInstanceOf(Array);
      expect(codeReview.arguments.length).toBeGreaterThan(0);

      codeReview.arguments.forEach((arg) => {
        expect(arg).toHaveProperty('name');
        expect(arg).toHaveProperty('description');
        expect(arg).toHaveProperty('required');
      });
    });
  });

  describe('getPrompt', () => {
    it('should throw error for unknown prompt', async () => {
      await expect(provider.getPrompt('unknown_prompt', {})).rejects.toThrow(
        'Prompt template not found'
      );
    });

    it('should validate required arguments', async () => {
      await expect(provider.getPrompt('debug_issue', {})).rejects.toThrow(
        'Missing required argument: error'
      );
    });

    it('should return prompt structure', async () => {
      const result = await provider.getPrompt('code_review', { code: 'test code' });

      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('messages');
      expect(result.messages).toBeInstanceOf(Array);
    });
  });

  describe('code_review prompt', () => {
    it('should work with code argument', async () => {
      const result = await provider.getPrompt('code_review', { code: 'const x = 1;' });

      expect(result.messages.length).toBe(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
      expect(result.messages[0].content.text).toContain('const x = 1;');
    });

    it('should work with filePath argument', async () => {
      const result = await provider.getPrompt('code_review', { filePath: '/test/file.js' });

      expect(fs.readFileSync).toHaveBeenCalledWith('/test/file.js', 'utf-8');
      expect(result.messages[0].content.text).toContain('function test()');
    });

    it('should include focus in prompt', async () => {
      const result = await provider.getPrompt('code_review', {
        code: 'test',
        focus: 'security',
      });

      expect(result.messages[0].content.text).toContain('security');
    });

    it('should throw error if neither code nor filePath provided', async () => {
      await expect(provider.getPrompt('code_review', {})).rejects.toThrow(
        "Either 'code' or 'filePath' must be provided"
      );
    });

    it('should handle file read errors', async () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(provider.getPrompt('code_review', { filePath: '/bad/path' })).rejects.toThrow(
        'Failed to read file'
      );
    });
  });

  describe('refactor_code prompt', () => {
    it('should require filePath', async () => {
      await expect(provider.getPrompt('refactor_code', {})).rejects.toThrow(
        'Missing required argument: filePath'
      );
    });

    it('should read file and generate prompt', async () => {
      const result = await provider.getPrompt('refactor_code', { filePath: '/test/file.js' });

      expect(fs.readFileSync).toHaveBeenCalledWith('/test/file.js', 'utf-8');
      expect(result.messages[0].content.text).toContain('refactoring strategies');
    });

    it('should include focus if provided', async () => {
      const result = await provider.getPrompt('refactor_code', {
        filePath: '/test/file.js',
        focus: 'performance',
      });

      expect(result.messages[0].content.text).toContain('performance');
    });
  });

  describe('explain_codebase prompt', () => {
    it('should require projectPath', async () => {
      await expect(provider.getPrompt('explain_codebase', {})).rejects.toThrow(
        'Missing required argument: projectPath'
      );
    });

    it('should analyze project and generate prompt', async () => {
      const result = await provider.getPrompt('explain_codebase', { projectPath: '/test' });

      expect(mockAnalyzer.analyze).toHaveBeenCalled();
      expect(result.messages[0].content.text).toContain('Total Files: 10');
      expect(result.messages[0].content.text).toContain('Total Tokens: 5000');
    });

    it('should include aspect if provided', async () => {
      const result = await provider.getPrompt('explain_codebase', {
        projectPath: '/test',
        aspect: 'architecture',
      });

      expect(result.messages[0].content.text).toContain('architecture');
    });
  });

  describe('debug_issue prompt', () => {
    it('should require error argument', async () => {
      await expect(provider.getPrompt('debug_issue', {})).rejects.toThrow(
        'Missing required argument: error'
      );
    });

    it('should work with just error message', async () => {
      const result = await provider.getPrompt('debug_issue', {
        error: "TypeError: Cannot read property 'x' of undefined",
      });

      expect(result.messages[0].content.text).toContain('TypeError');
    });

    it('should include stackTrace if provided', async () => {
      const result = await provider.getPrompt('debug_issue', {
        error: 'TypeError',
        stackTrace: 'at line 42',
      });

      expect(result.messages[0].content.text).toContain('at line 42');
    });

    it('should include file code if filePath provided', async () => {
      const result = await provider.getPrompt('debug_issue', {
        error: 'TypeError',
        filePath: '/test/file.js',
      });

      expect(fs.readFileSync).toHaveBeenCalledWith('/test/file.js', 'utf-8');
      expect(result.messages[0].content.text).toContain('function test()');
    });

    it('should handle file read errors gracefully', async () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = await provider.getPrompt('debug_issue', {
        error: 'TypeError',
        filePath: '/bad/file.js',
      });

      // Should not throw, just continue without code
      expect(result.messages[0].content.text).toContain('TypeError');
    });
  });

  describe('write_tests prompt', () => {
    it('should require filePath', async () => {
      await expect(provider.getPrompt('write_tests', {})).rejects.toThrow(
        'Missing required argument: filePath'
      );
    });

    it('should read file and generate prompt', async () => {
      const result = await provider.getPrompt('write_tests', { filePath: '/test/file.js' });

      expect(fs.readFileSync).toHaveBeenCalledWith('/test/file.js', 'utf-8');
      expect(result.messages[0].content.text).toContain('comprehensive tests');
    });

    it('should include specific functions if provided', async () => {
      const result = await provider.getPrompt('write_tests', {
        filePath: '/test/file.js',
        functions: 'foo,bar,baz',
      });

      expect(result.messages[0].content.text).toContain('foo,bar,baz');
    });

    it('should include framework if provided', async () => {
      const result = await provider.getPrompt('write_tests', {
        filePath: '/test/file.js',
        framework: 'vitest',
      });

      expect(result.messages[0].content.text).toContain('vitest');
    });
  });

  describe('validateArguments', () => {
    it('should pass for all required arguments present', () => {
      const template = provider.templates.debug_issue;
      expect(() => provider.validateArguments(template, { error: 'test' })).not.toThrow();
    });

    it('should throw for missing required arguments', () => {
      const template = provider.templates.debug_issue;
      expect(() => provider.validateArguments(template, {})).toThrow(
        'Missing required argument: error'
      );
    });

    it('should allow optional arguments to be missing', () => {
      const template = provider.templates.code_review;
      // code_review has no required arguments, only optional ones
      expect(() => provider.validateArguments(template, {})).not.toThrow();
    });
  });
});
