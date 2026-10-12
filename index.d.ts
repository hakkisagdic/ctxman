/**
 * Ctxman - AI Development Platform
 * TypeScript definitions for programmatic API
 */

// ============================================
// Analyzers
// ============================================

/**
 * Token Calculator Options
 */
export interface TokenCalculatorOptions {
  verbose?: boolean;
  compactContext?: boolean;
  methodLevel?: boolean;
  saveReport?: boolean;
  contextExport?: boolean;
  contextToClipboard?: boolean;
  gitingest?: boolean;
  targetModel?: string;
  dashboard?: boolean;
}

/**
 * File analysis result
 */
export interface FileInfo {
  path: string;
  relativePath: string;
  sizeBytes: number;
  tokens: number;
  lines: number;
  extension: string;
  error?: string;
  methods?: MethodInfo[];
}

/**
 * Method information
 */
export interface MethodInfo {
  name: string;
  line: number;
  file: string;
  tokens?: number;
  content?: string;
}

/**
 * Extension statistics
 */
export interface ExtensionStats {
  count: number;
  tokens: number;
  bytes: number;
  lines: number;
}

/**
 * Directory statistics
 */
export interface DirectoryStats {
  count: number;
  tokens: number;
  bytes: number;
  lines: number;
}

/**
 * Analysis statistics
 */
export interface AnalysisStats {
  totalFiles: number;
  totalTokens: number;
  totalBytes: number;
  totalLines: number;
  ignoredFiles: number;
  calculatorIgnoredFiles: number;
  byExtension: Record<string, ExtensionStats>;
  byDirectory: Record<string, DirectoryStats>;
  largestFiles: FileInfo[];
}

/**
 * Method statistics
 */
export interface MethodStats {
  totalMethods: number;
  includedMethods: number;
  methodTokens: Record<string, number>;
}

/**
 * LLM Context
 */
export interface LLMContext {
  project: {
    root: string;
    totalFiles: number;
    totalTokens: number;
  };
  paths?: Record<string, string[]>;
  methods?: Record<string, MethodInfo[]>;
  methodStats?: MethodStats;
}

/**
 * Token Calculator class
 * Main class for analyzing projects and calculating tokens
 */
export class TokenCalculator {
  constructor(projectRoot: string, options?: TokenCalculatorOptions);

  projectRoot: string;
  options: TokenCalculatorOptions;
  stats: AnalysisStats;
  methodStats: MethodStats;

  calculateTokens(content: string, filePath: string): number;
  isTextFile(filePath: string): boolean;
  isCodeFile(filePath: string): boolean;
  analyzeFile(filePath: string): FileInfo;
  scanDirectory(dir: string): string[];
  analyze(): FileInfo[];
  analyzeFiles(files: string[]): FileInfo[];
  updateStats(fileInfo: FileInfo): void;
  generateLLMContext(analysisResults: FileInfo[] | { files: FileInfo[] }): LLMContext;
  exportContextToClipboard(context: LLMContext): void;
  saveContextToFile(context: LLMContext): void;
  saveDetailedReport(analysisResults: FileInfo[]): void;
  saveGitIngestDigest(analysisResults: FileInfo[]): void;
  run(): AnalysisStats;
}

/**
 * @deprecated Use TokenCalculator instead
 */
export class TokenAnalyzer extends TokenCalculator {}

/**
 * Method Analyzer class
 * Extracts methods from multiple programming languages
 */
export class MethodAnalyzer {
  extractMethods(content: string, filePath: string): MethodInfo[];
  extractMethodContent(content: string, methodName: string): string | null;
  extractJavaScriptMethods(content: string, filePath: string): MethodInfo[];
  extractRustMethods(content: string, filePath: string): MethodInfo[];
  extractJavaMethods(content: string, filePath: string): MethodInfo[];
  extractCSharpMethods(content: string, filePath: string): MethodInfo[];
  extractPythonMethods(content: string, filePath: string): MethodInfo[];
  extractPHPMethods(content: string, filePath: string): MethodInfo[];
  extractRubyMethods(content: string, filePath: string): MethodInfo[];
  extractKotlinMethods(content: string, filePath: string): MethodInfo[];
  extractSwiftMethods(content: string, filePath: string): MethodInfo[];
  extractCPlusPlusMethods(content: string, filePath: string): MethodInfo[];
  extractScalaMethods(content: string, filePath: string): MethodInfo[];
}

// ============================================
// Parsers
// ============================================

/**
 * GitIgnore Pattern
 */
export interface GitIgnorePattern {
  regex: RegExp;
  isNegation: boolean;
  original: string;
  isDirectory: boolean;
}

/**
 * GitIgnore Parser class
 * Parses .gitignore, .contextignore, and .contextinclude files
 */
export class GitIgnoreParser {
  constructor(gitignorePath?: string, contextIgnorePath?: string, contextIncludePath?: string);

