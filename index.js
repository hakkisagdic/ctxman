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
import { resolveRemoteGitUrl, cloneRemoteRepo, withRemoteRepo } from './lib/utils/remote-repo.js';
import {
  redactSecrets,
  redactPII,
  isValidTCKN,
  isValidLuhn,
  formatRedactionSummary,
} from './lib/utils/secret-redactor.js';

// Pull-request review context
import { buildPrContext } from './lib/pr/pr-context.js';
import {
  analyzePrIntelligence,
  evaluatePrRules,
  calculatePrRiskAndConfidence,
  buildPrMermaidDiagram,
} from './lib/pr/pr-intelligence.js';

// Orchestrator functions
import { generateDigestFromReport, generateDigestFromContext } from './ctxman.js';

// Repository map (`ctxman map`)
import { buildRepoGraph, rankFiles, renderRepoMap, buildCallGraph } from './lib/map/index.js';

// Code history explanation (`ctxman why`)
import { explainHistory } from './lib/why/index.js';
import { findExperts, WhoError } from './lib/who/index.js';

// File contents in one document (`ctxman pack`)
import {
  packContext,
  discoverProjectRules,
  formatProjectRulesSection,
  classifyCacheTier,
  orderEntriesForPromptCache,
  buildPromptCachePlan,
} from './lib/pack/index.js';
import { createPackManifest, packDeltaContext } from './lib/pack/delta.js';
import { pruneContextToBudget } from './lib/pack/context-pruner.js';
import { compileAgentRules } from './lib/pack/rule-compiler.js';

// Pre-change Blast Radius & Symbol Contract Simulator (`ctxman impact`)
import {
  analyzeBlastRadius,
  buildBlastMermaidDiagram,
  formatBlastRadiusReport,
  ImpactError,
} from './lib/impact/index.js';

