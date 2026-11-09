/**
 * IncrementalAnalyzer - Incremental Analysis & Live RAG/Graph Sync Module
 * v3.2.0 - Watch mode with incremental SqliteVectorStore + Knowledge Graph synchronization
 *          (Single-Repo and Cross-Repo Multi-Root Workspace support)
 *
 * Responsibilities:
 * - Perform incremental token & method analysis on file changes
 * - Incrementally synchronize file embeddings in SqliteVectorStore (SHA-256 deduplicated)
 * - Incrementally synchronize repository knowledge graph (nodes, methods, import edges, symbolRefs)
 * - Resolve cross-repository import edges (<aliasA>/<file> -> <aliasB>/<file>) in multi-repo mode
 * - Enforce per-repository export policy (.ctxman/policy.json deny rules) and secret redaction on sync
 * - Update aggregate statistics and emit analysis/sync events
 */

import fs from 'fs';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import path from 'path';
import { Analyzer } from '../core/Analyzer.js';
import { Scanner } from '../core/Scanner.js';
import MethodAnalyzer from '../analyzers/method-analyzer.js';
import FileUtils from '../utils/file-utils.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import { languageOf, extractImports, extractDeclarations } from '../map/imports.js';
import { ImportResolver } from '../map/resolver.js';
import { signatureAt, DEFAULT_MAX_FILE_BYTES } from '../map/graph.js';
import { SqliteVectorStore } from '../rag/stores/SqliteVectorStore.js';
import { AutoEmbeddingProvider } from '../rag/EmbeddingProvider.js';
import { resolveWorkspaceRepos } from '../workspace/index.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('IncrementalAnalyzer');

const MINIFIED_LINE_LENGTH = 300;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

const toPosix = (p) =>
  String(p ?? '')
    .split(path.sep)
    .join('/')
    .replace(/\\/g, '/');