  patterns: GitIgnorePattern[];
  contextPatterns: GitIgnorePattern[];
  hasIncludeFile: boolean;
  _lastIgnoreReason: string | null;

  loadPatterns(
    gitignorePath: string,
    contextIgnorePath?: string,
    contextIncludePath?: string
  ): void;
  parsePatternFile(filePath: string): GitIgnorePattern[];
  convertToRegex(pattern: string): GitIgnorePattern;
  isIgnored(filePath: string, relativePath: string): boolean;
  testPatterns(patterns: GitIgnorePattern[], relativePath: string, reason: string): boolean;
}

/**
 * Method Filter Pattern
 */
export interface MethodFilterPattern {
  pattern: string;
  regex: RegExp;
}

/**
 * Method Filter Parser class
 * Parses .methodinclude and .methodignore files
 */
export class MethodFilterParser {
  constructor(methodIncludePath?: string, methodIgnorePath?: string);

  includePatterns: MethodFilterPattern[];
  ignorePatterns: MethodFilterPattern[];
  hasIncludeFile: boolean;

  parseMethodFile(filePath: string): MethodFilterPattern[];
  shouldIncludeMethod(methodName: string, fileName: string): boolean;
}

// ============================================
// Formatters
// ============================================

/**
 * GitIngest Formatter Options
 */
export interface GitIngestFormatterOptions {
  chunking?: {
    enabled?: boolean;
    strategy?: 'smart' | 'size' | 'file' | 'directory' | 'dependency';
    maxTokensPerChunk?: number;
    overlap?: number;
    preserveContext?: boolean;
    includeMetadata?: boolean;
    crossReferences?: boolean;
  };
}

/**
 * Chunk data for large repositories
 */
export interface ChunkData {
  id: string;
  index: number;
  total: number;
  content: string;
  files: string[];
  tokens: number;
  metadata: Record<string, unknown>;
  hasOverlap?: boolean;
  overlapFiles?: string[];
}

/**
 * GitIngest Formatter class
 * Formats analyzed code into a single prompt-friendly text file
 */
export class GitIngestFormatter {
  constructor(
    projectRoot: string,
    stats: AnalysisStats,
    analysisResults: FileInfo[],
    options?: GitIngestFormatterOptions
  );

  projectRoot: string;
  stats: AnalysisStats;
  analysisResults: FileInfo[];
  options: GitIngestFormatterOptions;
  chunking: GitIngestFormatterOptions['chunking'] & {
    enabled: boolean;
    strategy: string;
    maxTokensPerChunk: number;
    overlap: number;
    preserveContext: boolean;
    includeMetadata: boolean;
    crossReferences: boolean;
  };
  methodFilterEnabled: boolean;
  methodAnalyzer?: MethodAnalyzer;
  methodFilter?: MethodFilterParser | null;

  generateDigest(): string;
  generateChunkedDigest(): ChunkData[];
  createChunks(): Array<{
    files: FileInfo[];
    tokens: number;
    directories?: Set<string>;
    metadata?: Record<string, unknown>;
  }>;
  saveToFile(outputPath: string): number;
}

/**
 * Toon Formatter Options
 */
export interface ToonFormatterOptions {
  indent?: number;
  delimiter?: ',' | '\t' | '|';
  lengthMarker?: boolean;
}

/**
 * Toon Formatter class
 * Tabular Object Oriented Notation formatter (40-50% token reduction)
 */
export class ToonFormatter {
  constructor(options?: ToonFormatterOptions);

  options: ToonFormatterOptions & {
    indent: number;
    delimiter: string;
    lengthMarker: boolean;
  };
  indentChar: string;

  encode(data: unknown, options?: ToonFormatterOptions): string;
  encodeAsync(data: unknown, options?: ToonFormatterOptions): Promise<string>;
  encodeSync(data: unknown, options?: ToonFormatterOptions): string;
  decode(toonString: string, options?: ToonFormatterOptions): unknown;
  decodeAsync(toonString: string, options?: ToonFormatterOptions): Promise<unknown>;
  validate(toonString: string): { valid: boolean; errors: string[] };
  estimateTokens(toonString: string): number;
  optimize(toonString: string): string;
  minify(toonString: string): string;
  compareWithJSON(data: unknown): {
    toon: string;
    json: string;
    toonSize: number;
    jsonSize: number;
    savings: number;
    savingsPercentage: number;
    toonTokens: number;
    jsonTokens: number;
  };
  compareWithOfficial(
    data: unknown,
    options?: ToonFormatterOptions
  ): Promise<{
    custom: string;
    official: string;
    customSize: number;
    officialSize: number;
    difference: number;
    officialIsBetter: boolean;
  }>;
}

/**
 * Format Info
 */
export interface FormatInfo {
  name: string;
  description: string;
  extension: string;
  mimeType: string;
}

/**
 * Format Encoder Function
 */
