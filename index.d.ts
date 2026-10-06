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
  decode(toonString: string, options?: ToonFormatterOptions): never;
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
