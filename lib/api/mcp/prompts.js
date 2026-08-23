import { getLogger } from '../../utils/logger.js';
import { Analyzer } from '../../core/Analyzer.js';
import { ContextBuilder } from '../../core/ContextBuilder.js';
import fs from 'fs';

const logger = getLogger('MCP:Prompts');

/**
 * PromptProvider manages MCP prompt templates
 * Provides reusable templates for common development workflows
 */
export class PromptProvider {
  constructor(analyzer = null, contextBuilder = null) {
    this.analyzer = analyzer || new Analyzer();
    this.contextBuilder = contextBuilder || new ContextBuilder();
    this.templates = this.initializeTemplates();
  }

  /**
   * Initialize default prompt templates
   * @private
   */
  initializeTemplates() {
    return {
      code_review: {
        name: 'code_review',
        title: 'Code Review',
        description: 'Analyze code quality, identify issues, and suggest improvements',
        arguments: [
          {
            name: 'code',
            description: 'The code to review (optional if filePath provided)',
            required: false,
          },
          {
            name: 'filePath',
            description: 'Path to the file to review',
            required: false,
          },
          {
            name: 'focus',
            description: 'Specific aspect to focus on (security, performance, readability, etc.)',
            required: false,
          },
        ],
        handler: this.codeReviewHandler.bind(this),
      },

      refactor_code: {
        name: 'refactor_code',
        title: 'Refactor Code',
        description: 'Suggest refactoring strategies to improve code structure and maintainability',
        arguments: [
          {
            name: 'filePath',
            description: 'Path to the file to refactor',
            required: true,
          },
          {
            name: 'focus',
            description: 'Refactoring focus (modularity, testability, performance, etc.)',
            required: false,
          },
        ],
        handler: this.refactorHandler.bind(this),
      },

      explain_codebase: {
        name: 'explain_codebase',
        title: 'Explain Codebase',
        description: 'Explain the architecture and structure of the codebase',
        arguments: [
          {
            name: 'projectPath',
            description: 'Path to the project root',
            required: true,
          },
          {
            name: 'aspect',
            description: 'Specific aspect to explain (architecture, dependencies, patterns, etc.)',
            required: false,
          },
        ],
        handler: this.explainCodebaseHandler.bind(this),
      },

      debug_issue: {
        name: 'debug_issue',
        title: 'Debug Issue',
        description: 'Help debug and diagnose code issues',
        arguments: [
          {
            name: 'error',
            description: 'Error message or description of the issue',
            required: true,
          },
          {
            name: 'stackTrace',
            description: 'Stack trace (if available)',
            required: false,
          },
          {
            name: 'filePath',
            description: 'Path to the file where the issue occurs',
            required: false,
          },
        ],
        handler: this.debugHandler.bind(this),
      },

      write_tests: {
        name: 'write_tests',
        title: 'Write Tests',
        description: 'Generate test cases for functions or modules',
        arguments: [
          {
            name: 'filePath',
            description: 'Path to the file to test',
            required: true,
          },
          {
            name: 'functions',
            description: 'Specific functions to test (comma-separated)',
            required: false,
          },
          {
            name: 'framework',
            description: 'Testing framework (vitest, jest, mocha, etc.)',
            required: false,
          },
        ],
        handler: this.writeTestsHandler.bind(this),
      },
    };
  }

  /**
   * List available prompts
   * @param {string} cursor - Optional cursor for pagination
   * @returns {Object} List of prompts
   */
  listPrompts(cursor = null) {
    const prompts = Object.values(this.templates).map((template) => ({
      name: template.name,
      title: template.title,
      description: template.description,
      arguments: template.arguments,
    }));

    logger.info(`Listed ${prompts.length} prompts`);
    return { prompts };
  }

  /**
   * Get a specific prompt with arguments
   * @param {string} name - Prompt name
   * @param {Object} args - Prompt arguments
   * @returns {Promise<Object>} Rendered prompt
   */
  async getPrompt(name, args = {}) {
    logger.info(`Getting prompt: ${name}`);

    const template = this.templates[name];
    if (!template) {
      throw new Error(`Prompt template not found: ${name}`);
    }

    // Validate required arguments
    this.validateArguments(template, args);

    // Execute template handler
    const messages = await template.handler(args);

    return {
      description: template.description,
      messages,
    };
  }