export type FormatEncoder = (data: unknown, options?: Record<string, unknown>) => string;

/**
 * Format Registration
 */
export interface FormatRegistration {
  name: string;
  description: string;
  extension: string;
  mimeType: string;
  encoder: FormatEncoder;
}

/**
 * Format Registry class
 * Central registry for all output format exporters
 */
export class FormatRegistry {
  constructor();

  formatters: Map<string, FormatRegistration>;

  register(name: string, formatter: FormatRegistration): void;
  get(name: string): FormatRegistration;
  has(name: string): boolean;
  listFormats(): string[];
  getInfo(name: string): FormatInfo;
  getAllInfo(): Record<string, FormatInfo>;
  encode(name: string, data: unknown, options?: Record<string, unknown>): string;
  encodeYAML(data: unknown, indent?: number): string;
  encodeMarkdown(data: unknown): string;
  encodeCSV(data: unknown): string;
  encodeXML(data: unknown, indent?: number): string;
  suggestFormat(data: unknown): string;
}

// ============================================
// Utils
// ============================================

/**
 * Token Utils class
 * Token counting and formatting utilities
 */
export class TokenUtils {
  static calculateForModel(content: string, modelName: string): Promise<number>;
  static calculate(content: string, filePath: string): number;
  static estimate(content: string, filePath: string): number;
  static format(tokens: number): string;
  static getMethodForModel(modelName: string): Promise<string>;
  static getMethod(): string;
  static isExact(): boolean;
  static hasExactCounting(): boolean;
  static getAvailableTokenizers(): Promise<Array<{ name: string; available: boolean }>>;
  static detectTokenizer(modelName: string): Promise<string>;
  static getTelemetry(): Promise<Record<string, unknown>>;
  static resetTelemetry(): Promise<void>;
}

/**
 * File Utils class
 * File type detection and utilities
 */
export class FileUtils {
  static isText(filePath: string): boolean;
  static isCode(filePath: string): boolean;
  static getType(filePath: string): 'code' | 'config' | 'doc' | 'style' | 'other';
  static getExtension(filePath: string): string;
}

/**
 * Clipboard Utils class
 * Cross-platform clipboard utilities
 */
export class ClipboardUtils {
  static copy(text: string): boolean;
  static isAvailable(): boolean;
  static getCommand(): string;
}

/**
 * Config Utils class
 * Configuration file utilities
 */
export class ConfigUtils {
  static findConfigFile(projectRoot: string, filename: string): string | undefined;
  static initMethodFilter(projectRoot: string): MethodFilterParser | null;
  static detectMethodFilters(projectRoot: string): boolean;
  static initGitIgnore(projectRoot: string): GitIgnoreParser;
  static getConfigPaths(projectRoot: string): {
    gitignore: string;
    contextIgnore: string | undefined;
    contextInclude: string | undefined;
    methodInclude: string | undefined;
    methodIgnore: string | undefined;
  };
}

/**
 * Conversion Result
 */
export interface ConversionResult {
  output: string;
  metadata: {
    inputSize: number;
    outputSize: number;
    savings: number;
    savingsPercentage: number;
    fromFormat: string;
    toFormat: string;
  };
}

/**
 * File Conversion Result
 */
export interface FileConversionResult {
  inputFile: string;
  outputFile: string;
  fromFormat: string;
  toFormat: string;
  inputSize: number;
  outputSize: number;
  savings: number;
  savingsPercent: string;
}

/**
 * Batch Conversion Item
 */
export interface BatchConversionItem {
  input: string;
  output: string;
  from?: string;
  to?: string;
}

/**
 * Batch Conversion Result
 */
export interface BatchConversionResult {
  success: boolean;
  inputFile?: string;
  outputFile?: string;
  error?: string;
  fromFormat?: string;
  toFormat?: string;
  inputSize?: number;
  outputSize?: number;
  savings?: number;
  savingsPercent?: string;
}

/**
 * Format Converter class
 * Convert between different output formats
 */
export class FormatConverter {
  constructor();

  registry: FormatRegistry;
  toonFormatter: ToonFormatter;

  convert(input: string, fromFormat: string, toFormat: string): ConversionResult;
  parse(input: string, format: string): unknown;
  encode(data: unknown, format: string): string;
  parseYAML(yamlString: string): Record<string, unknown>;
  parseCSV(csvString: string): { headers: string[]; rows: Record<string, string>[] };
  convertFile(
    inputFile: string,
    outputFile: string,
    fromFormat?: string | null,
    toFormat?: string | null
  ): FileConversionResult;
  extensionToFormat(ext: string): string;
  batchConvert(files: BatchConversionItem[]): BatchConversionResult[];
  getSupportedConversions(): {
    fullySupported: string[];
    partialSupport: string[];
    planned: string[];
  };
}

/**
 * Error Handler Options
 */