function comparePaths(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class IncrementalAnalyzer extends EventEmitter {
  constructor(options = {}) {
    super();

    const syncEnabled = Boolean(
      options.sync ||
      options.syncRag ||
      options.syncGraph ||
      options.vectorStore ||
      options.storePath
    );

    this.options = {
      autoAnalyze: true,
      redactSecrets: options.redactSecrets !== false,
      maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      sync: syncEnabled,
      syncRag: options.syncRag ?? syncEnabled,
      syncGraph: options.syncGraph ?? syncEnabled,
      hydrateGraphOnStart: options.hydrateGraphOnStart !== false,
      repos: [],
      ...options,
    };

    this.projectRoot = options.projectRoot ? path.resolve(options.projectRoot) : null;
    this.extraRepos = Array.isArray(this.options.repos)
      ? this.options.repos.filter(Boolean).map((r) => path.resolve(r))
      : [];
    this.isMultiRepo = this.extraRepos.length > 0;
    this.repos = [];
    this._refreshWorkspaceRepos();

    this.analyzer = new Analyzer(options);
    this.methodAnalyzer = new MethodAnalyzer();
    this.fileCache = new Map(); // Cache of file analyses
    this.aggregateStats = null;

    // Incremental RAG & Knowledge Graph state
    this.vectorStore = options.vectorStore || null;
    this.graphNodes = new Map(); // posixRelativePath (or <alias>/<relPath>) -> node
    this.graphEdges = []; // Array<{from, to, weight}>
    this._graphHydrated = false;
  }

  /**
   * Resolve and cache workspace repositories when projectRoot or extraRepos are configured.
   */
  _refreshWorkspaceRepos() {
    if (!this.projectRoot) {
      this.repos = [];
      return;
    }
    if (this.extraRepos.length > 0) {
      this.isMultiRepo = true;
      this.repos = resolveWorkspaceRepos([this.projectRoot, ...this.extraRepos]);
    } else {
      this.isMultiRepo = false;
      this.repos = [{ root: this.projectRoot, alias: null }];
    }
  }

  /**
   * Infer projectRoot from a file change event when not explicitly configured.
   * @param {Object} changeEvent
   * @returns {string|null}
   */
  _inferProjectRoot(changeEvent) {
    if (this.projectRoot) return this.projectRoot;
    if (changeEvent?.path && changeEvent?.relativePath) {
      const full = path.resolve(changeEvent.path);
      const rel = path.normalize(changeEvent.relativePath);
      if (full.endsWith(rel)) {
        const prefix = full.slice(0, full.length - rel.length).replace(/[/\\]+$/, '');
        if (prefix) {
          this.projectRoot = prefix;
          this._refreshWorkspaceRepos();
          return this.projectRoot;
        }
      }
      this.projectRoot = path.dirname(full);
      this._refreshWorkspaceRepos();
      return this.projectRoot;
    }
    return null;
  }

  /**
   * Resolve a file change event to its owning repository, repo-relative POSIX path, and graph node path.
   * @param {Object} changeEvent
   * @returns {{repo: Object|null, repoRoot: string, repoRelPath: string, graphPath: string}}
   */
  _resolveChangeLocation(changeEvent) {
    const rawRel = toPosix(changeEvent?.relativePath || '');
    const fullPath = changeEvent?.path ? path.resolve(changeEvent.path) : '';

    if (!this.isMultiRepo || this.repos.length === 0) {
      const root = this.projectRoot || process.cwd();
      const repoRelPath =
        rawRel || (fullPath && root ? toPosix(path.relative(root, fullPath)) : '');
      return {
        repo: this.repos[0] || { root, alias: null },
        repoRoot: root,
        repoRelPath,
        graphPath: repoRelPath,
      };
    }

    // 1. Explicit repo metadata from FileWatcher
    if (changeEvent?.repo && changeEvent?.repoRoot) {
      const matched = this.repos.find(
        (r) => r.alias === changeEvent.repo || r.root === changeEvent.repoRoot
      ) || {
        root: path.resolve(changeEvent.repoRoot),
        alias: changeEvent.repo,
      };
      const repoRelPath = toPosix(
        changeEvent.repoRelativePath ||
          (fullPath
            ? path.relative(matched.root, fullPath)
            : rawRel.replace(`${matched.alias}/`, ''))
      );
      return {
        repo: matched,
        repoRoot: matched.root,
        repoRelPath,
        graphPath: `${matched.alias}/${repoRelPath}`,
      };
    }

    // 2. Match by absolute file path against configured repository roots (longest match wins)
    if (fullPath) {
      let bestRepo = null;
      for (const repo of this.repos) {
        const rel = path.relative(repo.root, fullPath);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
          if (!bestRepo || repo.root.length > bestRepo.root.length) {
            bestRepo = repo;
          }
        }
      }
      if (bestRepo) {
        const repoRelPath = toPosix(path.relative(bestRepo.root, fullPath));
        return {
          repo: bestRepo,
          repoRoot: bestRepo.root,
          repoRelPath,
          graphPath: `${bestRepo.alias}/${repoRelPath}`,
        };
      }
    }

    // 3. Match by <alias>/<path> prefix in relativePath
    for (const repo of this.repos) {
      if (repo.alias && rawRel.startsWith(`${repo.alias}/`)) {
        const repoRelPath = rawRel.slice(repo.alias.length + 1);
        return {
          repo,
          repoRoot: repo.root,
          repoRelPath,
          graphPath: rawRel,
        };
      }
    }

    // Fallback to primary repo
    const primary = this.repos[0];
    const repoRelPath = rawRel;
    return {
      repo: primary,
      repoRoot: primary.root,
      repoRelPath,
      graphPath: primary.alias ? `${primary.alias}/${repoRelPath}` : repoRelPath,
    };
  }

  /**
   * Check whether a graph node path (single-repo relative path or multi-repo `<alias>/<path>`)
   * is denied by its owning repository's export policy.
   * @param {string} graphPath
   * @returns {boolean}
   */
  isPathDenied(graphPath) {
    const normalized = toPosix(graphPath);
    if (!this.projectRoot) return false;

    if (this.isMultiRepo && this.repos.length > 0) {
      for (const repo of this.repos) {
        if (repo.alias && normalized.startsWith(`${repo.alias}/`)) {
          const repoRelPath = normalized.slice(repo.alias.length + 1);
          try {
            const scanner = new Scanner(repo.root);
            return scanner.isDenied(repoRelPath);
          } catch {
            return false;
          }
        }
      }
    }

    try {
      const scanner = new Scanner(this.projectRoot);
      return scanner.isDenied(normalized);
    } catch {
      return false;
    }
  }

  /**
   * Ensure the SqliteVectorStore is initialized and baseline graph state is hydrated if enabled.
   * @param {string|null} [rootOverride]\n   * @returns {Promise<boolean>}
   */
  async ensureSyncReady(rootOverride = null) {
    if (!this.options.syncRag && !this.options.syncGraph) {
      return false;
    }

    const root = rootOverride || this.projectRoot || process.cwd();
    if (!this.projectRoot && root) {
      this.projectRoot = path.resolve(root);
      this._refreshWorkspaceRepos();
    }

    if (!this.vectorStore) {
      const storePath =
        this.options.storePath || path.join(this.projectRoot, '.ctxman', 'self-knowledge');
      const embedder = this.options.embeddingProvider || new AutoEmbeddingProvider();
      this.vectorStore = new SqliteVectorStore(embedder, storePath);
    }

    if (!this.vectorStore.initialized) {
      await this.vectorStore.init();
    }

    if (this.options.syncGraph && !this._graphHydrated) {
      this._graphHydrated = true;
      const persisted = await this.vectorStore.getGraph();
      for (const node of persisted.nodes) {
        this.graphNodes.set(node.path, {
          ...node,
          identifiers: new Set(),
        });
      }
      this.graphEdges = persisted.edges;

      if (this.options.hydrateGraphOnStart && this.projectRoot && fs.existsSync(this.projectRoot)) {
        await this._hydrateGraphFromDisk(this.projectRoot);
      }
    }

    return true;
  }

  /**
   * Hydrate in-memory graph nodes from existing project files so cross-file import resolution
   * and symbol reference counts have full repository visibility.
   * @param {string} root
   */
  async _hydrateGraphFromDisk(root) {
    const targets =
      this.isMultiRepo && this.repos.length > 0
        ? this.repos
        : [{ root: path.resolve(root), alias: null }];

    let changed = false;
    for (const repo of targets) {
      let scanned = [];
      try {
        const scanner = new Scanner(repo.root);
        scanned = scanner.scan();
      } catch (_err) {
        continue;
      }

      for (const file of scanned) {
        const repoRelPath = toPosix(file.relativePath);
        const graphPath =
          this.isMultiRepo && repo.alias ? `${repo.alias}/${repoRelPath}` : repoRelPath;
        const language = languageOf(repoRelPath);
        if (!language || file.size > this.options.maxFileBytes) continue;

        let content;
        try {
          content = fs.readFileSync(file.path, 'utf-8');
        } catch {
          continue;
        }

        const contentHash = crypto.createHash('sha256').update(content).digest('hex');
        const existing = this.graphNodes.get(graphPath);
        if (existing && existing.contentHash === contentHash && existing.identifiers?.size > 0) {
          continue;
        }

        const node = this._buildNodeFromContent(
          graphPath,
          file.path,
          content,
          file.size,
          contentHash
        );
        if (node) {
          this.graphNodes.set(graphPath, node);
          changed = true;
        }
      }
    }

    if (changed) {
      this._recomputeGraphEdgesAndSymbols();
      await this.vectorStore.syncGraph({
        nodes: Array.from(this.graphNodes.values()),
        edges: this.graphEdges,
      });
    }
  }

  /**
   * Perform an initial full-repository (or multi-repo workspace) bootstrap sync of both
   * RAG embeddings and the knowledge graph.
   * @param {string} [root=this.projectRoot]
   * @param {Object} [options]
   * @param {string[]} [options.repos]
   * @returns {Promise<{files: number, ragUpserted: number, ragSkipped: number, graphNodes: number, graphEdges: number, repos?: string[]}>}
   */
  async bootstrapSync(root = this.projectRoot, options = {}) {
    const targetRoot = path.resolve(root || this.projectRoot || process.cwd());
    this.projectRoot = targetRoot;
    if (Array.isArray(options.repos) && options.repos.length > 0) {
      this.extraRepos = options.repos.filter(Boolean).map((r) => path.resolve(r));
    }
    this._refreshWorkspaceRepos();
    await this.ensureSyncReady(targetRoot);

    const targets =
      this.isMultiRepo && this.repos.length > 0 ? this.repos : [{ root: targetRoot, alias: null }];

    let totalFiles = 0;
    let ragUpserted = 0;
    let ragSkipped = 0;

    this.graphNodes.clear();

    for (const repo of targets) {
      const scanner = new Scanner(repo.root);
      const scanned = scanner.scan();
      totalFiles += scanned.length;

      for (const file of scanned) {
        if (file.size > this.options.maxFileBytes) continue;
        const repoRelPath = toPosix(file.relativePath);
        if (scanner.isDenied(repoRelPath)) continue;

        const graphPath =
          this.isMultiRepo && repo.alias ? `${repo.alias}/${repoRelPath}` : repoRelPath;

        let content;
        try {
          content = fs.readFileSync(file.path, 'utf-8');
        } catch {
          continue;
        }
        if (content.includes('\0')) continue;

        const contentHash = crypto.createHash('sha256').update(content).digest('hex');

        if (this.options.syncRag && FileUtils.isText(file.path)) {
          const textToEmbed = this.options.redactSecrets ? redactSecrets(content).text : content;
          const res = await this.vectorStore.addDocuments([
            {
              id: graphPath,
              text: textToEmbed,
              metadata: {
                source: 'watch-sync',
                sourceId: graphPath,
                path: file.path,
                relativePath: graphPath,
                repo: repo.alias || undefined,
                extension: file.extension,
                filename: file.name,
                size: file.size,
                updatedAt: new Date().toISOString(),
              },
            },
          ]);
          ragUpserted += res.upserted;
          ragSkipped += res.skipped;
        }

        if (this.options.syncGraph && languageOf(repoRelPath)) {
          const node = this._buildNodeFromContent(
            graphPath,
            file.path,
            content,
            file.size,
            contentHash
          );
          if (node) {
            this.graphNodes.set(graphPath, node);
          }
        }
      }
    }

    if (this.options.syncGraph) {
      this._recomputeGraphEdgesAndSymbols();
      await this.vectorStore.syncGraph({
        nodes: Array.from(this.graphNodes.values()),
        edges: this.graphEdges,
        replaceAll: true,
      });
    }

    const summary = {
      files: totalFiles,
      ragUpserted,
      ragSkipped,
      graphNodes: this.graphNodes.size,
      graphEdges: this.graphEdges.length,
      ...(this.isMultiRepo ? { repos: this.repos.map((r) => r.alias) } : {}),
    };

    this.emit('sync:bootstrap', summary);
    return summary;
  }

  /**
   * Build a knowledge-graph node from file content.
   * @param {string} relPath - POSIX project-relative path (or <alias>/<relPath> in multi-repo mode)
   * @param {string} fullPath - Absolute path on disk
   * @param {string} content - Raw file text
   * @param {number} sizeBytes
   * @param {string} [contentHash]
   * @returns {Object|null}
   */
  _buildNodeFromContent(relPath, fullPath, content, sizeBytes, contentHash = null) {
    const language = languageOf(relPath);
    if (!language) return null;

    const lines = content.split('\n');
    if (content.length > 4096 && content.length / lines.length > MINIFIED_LINE_LENGTH) {
      return null;
    }

    const hash = contentHash || crypto.createHash('sha256').update(content).digest('hex');
    const foundMethods = this.methodAnalyzer
      .extractMethods(content, fullPath)
      .sort((a, b) => a.line - b.line || comparePaths(a.name, b.name));

    const methods = foundMethods.map((method) => {
      let signature = signatureAt(lines, method.line);
      if (this.options.redactSecrets) {
        signature = redactSecrets(signature).text;
      }
      return { name: method.name, line: method.line, signature };
    });

    return {
      path: relPath,
      language,
      bytes: sizeBytes ?? Buffer.byteLength(content, 'utf-8'),
      contentHash: hash,
      methods,
      symbolRefs: 0,
      unresolvedImports: 0,
      imports: extractImports(language, content),
      declarations: extractDeclarations(language, content),
      identifiers: new Set(content.match(IDENTIFIER)),
    };
  }

  /**
   * Resolve cross-repository import specifiers in multi-repo workspace mode.
   * Supports:
   * - `<alias>/<subpath>`, `@<alias>/<subpath>`, `@<scope>/<alias>/<subpath>`
   * - Bare `<alias>`, `@<alias>`, `@<scope>/<alias>` (resolves index or src/index)
   * - Relative specifiers (`../../other-repo/src/foo.js`) crossing into another watched repo
   * @param {Object} fromRepo - { root, alias }
   * @param {string} fromRepoRelPath - POSIX path inside fromRepo
   * @param {string} spec - Import specifier string
   * @param {Map<string, ImportResolver>} resolversByAlias
   * @returns {string|null} Resolved `<targetAlias>/<targetRelPath>` or null
   */
  _resolveCrossRepoSpec(fromRepo, fromRepoRelPath, spec, resolversByAlias) {
    if (!spec || typeof spec !== 'string') return null;
    const cleanSpec = spec.trim().replace(/\\/g, '/');
    if (!cleanSpec) return null;

    // 1. Relative specifier crossing out of fromRepo into a sibling repo on disk
    if (cleanSpec.startsWith('.')) {
      const absFromDir = path.dirname(path.join(fromRepo.root, fromRepoRelPath));
      const absTargetBase = path.resolve(absFromDir, cleanSpec);
      for (const targetRepo of this.repos) {
        if (targetRepo.alias === fromRepo.alias) continue;
        const relInTarget = path.relative(targetRepo.root, absTargetBase);
        if (relInTarget && !relInTarget.startsWith('..') && !path.isAbsolute(relInTarget)) {
          const targetResolver = resolversByAlias.get(targetRepo.alias);
          if (!targetResolver) continue;
          const resolvedRel = targetResolver.resolveJs('', `./${toPosix(relInTarget)}`);
          if (resolvedRel) {
            return `${targetRepo.alias}/${resolvedRel}`;
          }
        }
      }
      return null;
    }

    // 2. Alias-prefixed specifier: `<alias>/...`, `@<alias>/...`, `@<scope>/<alias>/...`
    const normalized = cleanSpec.replace(/^@[^/]+\//, (match) => {
      const bare = match.slice(1, -1);
      // If `@<alias>/...` directly matches a repo alias, keep `<alias>/...`
      if (this.repos.some((r) => r.alias === bare)) {
        return `${bare}/`;
      }
      // Otherwise strip `@<scope>/` so `@org/<alias>/...` becomes `<alias>/...`
      return '';
    });
    const bareAt = cleanSpec.startsWith('@') ? cleanSpec.slice(1) : cleanSpec;

    for (const targetRepo of this.repos) {
      if (!targetRepo.alias || targetRepo.alias === fromRepo.alias) continue;
      const alias = targetRepo.alias;
      const targetResolver = resolversByAlias.get(alias);
      if (!targetResolver) continue;

      let subpath = null;
      if (normalized === alias || bareAt === alias) {
        subpath = 'index';
      } else if (normalized.startsWith(`${alias}/`)) {
        subpath = normalized.slice(alias.length + 1);
      } else if (bareAt.startsWith(`${alias}/`)) {
        subpath = bareAt.slice(alias.length + 1);
      }

      if (subpath) {
        const candidates = [`./${subpath}`, `./src/${subpath}`, `./lib/${subpath}`];
        for (const cand of candidates) {
          const resolvedRel = targetResolver.resolveJs('', cand);
          if (resolvedRel) {
            return `${alias}/${resolvedRel}`;
          }
        }
      }
    }

    return null;
  }

  /**
   * Recompute import edges and symbol reference scores in-memory across all active graph nodes.
   */
  _recomputeGraphEdgesAndSymbols() {
    const nodes = Array.from(this.graphNodes.values()).sort((a, b) => comparePaths(a.path, b.path));
    const edges = [];

    if (!this.isMultiRepo || this.repos.length === 0) {
      const root = this.projectRoot || process.cwd();
      const resolver = new ImportResolver(root, nodes);

      for (const node of nodes) {
        const { edges: targets, unresolved } = resolver.resolve(node);
        node.unresolvedImports = unresolved;
        for (const { to, weight } of targets) {
          edges.push({ from: node.path, to, weight });
        }
      }
    } else {
      // Multi-repo resolution: intra-repo ImportResolver per repo + cross-repo edge resolution
      const nodesByAlias = new Map();
      const resolversByAlias = new Map();

      for (const repo of this.repos) {
        nodesByAlias.set(repo.alias, []);
      }

      for (const node of nodes) {
        const slashIdx = node.path.indexOf('/');
        const alias = slashIdx > 0 ? node.path.slice(0, slashIdx) : null;
        if (alias && nodesByAlias.has(alias)) {
          const repoRelPath = node.path.slice(alias.length + 1);
          nodesByAlias.get(alias).push({
            origNode: node,
            strippedNode: {
              ...node,
              path: repoRelPath,
            },
          });
        }
      }

      for (const repo of this.repos) {
        const entries = nodesByAlias.get(repo.alias) || [];
        const strippedNodes = entries.map((e) => e.strippedNode);
        resolversByAlias.set(repo.alias, new ImportResolver(repo.root, strippedNodes));
      }

      for (const repo of this.repos) {
        const entries = nodesByAlias.get(repo.alias) || [];
        const resolver = resolversByAlias.get(repo.alias);

        for (const { origNode, strippedNode } of entries) {
          const { edges: intraTargets, unresolved: intraUnresolved } =
            resolver.resolve(strippedNode);
          const edgeWeights = new Map();

          for (const { to, weight } of intraTargets) {
            edgeWeights.set(`${repo.alias}/${to}`, weight);
          }

          // Attempt cross-repo resolution for imports
          let crossResolvedCount = 0;
          for (const imp of origNode.imports || []) {
            if (!imp?.spec) continue;
            const crossTarget = this._resolveCrossRepoSpec(
              repo,
              strippedNode.path,
              imp.spec,
              resolversByAlias
            );
            if (crossTarget && crossTarget !== origNode.path) {
              edgeWeights.set(crossTarget, (edgeWeights.get(crossTarget) || 0) + 1);
              crossResolvedCount++;
            }
          }

          origNode.unresolvedImports = Math.max(0, intraUnresolved - crossResolvedCount);
          for (const [to, weight] of edgeWeights) {
            edges.push({ from: origNode.path, to, weight });
          }
        }
      }
    }

    edges.sort((a, b) => comparePaths(a.from, b.from) || comparePaths(a.to, b.to));
    this.graphEdges = edges;

    // Recompute symbolRefs across all nodes (intra-repo and cross-repo)
    const definedNames = nodes.map(
      (node) =>
        new Set(
          (node.methods || [])
            .map((method) => method.name.split(' ').pop())
            .filter((name) => name && name.length > 2)
        )
    );
    const definers = new Map();
    for (const names of definedNames) {
      for (const name of names) {
        definers.set(name, (definers.get(name) || 0) + 1);
      }
    }
    const mentions = new Map();
    for (const node of nodes) {
      const ids = node.identifiers || new Set();
      for (const id of ids) {
        if (definers.has(id)) {
          mentions.set(id, (mentions.get(id) || 0) + 1);
        }
      }
    }
    nodes.forEach((node, i) => {
      let score = 0;
      for (const name of definedNames[i]) {
        const defining = definers.get(name);
        score += Math.max(0, (mentions.get(name) || 0) - defining) / defining;
      }
      node.symbolRefs = score;
    });
  }

  /**
   * Check whether a relative path is denied by policy or ignored by scanner rules in its owning repo.
   * @param {string} repoRelPath
   * @param {string} fullPath
   * @param {string} [repoRoot]
   * @returns {{denied: boolean, ignored: boolean}}
   */
  _checkPolicyAndIgnore(repoRelPath, fullPath, repoRoot = this.projectRoot) {
    const targetRoot = repoRoot || this.projectRoot;
    if (!targetRoot) return { denied: false, ignored: false };
    try {
      const scanner = new Scanner(targetRoot);
      const denied = scanner.isDenied(repoRelPath);
      const ignored = scanner.shouldIgnore(repoRelPath, fullPath);
      return { denied, ignored };
    } catch (_err) {
      return { denied: false, ignored: false };
    }
  }

  /**
   * Synchronize a created or modified file with SqliteVectorStore and the knowledge graph.
   * @param {Object} changeEvent
   * @returns {Promise<{rag: Object|null, graph: Object|null}>}
   */
  async syncFileChange(changeEvent) {
    this._inferProjectRoot(changeEvent);
    const ready = await this.ensureSyncReady();
    if (!ready) return { rag: null, graph: null };

    const { repo, repoRoot, repoRelPath, graphPath } = this._resolveChangeLocation(changeEvent);
    const fullPath = changeEvent.path;

    const { denied, ignored } = this._checkPolicyAndIgnore(repoRelPath, fullPath, repoRoot);
    if (denied || ignored) {
      // If previously indexed, purge from vector store and graph
      const removedDocs = this.options.syncRag
        ? await this.vectorStore.removeDocument(graphPath)
        : 0;
      let removedGraph = { removedNode: 0, removedEdges: 0 };
      if (this.options.syncGraph && this.graphNodes.has(graphPath)) {
        this.graphNodes.delete(graphPath);
        this._recomputeGraphEdgesAndSymbols();
        removedGraph = await this.vectorStore.removeGraphNode(graphPath);
        await this.vectorStore.syncGraph({
          nodes: Array.from(this.graphNodes.values()),
          edges: this.graphEdges,
        });
      }
      const skippedPayload = {
        file: graphPath,
        reason: denied ? 'denied' : 'ignored',
        removedDocs,
        removedGraph,
      };
      this.emit('sync:skipped', skippedPayload);
      return {
        rag: { status: skippedPayload.reason, removed: removedDocs },
        graph: { status: skippedPayload.reason, ...removedGraph },
      };
    }

    let content;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      return { rag: null, graph: null };
    }

    const sizeBytes = changeEvent.size ?? Buffer.byteLength(content, 'utf-8');
    if (sizeBytes > this.options.maxFileBytes || content.includes('\0')) {
      return {
        rag: { status: 'skipped-size-or-binary', upserted: 0, skipped: 0 },
        graph: { status: 'skipped-size-or-binary' },
      };
    }

    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    let ragResult = null;
    let graphResult = null;

    // 1. Incremental SQLite Vector Store upsert
    if (this.options.syncRag && FileUtils.isText(fullPath)) {
      let textToEmbed = content;
      let redactionsCount = 0;
      if (this.options.redactSecrets) {
        const redacted = redactSecrets(content);
        textToEmbed = redacted.text;
        redactionsCount = redacted.findings.length;
      }

      const { upserted, skipped } = await this.vectorStore.addDocuments([
        {
          id: graphPath,
          text: textToEmbed,
          metadata: {
            source: 'watch-sync',
            sourceId: graphPath,
            path: fullPath,
            relativePath: graphPath,
            repo: repo?.alias || undefined,
            extension: path.extname(fullPath),
            filename: path.basename(fullPath),
            size: sizeBytes,
            updatedAt: new Date().toISOString(),
          },
        },
      ]);

      ragResult = {
        action: upserted > 0 ? 'upserted' : 'unchanged',
        file: graphPath,
        upserted,
        skipped,
        redactions: redactionsCount,
        totalDocuments: this.vectorStore.count(),
      };
      this.emit('rag:synced', ragResult);
    }

    // 2. Incremental Knowledge Graph node & edge sync
    if (this.options.syncGraph) {
      const node = this._buildNodeFromContent(graphPath, fullPath, content, sizeBytes, contentHash);
      if (node) {
        this.graphNodes.set(graphPath, node);
        this._recomputeGraphEdgesAndSymbols();
        await this.vectorStore.syncGraph({
          nodes: Array.from(this.graphNodes.values()),
          edges: this.graphEdges,
        });

        const fileEdges = this.graphEdges.filter((e) => e.from === graphPath);
        graphResult = {
          action: 'upserted',
          file: graphPath,
          methods: node.methods.length,
          outgoingEdges: fileEdges.length,
          symbolRefs: node.symbolRefs,
          totalNodes: this.graphNodes.size,
          totalEdges: this.graphEdges.length,
        };
        this.emit('graph:updated', graphResult);
      } else if (this.graphNodes.has(graphPath)) {
        // File became minified or non-code; remove from graph
        this.graphNodes.delete(graphPath);
        this._recomputeGraphEdgesAndSymbols();
        await this.vectorStore.removeGraphNode(graphPath);
        await this.vectorStore.syncGraph({
          nodes: Array.from(this.graphNodes.values()),
          edges: this.graphEdges,
        });
        graphResult = {
          action: 'removed',
          file: graphPath,
          totalNodes: this.graphNodes.size,
          totalEdges: this.graphEdges.length,
        };
        this.emit('graph:updated', graphResult);
      }
    }

    return { rag: ragResult, graph: graphResult };
  }

  /**
   * Analyze changed file and update stats, vector embeddings, and knowledge graph.
   * @param {FileChangeEvent} changeEvent
   */
  async analyzeChange(changeEvent) {
    logger.debug(`Analyzing change: ${changeEvent.relativePath}`);

    const startTime = Date.now();
    this._inferProjectRoot(changeEvent);

    try {
      // If file deleted, remove from cache, vector store, and knowledge graph
      if (!changeEvent.exists) {
        await this.handleFileDeleted(changeEvent);
        return;
      }

      const { repoRoot, repoRelPath, graphPath } = this._resolveChangeLocation(changeEvent);
      const { denied, ignored } = this._checkPolicyAndIgnore(
        repoRelPath,
        changeEvent.path,
        repoRoot
      );
      if (denied || ignored) {
        if (this.options.syncRag || this.options.syncGraph) {
          await this.syncFileChange(changeEvent);
        }
        return;
      }

      // Analyze file
      const fileInfo = {
        path: changeEvent.path,
        relativePath: this.isMultiRepo ? graphPath : changeEvent.relativePath,
        name: path.basename(changeEvent.path),
        extension: path.extname(changeEvent.path),
        size: changeEvent.size,
        modified: changeEvent.modified,
      };

      const analysis = await this.analyzer.analyzeFile(fileInfo);

      if (analysis) {
        // Update cache
        const oldAnalysis = this.fileCache.get(changeEvent.path);
        this.fileCache.set(changeEvent.path, analysis);

        // Update aggregate stats
        this.updateAggregateStats(oldAnalysis, analysis);

        // Synchronize SQLite vector store & knowledge graph if enabled
        let sync = null;
        if (this.options.syncRag || this.options.syncGraph) {
          sync = await this.syncFileChange(changeEvent);
        }

        const elapsed = Date.now() - startTime;

        this.emit('analysis:complete', {
          file: this.isMultiRepo ? graphPath : changeEvent.relativePath,
          analysis,
          sync,
          elapsed,
          cached: false,
        });

        logger.debug(`Analysis complete: ${changeEvent.relativePath} (${elapsed}ms)`);
      }
    } catch (error) {
      logger.error(`Analysis failed for ${changeEvent.relativePath}: ${error.message}`);
      this.emit('analysis:error', {
        file: changeEvent.relativePath,
        error,
      });
    }
  }

  /**
   * Handle file deletion across analysis cache, SqliteVectorStore, and knowledge graph.
   * @param {FileChangeEvent} changeEvent
   */
  async handleFileDeleted(changeEvent) {
    const oldAnalysis = this.fileCache.get(changeEvent.path);
    const { graphPath } = this._resolveChangeLocation(changeEvent);

    if (oldAnalysis) {
      // Remove from cache
      this.fileCache.delete(changeEvent.path);

      // Update stats (subtract)
      if (this.aggregateStats) {
        this.aggregateStats.totalFiles--;
        this.aggregateStats.totalTokens -= oldAnalysis.tokens;
        this.aggregateStats.totalSize -= oldAnalysis.size;

        // Update language stats
        const lang = oldAnalysis.language;
        if (this.aggregateStats.byLanguage[lang]) {
          this.aggregateStats.byLanguage[lang].files--;
          this.aggregateStats.byLanguage[lang].tokens -= oldAnalysis.tokens;
          this.aggregateStats.byLanguage[lang].size -= oldAnalysis.size;
        }
      }
    }

    let sync = null;
    if (this.options.syncRag || this.options.syncGraph) {
      const ready = await this.ensureSyncReady();
      if (ready) {
        let ragResult = null;
        let graphResult = null;

        if (this.options.syncRag) {
          const removedByRel = await this.vectorStore.removeDocument(graphPath);
          const removedByAbs =
            changeEvent.path && changeEvent.path !== graphPath
              ? await this.vectorStore.removeDocument(changeEvent.path)
              : 0;
          const removed = removedByRel + removedByAbs;
          ragResult = {
            action: 'deleted',
            file: graphPath,
            removed,
            totalDocuments: this.vectorStore.count(),
          };
          this.emit('rag:synced', ragResult);
        }

        if (this.options.syncGraph) {
          this.graphNodes.delete(graphPath);
          this._recomputeGraphEdgesAndSymbols();
          const { removedNode, removedEdges } = await this.vectorStore.removeGraphNode(graphPath);
          await this.vectorStore.syncGraph({
            nodes: Array.from(this.graphNodes.values()),
            edges: this.graphEdges,
          });
          graphResult = {
            action: 'deleted',
            file: graphPath,
            removedNode,
            removedEdges,
            totalNodes: this.graphNodes.size,
            totalEdges: this.graphEdges.length,
          };
          this.emit('graph:updated', graphResult);
        }

        sync = { rag: ragResult, graph: graphResult };
      }
    }

    if (oldAnalysis || sync) {
      this.emit('file:deleted', {
        file: this.isMultiRepo ? graphPath : changeEvent.relativePath,
        oldTokens: oldAnalysis ? oldAnalysis.tokens : 0,
        sync,
      });

      logger.debug(`File deleted from cache/store: ${graphPath}`);
    }
  }

  /**
   * Update aggregate statistics
   * @param {FileAnalysis|null} oldAnalysis
   * @param {FileAnalysis} newAnalysis
   */
  updateAggregateStats(oldAnalysis, newAnalysis) {
    if (!this.aggregateStats) {
      this.aggregateStats = this.analyzer.getStats();
    }

    // Subtract old values if exists
    if (oldAnalysis) {
      this.aggregateStats.totalTokens -= oldAnalysis.tokens;
      this.aggregateStats.totalSize -= oldAnalysis.size;

      const oldLang = oldAnalysis.language;
      if (this.aggregateStats.byLanguage[oldLang]) {
        this.aggregateStats.byLanguage[oldLang].tokens -= oldAnalysis.tokens;
        this.aggregateStats.byLanguage[oldLang].size -= oldAnalysis.size;
      }
    } else {
      // New file
      this.aggregateStats.totalFiles++;
    }

    // Add new values
    this.aggregateStats.totalTokens += newAnalysis.tokens;
    this.aggregateStats.totalSize += newAnalysis.size;

    const lang = newAnalysis.language;
    if (!this.aggregateStats.byLanguage[lang]) {
      this.aggregateStats.byLanguage[lang] = { files: 0, tokens: 0, size: 0 };
    }

    if (!oldAnalysis) {
      this.aggregateStats.byLanguage[lang].files++;
    }

    this.aggregateStats.byLanguage[lang].tokens += newAnalysis.tokens;
    this.aggregateStats.byLanguage[lang].size += newAnalysis.size;

    // Emit stats update
    this.emit('stats:updated', this.aggregateStats);
  }

  /**
   * Get current knowledge graph snapshot (from SQLite store if initialized, else in-memory).
   * @returns {Promise<{nodes: Array<Object>, edges: Array<{from: string, to: string, weight: number}>}>}
   */
  async getGraph() {
    if (this.vectorStore) {
      return this.vectorStore.getGraph();
    }
    const nodes = Array.from(this.graphNodes.values())
      .map(({ identifiers: _identifiers, ...rest }) => rest)
      .sort((a, b) => comparePaths(a.path, b.path));
    return {
      nodes,
      edges: [...this.graphEdges],
    };
  }

  /**
   * Get current aggregate statistics
   * @returns {object}
   */
  getStats() {
    return this.aggregateStats || this.analyzer.getStats();
  }

  /**
   * Get cached file analysis
   * @param {string} filePath
   * @returns {FileAnalysis|null}
   */
  getCachedAnalysis(filePath) {
    return this.fileCache.get(filePath) || null;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.fileCache.clear();
    logger.info('Analysis cache cleared');
  }

  /**
   * Close underlying vector store connection if open.
   */
  close() {
    if (this.vectorStore && typeof this.vectorStore.close === 'function') {
      this.vectorStore.close();
    }
  }

  /**
   * Get cache statistics
   * @returns {object}
   */
  getCacheStats() {
    return {
      cachedFiles: this.fileCache.size,
      cacheSize: this.fileCache.size * 1024, // Rough estimate
      graphNodes: this.graphNodes.size,
      graphEdges: this.graphEdges.length,
      vectorDocuments: this.vectorStore ? this.vectorStore.count() : 0,
      repos: this.repos.map((r) => ({ root: r.root, alias: r.alias })),
    };
  }
}

export default IncrementalAnalyzer;
