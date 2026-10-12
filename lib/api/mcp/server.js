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
import { GitClient, isValidGitRef } from '../../integrations/git/GitClient.js';
import { renderRepoMap } from '../../map/index.js';
import { ResourceProvider } from './resources.js';
import { PromptProvider } from './prompts.js';
import { buildPrContext } from '../../pr/pr-context.js';
import { resolveRootDir, resolveSandboxPath } from './sandbox.js';
import { searchProject, DEFAULT_LIMIT, DEFAULT_MAX_TOKENS } from '../../search/bm25.js';
import { getSymbol } from '../../search/symbols.js';
import { countForModel } from '../../count/index.js';
import { explainHistory } from '../../why/index.js';
import { packContext, describePack, TOOL_DEFAULT_BUDGET } from '../../pack/index.js';
import { loadPolicy, guardExport } from '../../policy/index.js';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const { version } = createRequire(import.meta.url)('../../../package.json');

// Tools whose `path` may also name a single file
const FILE_PATH_TOOLS = new Set(['list_methods']);

class MCPServer {
  /**
   * @param {Object} [options]
   * @param {string} [options.root] - Confine every tool and prompt path to this directory
   */
  constructor(options = {}) {
    this.root = options.root ? resolveRootDir(options.root) : null;
    this.server = new Server(
      {
        name: 'ctxman',
        version,
      },
      {
        // No subscribe or listChanged: the server has no subscription handler and sends no
        // change notifications, so clients must not wait for them
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.analyzer = new Analyzer();
    this.contextBuilder = new ContextBuilder();
    this.resourceProvider = new ResourceProvider(this.root ?? undefined);
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
            description:
              'Search source lines by regular expression (default) or plain substring ("semantic" is currently a substring match). "ranked" returns the methods/functions (or 40-line windows) that best match the query words by BM25, with their source.',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Project root' },
                query: { type: 'string', description: 'Search query' },
                type: { type: 'string', enum: ['regex', 'semantic', 'ranked'], default: 'regex' },
                limit: {
                  type: 'number',
                  description: `ranked: maximum number of chunks (default ${DEFAULT_LIMIT})`,
                },
                maxTokens: {
                  type: 'number',
                  description: `ranked: token budget for the returned source (default ${DEFAULT_MAX_TOKENS})`,
                },
                redact: {
                  type: 'boolean',
                  description: 'ranked: redact secrets in the returned source (default true)',
                },
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
          {
            name: 'repo_map',
            description:
              'Ranked repository map: the most important files (PageRank over the import graph, git change frequency, symbol references) with one line per function signature, trimmed to a token budget',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Absolute path to the project root' },
                tokens: {
                  type: 'number',
                  description: 'Token budget for the map (default 2048)',
                },
                focus: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Project-relative files or folders to rank higher, with the files next to them in the import graph',
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'pr_context',
            description:
              'Review context for a branch: summary, commit log, changed files, full source of changed methods, unified diff and related tests (secrets redacted)',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Project directory inside a git work tree' },
                base: {
                  type: 'string',
                  description:
                    'Base branch or commit (default: origin/HEAD, else main, else master)',
                },
                head: { type: 'string', description: 'Head branch or commit (default: HEAD)' },
                budget: { type: 'number', description: 'Maximum tokens of the result' },
                style: { type: 'string', enum: ['markdown', 'xml', 'json'], default: 'markdown' },
              },
              required: ['path'],
            },
          },
          {
            name: 'get_symbol',
            description:
              'Full source of a method, function or class by name, with file and line range. Exact matches first, then case-insensitive; similar names are suggested when nothing matches. "Class.method" narrows to methods of a class.',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Project root' },
                name: { type: 'string', description: 'Symbol name, or Class.method' },
                file: {
                  type: 'string',
                  description: 'Optional: only look in this project-relative file',
                },
                redact: {
                  type: 'boolean',
                  description: 'Redact secrets in the source (default true)',
                },
              },
              required: ['path', 'name'],
            },
          },
          {
            name: 'count_tokens',
            description:
              "Token count of a project (or of a text) for a model, with the model's context window and whether it fits. Exact for OpenAI models; approximate for models with their own tokenizer (Claude, Gemini, ...). Nothing leaves the machine; for Claude's exact count run `ctxman count --model <id> --api`",
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Project root (ignored when text is given)',
                },
                text: { type: 'string', description: 'Count this text instead of a project' },
                model: {
                  type: 'string',
                  description: 'Model id from `ctxman --list-llms` (default: claude-sonnet-5-5)',
                },
                top: {
                  type: 'number',
                  description: 'How many of the largest files to list (default 10)',
                },
              },
            },
          },
          {
            name: 'explain_history',
            description:
              'Explain why code looks the way it does, from the local git history (offline): commits that changed a file, symbol or line range with their messages, referenced issues/PRs/tickets, blame ownership, files that change together with it, related docs/ADRs/comments, TODO notes and tests. Returns Markdown.',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Absolute path to the project root (inside a git repository)',
                },
                target: {
                  type: 'string',
                  description:
                    'File relative to path, optionally with a symbol or line range: "src/cart.js", "src/cart.js:total", "src/cart.js:Cart.total", "src/cart.js#L10-L40"',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of commits (default 20)',
                },
                budget: {
                  type: 'number',
                  description:
                    'Maximum tokens of the result (default 20000); patches, related text, tests, coupling details and older commits are dropped first',
                },
                since: {
                  type: 'string',
                  description: 'Only commits after this date ("2024-01-01", "6 months ago")',
                },
                patches: {
                  type: 'boolean',
                  description: "Include each commit's diff of the target (default false)",
                },
              },
              required: ['path', 'target'],
            },
          },
          {
            name: 'pack_context',
            description:
              'File contents of a project in one LLM-ready document (directory tree, then every file; Anthropic <documents> XML by default), honouring .gitignore/.contextignore/.contextinclude, with secrets redacted. Trimmed to a token budget (default 20000): the highest-ranked files first, the rest listed with their token counts.',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Project root' },
                include: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Gitignore-style globs: only matching files (e.g. "src/**/*.ts")',
                },
                exclude: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Gitignore-style globs: leave matching files out',
                },
                files: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Project-relative files to pack instead of scanning the project',
                },
                style: {
                  type: 'string',
                  enum: ['xml', 'markdown', 'plain', 'json'],
                  default: 'xml',
                },
                compress: {
                  type: 'boolean',
                  description: 'Keep signatures, replace function bodies with a placeholder',
                },
                lineNumbers: { type: 'boolean', description: 'Number every line' },
                tree: {
                  type: 'boolean',
                  description: 'Directory tree at the top (default true)',
                },
                instructions: {
                  type: 'string',
                  description: 'Text placed at the end, after the files',
                },
                budget: {
                  type: 'number',
                  description: `Maximum tokens of the document (default ${TOOL_DEFAULT_BUDGET})`,
                },
                targetModel: {
                  type: 'string',
                  description: "Count with this model's tokenizer encoding and report the fit",
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
      const { name } = request.params;
      let args = request.params.arguments;
      // With a root, the paths prompts read must lie inside it too
      if (this.root && args) {
        args = { ...args };
        if (args.projectPath !== undefined) {
          args.projectPath = resolveSandboxPath(args.projectPath, {
            root: this.root,
            name: 'projectPath',
          });
        }
        if (args.filePath !== undefined) {
          args.filePath = resolveSandboxPath(args.filePath, {
            root: this.root,
            expect: 'file',
            name: 'filePath',
          });
        }
      }
      return await this.promptProvider.getPrompt(name, args);
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name } = request.params;
      let args = request.params.arguments ?? {};

      try {
        // `path` must name an existing directory (inside the root, when there is one)
        if (args.path !== undefined || this.root) {
          args = {
            ...args,
            path: resolveSandboxPath(args.path, {
              root: this.root,
              expect: FILE_PATH_TOOLS.has(name) ? 'any' : 'directory',
            }),
          };
        }

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
            // Export policy: throws PolicyViolationError (an isError result) and logs the export
            guardExport(loadPolicy(projectPath), {
              command: 'mcp generate_context',
              root: projectPath,
              destination: 'mcp',
              format: 'json',
              files: Object.values(context.files || {}).flat(),
              text: contextText,
            });
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

            if (!isValidGitRef(branch)) {
              return {
                content: [
                  { type: 'text', text: `Invalid branch or ref: ${JSON.stringify(branch)}` },
                ],
                isError: true,
              };
            }

            let diff;
            try {
              // With a root, keep the diff to that directory even if the repository is larger
              diff = gitClient.exec(['diff', branch, '--', ...(this.root ? ['.'] : [])]);
            } catch (e) {
              return {
                content: [{ type: 'text', text: `Error executing git diff: ${e.message}` }],
                isError: true,
              };
            }

            return {
              content: [{ type: 'text', text: diff || 'No changes detected.' }],
            };
          }
          case 'search_code': {
            const { path: projectPath, query, type = 'regex' } = args;
            if (type === 'ranked') {
              const result = searchProject(projectPath, query, {
                limit: args.limit ?? DEFAULT_LIMIT,
                maxTokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
                redact: args.redact !== false,
              });
              return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            }
            let pattern = null;
            if (type === 'regex') {
              try {
                pattern = new RegExp(query);
              } catch (e) {
                return {
                  content: [{ type: 'text', text: `Invalid regular expression: ${e.message}` }],
                  isError: true,
                };
              }
            }
            const scanner = new Scanner(projectPath);
            const files = scanner.scan();
            const results = [];

            for (const file of files) {
              try {
                const content = fs.readFileSync(file.path, 'utf-8');
                const lines = content.split('\n');

                lines.forEach((line, index) => {
                  const match = pattern ? pattern.test(line) : line.includes(query);

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
            let projectPath = args.path;
            let file = args.file;
            // `path` may name a single file instead of the project root
            if (!file && fs.statSync(projectPath, { throwIfNoEntry: false })?.isFile()) {
              file = path.basename(projectPath);
              projectPath = path.dirname(projectPath);
            }
            const scanner = new Scanner(projectPath);
            // Optional `file`: one project-relative file instead of the whole project
            const target = file ? path.normalize(file) : null;
            const files = scanner
              .scan()
              .filter((file) => !target || path.normalize(file.relativePath) === target);
            if (target && files.length === 0) {
              return {
                content: [{ type: 'text', text: `File not found in project: ${file}` }],
                isError: true,
              };
            }

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
          case 'repo_map': {
            const map = renderRepoMap(args.path, {
              tokens: args.tokens,
              focus: args.focus,
            });
            const notes = map.warnings.map((warning) => `Note: ${warning}`).join('\n');
            return {
              content: [
                {
                  type: 'text',
                  text: [map.output.trimEnd(), notes].filter(Boolean).join('\n\n') || 'Empty map.',
                },
              ],
            };
          }
          case 'pr_context': {
            const result = await buildPrContext(args.path, {
              base: args.base,
              head: args.head,
              budget: args.budget == null ? undefined : Math.floor(args.budget),
              style: args.style,
            });
            return { content: [{ type: 'text', text: result.output }] };
          }
          case 'get_symbol': {
            const result = getSymbol(args.path, args.name, {
              file: args.file,
              redact: args.redact !== false,
            });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'count_tokens': {
            if (args.text === undefined && args.path === undefined) {
              throw new Error('Give a project path or a text to count');
            }
            const { largestFiles, ...summary } = await countForModel(args.path, {
              model: args.model,
              text: args.text,
            });
            const top = Number.isInteger(args.top) && args.top >= 0 ? args.top : 10;
            const result = { ...summary, largestFiles: largestFiles.slice(0, top) };
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }
          case 'explain_history': {
            const whole = (value) => (typeof value === 'number' ? Math.floor(value) : value);
            const result = await explainHistory(args.path, args.target, {
              limit: whole(args.limit),
              budget: whole(args.budget ?? 20000),
              since: args.since,
              patches: args.patches === true,
            });
            return { content: [{ type: 'text', text: result.text }] };
          }
          case 'pack_context': {
            const result = await packContext(args.path, {
              include: args.include,
              exclude: args.exclude,
              // Relative to the project; packContext rejects paths that leave it
              files: args.files,
              cwd: args.path,
              style: args.style,
              compress: args.compress,
              lineNumbers: args.lineNumbers,
              tree: args.tree,
              instructions: args.instructions,
              budget: args.budget == null ? TOOL_DEFAULT_BUDGET : Math.floor(args.budget),
              targetModel: args.targetModel,
            });
            return {
              content: [
                { type: 'text', text: result.text },
                { type: 'text', text: describePack(result) },
              ],
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