export interface ErrorHandlerOptions {
  verbose?: boolean;
  logFile?: string | null;
}

/**
 * Error Handler class
 * Enhanced error handling and user-friendly messages
 */
export class ErrorHandler {
  constructor(options?: ErrorHandlerOptions);

  verbose: boolean;
  logFile: string | null;

  handleFormatError(error: Error, format: string): void;
  handleFileError(error: Error & { code?: string }, filePath: string): void;
  handleParseError(error: Error, format: string, content?: string): void;
  handleValidationError(errors: string[], context: string): void;
  logError(message: string, error: Error | { errors?: string[] }): void;
  wrapAsync<T extends (...args: unknown[]) => Promise<unknown>>(fn: T, context: string): T;
  validateFormat(format: string, supportedFormats: string[]): void;
  createUserMessage(error: Error & { code?: string }, context?: string): string;
}

/**
 * Logger Options
 */
export interface LoggerOptions {
  level?: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  logToFile?: boolean;
  logDir?: string;
  logFile?: string;
  silent?: boolean;
}

/**
 * Logger class
 * Centralized logging with multiple levels and file output
 */
export class Logger {
  constructor(options?: LoggerOptions);

  level: string;
  logToFile: boolean;
  logDir: string;
  logFile: string;
  silent: boolean;
  levels: Record<string, number>;
  colors: Record<string, string>;
  icons: Record<string, string>;

  initializeLogDirectory(): void;
  getDateString(): string;
  getTimestamp(): string;
  shouldLog(level: string): boolean;
  formatMessage(
    level: string,
    message: string,
    meta?: Record<string, unknown>
  ): {
    consoleMessage: string;
    fileMessage: string;
  };
  writeToFile(message: string): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  trace(message: string, meta?: Record<string, unknown>): void;
  custom(icon: string, level: string, message: string, meta?: Record<string, unknown>): void;
  group(title: string): void;
  groupEnd(): void;
  time(label: string): void;
  timeEnd(label: string): void;
  clearOldLogs(daysToKeep?: number): void;
  getLogFilePath(): string;
  getRecentLogs(lines?: number): string[];
}

/**
 * Get or create default logger instance
 */
export function getLogger(options?: LoggerOptions): Logger;

/**
 * Create a new logger instance
 */
export function createLogger(options?: LoggerOptions): Logger;

/**
 * Updater Options
 */
export interface UpdaterOptions {
  channel?: 'stable' | 'insider';
  autoUpdate?: boolean;
  checkInterval?: number;
  configDir?: string;
}

/**
 * Update Info
 */
export interface UpdateInfo {
  available: boolean;
  currentVersion?: string;
  latestVersion?: string;
  channel?: string;
  releaseNotes?: string;
  downloadUrl?: string;
  publishedAt?: string;
  message?: string;
  error?: string;
}

/**
 * Install Result
 */
export interface InstallResult {
  success: boolean;
  oldVersion?: string;
  newVersion?: string;
  backupPath?: string;
  error?: string;
  manualUpdateRequired?: boolean;
  instructions?: string;
}

/**
 * Rollback Result
 */
export interface RollbackResult {
  success: boolean;
  restoredVersion?: string;
  error?: string;
}

/**
 * Updater class
 * Auto-update system with version channels
 */
export class Updater {
  constructor(options?: UpdaterOptions);

  currentVersion: string;
  channel: 'stable' | 'insider';
  autoUpdate: boolean;
  checkInterval: number;
  configDir: string;
  updateCacheFile: string;
  endpoints: {
    stable: string;
    insider: string;
    version: string;
  };

  getCurrentVersion(): string;
  fetchJSON(url: string): Promise<unknown>;
  compareVersions(v1: string, v2: string): -1 | 0 | 1;
  checkForUpdates(): Promise<UpdateInfo>;
  getLatestVersion(): Promise<{
    version: string;
    releaseNotes: string;
    downloadUrl: string;
    publishedAt: string;
    assets: unknown[];
  } | null>;
  installUpdate(updateInfo: UpdateInfo): Promise<InstallResult>;
  detectInstallationType(): 'global' | 'local' | 'source' | 'unknown';
  getInstallDir(): string | null;
  createBackup(): string;
  rollback(): Promise<RollbackResult>;
  switchChannel(newChannel: 'stable' | 'insider'): Promise<UpdateInfo>;
  saveConfig(config: { channel?: string; autoUpdate?: boolean }): void;
  getUpdateCache(): Record<string, unknown> | null;
  saveUpdateCache(data: Record<string, unknown>): void;
  shouldCheckForUpdates(): boolean;
  checkAndNotify(): Promise<UpdateInfo>;
  showUpdateNotification(updateInfo: UpdateInfo): void;
}

/**
 * Git Utils Options
 */
export interface GitUtilsOptions {
  tempDir?: string;
  outputDir?: string;
  verbose?: boolean;
}

