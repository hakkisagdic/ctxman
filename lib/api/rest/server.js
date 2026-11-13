/**
 * REST API Server
 * v3.0.0 - API infrastructure
 *
 * Responsibilities:
 * - HTTP server for Ctxman API
 * - RESTful endpoints (single-repo and multi-repository workspaces via `repos`)
 * - WebSocket support for watch mode
 * - Authentication (optional)
 */

import fs from 'fs';
import http from 'http';
import path from 'path';
import { URL } from 'url';
import { getLogger } from '../../utils/logger.js';
import Scanner from '../../core/Scanner.js';
import Analyzer from '../../core/Analyzer.js';
import ContextBuilder from '../../core/ContextBuilder.js';
import DiffAnalyzer from '../../integrations/git/DiffAnalyzer.js';
import { isValidGitRef } from '../../integrations/git/GitClient.js';
import { loadPolicy } from '../../policy/policy.js';
import { guardExport, PolicyViolationError } from '../../policy/enforce.js';
import { resolveWorkspaceRepos } from '../../workspace/index.js';

const logger = getLogger('APIServer');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export class APIServer {
  constructor(options = {}) {
    this.options = {
      port: 3000,
      host: 'localhost',
      authToken: null,
      // Off by default: with CORS on, any web page the user opens can read the responses
      cors: false,
      repos: [],
      ...options,
    };

    this.server = null;
    this.isRunning = false;
  }

  /**
   * Extract additional workspace repository paths from query parameters or JSON body,
   * falling back to `this.options.repos` when none are provided on the request.
   * @param {URL|object} source - URL instance (GET) or parsed body object (POST)
   * @returns {string[]}
   */
  extractRepos(source) {
    const raw = [];
    if (source instanceof URL) {
      for (const val of source.searchParams.getAll('repo')) {
        if (val && val.trim()) raw.push(val.trim());
      }
      for (const val of source.searchParams.getAll('repos')) {
        for (const part of String(val).split(',')) {
          if (part.trim()) raw.push(part.trim());
        }
      }
    } else if (source && typeof source === 'object') {
      if (Array.isArray(source.repos)) {
        for (const item of source.repos) {
          if (typeof item === 'string' && item.trim()) raw.push(item.trim());
        }
      } else if (typeof source.repos === 'string' && source.repos.trim()) {
        for (const part of source.repos.split(',')) {
          if (part.trim()) raw.push(part.trim());
        }
      }
      if (typeof source.repo === 'string' && source.repo.trim()) {
        raw.push(source.repo.trim());
      }
    }

    if (raw.length > 0) return raw;
    return Array.isArray(this.options.repos) ? this.options.repos.filter(Boolean) : [];
  }

  /**
   * Resolve workspace repositories and map invalid directory errors to HTTP 400.
   * @param {string} primaryPath
   * @param {string[]} extraRepos
   */
  resolveReposOrThrow(primaryPath, extraRepos) {
    try {
      return resolveWorkspaceRepos([primaryPath, ...extraRepos]);
    } catch (error) {
      if (/Not a directory|Repository path must be/i.test(error.message)) {
        throw Object.assign(new Error(error.message), { statusCode: 400 });
      }
      throw error;
    }
  }

  /**
   * Start API server
   */
  start() {
    if (this.isRunning) {
      logger.warn('Server already running');
      return;
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.listen(this.options.port, this.options.host, () => {
      this.isRunning = true;
      logger.info(`API Server started: http://${this.options.host}:${this.options.port}`);
      console.log(`\n🌐 Ctxman API Server`);
      console.log(`   Listening on: http://${this.options.host}:${this.options.port}`);
      console.log(`   API Version: v1`);
      console.log(`   Documentation: http://${this.options.host}:${this.options.port}/api/v1/docs`);
      console.log();
    });

    this.server.on('error', (error) => {
      logger.error(`Server error: ${error.message}`);
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${this.options.port} is already in use`);
        console.error(`   Try a different port: ctxman serve --port 3001`);
      }
    });
  }

  /**
   * Stop API server
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.server.close(() => {
      this.isRunning = false;
      logger.info('API Server stopped');
      console.log('\n✅ Server stopped');
    });
  }

  /**
   * Handle HTTP request
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async handleRequest(req, res) {
    // DNS-rebinding guard: a server bound to loopback only answers to loopback host names
    if (LOOPBACK_HOSTS.has(this.options.host) && !this.isLoopbackHostHeader(req.headers.host)) {
      this.sendError(res, 403, 'Forbidden host');
      return;
    }

    // CORS headers
    if (this.options.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
    }

    // Authentication
    if (this.options.authToken && !this.checkAuth(req)) {
      this.sendError(res, 401, 'Unauthorized');
      return;
    }

    // Parse URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    logger.debug(`${req.method} ${pathname}`);

    try {
      // Route to handlers
      if (pathname.startsWith('/api/v1')) {
        await this.handleAPIv1(req, res, pathname, url);
      } else {
        this.sendError(res, 404, 'Not Found');
      }
    } catch (error) {
      logger.error(`Request error: ${error.message}`);
      this.sendError(res, error.statusCode || 500, error.message);
    }
  }

  /**
   * Handle API v1 routes
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {string} pathname
   * @param {URL} url
   */
  async handleAPIv1(req, res, pathname, url) {
    // GET /api/v1/analyze
    if (pathname === '/api/v1/analyze' && req.method === 'GET') {
      await this.handleAnalyze(req, res, url);
      return;
    }

    // GET /api/v1/methods
    if (pathname === '/api/v1/methods' && req.method === 'GET') {
      await this.handleMethods(req, res, url);
      return;
    }

    // GET /api/v1/stats
    if (pathname === '/api/v1/stats' && req.method === 'GET') {
      await this.handleStats(req, res, url);
      return;
    }

    // GET /api/v1/diff
    if (pathname === '/api/v1/diff' && req.method === 'GET') {
      await this.handleDiff(req, res, url);
      return;
    }

    // POST /api/v1/context
    if (pathname === '/api/v1/context' && req.method === 'POST') {
      await this.handleContext(req, res);
      return;
    }

    // GET /api/v1/docs
    if (pathname === '/api/v1/docs' && req.method === 'GET') {
      this.handleDocs(req, res);
      return;
    }

    this.sendError(res, 404, 'Endpoint not found');
  }

  /**
   * Handle /api/v1/analyze endpoint
   */
  async handleAnalyze(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const extraRepos = this.extractRepos(url);

    if (extraRepos.length > 0) {
      const resolvedRepos = this.resolveReposOrThrow(projectPath, extraRepos);
      const allFiles = [];
      for (const repo of resolvedRepos) {
        const scanner = new Scanner(repo.root, { policy: repo.policy });
        for (const file of scanner.scan()) {
          const relPosix = `${repo.alias}/${file.relativePath.split(path.sep).join('/')}`;
          allFiles.push({
            ...file,
            relativePath: relPosix,
          });
        }
      }
      const analyzer = new Analyzer({ methodLevel: params.methods === 'true' });
      const result = await analyzer.analyze(allFiles);
      result.repos = resolvedRepos.map((r) => ({ alias: r.alias, root: r.root }));
      this.sendJSON(res, result);
      return;
    }

    const scanner = new Scanner(projectPath);
    const files = scanner.scan();

    const analyzer = new Analyzer({ methodLevel: params.methods === 'true' });
    const result = await analyzer.analyze(files);

    this.sendJSON(res, result);
  }

  /**
   * Handle /api/v1/methods endpoint
   */
  async handleMethods(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const filePath = params.file;
    const extraRepos = this.extractRepos(url);

    if (!filePath) {
      this.sendError(res, 400, 'Missing "file" parameter');
      return;
    }

    let resolvedFile = filePath;
    let displayFile = filePath;
    let matchedRepo = null;

    if (extraRepos.length > 0 && (!fs.existsSync(filePath) || !path.isAbsolute(filePath))) {
      const projectPath = params.path || process.cwd();
      const resolvedRepos = this.resolveReposOrThrow(projectPath, extraRepos);
      const normalized = String(filePath).replace(/\\/g, '/').replace(/^\.\//, '');
      const slashIdx = normalized.indexOf('/');
      if (slashIdx > 0) {
        const alias = normalized.slice(0, slashIdx);
        const relInside = normalized.slice(slashIdx + 1);
        const repo = resolvedRepos.find((r) => r.alias === alias);
        if (repo) {
          if (repo.policy?.isDenied(relInside)) {
            this.sendError(res, 403, `File is denied by export policy: ${filePath}`);
            return;
          }
          resolvedFile = path.join(repo.root, relInside);
          displayFile = `${repo.alias}/${relInside}`;
          matchedRepo = repo.alias;
        }
      }
    }

    if (!fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
      this.sendError(res, 404, `File not found: ${filePath}`);
      return;
    }

    // Analyze single file
    const analyzer = new Analyzer({ methodLevel: true });
    const fileInfo = {
      path: resolvedFile,
      relativePath: displayFile,
      name: path.basename(resolvedFile),
      extension: path.extname(resolvedFile),
    };

    const analysis = await analyzer.analyzeFile(fileInfo);
    // analyzeFile() returns null for binary and other non-source files
    if (!analysis) {
      this.sendError(res, 400, `Not a text source file: ${filePath}`);
      return;
    }

    const payload = {
      file: displayFile,
      methods: analysis.methods || [],
      totalMethods: analysis.methodCount || 0,
    };
    if (matchedRepo) {
      payload.repo = matchedRepo;
    }
    this.sendJSON(res, payload);
  }

  /**
   * Handle /api/v1/stats endpoint
   */
  async handleStats(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const extraRepos = this.extractRepos(url);

    if (extraRepos.length > 0) {
      const resolvedRepos = this.resolveReposOrThrow(projectPath, extraRepos);
      const allFiles = [];
      for (const repo of resolvedRepos) {
        const scanner = new Scanner(repo.root, { policy: repo.policy });
        for (const file of scanner.scan()) {
          const relPosix = `${repo.alias}/${file.relativePath.split(path.sep).join('/')}`;
          allFiles.push({
            ...file,
            relativePath: relPosix,
          });
        }
      }
      const analyzer = new Analyzer();
      const result = await analyzer.analyze(allFiles);
      this.sendJSON(res, {
        ...result.stats,
        repos: resolvedRepos.map((r) => ({ alias: r.alias, root: r.root })),
      });
      return;
    }

    const scanner = new Scanner(projectPath);
    const files = scanner.scan();

    const analyzer = new Analyzer();
    const result = await analyzer.analyze(files);

    this.sendJSON(res, result.stats);
  }

  /**
   * Handle /api/v1/diff endpoint
   */
  async handleDiff(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const since = params.since || null;
    const extraRepos = this.extractRepos(url);

    if (since && !isValidGitRef(since)) {
      this.sendError(res, 400, 'Invalid "since" parameter: expected a branch, tag or commit');
      return;
    }

    if (extraRepos.length > 0) {
      const resolvedRepos = this.resolveReposOrThrow(projectPath, extraRepos);
      const allChangedFiles = [];
      const repoSummaries = [];
      const helperAnalyzer = new DiffAnalyzer(projectPath);

      for (const repo of resolvedRepos) {
        const repoDiff = new DiffAnalyzer(repo.root);
        const repoAnalysis = repoDiff.analyzeChanges(since);
        const prefixed = (repoAnalysis.changedFiles || [])
          .filter((f) => !repo.policy?.isDenied(f))
          .map((f) => `${repo.alias}/${String(f).split(path.sep).join('/')}`);
        allChangedFiles.push(...prefixed);
        repoSummaries.push({
          alias: repo.alias,
          root: repo.root,
          changedFiles: prefixed,
          totalChangedFiles: prefixed.length,
        });
      }

      this.sendJSON(res, {
        repos: repoSummaries,
        changedFiles: allChangedFiles,
        totalChangedFiles: allChangedFiles.length,
        since,
        relatedFiles: [],
        impact: helperAnalyzer.calculateImpact(allChangedFiles),
      });
      return;
    }

    const diffAnalyzer = new DiffAnalyzer(projectPath);
    const analysis = diffAnalyzer.analyzeChanges(since);

    this.sendJSON(res, analysis);
  }

  /**
   * Handle /api/v1/context endpoint (POST)
   */
  async handleContext(req, res) {
    const body = await this.parseBody(req);

    const projectPath = body.path || process.cwd();
    const extraRepos = this.extractRepos(body);
    const options = {
      methodLevel: body.methodLevel || false,
      targetModel: body.targetModel || null,
      targetTokens: body.targetTokens || null,
      useCase: body.useCase || 'custom',
    };

    if (extraRepos.length > 0) {
      const resolvedRepos = this.resolveReposOrThrow(projectPath, extraRepos);
      const allFiles = [];
      let totalRemovedByPolicy = 0;
      let anyPolicyActive = false;

      for (const repo of resolvedRepos) {
        if (repo.policy?.active) anyPolicyActive = true;
        const scanner = new Scanner(repo.root, { policy: repo.policy });
        const scanned = scanner.scan();
        totalRemovedByPolicy += scanner.getStats().filesDenied;
        for (const file of scanned) {
          const relPosix = `${repo.alias}/${file.relativePath.split(path.sep).join('/')}`;
          allFiles.push({
            ...file,
            relativePath: relPosix,
          });
        }
      }

      const analyzer = new Analyzer(options);
      const result = await analyzer.analyze(allFiles);
      const builder = new ContextBuilder(options);
      const context = builder.build(result);
      context.repos = resolvedRepos.map((r) => ({ alias: r.alias, root: r.root }));

      if (anyPolicyActive) {
        context.metadata.removedByPolicy = totalRemovedByPolicy;
        const exported = Object.values(context.files || {}).flat();
        const serialized = JSON.stringify(context, null, 2);
        try {
          for (const repo of resolvedRepos) {
            if (!repo.policy?.active) continue;
            const prefix = `${repo.alias}/`;
            const repoFiles = exported
              .filter((f) => typeof f.path === 'string' && f.path.startsWith(prefix))
              .map((f) => ({ ...f, path: f.path.slice(prefix.length) }));
            guardExport(repo.policy, {
              command: 'rest POST /api/v1/context',
              root: repo.root,
              destination: 'rest',
              format: 'json',
              targetModel: options.targetModel,
              files: repoFiles,
              removedByPolicy: totalRemovedByPolicy,
              text: serialized,
            });
          }
        } catch (error) {
          if (!(error instanceof PolicyViolationError)) throw error;
          this.sendJSON(
            res,
            { error: error.message, statusCode: 403, violations: error.violations },
            403
          );
          return;
        }
      }

      this.sendJSON(res, context);
      return;
    }

    // Export policy of the project: denied files are dropped by the scanner, the rest of the
    // rules are checked before the context is sent
    const policy = loadPolicy(projectPath);

    // Build context
    const scanner = new Scanner(projectPath, { policy });
    const files = scanner.scan();

    const analyzer = new Analyzer(options);
    const result = await analyzer.analyze(files);

    const builder = new ContextBuilder(options);
    const context = builder.build(result);

    if (policy.active) {
      context.metadata.removedByPolicy = scanner.getStats().filesDenied;
      const exported = Object.values(context.files || {}).flat();
      try {
        guardExport(policy, {
          command: 'rest POST /api/v1/context',
          root: projectPath,
          destination: 'rest',
          format: 'json',
          targetModel: options.targetModel,
          files: exported,
          removedByPolicy: context.metadata.removedByPolicy,
          // Same serialization as sendJSON(), so the hash matches the response body
          text: JSON.stringify(context, null, 2),
        });
      } catch (error) {
        if (!(error instanceof PolicyViolationError)) throw error;
        this.sendJSON(
          res,
          { error: error.message, statusCode: 403, violations: error.violations },
          403
        );
        return;
      }
    }

    this.sendJSON(res, context);
  }

  /**
   * Handle /api/v1/docs endpoint
   */
  handleDocs(req, res) {
    const docs = {
      version: 'v1',
      endpoints: [
        {
          path: '/api/v1/analyze',
          method: 'GET',
          description: 'Analyze project or workspace files and get token counts',
          parameters: {
            path: 'Project path (optional, defaults to cwd)',
            repos:
              'Additional repository roots (repeatable ?repo=DIR or comma-separated ?repos=A,B)',
            methods: 'Include method-level analysis (true/false)',
          },
        },
        {
          path: '/api/v1/methods',
          method: 'GET',
          description: 'Extract methods from a file (or <alias>/<path> when repos is provided)',
          parameters: {
            file: 'File path or <alias>/<path> (required)',
            path: 'Primary workspace root when resolving <alias>/<path> (optional)',
            repos: 'Additional repository roots for <alias>/<path> resolution (optional)',
          },
        },
        {
          path: '/api/v1/stats',
          method: 'GET',
          description: 'Get project or multi-repository workspace statistics',
          parameters: {
            path: 'Project path (optional)',
            repos: 'Additional repository roots (optional)',
          },
        },
        {
          path: '/api/v1/diff',
          method: 'GET',
          description: 'Analyze git diff across one or more repositories',
          parameters: {
            path: 'Project path (optional)',
            since: 'Git reference (optional, e.g., "main", "HEAD~5")',
            repos: 'Additional repository roots (optional)',
          },
        },
        {
          path: '/api/v1/context',
          method: 'POST',
          description: 'Generate optimized LLM context for a project or multi-repository workspace',
          body: {
            path: 'Project path',
            repos: 'Additional repository roots (string[])',
            methodLevel: 'Include methods (boolean)',
            targetModel: 'Target LLM model',
            targetTokens: 'Target token budget',
            useCase: 'Use case template',
          },
        },
      ],
    };

    this.sendJSON(res, docs);
  }

  /**
   * Whether a Host header names this machine's loopback interface
   * @param {string} hostHeader - e.g. "localhost:3000" or "[::1]:3000"
   * @returns {boolean}
   */
  isLoopbackHostHeader(hostHeader) {
    if (!hostHeader) return false;
    try {
      const { hostname } = new URL(`http://${hostHeader}`);
      return LOOPBACK_HOSTS.has(hostname.replace(/^\[|\]$/g, ''));
    } catch (_error) {
      return false;
    }
  }

  checkAuth(req) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return false;
    }

    const token = authHeader.replace('Bearer ', '');
    return token === this.options.authToken;
  }

  /**
   * Parse request body
   * @param {http.IncomingMessage} req
   * @returns {Promise<object>}
   */
  parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (_error) {
          // A malformed body is the client's fault, not a server error
          reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
        }
      });

      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   * @param {http.ServerResponse} res
   * @param {object} data
   * @param {number} statusCode
   */
  sendJSON(res, data, statusCode = 200) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send error response
   * @param {http.ServerResponse} res
   * @param {number} statusCode
   * @param {string} message
   */
  sendError(res, statusCode, message) {
    this.sendJSON(
      res,
      {
        error: message,
        statusCode: statusCode,
      },
      statusCode
    );
  }
}

export default APIServer;
