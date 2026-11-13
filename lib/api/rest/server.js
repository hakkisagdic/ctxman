/**
 * REST API Server
 * v3.2.x - Code Intelligence & Multi-Repository Workspace REST API
 *
 * Responsibilities:
 * - HTTP server for Ctxman API
 * - RESTful v1 endpoints across single-repo and multi-repository workspaces (`repos`)
 * - Export policy enforcement (403 on PolicyViolationError)
 * - Authentication (optional Bearer token) & loopback DNS-rebinding protection
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
import {
  loadPolicy,
  PolicyConfigError,
  auditLogFiles,
  readAuditLog,
  filterAuditEvents,
  parseSince,
  checkWorkspacePolicies,
  readWorkspaceAuditLogs,
} from '../../policy/index.js';
import { guardExport, PolicyViolationError } from '../../policy/enforce.js';
import {
  resolveWorkspaceRepos,
  mapWorkspace,
  searchWorkspace,
  packWorkspace,
} from '../../workspace/index.js';
import { renderRepoMap } from '../../map/index.js';
import { searchProject, DEFAULT_LIMIT, DEFAULT_MAX_TOKENS } from '../../search/bm25.js';
import { hybridSearch } from '../../search/hybrid.js';
import { getSymbol } from '../../search/symbols.js';
import { countForModel } from '../../count/index.js';
import { buildPrContext } from '../../pr/pr-context.js';
import { explainHistory } from '../../why/index.js';
import { findExperts, DEFAULT_WHO_LIMIT } from '../../who/index.js';
import { packContext, TOOL_DEFAULT_BUDGET } from '../../pack/index.js';
import { focusContext, DEFAULT_FOCUS_DEPTH } from '../../focus/index.js';
import { buildTaskContext, DEFAULT_TASK_BUDGET } from '../../task/index.js';
import { diagnoseFailure, DEFAULT_DIAGNOSE_BUDGET } from '../../diagnose/index.js';
import { askCodebase, DEFAULT_ASK_LIMIT } from '../../rag/ask.js';

const logger = getLogger('APIServer');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DEFAULT_AUDIT_LIMIT = 50;
const ASK_SNIPPET_CHARS = 2000;

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
      if (error instanceof PolicyViolationError) {
        this.sendJSON(
          res,
          { error: error.message, statusCode: 403, violations: error.violations },
          403
        );
        return;
      }
      const status =
        error.statusCode ||
        (/Not a directory|Repository path must be|Unknown model|Invalid/i.test(error.message)
          ? 400
          : 500);
      logger.error(`Request error: ${error.message}`);
      this.sendError(res, status, error.message);
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

    // GET /api/v1/map
    if (pathname === '/api/v1/map' && req.method === 'GET') {
      await this.handleMap(req, res, url);
      return;
    }

    // GET /api/v1/search
    if (pathname === '/api/v1/search' && req.method === 'GET') {
      await this.handleSearch(req, res, url);
      return;
    }

    // GET /api/v1/symbol
    if (pathname === '/api/v1/symbol' && req.method === 'GET') {
      await this.handleSymbol(req, res, url);
      return;
    }

    // GET /api/v1/count
    if (pathname === '/api/v1/count' && req.method === 'GET') {
      await this.handleCount(req, res, url);
      return;
    }

    // GET /api/v1/pr
    if (pathname === '/api/v1/pr' && req.method === 'GET') {
      await this.handlePr(req, res, url);
      return;
    }

    // GET /api/v1/why
    if (pathname === '/api/v1/why' && req.method === 'GET') {
      await this.handleWhy(req, res, url);
      return;
    }

    // GET /api/v1/who
    if (pathname === '/api/v1/who' && req.method === 'GET') {
      await this.handleWho(req, res, url);
      return;
    }

    // GET /api/v1/policy
    if (pathname === '/api/v1/policy' && req.method === 'GET') {
      await this.handlePolicy(req, res, url);
      return;
    }

    // GET /api/v1/audit
    if (pathname === '/api/v1/audit' && req.method === 'GET') {
      await this.handleAudit(req, res, url);
      return;
    }

    // POST /api/v1/pack
    if (pathname === '/api/v1/pack' && req.method === 'POST') {
      await this.handlePack(req, res);
      return;
    }

    // POST /api/v1/focus
    if (pathname === '/api/v1/focus' && req.method === 'POST') {
      await this.handleFocus(req, res);
      return;
    }

    // POST /api/v1/task
    if (pathname === '/api/v1/task' && req.method === 'POST') {
      await this.handleTask(req, res);
      return;
    }

    // POST /api/v1/diagnose
    if (pathname === '/api/v1/diagnose' && req.method === 'POST') {
      await this.handleDiagnose(req, res);
      return;
    }

    // POST /api/v1/ask
    if (pathname === '/api/v1/ask' && req.method === 'POST') {
      await this.handleAsk(req, res);
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
   * Handle GET /api/v1/map endpoint
   */
  async handleMap(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const extraRepos = this.extractRepos(url);
    const tokens = params.tokens !== undefined ? Number(params.tokens) : undefined;
    const focus = url.searchParams
      .getAll('focus')
      .flatMap((v) => String(v).split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    const callGraph = params.callGraph === undefined ? undefined : params.callGraph !== 'false';
    const style = params.style || 'text';

    const map =
      extraRepos.length > 0
        ? mapWorkspace(this.resolveReposOrThrow(projectPath, extraRepos), {
            tokens,
            focus: focus.length > 0 ? focus : undefined,
            callGraph,
            style,
          })
        : renderRepoMap(projectPath, {
            tokens,
            focus: focus.length > 0 ? focus : undefined,
            callGraph,
            style,
          });

    this.sendJSON(res, {
      ...(map.repos ? { repos: map.repos } : {}),
      output: map.output,
      style: map.style,
      budget: map.budget,
      tokens: map.tokens,
      files: map.files,
      skipped: map.skipped,
      warnings: map.warnings,
      stats: map.stats,
    });
  }

  /**
   * Handle GET /api/v1/search endpoint
   */
  async handleSearch(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const query = params.query ?? params.q;
    if (!query || !String(query).trim()) {
      this.sendError(res, 400, 'Missing "query" parameter');
      return;
    }

    const extraRepos = this.extractRepos(url);
    const type = params.type || 'ranked';
    const limit = params.limit !== undefined ? Number(params.limit) : DEFAULT_LIMIT;
    const maxTokens =
      params.maxTokens !== undefined ? Number(params.maxTokens) : DEFAULT_MAX_TOKENS;
    const redact = params.redact !== 'false';

    if (extraRepos.length > 0) {
      const resolvedRepos = this.resolveReposOrThrow(projectPath, extraRepos);
      const result = searchWorkspace(resolvedRepos, query, { limit, maxTokens, redact });
      this.sendJSON(res, result);
      return;
    }

    if (type === 'hybrid' || type === 'semantic') {
      const result = await hybridSearch(projectPath, query, {
        mode: type,
        fallbackToBm25: true,
        limit,
        maxTokens,
        redact,
      });
      this.sendJSON(res, result);
      return;
    }

    const result = searchProject(projectPath, query, { limit, maxTokens, redact });
    this.sendJSON(res, result);
  }

  /**
   * Handle GET /api/v1/symbol endpoint
   */
  async handleSymbol(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const name = params.name ?? params.symbol;
    if (!name || !String(name).trim()) {
      this.sendError(res, 400, 'Missing "name" parameter');
      return;
    }

    const extraRepos = this.extractRepos(url);
    if (extraRepos.length > 0) {
      this.resolveReposOrThrow(projectPath, extraRepos);
    }

    const result = getSymbol(projectPath, name, {
      file: params.file || undefined,
      redact: params.redact !== 'false',
      repos: extraRepos.length > 0 ? extraRepos : undefined,
    });
    this.sendJSON(res, result);
  }

  /**
   * Handle GET /api/v1/count endpoint
   */
  async handleCount(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const extraRepos = this.extractRepos(url);
    if (extraRepos.length > 0) {
      this.resolveReposOrThrow(projectPath, extraRepos);
    }

    const top =
      params.top !== undefined && Number.isInteger(Number(params.top)) && Number(params.top) >= 0
        ? Number(params.top)
        : 10;
    const { largestFiles, ...summary } = await countForModel(projectPath, {
      model: params.model || undefined,
      repos: extraRepos.length > 0 ? extraRepos : undefined,
    });
    this.sendJSON(res, {
      ...summary,
      largestFiles: largestFiles.slice(0, top),
    });
  }

  /**
   * Handle GET /api/v1/pr endpoint
   */
  async handlePr(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const extraRepos = this.extractRepos(url);
    if (extraRepos.length > 0) {
      this.resolveReposOrThrow(projectPath, extraRepos);
    }

    const result = await buildPrContext(projectPath, {
      repos: extraRepos.length > 0 ? extraRepos : undefined,
      base: params.base || undefined,
      head: params.head || undefined,
      budget: params.budget !== undefined ? Math.floor(Number(params.budget)) : undefined,
      style: params.style || 'markdown',
    });
    this.sendJSON(res, result);
  }

  /**
   * Handle GET /api/v1/why endpoint
   */
  async handleWhy(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const target = params.target ?? params.file;
    if (!target || !String(target).trim()) {
      this.sendError(res, 400, 'Missing "target" parameter');
      return;
    }

    const extraRepos = this.extractRepos(url);
    if (extraRepos.length > 0) {
      this.resolveReposOrThrow(projectPath, extraRepos);
    }

    const result = await explainHistory(projectPath, target, {
      repos: extraRepos.length > 0 ? extraRepos : undefined,
      limit: params.limit !== undefined ? Math.floor(Number(params.limit)) : undefined,
      budget: params.budget !== undefined ? Math.floor(Number(params.budget)) : 20000,
      since: params.since || undefined,
      patches: params.patches === 'true',
      analyzer: params.analyzer === 'true',
      analyzerDb: params.analyzerDb || undefined,
      style: params.style || 'markdown',
    });
    this.sendJSON(res, result);
  }

  /**
   * Handle GET /api/v1/who endpoint
   */
  async handleWho(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const target = params.target ?? params.query;
    if (!target || !String(target).trim()) {
      this.sendError(res, 400, 'Missing "target" parameter');
      return;
    }

    const extraRepos = this.extractRepos(url);
    if (extraRepos.length > 0) {
      this.resolveReposOrThrow(projectPath, extraRepos);
    }

    const result = await findExperts(projectPath, target, {
      repos: extraRepos.length > 0 ? extraRepos : undefined,
      limit: params.limit !== undefined ? Math.floor(Number(params.limit)) : DEFAULT_WHO_LIMIT,
      halfLifeDays: params.halfLifeDays !== undefined ? Number(params.halfLifeDays) : undefined,
      style: params.style || 'markdown',
    });
    this.sendJSON(res, result);
  }

  /**
   * Handle GET /api/v1/policy endpoint
   */
  async handlePolicy(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const extraRepos = this.extractRepos(url);

    if (extraRepos.length > 0) {
      const result = checkWorkspacePolicies(projectPath, extraRepos);
      this.sendJSON(res, result);
      return;
    }

    try {
      const result = { valid: true, ...loadPolicy(projectPath).toJSON() };
      this.sendJSON(res, result);
    } catch (error) {
      if (!(error instanceof PolicyConfigError)) throw error;
      this.sendJSON(res, { valid: false, file: error.file, errors: error.errors });
    }
  }

  /**
   * Handle GET /api/v1/audit endpoint
   */
  async handleAudit(req, res, url) {
    const params = Object.fromEntries(url.searchParams);
    const projectPath = params.path || process.cwd();
    const extraRepos = this.extractRepos(url);
    const since = params.since === undefined ? null : parseSince(String(params.since));
    const limit =
      params.limit !== undefined &&
      Number.isInteger(Number(params.limit)) &&
      Number(params.limit) >= 0
        ? Number(params.limit)
        : DEFAULT_AUDIT_LIMIT;

    if (extraRepos.length > 0) {
      const ws = readWorkspaceAuditLogs(projectPath, extraRepos, { since, limit });
      const result = {
        repos: ws.repos,
        files: ws.files,
        total: ws.total,
        events: ws.events,
        skippedLines: ws.skippedLines,
      };
      if (ws.policyErrors.length > 0) result.policyErrors = ws.policyErrors;
      this.sendJSON(res, result);
      return;
    }

    const { files, error } = auditLogFiles(projectPath);
    const { events, skipped, missing } = readAuditLog(files);
    const matching = filterAuditEvents(events, { since });
    const result = {
      files: files.filter((file) => !missing.includes(file)),
      total: matching.length,
      events: filterAuditEvents(matching, { limit }),
      skippedLines: skipped,
    };
    if (error) result.policyError = error.message;
    this.sendJSON(res, result);
  }

  /**
   * Handle POST /api/v1/pack endpoint
   */
  async handlePack(req, res) {
    const body = await this.parseBody(req);
    const projectPath = body.path || process.cwd();
    const extraRepos = this.extractRepos(body);
    const budget = body.budget == null ? TOOL_DEFAULT_BUDGET : Math.floor(Number(body.budget));

    if (extraRepos.length > 0) {
      const resolvedRepos = this.resolveReposOrThrow(projectPath, extraRepos);
      const result = await packWorkspace(resolvedRepos, {
        include: body.include,
        exclude: body.exclude,
        style: body.style,
        compress: body.compress,
        lineNumbers: body.lineNumbers,
        tree: body.tree,
        instructions: body.instructions,
        budget,
        targetModel: body.targetModel,
      });
      this.sendJSON(res, result);
      return;
    }

    const result = await packContext(projectPath, {
      include: body.include,
      exclude: body.exclude,
      files: body.files,
      cwd: projectPath,
      style: body.style,
      compress: body.compress,
      lineNumbers: body.lineNumbers,
      tree: body.tree,
      instructions: body.instructions,
      budget,
      targetModel: body.targetModel,
    });
    this.sendJSON(res, result);
  }

  /**
   * Handle POST /api/v1/focus endpoint
   */
  async handleFocus(req, res) {
    const body = await this.parseBody(req);
    const projectPath = body.path || process.cwd();
    const target = body.file ?? body.target;
    if (!target || !String(target).trim()) {
      this.sendError(res, 400, 'Missing "file" parameter');
      return;
    }

    const extraRepos = this.extractRepos(body);
    if (extraRepos.length > 0) {
      this.resolveReposOrThrow(projectPath, extraRepos);
    }

    const result = await focusContext(projectPath, target, {
      repos: extraRepos.length > 0 ? extraRepos : undefined,
      symbol: body.symbol,
      depth: body.depth == null ? DEFAULT_FOCUS_DEPTH : Math.floor(Number(body.depth)),
      direction: body.direction,
      callGraph: body.callGraph,
      includeTests: body.includeTests,
      cwd: projectPath,
      style: body.style,
      compress: body.compress,
      lineNumbers: body.lineNumbers,
      tree: body.tree,
      instructions: body.instructions,
      budget: body.budget == null ? TOOL_DEFAULT_BUDGET : Math.floor(Number(body.budget)),
      targetModel: body.targetModel,
    });
    this.sendJSON(res, result);
  }

  /**
   * Handle POST /api/v1/task endpoint
   */
  async handleTask(req, res) {
    const body = await this.parseBody(req);
    const projectPath = body.path || process.cwd();
    const taskQuery = body.task ?? body.query;
    if (!taskQuery || !String(taskQuery).trim()) {
      this.sendError(res, 400, 'Missing "task" parameter');
      return;
    }

    const extraRepos = this.extractRepos(body);
    if (extraRepos.length > 0) {
      this.resolveReposOrThrow(projectPath, extraRepos);
    }

    const result = await buildTaskContext(projectPath, taskQuery, {
      repos: extraRepos.length > 0 ? extraRepos : undefined,
      budget: body.budget == null ? DEFAULT_TASK_BUDGET : Math.floor(Number(body.budget)),
      format: body.format,
      model: body.model,
      callGraph: body.callGraph,
    });
    this.sendJSON(res, result);
  }

  /**
   * Handle POST /api/v1/diagnose endpoint
   */
  async handleDiagnose(req, res) {
    const body = await this.parseBody(req);
    const projectPath = body.path || process.cwd();
    const trace = body.trace ?? body.log;
    if (!trace || !String(trace).trim()) {
      this.sendError(res, 400, 'Missing "trace" parameter');
      return;
    }

    const extraRepos = this.extractRepos(body);
    if (extraRepos.length > 0) {
      this.resolveReposOrThrow(projectPath, extraRepos);
    }

    const result = await diagnoseFailure(projectPath, trace, {
      repos: extraRepos.length > 0 ? extraRepos : undefined,
      budget: body.budget == null ? DEFAULT_DIAGNOSE_BUDGET : Math.floor(Number(body.budget)),
      format: body.format,
      callGraph: body.callGraph,
    });
    this.sendJSON(res, result);
  }

  /**
   * Handle POST /api/v1/ask endpoint
   */
  async handleAsk(req, res) {
    const body = await this.parseBody(req);
    const projectPath = body.path || process.cwd();
    const query = body.query ?? body.question;
    if (!query || !String(query).trim()) {
      this.sendError(res, 400, 'Missing "query" parameter');
      return;
    }

    const extraRepos = this.extractRepos(body);
    if (extraRepos.length > 0) {
      this.resolveReposOrThrow(projectPath, extraRepos);
    }

    const result = await askCodebase(projectPath, query, {
      repos: extraRepos.length > 0 ? extraRepos : undefined,
      limit: Number.isInteger(body.limit) ? body.limit : DEFAULT_ASK_LIMIT,
      maxChars: ASK_SNIPPET_CHARS,
    });
    this.sendJSON(res, result);
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
        {
          path: '/api/v1/map',
          method: 'GET',
          description: 'Ranked repository or workspace map within a token budget',
          parameters: {
            path: 'Project path (optional)',
            repos: 'Additional repository roots (optional)',
            tokens: 'Token budget (default 2048)',
            focus: 'Files or folders to focus PageRank on (optional)',
            callGraph: 'Include cross-file AST symbol call edges (default true)',
            style: 'text | markdown | json | dot',
          },
        },
        {
          path: '/api/v1/search',
          method: 'GET',
          description: 'BM25 ranked, semantic, or hybrid RRF code search across one or more repos',
          parameters: {
            query: 'Search query (required)',
            path: 'Project path (optional)',
            repos: 'Additional repository roots (optional)',
            type: 'ranked | hybrid | semantic (default ranked)',
            limit: 'Maximum chunks (default 10)',
            maxTokens: 'Token budget (default 4000)',
            redact: 'Redact secrets (default true)',
          },
        },
        {
          path: '/api/v1/symbol',
          method: 'GET',
          description: 'Full source of a named function, method, or class across one or more repos',
          parameters: {
            name: 'Symbol name or Class.method (required)',
            path: 'Project path (optional)',
            repos: 'Additional repository roots (optional)',
            file: 'Optional project-relative or <alias>/<path> file filter',
            redact: 'Redact secrets (default true)',
          },
        },
        {
          path: '/api/v1/count',
          method: 'GET',
          description: 'Model-aware token count and context window fit across one or more repos',
          parameters: {
            path: 'Project path (optional)',
            repos: 'Additional repository roots (optional)',
            model: 'Target model ID (default claude-sonnet-5-5)',
            top: 'Number of largest files to include (default 10)',
          },
        },
        {
          path: '/api/v1/pr',
          method: 'GET',
          description: 'Pull-request review context across one or more git repositories',
          parameters: {
            path: 'Project path (optional)',
            repos: 'Additional repository roots (optional)',
            base: 'Base branch or commit',
            head: 'Head branch or commit',
            budget: 'Token budget',
            style: 'markdown | xml | json',
          },
        },
        {
          path: '/api/v1/why',
          method: 'GET',
          description:
            'Git archaeology, ownership, coupling, and ADR/doc/test lookup for a file or symbol',
          parameters: {
            target: 'File (<alias>/<path>), file:symbol, or file#L10-L40 (required)',
            path: 'Project path (optional)',
            repos: 'Additional repository roots (optional)',
            limit: 'Maximum commits (default 20)',
            budget: 'Token budget (default 20000)',
            patches: 'Include commit diffs (true/false)',
          },
        },
        {
          path: '/api/v1/who',
          method: 'GET',
          description:
            'Rank code and domain experts across git blame, recency-decayed commits, and CODEOWNERS',
          parameters: {
            target: 'File, symbol, directory, or natural-language topic (required)',
            path: 'Project path (optional)',
            repos: 'Additional repository roots (optional)',
            limit: 'Maximum experts (default 5)',
            style: 'markdown | xml | json',
          },
        },
        {
          path: '/api/v1/policy',
          method: 'GET',
          description:
            'Validate and summarize effective export policy across one or more repositories',
          parameters: {
            path: 'Project path (optional)',
            repos: 'Additional repository roots (optional)',
          },
        },
        {
          path: '/api/v1/audit',
          method: 'GET',
          description: 'Read export audit log events across one or more repositories',
          parameters: {
            path: 'Project path (optional)',
            repos: 'Additional repository roots (optional)',
            since: 'ISO date or relative age (30m, 12h, 7d, 2w)',
            limit: 'Last N events (default 50)',
          },
        },
        {
          path: '/api/v1/pack',
          method: 'POST',
          description:
            'Pack repository or workspace files into one LLM-ready document under a token budget',
          body: {
            path: 'Project path',
            repos: 'Additional repository roots (string[])',
            include: 'Include globs (string[])',
            exclude: 'Exclude globs (string[])',
            style: 'xml | markdown | plain | json',
            compress: 'Keep signatures only (boolean)',
            budget: 'Token budget (default 20000)',
            targetModel: 'Target model ID',
          },
        },
        {
          path: '/api/v1/focus',
          method: 'POST',
          description:
            'Pack a target file or symbol together with its N-hop import & AST call neighborhood',
          body: {
            file: 'Target file or <alias>/<path>[:symbol] (required)',
            path: 'Project path',
            repos: 'Additional repository roots (string[])',
            symbol: 'Optional symbol name',
            depth: 'Graph hop depth (default 1)',
            direction: 'both | imports | importers | calls | callers',
            budget: 'Token budget (default 20000)',
          },
        },
        {
          path: '/api/v1/task',
          method: 'POST',
          description:
            'Build a task-driven context bundle (hybrid search seeds + AST/import neighborhood + repo map)',
          body: {
            task: 'Natural-language task description (required)',
            path: 'Project path',
            repos: 'Additional repository roots (string[])',
            budget: 'Token budget (default 32000)',
            format: 'xml | markdown | json',
          },
        },
        {
          path: '/api/v1/diagnose',
          method: 'POST',
          description: 'Diagnose a stack trace or failure log across one or more repositories',
          body: {
            trace: 'Error stack trace or failure log (required)',
            path: 'Project path',
            repos: 'Additional repository roots (string[])',
            budget: 'Token budget (default 24000)',
            format: 'xml | markdown | json',
          },
        },
        {
          path: '/api/v1/ask',
          method: 'POST',
          description:
            'Semantic search over the local SQLite embedding index across one or more repositories',
          body: {
            query: 'Natural-language question (required)',
            path: 'Project path',
            repos: 'Additional repository roots (string[])',
            limit: 'Maximum files (default 5)',
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
