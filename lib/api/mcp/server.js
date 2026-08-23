import { Server } from '@modelcontextprotocol/sdk/server/index.js';

import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Analyzer } from '../../core/Analyzer.js';
import { ContextBuilder } from '../../core/ContextBuilder.js';
import { Scanner } from '../../core/Scanner.js';
import { GitClient } from '../../integrations/git/GitClient.js';
import { ResourceProvider } from './resources.js';
import { PromptProvider } from './prompts.js';
import fs from 'fs';

class MCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'ctxman',
        version: '3.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {
            subscribe: true,
            listChanged: true,
          },
          prompts: {
            listChanged: true,
          },
        },
      }
    );

    this.analyzer = new Analyzer();
    this.contextBuilder = new ContextBuilder();
    this.resourceProvider = new ResourceProvider();
    this.promptProvider = new PromptProvider(this.analyzer, this.contextBuilder);
    this.setupHandlers();
    this.setupErrorHandling();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'analyze_codebase',
            description: 'Analyze the codebase and return statistics and token counts',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Absolute path to the project root',
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'generate_context',
            description: 'Generate optimized context for LLMs from the codebase',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Absolute path to the project root',
                },
                template: {
                  type: 'string',
                  description: 'Context template (bug-fix, feature, etc.)',
                  enum: ['bug-fix', 'feature', 'review', 'refactor'],
                },
                maxTokens: {
                  type: 'number',
                  description: 'Maximum tokens for the context',
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'git_diff',
            description: 'Analyze git changes and return diff context',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Project root' },
                branch: {
                  type: 'string',
                  description: 'Branch to compare against (default: main)',
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'search_code',
            description: 'Search for code using regex or semantic search',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Project root' },
                query: { type: 'string', description: 'Search query' },
                type: { type: 'string', enum: ['regex', 'semantic'], default: 'regex' },
              },
              required: ['path', 'query'],
            },
          },
          {
            name: 'list_methods',
            description: 'List all methods/functions in a given file or project',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Absolute path to the project root or a specific file',
                },
                file: {
                  type: 'string',
                  description: 'Optional: Relative path to a specific file within the project',
                },
              },
              required: ['path'],
            },
          },
        ],
      };
    });

    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      const { cursor } = request.params || {};
      return await this.resourceProvider.listResources(cursor);
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      return await this.resourceProvider.readResource(uri);
    });

    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      return {
        resourceTemplates: this.resourceProvider.getResourceTemplates(),
      };
    });

    // Prompt handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      const { cursor } = request.params || {};
      return this.promptProvider.listPrompts(cursor);
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await this.promptProvider.getPrompt(name, args);
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'analyze_codebase': {
            const projectPath = args.path;

            // Update resource provider project path
            this.resourceProvider.projectPath = projectPath;

            const scanner = new Scanner(projectPath);
            const files = scanner.scan();
            const analysis = await this.analyzer.analyze(files);

            // Cache analysis result as a resource
            const analysisId = Date.now().toString();
            this.resourceProvider.cacheAnalysis(analysisId, analysis);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(analysis, null, 2),
                },
              ],
            };
          }
          case 'generate_context': {
            const projectPath = args.path;

            // Update resource provider project path
            this.resourceProvider.projectPath = projectPath;

            const scanner = new Scanner(projectPath);
            const files = scanner.scan();
            const analysis = await this.analyzer.analyze(files);

            // Configure ContextBuilder based on args
            const builderOptions = {
              targetTokens: args.maxTokens,
              useCase: args.template || 'custom',
            };
            const contextBuilder = new ContextBuilder(builderOptions);
            const context = contextBuilder.build(analysis);

            // Cache context as a resource
            const templateName = args.template || 'custom';
            const contextText = JSON.stringify(context, null, 2);
            this.resourceProvider.cacheContext(templateName, contextText);

            return {
              content: [
                {
                  type: 'text',
                  text: contextText,
                },
              ],
            };
          }
          case 'git_diff': {
            const projectPath = args.path;
            const gitClient = new GitClient(projectPath);
            const branch = args.branch || 'main';

            let diff;
            try {
              diff = gitClient.exec(`diff ${branch}`);
            } catch (e) {
              diff = `Error executing git diff: ${e.message}`;
            }

            return {
              content: [{ type: 'text', text: diff || 'No changes detected.' }],
            };
          }
          case 'search_code': {
            const { path: projectPath, query, type } = args;
            const scanner = new Scanner(projectPath);
            const files = scanner.scan();
            const results = [];

            for (const file of files) {
              try {
                const content = fs.readFileSync(file.path, 'utf-8');
                const lines = content.split('\n');

                lines.forEach((line, index) => {
                  let match = false;
                  if (type === 'regex') {
                    try {
                      if (new RegExp(query).test(line)) match = true;
                    } catch (_e) {
                      /* ignore invalid regex */
                    }
                  } else {
                    if (line.includes(query)) match = true;
                  }

                  if (match) {
                    results.push({
                      file: file.relativePath,
                      line: index + 1,
                      content: line.trim(),
                    });
                  }
                });
              } catch (_e) {
                // Skip read errors
              }
            }

            return {
              content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
            };
          }
          case 'list_methods': {
            const projectPath = args.path;
            const scanner = new Scanner(projectPath);
            const files = scanner.scan();

            // Use Analyzer with methodLevel: true
            const methodAnalyzer = new Analyzer({ methodLevel: true });
            const analysis = await methodAnalyzer.analyze(files);

            const methods = [];
            if (analysis.files) {
              for (const file of analysis.files) {
                if (file.methods && file.methods.length > 0) {
                  methods.push({
                    file: file.relativePath,
                    methods: file.methods,
                  });
                }
              }
            }

            return {
              content: [{ type: 'text', text: JSON.stringify(methods, null, 2) }],
            };
          }
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };
  }

  async start(transport) {
    if (!transport) {
      const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
      transport = new StdioServerTransport();
    }
    await this.server.connect(transport);
    console.error('Ctxman MCP Server running');
  }
}

export default MCPServer;