// Architecture Drift & Layer Violation Detector (`C-3`) & Faz 3–17 Creative Features
import { checkArchitectureDrift, loadArchitectureConfig } from './lib/architecture/index.js';
import { findDeadSymbols } from './lib/architecture/dead-symbols.js';
import { checkDocDrift } from './lib/architecture/doc-drift.js';
import { findCircularDependencies } from './lib/architecture/circular-deps.js';
import { findSemanticClones } from './lib/architecture/semantic-clones.js';
import { findQueryBottlenecks } from './lib/architecture/query-bottlenecks.js';
import { checkEnvConfigDrift } from './lib/architecture/env-drift.js';
import { mapEventLineage } from './lib/architecture/event-lineage.js';
import { generateTestScaffold } from './lib/pr/test-scaffold.js';
import { analyzeSemverBreakage } from './lib/pr/semver-analyzer.js';
import { sanitizePromptContext } from './lib/security/prompt-shield.js';
import { findStaleFeatureFlags } from './lib/architecture/feature-flags.js';
import { auditResiliencePatterns } from './lib/architecture/resilience-audit.js';
import { checkI18nDrift } from './lib/architecture/i18n-drift.js';
import { generateSemanticReleaseNotes } from './lib/pr/release-notes.js';
import { decomposeTaskIntoSteps } from './lib/task/task-decomposer.js';
import { analyzeTechDebtHotspots } from './lib/architecture/tech-debt-hotspots.js';
import { detectFlakyTestPatterns } from './lib/pr/flaky-test-detector.js';
import { scanHighEntropySecrets } from './lib/security/entropy-scanner.js';
import { checkSchemaCodeParity } from './lib/architecture/schema-parity.js';
import { planParallelAgentWorkspaces } from './lib/task/parallel-agent-planner.js';
import { auditMigrationSafety } from './lib/architecture/migration-auditor.js';
import { buildSelfHealingPrompt } from './lib/pr/self-healing-test.js';
import { estimateBundleImpact } from './lib/architecture/bundle-impact.js';
import { generateComplianceEvidencePack } from './lib/policy/compliance-evidence.js';
import { suggestChaosTargets } from './lib/architecture/chaos-targets.js';
import { planFeatureFlagRetirement } from './lib/architecture/flag-retirement.js';
import { buildAgentHandoffPack } from './lib/task/agent-handoff.js';
import { simulateConsumerContractImpact } from './lib/workspace/consumer-simulator.js';
import { classifyDataSensitivity } from './lib/security/data-sensitivity.js';
import { auditBuildReproducibility } from './lib/architecture/build-reproducibility.js';
import { evaluateDeployFreezeGate } from './lib/pr/deploy-gate.js';
import { analyzeAgentToolLoop } from './lib/task/tool-loop-guard.js';
import { auditTenantIsolation } from './lib/security/tenant-isolation.js';
import { generateAdrDraft } from './lib/architecture/adr-generator.js';
import { verifyAirgappedReadiness } from './lib/security/airgap-verifier.js';
import { buildIncidentPostmortemPack } from './lib/diagnose/incident-postmortem.js';
import { auditPaymentIdempotency } from './lib/security/payment-idempotency.js';
import { checkPromptTemplateDrift } from './lib/pack/prompt-drift.js';
import { auditQueueConsumerResilience } from './lib/architecture/queue-resilience.js';
import { optimizeWorkspaceTaskGraph } from './lib/workspace/task-optimizer.js';
import { evaluateCanaryRollout } from './lib/pr/canary-evaluator.js';
import { signAndVerifyContextPack } from './lib/policy/context-attestation.js';
import { recommendMissingIndexes } from './lib/architecture/index-advisor.js';
import { assignBalancedReviewers } from './lib/who/reviewer-balancer.js';
import { auditRagCorpusIntegrity } from './lib/rag/corpus-integrity.js';
import { detectFinopsCostAnomalies } from './lib/billing/finops-anomaly.js';
import { auditEndpointAuthCoverage } from './lib/security/auth-coverage.js';
import { generateRollbackRunbook } from './lib/pr/rollback-runbook.js';
import { detectConcurrencyHazards } from './lib/architecture/concurrency-hazards.js';
import { buildSlaImpactReport } from './lib/policy/sla-impact.js';
import { auditCryptoAgility } from './lib/security/crypto-agility.js';
import { evaluateMultiAgentConsensus } from './lib/task/agent-consensus.js';
import { generateShadowReplayPlan } from './lib/pr/shadow-replay.js';
import { auditRightToBeForgotten } from './lib/security/rtbf-auditor.js';
import { analyzeColdStartBottlenecks } from './lib/architecture/cold-start.js';
import { auditDependencyTyposquatting } from './lib/security/typosquat-auditor.js';
import { compressPromptSemantically } from './lib/pack/semantic-compressor.js';
import { auditGraphqlQueryComplexity } from './lib/architecture/graphql-complexity.js';
import { auditTraceContextPropagation } from './lib/architecture/trace-propagation.js';
import { estimateCarbonFootprint } from './lib/count/carbon-estimator.js';
import { planZeroDowntimeSchemaMigration } from './lib/architecture/expand-contract.js';
import { detectHallucinatedPackages } from './lib/security/slopsquat-detector.js';
import { auditSecretRotationReadiness } from './lib/security/secret-rotation.js';
import { estimatePrReviewCognitiveLoad } from './lib/pr/cognitive-load.js';
import { auditApiDeprecationHeaders } from './lib/architecture/api-deprecation.js';
import { auditRegexDosRisk } from './lib/security/redos-auditor.js';
import { auditMcpToolPermissions } from './lib/security/mcp-permission-auditor.js';
import { auditConnectionPoolExhaustion } from './lib/architecture/connection-pool-auditor.js';
import { compareEnvironmentParity } from './lib/architecture/env-parity.js';
import { estimateSemanticCacheHitRate } from './lib/count/semantic-cache-estimator.js';
import { auditWebhookSignatureSecurity } from './lib/security/webhook-security.js';
import { rebalanceContextAttention } from './lib/pack/attention-rebalancer.js';
import { auditSsrfEgressSafety } from './lib/security/ssrf-auditor.js';
import { auditCodeownersCoverage } from './lib/who/codeowners-auditor.js';
import { auditCronJobIdempotency } from './lib/architecture/cron-idempotency.js';
import { analyzeBusFactor } from './lib/who/bus-factor.js';
import { splitPrIntoAtomicGroups } from './lib/pr/pr-splitter.js';
import { parseLcovReport, analyzeUncoveredRisk } from './lib/pr/coverage-risk.js';
import { verifyPatchGrounding } from './lib/pr/patch-verifier.js';
import { buildBisectContextPack } from './lib/pr/bisect-pack.js';
import { checkCrossRepoContracts } from './lib/workspace/contract-checker.js';
import {
  checkLicenseCompliance,
  DEFAULT_ALLOWED_LICENSES,
  DEFAULT_DENIED_LICENSES,
} from './lib/policy/license-gate.js';
import {
  recommendModelRoute,
  classifyTaskComplexity,
  MODEL_CATALOG,
} from './lib/count/cost-router.js';

// Sensitive Data Taint Path Tracker (`C-5`)
import { analyzeTaintFlows } from './lib/security/taint.js';

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

// Uniform Evidence contract & citations (`lib/evidence`)
import {
  EVIDENCE_KINDS,
  MAX_EXCERPT_CHARS,
  EvidenceError,
  normalizeEvidence,
  DEFAULT_SOURCE_TIMEOUT_MS,
  runSources,
  buildCitations,
  renderCitations,
} from './lib/evidence/index.js';