/**
 * GitHub Repository Info
 */
export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  branch: string;
  fullName: string;
  cloneUrl: string;
  apiUrl: string;
  rawUrl: string;
  originalUrl: string;
}

/**
 * Repository Generation Stats
 */
export interface RepoGenerationStats {
  repository: string;
  branch: string;
  url: string;
  localPath: string;
  outputFile: string;
  digestSize: number;
  digestSizeKB: string;
  files: number;
  tokens: number;
  lines: number;
}

/**
 * Repository Info from API
 */
export interface RepositoryAPIInfo {
  name: string;
  fullName: string;
  description: string;
  stars: number;
  forks: number;
  defaultBranch: string;
  size: number;
  language: string;
  updatedAt: string;
}

/**
 * Cached Repository
 */
export interface CachedRepo {
  name: string;
  path: string;
  size: number;
}

/**
 * Git Utils class
 * GitHub URL parsing, repository cloning, and GitIngest generation
 */
export class GitUtils {
  constructor(options?: GitUtilsOptions);

  tempDir: string;
  outputDir: string;
  verbose: boolean;

  parseGitHubURL(url: string): GitHubRepoInfo;
  isGitInstalled(): boolean;
  cloneRepository(
    repoInfo: GitHubRepoInfo,
    options?: { shallow?: boolean; depth?: number }
  ): string;
  generateFromGitHub(
    url: string,
    options?: {
      outputFile?: string;
      cleanup?: boolean;
      shallow?: boolean;
      analyzerOptions?: TokenCalculatorOptions;
      formatterOptions?: GitIngestFormatterOptions;
    }
  ): Promise<RepoGenerationStats>;
  fetchFileFromGitHub(url: string): Promise<string>;
  getRepositoryInfo(repoInfo: GitHubRepoInfo): Promise<RepositoryAPIInfo>;
  cleanupTemp(): void;
  listCachedRepos(): CachedRepo[];
  getDirectorySize(dir: string): number;
}

// ============================================
// Orchestrator Functions
// ============================================

/**
 * Generate GitIngest digest from token-analysis-report.json
 */
export function generateDigestFromReport(reportPath: string): void;

/**
 * Generate GitIngest digest from llm-context.json
 */
export function generateDigestFromContext(contextPath: string): void;

// ============================================
// Repository Map (ctxman map)
// ============================================

/**
 * A function or method of a mapped file
 */
export interface RepoMapMethod {
  name: string;
  /** 1-based line of the declaration */
  line: number;
  /** Declaration on one line, secrets redacted unless `redact: false` */
  signature: string;
}

/**
 * A source file of the repository graph
 */
export interface RepoGraphNode {
  /** Project-relative path with forward slashes */
  path: string;
  language: string;
  bytes: number;
  methods: RepoMapMethod[];
  /** Mentions of this file's function names in other files (shared between definers) */
  symbolRefs: number;
  /** Imports that named no file of the project (packages, standard library) */
  unresolvedImports: number;
}

/**
 * Import edge, importer -> imported. A package-wide import (Go, Java wildcard, C# using)
 * spreads weight 1 over the files of the package.
 */
export interface RepoGraphEdge {
  from: string;
  to: string;
  weight: number;
}

export interface RepoGraph {
  /** Absolute project root */
  root: string;
  nodes: RepoGraphNode[];
  edges: RepoGraphEdge[];
  history: {
    available: boolean;
    requested: number;
    commits: number;
    /** Commits touching each file */
    counts: Record<string, number>;
    reason?: string;
  };
  stats: {
    scannedFiles: number;
    files: number;
    edges: number;
    unresolvedImports: number;
    skipped: Array<{ path: string; reason: string }>;
    redactions: Record<string, number>;
    timings: Record<string, number>;
  };
}

export interface RepoGraphOptions {
  /** Commits of git history to mine for change frequency (default 300, 0 disables) */
  history?: number;
  /** Mask secrets in signatures (default true) */
  redact?: boolean;
  /** Leave out larger files (default 512 KiB) */
  maxFileBytes?: number;
}

export interface RankWeights {
  pagerank?: number;
  history?: number;
  symbols?: number;
}

export interface RankOptions {
  /** Files or folders (project-relative or absolute) to personalise PageRank toward */
  focus?: string[];
  /** Blend of the normalised components (default 0.70 / 0.25 / 0.05) */
  weights?: RankWeights;
  /** PageRank damping (default 0.85) */
  damping?: number;
}

export interface RankedFile {
  path: string;
  /** 1 = best */
  rank: number;
  /** Blended score in [0, 1] */
  score: number;
  /** Raw PageRank (all files sum to 1) */
  pagerank: number;
  /** Commits touching the file among the mined history */
  changes: number;
  symbolRefs: number;
  focus: boolean;
  /** Each component scaled to [0, 1] */
  components: { pagerank: number; history: number; symbols: number };
}