  /**
   * Validate prompt arguments
   * @private
   */
  validateArguments(template, args) {
    for (const arg of template.arguments) {
      if (arg.required && !(arg.name in args)) {
        throw new Error(`Missing required argument: ${arg.name}`);
      }
    }
  }

  /**
   * Code review prompt handler
   * @private
   */
  async codeReviewHandler(args) {
    let code = args.code;

    // If filePath provided, read the file
    if (args.filePath && !code) {
      try {
        code = fs.readFileSync(args.filePath, 'utf-8');
      } catch (error) {
        throw new Error(`Failed to read file: ${error.message}`);
      }
    }

    if (!code) {
      throw new Error("Either 'code' or 'filePath' must be provided");
    }

    const focusText = args.focus ? ` with focus on ${args.focus}` : '';
    const fileInfo = args.filePath ? ` from ${args.filePath}` : '';

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please review the following code${fileInfo}${focusText}:\n\n\`\`\`\n${code}\n\`\`\`\n\nProvide feedback on:\n1. Code quality and best practices\n2. Potential bugs or issues\n3. Performance considerations\n4. Readability and maintainability\n5. Suggested improvements`,
        },
      },
    ];
  }

  /**
   * Refactor prompt handler
   * @private
   */
  async refactorHandler(args) {
    const code = fs.readFileSync(args.filePath, 'utf-8');
    const focusText = args.focus ? ` focusing on ${args.focus}` : '';

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please suggest refactoring strategies for the following code from ${args.filePath}${focusText}:\n\n\`\`\`\n${code}\n\`\`\`\n\nProvide:\n1. Identified code smells\n2. Refactoring suggestions\n3. Expected benefits\n4. Implementation steps`,
        },
      },
    ];
  }

  /**
   * Explain codebase prompt handler
   * @private
   */
  async explainCodebaseHandler(args) {
    const Scanner = (await import('../../core/Scanner.js')).Scanner;
    const scanner = new Scanner(args.projectPath);
    const files = scanner.scan();
    const analysis = await this.analyzer.analyze(files);

    const aspectText = args.aspect ? ` with focus on ${args.aspect}` : '';
    const stats = analysis.stats;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please explain the codebase at ${args.projectPath}${aspectText}.\n\nCodebase Statistics:\n- Total Files: ${stats.totalFiles}\n- Total Lines: ${stats.totalLines}\n- Total Tokens: ${stats.totalTokens}\n- Languages: ${Object.keys(stats.byLanguage || {}).join(', ')}\n\nProvide:\n1. Architecture overview\n2. Key components and their relationships\n3. Design patterns used\n4. Technology stack\n5. Notable characteristics`,
        },
      },
    ];
  }

  /**
   * Debug prompt handler
   * @private
   */
  async debugHandler(args) {
    let debugContext = `Error: ${args.error}`;

    if (args.stackTrace) {
      debugContext += `\n\nStack Trace:\n${args.stackTrace}`;
    }

    if (args.filePath) {
      try {
        const code = fs.readFileSync(args.filePath, 'utf-8');
        debugContext += `\n\nRelevant Code (${args.filePath}):\n\`\`\`\n${code}\n\`\`\``;
      } catch (error) {
        // File read failed, continue without code
      }
    }

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please help debug the following issue:\n\n${debugContext}\n\nProvide:\n1. Root cause analysis\n2. Possible fixes\n3. Prevention strategies\n4. Related best practices`,
        },
      },
    ];
  }

  /**
   * Write tests prompt handler
   * @private
   */
  async writeTestsHandler(args) {
    const code = fs.readFileSync(args.filePath, 'utf-8');
    const functionsText = args.functions ? ` for functions: ${args.functions}` : '';
    const frameworkText = args.framework ? ` using ${args.framework}` : '';

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please write comprehensive tests${functionsText}${frameworkText} for the following code from ${args.filePath}:\n\n\`\`\`\n${code}\n\`\`\`\n\nProvide:\n1. Unit tests for individual functions\n2. Edge case tests\n3. Integration tests (if applicable)\n4. Mock/stub examples\n5. Test organization suggestions`,
        },
      },
    ];
  }
}