// Work & session digests (`ctxman digest`)
import { writeDigest, readDigest, listDigests } from './lib/context/digest.js';

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
  buildSarifReport,
  SARIF_SCHEMA,
  SARIF_VERSION,
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
  resolveRemoteGitUrl,
  cloneRemoteRepo,
  withRemoteRepo,

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
  analyzePrIntelligence,
  evaluatePrRules,
  calculatePrRiskAndConfidence,
  buildPrMermaidDiagram,

  // Code history explanation (`ctxman why`)
  explainHistory,
  findExperts,
  WhoError,

  // Packed file contents, rules discovery, prompt cache optimizer & session delta pack
  packContext,
  discoverProjectRules,
  formatProjectRulesSection,
  classifyCacheTier,
  orderEntriesForPromptCache,
  buildPromptCachePlan,
  createPackManifest,
  packDeltaContext,
  pruneContextToBudget,
  compileAgentRules,

  // Pre-change Blast Radius & Symbol Contract Simulator (`ctxman impact`)
  analyzeBlastRadius,
  buildBlastMermaidDiagram,
  formatBlastRadiusReport,
  ImpactError,

  // Architecture Drift & Layer Violation Detector (`C-3`), Taint Flow Tracker (`C-5`) & Creative Features
  checkArchitectureDrift,
  loadArchitectureConfig,
  findDeadSymbols,
  checkDocDrift,
  findCircularDependencies,
  findSemanticClones,
  findQueryBottlenecks,
  checkEnvConfigDrift,
  mapEventLineage,
  generateTestScaffold,
  analyzeSemverBreakage,
  sanitizePromptContext,
  findStaleFeatureFlags,
  auditResiliencePatterns,
  checkI18nDrift,
  generateSemanticReleaseNotes,
  decomposeTaskIntoSteps,
  analyzeTechDebtHotspots,
  detectFlakyTestPatterns,
  scanHighEntropySecrets,
  checkSchemaCodeParity,
  planParallelAgentWorkspaces,
  auditMigrationSafety,
  buildSelfHealingPrompt,
  estimateBundleImpact,
  generateComplianceEvidencePack,
  suggestChaosTargets,
  planFeatureFlagRetirement,
  buildAgentHandoffPack,
  simulateConsumerContractImpact,
  classifyDataSensitivity,
  auditBuildReproducibility,
  evaluateDeployFreezeGate,
  analyzeAgentToolLoop,
  auditTenantIsolation,
  generateAdrDraft,
  verifyAirgappedReadiness,
  buildIncidentPostmortemPack,
  auditPaymentIdempotency,
  checkPromptTemplateDrift,
  auditQueueConsumerResilience,
  optimizeWorkspaceTaskGraph,
  evaluateCanaryRollout,
  signAndVerifyContextPack,
  recommendMissingIndexes,
  assignBalancedReviewers,
  auditRagCorpusIntegrity,
  detectFinopsCostAnomalies,
  auditEndpointAuthCoverage,
  generateRollbackRunbook,
  detectConcurrencyHazards,
  buildSlaImpactReport,
  auditCryptoAgility,
  evaluateMultiAgentConsensus,
  generateShadowReplayPlan,
  auditRightToBeForgotten,
  analyzeColdStartBottlenecks,
  auditDependencyTyposquatting,
  compressPromptSemantically,
  auditGraphqlQueryComplexity,
  auditTraceContextPropagation,
  estimateCarbonFootprint,
  planZeroDowntimeSchemaMigration,
  detectHallucinatedPackages,
  auditSecretRotationReadiness,
  estimatePrReviewCognitiveLoad,
  auditApiDeprecationHeaders,
  auditRegexDosRisk,
  auditMcpToolPermissions,
  auditConnectionPoolExhaustion,
  compareEnvironmentParity,
  estimateSemanticCacheHitRate,
  auditWebhookSignatureSecurity,
  rebalanceContextAttention,
  auditSsrfEgressSafety,
  auditCodeownersCoverage,
  auditCronJobIdempotency,
  analyzeBusFactor,
  splitPrIntoAtomicGroups,
  parseLcovReport,
  analyzeUncoveredRisk,
  verifyPatchGrounding,
  buildBisectContextPack,
  checkCrossRepoContracts,
  checkLicenseCompliance,
  DEFAULT_ALLOWED_LICENSES,
  DEFAULT_DENIED_LICENSES,
  recommendModelRoute,
  classifyTaskComplexity,
  MODEL_CATALOG,
  analyzeTaintFlows,

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

  // Uniform Evidence contract & citations (`lib/evidence`)
  EVIDENCE_KINDS,
  MAX_EXCERPT_CHARS,
  EvidenceError,
  normalizeEvidence,
  DEFAULT_SOURCE_TIMEOUT_MS,
  runSources,
  buildCitations,
  renderCitations,

  // Work & session digests (`ctxman digest`)
  writeDigest,
  readDigest,
  listDigests,

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
  buildSarifReport,
  SARIF_SCHEMA,
  SARIF_VERSION,

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