export interface RepoMapOptions extends RepoGraphOptions, RankOptions {
  /** Token budget of the rendered map (default 2048) */
  tokens?: number;
  /** Order of the files in the output (default 'rank') */
  order?: 'rank' | 'path';
  /** Highest-ranked file last (rank order only) */
  importantLast?: boolean;
  style?: 'text' | 'markdown' | 'json' | 'dot';
  /** Render the dependency edges instead of the map */
  graph?: boolean;
}

export interface RepoMapFile {
  path: string;
  rank: number;
  score: number;
  /** Tokens of the whole file */
  tokens: number;
  methods: Array<RepoMapMethod & { tokens: number }>;
}

export interface RepoMapResult {
  output: string;
  style: string;
  budget: number;
  /** Tokens of the rendered map (for json: of the same map rendered as text) */
  tokens: number;
  /** Files in the map, in output order */
  files: RepoMapFile[];
  /** Every file, best first */
  ranked: RankedFile[];
  graph: RepoGraph;
  /** Files that did not fit the budget */
  skipped: number;
  warnings: string[];
  stats: RepoGraph['stats'];
}

/**
 * Scan a project (respecting .gitignore/.contextignore/.contextinclude) and build its
 * file dependency graph from imports
 */
export function buildRepoGraph(root: string, options?: RepoGraphOptions): RepoGraph;

/**
 * Rank the files of a graph, best first: PageRank blended with git change frequency and
 * symbol references
 */
export function rankFiles(graph: RepoGraph, options?: RankOptions): RankedFile[];

/**
 * Build, rank and render the repository map of a project within a token budget
 */
export function renderRepoMap(root: string, options?: RepoMapOptions): RepoMapResult;

// ============================================
// Pull-request review context
// ============================================

export type PrContextStyle = 'markdown' | 'xml' | 'json';

export interface PrContextOptions {
  /** Base revision (default: origin/HEAD, else main, else master; HEAD with staged/working) */
  base?: string;
  /** Head revision (default: HEAD) */
  head?: string;
  /** Compare the index instead of a head commit */
  staged?: boolean;
  /** Compare the working tree (untracked files included) instead of a head commit */
  working?: boolean;
  /** Context lines in the diff (default: 3) */
  unified?: number;
  /** Include the unified diff (default: true) */
  diff?: boolean;
  /** Include the related tests' contents */
  withTests?: boolean;
  /** Include the changed files' full contents */
  withFiles?: boolean;
  /** Question appended at the end */
  ask?: string;
  /** Instructions appended at the end */
  instructions?: string;
  /** Maximum tokens of the output; lower-priority material is dropped first */
  budget?: number;
  /** Output style (default: markdown) */
  style?: PrContextStyle;
  /** Mask secrets in contents, diff and commit messages (default: true) */
  redact?: boolean;
  /** Skip file contents larger than this for methods and full contents (default: 1 MiB) */
  maxFileBytes?: number;
  /** Most related tests to list (default: 50) */
  maxRelatedTests?: number;
}

export interface PrRevision {
  ref: string;
  sha: string | null;
  short: string | null;
}

export interface PrChangedFile {
  /** A, M, D, R, C or T */
  status: string;
  path: string;
  oldPath: string | null;
  similarity: number | null;
  additions: number;
  deletions: number;
  binary: boolean;
  untracked: boolean;
  /** Filter that keeps the file's content out (.contextignore, ...), or null */
  excluded: string | null;
}

export interface PrMethod {
  file: string;
  name: string;
  start: number;
  end: number;
}

export interface PrChangedMethod extends PrMethod {
  change: 'added' | 'modified';
  changedLines: number;
  source: string;
  sourceDropped: boolean;
}

export interface PrCommit {
  sha: string;
  short: string;
  author: string;
  date: string;
  subject: string;
  body: string;
}

export interface PrRelatedTest {
  path: string;
  reasons: string[];
  changed: boolean;
  excluded: string | null;
}

export interface PrContextResult {
  /** The rendered context */
  output: string;
  /** Tokens of `output` */
  tokens: number;
  style: PrContextStyle;
  mode: 'range' | 'staged' | 'working';
  base: PrRevision;
  head: PrRevision;
  mergeBase: { sha: string; short: string };
  /** Directory the change was limited to ('' for the whole repository) */
  scope: string;
  stats: {
    commits: number;
    files: number;
    byStatus: Record<string, number>;
    additions: number;
    deletions: number;
    excluded: number;
    changedMethods: number;
    addedMethods: number;
    deletedMethods: number;
    relatedTests: number;
  };
  /** Tokens per rendered section */
  sections: Record<string, number>;
  budget: { limit: number; dropped: string[]; over: boolean } | null;
  commits: PrCommit[];
  files: PrChangedFile[];
  methods: { changed: PrChangedMethod[]; deleted: PrMethod[] };
  relatedTests: PrRelatedTest[];
  /** Redacted matches per secret type */
  redactions: Record<string, number>;
  warnings: string[];
}

