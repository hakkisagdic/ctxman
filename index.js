/**
 * Ctxman - Public API
 * Exports all modules for programmatic usage
 */

// Core analyzers
import TokenCalculator from './lib/analyzers/token-calculator.js';
import MethodAnalyzer from './lib/analyzers/method-analyzer.js';

// Core v3 modular pipeline & cache
import { Scanner } from './lib/core/Scanner.js';
import { Analyzer } from './lib/core/Analyzer.js';
import { ContextBuilder } from './lib/core/ContextBuilder.js';
import { Reporter } from './lib/core/Reporter.js';
import { CacheManager, resolveCacheManager } from './lib/cache/CacheManager.js';

// Watch & incremental RAG/graph sync
import { FileWatcher } from './lib/watch/FileWatcher.js';
import { IncrementalAnalyzer } from './lib/watch/IncrementalAnalyzer.js';

// Parsers
import GitIgnoreParser from './lib/parsers/gitignore-parser.js';
import MethodFilterParser from './lib/parsers/method-filter-parser.js';

// Formatters
import GitIngestFormatter from './lib/formatters/gitingest-formatter.js';
import ToonFormatter from './lib/formatters/toon-formatter.js';
import FormatRegistry from './lib/formatters/format-registry.js';

// Utils
import TokenUtils from './lib/utils/token-utils.js';
import FileUtils from './lib/utils/file-utils.js';
import ClipboardUtils from './lib/utils/clipboard-utils.js';
import ConfigUtils from './lib/utils/config-utils.js';
import FormatConverter from './lib/utils/format-converter.js';
import ErrorHandler from './lib/utils/error-handler.js';
import { Logger, getLogger, createLogger } from './lib/utils/logger.js'; // v2.3.6+
import Updater from './lib/utils/updater.js'; // v2.3.6+
import GitUtils from './lib/utils/git-utils.js'; // v2.3.6+
import {
  redactSecrets,
  redactPII,
  isValidTCKN,
  isValidLuhn,
  formatRedactionSummary,
} from './lib/utils/secret-redactor.js';

// Pull-request review context
import { buildPrContext } from './lib/pr/pr-context.js';

// Orchestrator functions
import { generateDigestFromReport, generateDigestFromContext } from './ctxman.js';

// Repository map (`ctxman map`)
import { buildRepoGraph, rankFiles, renderRepoMap, buildCallGraph } from './lib/map/index.js';

// Code history explanation (`ctxman why`)
import { explainHistory } from './lib/why/index.js';
import { findExperts, WhoError } from './lib/who/index.js';

// File contents in one document (`ctxman pack`)
import { packContext } from './lib/pack/index.js';

// Import/importer neighborhood context (`ctxman focus`)
import { focusContext, describeFocus, FocusError } from './lib/focus/index.js';

// Multi-repository workspace (`--repo`)
import {
  resolveWorkspaceRepos,
  buildWorkspaceGraph,
  mapWorkspace,
  searchWorkspace,
  packWorkspace,
} from './lib/workspace/index.js';

// RAG Stores & Embedding Providers (v3.2.0)
import { SqliteVectorStore } from './lib/rag/stores/SqliteVectorStore.js';
import { LocalHashEmbeddingProvider, AutoEmbeddingProvider } from './lib/rag/EmbeddingProvider.js';

// Task-Driven Auto Context & Failure Diagnosis (v3.2.0)
import { buildTaskContext } from './lib/task/index.js';
import { diagnoseFailure } from './lib/diagnose/index.js';

// Institutional Memory Bridge (v3.2.0)
import { queryAnalyzerCitations } from './lib/why/analyzer-bridge.js';

// Search, symbol lookup, token counting, RAG & export policy
import { searchProject } from './lib/search/bm25.js';
import { hybridSearch } from './lib/search/hybrid.js';
import { getSymbol } from './lib/search/symbols.js';
import { countForModel } from './lib/count/index.js';
import { askCodebase } from './lib/rag/ask.js';
import {
  loadPolicy,
  Policy,
  PolicyConfigError,
  PolicyViolationError,
  createStarterPolicy,
  createPolicyTemplate,
  COMPLIANCE_PRESETS,
  checkWorkspacePolicies,
  readWorkspaceAuditLogs,
} from './lib/policy/index.js';

// Billing, usage metering, quotas, invoices & payment providers
import {
  PLANS,
  TOPUP_PACKS,
  getPlan,
  listPlans,
  BillingStore,
  QuotaExceededError,
  PaymentProvider,
  IyzicoProvider,
  MockPaymentProvider,
  createPaymentProvider,
} from './lib/billing/index.js';

export {
  // Analyzers
  TokenCalculator,
  MethodAnalyzer,

  // Core v3 pipeline & cache
  Scanner,
  Analyzer,
  ContextBuilder,
  Reporter,
  CacheManager,
  resolveCacheManager,

  // Watch & incremental RAG/graph sync
  FileWatcher,
  IncrementalAnalyzer,

  // Parsers
  GitIgnoreParser,
  MethodFilterParser,

  // Formatters
  GitIngestFormatter,
  ToonFormatter,
  FormatRegistry,

  // Utils
  TokenUtils,
  FileUtils,
  ClipboardUtils,
  ConfigUtils,
  FormatConverter,
  ErrorHandler,
  redactSecrets,
  redactPII,
  isValidTCKN,
  isValidLuhn,
  formatRedactionSummary,

  // v2.3.6+ Utils
  Logger,
  getLogger,
  createLogger,
  Updater,
  GitUtils,

  // Functions
  generateDigestFromReport,
  generateDigestFromContext,

  // Repository map
  buildRepoGraph,
  rankFiles,
  renderRepoMap,
  buildCallGraph,

  // Pull-request context
  buildPrContext,

  // Code history explanation (`ctxman why`)
  explainHistory,
  findExperts,
  WhoError,

  // Packed file contents
  packContext,

  // Focused neighborhood context (`ctxman focus`)
  focusContext,
  describeFocus,
  FocusError,

  // Multi-repository workspace
  resolveWorkspaceRepos,
  buildWorkspaceGraph,
  mapWorkspace,
  searchWorkspace,
  packWorkspace,

  // RAG Stores & Embedding Providers (v3.2.0)
  SqliteVectorStore,
  LocalHashEmbeddingProvider,
  AutoEmbeddingProvider,

  // Task-Driven Auto Context & Failure Diagnosis (v3.2.0)
  buildTaskContext,
  diagnoseFailure,

  // Institutional Memory Bridge (v3.2.0)
  queryAnalyzerCitations,

  // Search, symbols, counting, RAG & policy
  searchProject,
  hybridSearch,
  getSymbol,
  countForModel,
  askCodebase,
  loadPolicy,
  Policy,
  PolicyConfigError,
  PolicyViolationError,
  createStarterPolicy,
  createPolicyTemplate,
  COMPLIANCE_PRESETS,
  checkWorkspacePolicies,
  readWorkspaceAuditLogs,

  // Billing, usage metering, quotas, invoices & payment providers
  PLANS,
  TOPUP_PACKS,
  getPlan,
  listPlans,
  BillingStore,
  QuotaExceededError,
  PaymentProvider,
  IyzicoProvider,
  MockPaymentProvider,
  createPaymentProvider,
};

// Alias for backward compatibility
export { TokenCalculator as TokenAnalyzer };