/**
 * Build review context for a branch (merge base of base and head up to head), the staged
 * changes or the working tree
 */
export function buildPrContext(root?: string, options?: PrContextOptions): Promise<PrContextResult>;

// ============================================
// ctxman why
// ============================================

/**
 * Target of explainHistory() given as an object instead of "file:symbol" / "file#L1-L9"
 */
export interface ExplainHistoryTarget {
  file: string;
  /** Function, method or class: "total", "Cart.total", "Cart::total" */
  symbol?: string;
  startLine?: number;
  endLine?: number;
}

export interface ExplainHistoryOptions {
  /** Commits to include (default 20) */
  limit?: number;
  /** Only commits after this date, in git's date syntax */
  since?: string;
  /** Explain the code as of this revision instead of the working tree */
  rev?: string;
  /** Include each commit's diff of the target */
  patches?: boolean;
  /** Commits of the file examined for co-changes (default 500, 0 = off) */
  couplingWindow?: number;
  /** Co-changed files listed (default 10) */
  couplingTop?: number;
  /** Commits touching more files are ignored for coupling (default 50) */
  maxFilesPerCommit?: number;
  /** Related text snippets listed (default 20) */
  maxRelated?: number;
  /** Test files listed (default 10) */
  maxTests?: number;
  style?: 'markdown' | 'xml' | 'json';
  /** Maximum tokens of the output */
  budget?: number;
  /** Question appended at the end of the document */
  ask?: string;
  /** Mask secrets (default true) */
  redact?: boolean;
  /** Directory relative target paths start from (default: root) */
  cwd?: string;
}

export interface WhyCommit {
  sha: string;
  shortSha: string;
  /** Author date, ISO 8601 in UTC: 2024-01-02T10:00:00Z */
  date: string;
  author: string;
  email: string;
  merge: boolean;
  subject: string;
  body: string;
  /** Issue / ticket ids this commit mentions */
  refs: string[];
  patch?: string;
  /** Oldest commit a shallow clone has: its parents were not fetched */
  shallowBoundary?: boolean;
}

export interface WhyIssueReference {
  /** "#12", or "owner/repo#12" for another repository */
  id: string;
  number: number;
  repo: string | null;
  kind: 'issue' | 'pr' | 'mr';
  /** Referred to with fixes / closes / resolves */
  closes: boolean;
  url: string | null;
  commits: string[];
}

export interface ExplainHistoryData {
  target: {
    path: string;
    symbol: string | null;
    kind: string | null;
    line: number | null;
    resolvedBy: string | null;
    startLine: number | null;
    endLine: number | null;
    totalLines: number;
    wholeFile: boolean;
    binary: boolean;
    revision: string;
    symbolsInRange: string[];
    contentOmitted: string | null;
    source: string | null;
  };
  repository: { remote: string | null; provider: string | null; shallow: boolean };
  history: {
    mode: 'range' | 'funcname' | 'file' | 'none';
    startLine: number | null;
    endLine: number | null;
    funcname?: string;
    since: string | null;
    limit: number;
    limitReached: boolean;
    reason?: string;
    commits: WhyCommit[];
  };
  references: {
    issues: WhyIssueReference[];
    tickets: Array<{ id: string; commits: string[] }>;
    cves: Array<{ id: string; commits: string[] }>;
    urls: Array<{ url: string; commits: string[] }>;
    coAuthors: Array<{ value: string; commits: string[] }>;
    reviewers: Array<{ value: string; commits: string[] }>;
  };
  ownership: {
    startLine: number | null;
    endLine: number | null;
    totalLines: number;
    /** ISO 8601 in UTC, like the dates below */
    lastChanged: string | null;
    authors: Array<{
      name: string;
      lines: number;
      share: number;
      commits: number;
      lastTouched: string | null;
    }>;
  } | null;
  coupling: {
    window: number;
    targetChanges: number;
    skippedLargeCommits: number;
    maxFilesPerCommit: number;
    totalFiles: number;
    files: Array<{ path: string; count: number; confidence: number; exists: boolean }>;
  } | null;
  related: Array<{
    path: string;
    line: number;
    kind: 'adr' | 'changelog' | 'doc' | 'comment';
    mentions: 'symbol' | 'file';
    heading: string | null;
    snippet: string;
  }>;
  notes: Array<{ line: number; tag: string; text: string; author?: string }>;
  tests: Array<{
    path: string;
    references: 'symbol' | 'file';
    matches: Array<{ line: number; text: string }>;
    totalMatches: number;
  }>;
  warnings: string[];
  question: string | null;
}

export interface ExplainHistoryResult {
  /** The rendered document */
  text: string;
  style: 'markdown' | 'xml' | 'json';
  tokens: number;
  budget: number | null;
  /** Items dropped to fit the budget, per section */
  omitted: Record<string, number>;
  warnings: string[];
  /** Everything collected (before budget trimming, after redaction) */
  data: ExplainHistoryData;
}

/**
 * Explain why code looks the way it does, from the local git history: commits, referenced
 * issues and tickets, ownership, co-changed files, related docs, notes and tests.
 * Errors carry a `code` (NOT_A_GIT_REPO, PATH_OUTSIDE_ROOT, FILE_NOT_FOUND, NOT_TRACKED,
 * SYMBOL_NOT_FOUND, INVALID_RANGE, INVALID_REF, BUDGET_TOO_SMALL, ...)
 * @param root - Project directory inside a git work tree
 * @param target - "file", "file:symbol", "file#L10-L40" or an object
 */
export function explainHistory(
  root: string,
  target: string | ExplainHistoryTarget,
  options?: ExplainHistoryOptions
): Promise<ExplainHistoryResult>;
// Packed file contents (`ctxman pack`)
// ============================================

export type PackStyle = 'xml' | 'markdown' | 'plain' | 'json';

export interface PackOptions {
  /** Output style (default: xml, Anthropic's `<documents>` long-context format) */
  style?: PackStyle;
  /** Gitignore-style globs: keep only matching files */
  include?: string[];
  /** Gitignore-style globs: leave matching files out */
  exclude?: string[];
  /**
   * Explicit file list instead of scanning the root. Entries must lie inside the root
   * (PATH_OUTSIDE_ROOT otherwise); .gitignore/.contextignore/.contextinclude still apply.
   */
  files?: string[];
  /** Base directory for relative `files` entries (default: the root) */
  cwd?: string;
  /** Absolute paths to leave out (e.g. the output file) */
  excludeFiles?: string[];
  /** Skip files larger than this many bytes (default: 1 MiB) */
  maxFileSize?: number;
  /** Directory tree at the top (default: true) */
  tree?: boolean;
  /** Text at the top */
  header?: string;
  /** Text at the end, after the files (long documents first, the query last) */
  instructions?: string;
  /** Number every line with its original line number */
  lineNumbers?: boolean;
  /** Keep signatures, replace function bodies with a one-line placeholder */
  compress?: boolean;
  /** Mask secrets (default: true) */
  redact?: boolean;
  /**
   * Token limit for the whole rendered document: the highest-ranked files (ranking of
   * `ctxman map`) are packed first, the others are listed as omitted
   */
  budget?: number;
  /** Token limit per part: adds `parts` to the result */
  split?: number;
  /** Count with this model's tiktoken encoding and report the fit in `model` */
  targetModel?: string;
}

export interface PackedFile {
  /** Project-relative path with `/` separators */
  path: string;
  /** Tokens of the file's content as packed (after compression, numbering, redaction) */
  tokens: number;
  /** Lines of the original file */
  lines: number;
  compressed: boolean;
}

export interface PackPart {
  /** 1-based part number */
  index: number;
  text: string;
  tokens: number;
  /** Files in the part; pieces of a file split by lines read "path (lines a-b)" */
  files: string[];
}

export interface PackModelFit {
  id: string;
  name: string;
  vendor: string;
  /** tiktoken encoding used ('estimate' without tiktoken) */
  encoding: string;
  /** Whether the encoding is the model's own tokenizer */
  exact: boolean;
  contextWindow: number;
  maxRecommendedInput: number | null;
  fits: boolean;
  percentOfWindow: number;
}

export interface PackResult {
  /** The whole document (also when it is split) */
  text: string;
  style: PackStyle;
  /** tiktoken encoding of every count ('estimate' without tiktoken) */
  encoding: string;
  /** Tokens of `text` */
  totalTokens: number;
  files: PackedFile[];
  /** Files left out by the budget, most important first */
  omitted: Array<{ path: string; tokens: number }>;
  /** Files not packed: binary, too-large, unreadable, missing, not-a-file, ignored */
  skipped: Array<{ path: string; reason: string }>;
  redactions: { total: number; byType: Record<string, number> };
  compression: {
    files: number;
    bodies: number;
    originalTokens: number;
    compressedTokens: number;
    savedTokens: number;
  } | null;
  budget: { limit: number; used: number } | null;
  model: PackModelFit | null;
  parts: PackPart[] | null;
  /** Files larger than a part on their own, split by lines */
  splitFiles: Array<{ path: string; pieces: number }>;
}

/**
 * Pack the contents of a project's files into one document. Rejects with a PackError
 * (`code`: ROOT_NOT_FOUND, PATH_OUTSIDE_ROOT, INVALID_OPTION, UNKNOWN_MODEL,
 * BUDGET_TOO_SMALL, SPLIT_TOO_SMALL).
 */
export function packContext(root: string, options?: PackOptions): Promise<PackResult>;
