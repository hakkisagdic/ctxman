# TypeScript Migration Plan

**Status**: 📋 Planned (Optional Future Work)
**Priority**: Medium
**Effort**: High (40-80 hours)
**Dependencies**: Security audit (002) - COMPLETED

---

## Problem Statement

### Why This Matters

Ctxman is currently a pure JavaScript codebase using ES6 modules. While this provides flexibility, it introduces several challenges:

**Developer Experience Issues**:

- No compile-time type checking
- IDE autocompletion limited without JSDoc
- Refactoring is error-prone
- API contracts unclear without documentation

**Code Quality Issues**:

- Runtime type errors not caught early
- Implicit `any` types proliferate
- Interface contracts not enforced
- Plugin API lacks type definitions

**User Impact**:

- Plugin developers struggle with API contracts
- Contributors make type-related mistakes
- Debugging takes longer without type information

**Business Impact**:

- Increased maintenance burden
- Higher bug rate in edge cases
- Contributor onboarding friction
- Plugin ecosystem growth hindered

---

## Proposed Solution

### What We Will Do

Implement an **incremental TypeScript migration** that:

1. Preserves backward compatibility during transition
2. Provides immediate value at each migration phase
3. Enables gradual type strictness increase

### Migration Strategy

```
Phase 1: Foundation (Week 1-2)
├── Add TypeScript tooling
├── Configure tsconfig.json
├── Create type definitions for public API
└── Enable JSDoc-based type checking

Phase 2: Core Modules (Week 3-6)
├── Migrate lib/core/ modules
├── Migrate lib/analyzers/
├── Add plugin type definitions
└── Enable strict mode for migrated files

Phase 3: Utilities & Plugins (Week 7-10)
├── Migrate lib/utils/
├── Migrate lib/plugins/
├── Update CLI entry points
└── Add comprehensive type tests

Phase 4: Full Migration (Week 11-12)
├── Convert remaining .js to .ts
├── Enable project-wide strict mode
├── Update documentation
└── Publish types with package
```

---

## Detailed Implementation Guide

### Phase 1: Foundation (Week 1-2)

#### Step 1.1: Install TypeScript Dependencies

```bash
# Install TypeScript and related tooling
npm install --save-dev typescript @types/node tsx

# Install types for existing dependencies
npm install --save-dev @types/express @types/cors
```

#### Step 1.2: Create Initial tsconfig.json

Create `tsconfig.json` in the project root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "types": ["node"],
    "baseUrl": ".",
    "paths": {
      "#lib/*": ["./lib/*"]
    }
  },
  "include": ["lib/**/*", "index.js", "bin/**/*"],
  "exclude": ["node_modules", "test", "coverage", "dist"]
}
```

**Important Notes for ES Modules (NodeNext)**:

- `NodeNext` moduleResolution is required for ES modules (`"type": "module"` in package.json)
- All local imports must include `.js` extension (TypeScript will resolve to `.ts`)
- Import paths like `import { foo } from './lib/foo'` must become `import { foo } from './lib/foo.js'`

#### Step 1.3: Create Type Definitions Directory

```bash
mkdir -p lib/types
```

Create `lib/types/index.d.ts`:

```typescript
/**
 * Core type definitions for ctxman
 */

// Scanner Types
export interface ScannerOptions {
  root: string;
  excludePatterns?: string[];
  includePatterns?: string[];
  maxFileSize?: number;
  methodLevel?: boolean;
  respectGitignore?: boolean;
  followSymlinks?: boolean;
  maxDepth?: number;
}

export interface FileInfo {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  modified: Date;
  created: Date;
  tokens?: number;
  lines?: number;
  language?: string;
  methods?: MethodInfo[];
}

export interface ScanResult {
  files: FileInfo[];
  totalFiles: number;
  totalTokens: number;
  totalLines: number;
  errors: ScanError[];
}

export interface ScanError {
  path: string;
  message: string;
  code?: string;
}

// Token Calculator Types
export interface TokenCalculatorOptions {
  verbose?: boolean;
  compactContext?: boolean;
  methodLevel?: boolean;
  targetModel?: string;
  saveReport?: boolean;
  contextExport?: boolean;
  contextToClipboard?: boolean;
  gitingest?: boolean;
  dashboard?: boolean;
}

export interface TokenStats {
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

export interface ExtensionStats {
  count: number;
  tokens: number;
  bytes: number;
  lines: number;
}

export interface DirectoryStats {
  count: number;
  tokens: number;
  bytes: number;
  lines: number;
}

// Method Analysis Types
export interface MethodInfo {
  name: string;
  line: number;
  file: string;
  tokens?: number;
  content?: string;
  type?: 'function' | 'method' | 'arrow' | 'accessor';
}

export interface MethodFilterOptions {
  includePatterns?: string[];
  excludePatterns?: string[];
}

// Logger Types
export interface LoggerOptions {
  level?: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  logToFile?: boolean;
  logDir?: string;
  logFile?: string;
  silent?: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: Record<string, unknown>;
}

// Plugin Types
export interface PluginContext {
  projectRoot: string;
  options: ScannerOptions;
  logger: Logger;
}

export interface Plugin {
  name: string;
  version: string;
  init?(context: PluginContext): void | Promise<void>;
  onFileScan?(file: FileInfo): FileInfo | Promise<FileInfo>;
  onAnalysisComplete?(results: ScanResult): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

// LLM Context Types
export interface LLMContext {
  project: {
    root: string;
    totalFiles: number;
    totalTokens: number;
  };
  paths?: Record<string, string[]>;
  methods?: Record<string, MethodInfo[]>;
  methodStats?: {
    totalMethods: number;
    includedMethods: number;
    totalMethodTokens: number;
  };
}
```

#### Step 1.4: Enable JSDoc Type Checking in Existing Files

Update `lib/utils/logger.js` to add JSDoc type annotations:

```javascript
/**
 * @typedef {import('../types/index.d.ts').LoggerOptions} LoggerOptions
 * @typedef {import('../types/index.d.ts').LogEntry} LogEntry
 */

/**
 * Logger System
 * Centralized logging with multiple levels and file output
 * v2.3.6+
 */

import fs from 'fs';
import path from 'path';

/**
 * @class Logger
 * @description Centralized logging with multiple levels and file output
 */
class Logger {
  /**
   * @param {LoggerOptions} [options={}]
   */
  constructor(options = {}) {
    /** @type {'error'|'warn'|'info'|'debug'|'trace'} */
    this.level = (options.level || process.env.LOG_LEVEL || 'info').toLowerCase();
    /** @type {boolean} */
    this.logToFile = options.logToFile !== false;
    /** @type {string} */
    this.logDir = options.logDir || path.join(process.cwd(), '.ctxman', 'logs');
    // ... rest of implementation
  }
}
```

#### Step 1.5: Add Type Check Scripts to package.json

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "typecheck:watch": "tsc --noEmit --watch",
    "build:types": "tsc --emitDeclarationOnly"
  }
}
```

---

### Phase 2: Core Modules (Week 3-6)

#### Step 2.1: Migrate Scanner.js to Scanner.ts

**Before (lib/core/Scanner.js):**

```javascript
import fs from 'fs';
import path from 'path';
import GitIgnoreParser from '../parsers/gitignore-parser.js';
import FileUtils from '../utils/file-utils.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('Scanner');

export class Scanner {
  constructor(rootPath, options = {}) {
    this.rootPath = rootPath;
    this.options = {
      respectGitignore: true,
      followSymlinks: false,
      maxDepth: Infinity,
      ...options,
    };
    // ... implementation
  }
}
```

**After (lib/core/Scanner.ts):**

```typescript
import fs from 'fs';
import path from 'path';
import GitIgnoreParser from '../parsers/gitignore-parser.js';
import FileUtils from '../utils/file-utils.js';
import { getLogger } from '../utils/logger.js';
import type { ScannerOptions, FileInfo, ScanResult, ScanError } from '../types/index.js';

const logger = getLogger('Scanner');

interface ScannerInternalOptions extends ScannerOptions {
  respectGitignore?: boolean;
  followSymlinks?: boolean;
  maxDepth?: number;
}

interface ScannerStats {
  filesScanned: number;
  directoriesTraversed: number;
  filesIgnored: number;
  errors: number;
}

export class Scanner {
  private rootPath: string;
  private options: Required<ScannerInternalOptions>;
  private gitIgnore: GitIgnoreParser;
  private stats: ScannerStats;

  constructor(rootPath: string, options: ScannerInternalOptions = {}) {
    this.rootPath = rootPath;
    this.options = {
      respectGitignore: true,
      followSymlinks: false,
      maxDepth: Infinity,
      root: rootPath,
      ...options,
    } as Required<ScannerInternalOptions>;

    // Initialize GitIgnoreParser with correct file paths
    const gitignorePath = path.join(rootPath, '.gitignore');
    const contextIgnorePath = path.join(rootPath, '.contextignore');
    const contextIncludePath = path.join(rootPath, '.contextinclude');

    this.gitIgnore = new GitIgnoreParser(gitignorePath, contextIgnorePath, contextIncludePath);
    this.stats = this.initStats();
  }

  private initStats(): ScannerStats {
    return {
      filesScanned: 0,
      directoriesTraversed: 0,
      filesIgnored: 0,
      errors: 0,
    };
  }

  scan(): FileInfo[] {
    logger.info(`Starting scan: ${this.rootPath}`);
    const startTime = Date.now();

    const files = this.scanDirectory(this.rootPath, 0);

    const elapsed = Date.now() - startTime;
    logger.info(`Scan complete: ${this.stats.filesScanned} files in ${elapsed}ms`);

    return files;
  }

  private scanDirectory(dirPath: string, depth: number = 0): FileInfo[] {
    if (depth > this.options.maxDepth) {
      return [];
    }

    const files: FileInfo[] = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      this.stats.directoriesTraversed++;

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.rootPath, fullPath);

        if (this.shouldIgnore(relativePath)) {
          this.stats.filesIgnored++;
          continue;
        }

        if (entry.isDirectory()) {
          const subFiles = this.scanDirectory(fullPath, depth + 1);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          try {
            if (FileUtils.isText(fullPath)) {
              const fileInfo = this.getFileInfo(fullPath, relativePath);
              files.push(fileInfo);
              this.stats.filesScanned++;
            } else {
              this.stats.filesIgnored++;
            }
          } catch (error) {
            this.stats.filesIgnored++;
          }
        }
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error scanning directory ${dirPath}: ${err.message}`);
      this.stats.errors++;
    }

    return files;
  }

  private getFileInfo(fullPath: string, relativePath: string): FileInfo {
    const stats = fs.statSync(fullPath);

    return {
      path: fullPath,
      relativePath: relativePath,
      name: path.basename(fullPath),
      extension: path.extname(fullPath),
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime,
    };
  }

  private shouldIgnore(relativePath: string): boolean {
    return this.gitIgnore.isIgnored(null, relativePath);
  }

  getStats(): ScannerStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = this.initStats();
  }
}

export default Scanner;
```

#### Step 2.2: Migrate method-analyzer.js

**Before (lib/analyzers/method-analyzer.js) - Key Methods:**

```javascript
class MethodAnalyzer {
  constructor() {
    this.goAnalyzer = new GoMethodAnalyzer();
  }

  extractMethods(content, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    // ... implementation
  }
}
```

**After (lib/analyzers/method-analyzer.ts):**

```typescript
import path from 'path';
import type { MethodInfo } from '../types/index.js';
import GoMethodAnalyzer from './go-method-analyzer.js';

type MethodType =
  | 'function'
  | 'method'
  | 'arrow'
  | 'accessor'
  | 'shorthand'
  | 'constructor'
  | 'property'
  | 'expression-bodied'
  | 'init';

interface PatternConfig {
  regex: RegExp;
  type: MethodType;
}

class MethodAnalyzer {
  private goAnalyzer: GoMethodAnalyzer;

  constructor() {
    this.goAnalyzer = new GoMethodAnalyzer();
  }

  extractMethods(content: string, filePath: string): MethodInfo[] {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.rs') {
      return this.extractRustMethods(content, filePath);
    } else if (ext === '.go') {
      return this.goAnalyzer.extractMethods(content, filePath);
    } else if (ext === '.java') {
      return this.extractJavaMethods(content, filePath);
    }
    // ... other language handlers
    return this.extractJavaScriptMethods(content, filePath);
  }

  private extractJavaScriptMethods(content: string, filePath: string): MethodInfo[] {
    const namePattern = '[\\w$_]+';

    const patterns: PatternConfig[] = [
      {
        regex: new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+(${namePattern})\\s*\\(`, 'g'),
        type: 'function',
      },
      {
        regex: new RegExp(`(${namePattern})\\s*:\\s*(?:async\\s+)?function\\s*\\(`, 'g'),
        type: 'method',
      },
      {
        regex: new RegExp(
          `(?:const|let|var)\\s+(${namePattern})\\s*=\\s*(?:async\\s+)?\\([^)]*\\)\\s*=>`,
          'g'
        ),
        type: 'arrow',
      },
    ];

    return this.processPatterns(content, filePath, patterns);
  }

  private processPatterns(
    content: string,
    filePath: string,
    patterns: PatternConfig[],
    isJava: boolean = false,
    isCSharp: boolean = false,
    isPython: boolean = false,
    isRuby: boolean = false,
    isKotlin: boolean = false,
    isSwift: boolean = false,
    isScala: boolean = false
  ): MethodInfo[] {
    const methodsMap = new Map<string, MethodInfo>();
    const processedLines = new Map<string, boolean>();

    for (const { regex, type } of patterns) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const methodName = match[1];
        const line = this.getLineNumber(content, match.index + match[0].indexOf(methodName));

        const keywordCheck = this.shouldSkipKeyword(
          methodName,
          isJava,
          isCSharp,
          isPython,
          isRuby,
          isKotlin,
          isSwift,
          isScala
        );

        if (methodName && keywordCheck) {
          const lineKey = `${methodName}:${line}`;
          if (processedLines.has(lineKey)) {
            continue;
          }

          const key = `${methodName}:${line}`;
          if (!methodsMap.has(key)) {
            methodsMap.set(key, {
              name: methodName,
              line: line,
              file: path.relative(process.cwd(), filePath),
              type: type,
            });
            processedLines.set(lineKey, true);
          }
        }
      }
    }

    return Array.from(methodsMap.values());
  }

  private shouldSkipKeyword(
    name: string,
    isJava: boolean,
    isCSharp: boolean,
    isPython: boolean,
    isRuby: boolean,
    isKotlin: boolean,
    isSwift: boolean,
    isScala: boolean
  ): boolean {
    if (isCSharp) return !this.isCSharpKeyword(name);
    if (isPython) return !this.isPythonKeyword(name);
    if (isRuby) return !this.isRubyKeyword(name);
    if (isKotlin) return !this.isKotlinKeyword(name);
    if (isSwift) return !this.isSwiftKeyword(name);
    if (isScala) return !this.isScalaKeyword(name);
    return !this.isKeyword(name, isJava);
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  private isKeyword(name: string, isJava: boolean = false): boolean {
    // ... keyword sets
    return false; // implementation
  }

  // Other keyword check methods...

  extractMethodContent(content: string, methodName: string): string | null {
    const patterns = [
      new RegExp(
        `(function\\s+${methodName}\\s*\\([^)]*\\)\\s*\\{[^}]*(?:\\{[^}]*\\}[^}]*)*\\})`,
        'g'
      ),
      new RegExp(
        `(${methodName}\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{[^}]*(?:\\{[^}]*\\}[^}]*)*\\})`,
        'g'
      ),
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) return match[1];
    }
    return null;
  }
}

export default MethodAnalyzer;
```

#### Step 2.3: Migrate token-calculator.js

**Before (lib/analyzers/token-calculator.js) - Constructor:**

```javascript
class TokenCalculator {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = { verbose: false, compactContext: true, methodLevel: false, ...options };
    this.stats = this.initStats();
    this.gitIgnore = this.initGitIgnore();
    this.methodAnalyzer = new MethodAnalyzer();
    // ...
  }
}
```

**After (lib/analyzers/token-calculator.ts):**

```typescript
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import TokenUtils from '../utils/token-utils.js';
import FileUtils from '../utils/file-utils.js';
import ClipboardUtils from '../utils/clipboard-utils.js';
import ConfigUtils from '../utils/config-utils.js';
import GitIgnoreParser from '../parsers/gitignore-parser.js';
import MethodAnalyzer from './method-analyzer.js';
import MethodFilterParser from '../parsers/method-filter-parser.js';
import GitIngestFormatter from '../formatters/gitingest-formatter.js';
import { LLMDetector } from '../utils/llm-detector.js';
import type {
  TokenCalculatorOptions,
  TokenStats,
  FileInfo,
  MethodInfo,
  LLMContext,
  ExtensionStats,
  DirectoryStats,
} from '../types/index.js';

interface ExtendedTokenStats extends TokenStats {
  byExtension: Record<string, ExtensionStats>;
  byDirectory: Record<string, DirectoryStats>;
}

interface MethodStats {
  totalMethods: number;
  includedMethods: number;
  methodTokens: Record<string, number>;
}

class TokenCalculator {
  private projectRoot: string;
  private options: Required<TokenCalculatorOptions> & { targetModel?: string };
  private stats: ExtendedTokenStats;
  private gitIgnore: GitIgnoreParser;
  private methodAnalyzer: MethodAnalyzer;
  private methodFilter: MethodFilterParser | null;
  private methodStats: MethodStats;

  constructor(projectRoot: string, options: TokenCalculatorOptions = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      verbose: false,
      compactContext: true,
      methodLevel: false,
      ...options,
    } as Required<TokenCalculatorOptions>;
    this.stats = this.initStats();
    this.gitIgnore = this.initGitIgnore();
    this.methodAnalyzer = new MethodAnalyzer();
    this.methodFilter = this.options.methodLevel ? this.initMethodFilter() : null;
    this.methodStats = { totalMethods: 0, includedMethods: 0, methodTokens: {} };
  }

  private initStats(): ExtendedTokenStats {
    return {
      totalFiles: 0,
      totalTokens: 0,
      totalBytes: 0,
      totalLines: 0,
      ignoredFiles: 0,
      calculatorIgnoredFiles: 0,
      byExtension: {},
      byDirectory: {},
      largestFiles: [],
    };
  }

  calculateTokens(content: string, filePath: string): number {
    return TokenUtils.calculate(content, filePath);
  }

  isTextFile(filePath: string): boolean {
    return FileUtils.isText(filePath);
  }

  analyzeFile(filePath: string): FileInfo {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const stats = fs.statSync(filePath);

      const fileInfo: FileInfo = {
        path: filePath,
        relativePath: path.relative(this.projectRoot, filePath),
        size: stats.size,
        tokens: this.calculateTokens(content, filePath),
        lines: content.split('\n').length,
        extension: path.extname(filePath).toLowerCase() || 'no-extension',
        name: path.basename(filePath),
        modified: stats.mtime,
        created: stats.birthtime,
      };

      if (this.options.methodLevel && this.isCodeFile(filePath)) {
        fileInfo.methods = this.analyzeFileMethods(content, filePath);
      }

      return fileInfo;
    } catch (error) {
      const err = error as Error;
      return {
        path: filePath,
        relativePath: path.relative(this.projectRoot, filePath),
        size: 0,
        tokens: 0,
        lines: 0,
        extension: 'error',
        name: path.basename(filePath),
        error: err.message,
      } as FileInfo;
    }
  }

  run(): ExtendedTokenStats {
    this.printHeader();

    const allFiles = this.scanDirectory(this.projectRoot);
    this.printScanResults(allFiles);

    const analysisResults: FileInfo[] = [];
    for (const file of allFiles) {
      const fileInfo = this.analyzeFile(file);
      this.updateStats(fileInfo);
      analysisResults.push(fileInfo);
    }

    this.stats.largestFiles.sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
    this.printReport();

    if (this.options.targetModel && !this.options.dashboard) {
      this.printContextFitAnalysis();
    }

    if (!this.options.dashboard) {
      this.handleExports(analysisResults);
    }

    return this.stats;
  }

  // ... remaining methods
}

export default TokenCalculator;
```

---

### Phase 3: Utilities & Plugins (Week 7-10)

#### Step 3.1: Migrate logger.js to logger.ts

**Key changes:**

- Add type annotations to all methods
- Use union types for log levels
- Add generic types for metadata

```typescript
// lib/utils/logger.ts

import fs from 'fs';
import path from 'path';
import type { LoggerOptions, LogEntry } from '../types/index.js';

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
type LogLevelMap = Record<LogLevel, number>;
type ColorMap = Record<LogLevel, string>;
type IconMap = Record<LogLevel, string>;

class Logger {
  private level: LogLevel;
  private logToFile: boolean;
  private logDir: string;
  private logFile: string;
  private silent: boolean;
  private levels: LogLevelMap;
  private colors: ColorMap;
  private icons: IconMap;

  constructor(options: LoggerOptions = {}) {
    this.level = (options.level || process.env.LOG_LEVEL || 'info') as LogLevel;
    this.logToFile = options.logToFile !== false;
    this.logDir = options.logDir || path.join(process.cwd(), '.ctxman', 'logs');
    this.logFile = options.logFile || `ctxman-${this.getDateString()}.log`;
    this.silent = options.silent || false;

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4,
    };

    this.colors = {
      error: '\x1b[31m',
      warn: '\x1b[33m',
      info: '\x1b[36m',
      debug: '\x1b[35m',
      trace: '\x1b[90m',
    };

    this.icons = {
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🔍',
      trace: '🔬',
    };

    this.initializeLogDirectory();
  }

  log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
    if (!this.shouldLog(level)) return;

    const { consoleMessage, fileMessage } = this.formatMessage(level, message, meta);

    if (!this.silent) {
      console.log(consoleMessage);
    }

    this.writeToFile(fileMessage);
  }

  error(message: string, meta: Record<string, unknown> = {}): void {
    this.log('error', message, meta);
  }

  warn(message: string, meta: Record<string, unknown> = {}): void {
    this.log('warn', message, meta);
  }

  info(message: string, meta: Record<string, unknown> = {}): void {
    this.log('info', message, meta);
  }

  debug(message: string, meta: Record<string, unknown> = {}): void {
    this.log('debug', message, meta);
  }

  trace(message: string, meta: Record<string, unknown> = {}): void {
    this.log('trace', message, meta);
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] <= this.levels[this.level];
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    meta: Record<string, unknown>
  ): { consoleMessage: string; fileMessage: string } {
    const timestamp = this.getTimestamp();
    const icon = this.icons[level];

    const consoleMessage = `${this.colors[level]}${icon} [${level.toUpperCase()}]\x1b[0m ${message}`;

    const metaString = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    const fileMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;

    return { consoleMessage, fileMessage };
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private getDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private initializeLogDirectory(): void {
    if (this.logToFile) {
      const fullLogDir = path.isAbsolute(this.logDir)
        ? this.logDir
        : path.join(process.cwd(), this.logDir);
      if (!fs.existsSync(fullLogDir)) {
        fs.mkdirSync(fullLogDir, { recursive: true });
      }
    }
  }

  private writeToFile(message: string): void {
    if (!this.logToFile) return;

    try {
      const fullLogPath = path.isAbsolute(this.logDir)
        ? path.join(this.logDir, this.logFile)
        : path.join(process.cwd(), this.logDir, this.logFile);

      fs.appendFileSync(fullLogPath, message + '\n', 'utf8');
    } catch (error) {
      const err = error as Error;
      console.error('Failed to write to log file:', err.message);
    }
  }

  clearOldLogs(daysToKeep: number = 7): void {
    // ... implementation
  }

  getRecentLogs(lines: number = 100): string[] {
    // ... implementation
    return [];
  }
}

let defaultLogger: Logger | null = null;

function getLogger(options: LoggerOptions = {}): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger(options);
  }
  return defaultLogger;
}

function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}

export { Logger, getLogger, createLogger };
```

#### Step 3.2: Migrate Plugin System

Create `lib/plugins/types.ts`:

```typescript
import type { FileInfo, ScanResult, ScannerOptions, Logger } from '../types/index.js';

export interface PluginContext {
  projectRoot: string;
  options: ScannerOptions;
  logger: Logger;
}

export interface PluginLifecycle {
  init?(context: PluginContext): void | Promise<void>;
  onFileScan?(file: FileInfo): FileInfo | Promise<FileInfo>;
  onBeforeAnalysis?(files: FileInfo[]): FileInfo[] | Promise<FileInfo[]>;
  onAnalysisComplete?(results: ScanResult): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  main: string;
  dependencies?: Record<string, string>;
}

export interface Plugin extends PluginLifecycle {
  name: string;
  version: string;
  manifest?: PluginManifest;
}

export type PluginConstructor = new (context: PluginContext) => Plugin;
```

---

### Phase 4: Full Migration (Week 11-12)

#### Step 4.1: Update CLI Entry Point

**Before (bin/cli.js):**

```javascript
#!/usr/bin/env node
import TokenCalculator from '../lib/analyzers/token-calculator.js';
// ...
```

**After (bin/cli.ts):**

```typescript
#!/usr/bin/env node
import TokenCalculator from '../lib/analyzers/token-calculator.js';
import type { TokenCalculatorOptions } from '../lib/types/index.js';
import { program } from 'commander';

// ... typed CLI implementation
```

#### Step 4.2: Update package.json Exports

```json
{
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./index.js",
      "default": "./index.js"
    },
    "./types": {
      "types": "./dist/types/index.d.ts",
      "import": "./lib/types/index.js"
    }
  },
  "typesVersions": {
    "*": {
      "types": ["./dist/types/index.d.ts"]
    }
  }
}
```

---

## Verification Steps

### Phase 1 Verification

1. **TypeScript Installation Check**

   ```bash
   npx tsc --version
   # Expected: Version 5.x.x
   ```

2. **Initial Type Check**

   ```bash
   npm run typecheck
   # Expected: Some errors (we haven't fixed everything yet)
   # Goal: No fatal errors, tsconfig.json is valid
   ```

3. **JSDoc Type Checking**

   ```bash
   # Verify JSDoc types are recognized
   npm run typecheck 2>&1 | grep "lib/utils/logger.js"
   # Expected: Reduced errors for logger.js
   ```

4. **Build Types**
   ```bash
   npm run build:types
   ls dist/*.d.ts
   # Expected: Type definition files generated
   ```

### Phase 2 Verification

1. **Core Module Migration**

   ```bash
   # Run type check on migrated files
   npx tsc --noEmit lib/core/Scanner.ts
   npx tsc --noEmit lib/analyzers/method-analyzer.ts
   npx tsc --noEmit lib/analyzers/token-calculator.ts
   # Expected: No errors
   ```

2. **Test Suite**

   ```bash
   npm test
   # Expected: All tests pass (1121+ tests)
   ```

3. **CLI Functionality**

   ```bash
   node bin/cli.js --help
   node bin/cli.js --cli
   # Expected: CLI works as before
   ```

4. **Integration Test**
   ```bash
   # Test against real project
   node bin/cli.js --cli --save-report
   cat token-analysis-report.json | jq '.summary'
   # Expected: Valid JSON output
   ```

### Phase 3 Verification

1. **Utility Migration**

   ```bash
   npm run typecheck
   # Expected: No errors for lib/utils/*.ts
   ```

2. **Plugin System**

   ```bash
   # Test plugin loading
   node -e "import('./lib/plugins/index.js').then(m => console.log(m))"
   # Expected: Plugin module loads correctly
   ```

3. **Full Test Suite**
   ```bash
   npm test
   npm run test:coverage
   # Expected: Coverage maintained or improved
   ```

### Phase 4 Verification

1. **Complete Type Check**

   ```bash
   npm run typecheck
   # Expected: 0 errors
   ```

2. **Strict Mode**

   ```bash
   # Update tsconfig.json to enable strict mode
   npx tsc --noEmit --strict
   # Expected: 0 errors
   ```

3. **Type Exports**

   ```bash
   npm run build:types
   # Verify all types are exported
   node -e "import('./dist/index.d.ts')"
   ```

4. **Package Publishing Dry Run**
   ```bash
   npm pack --dry-run
   # Verify .d.ts files are included
   ```

---

## Rollback Procedures

### General Rollback Strategy

Each phase has a corresponding git branch and tag:

```bash
# Create checkpoint branches before each phase
git checkout -b typescript-phase-1-start
git tag ts-phase-1-start

# After completing phase
git tag ts-phase-1-complete
```

### Phase 1 Rollback

```bash
# If Phase 1 introduces build issues
git checkout ts-phase-1-start

# Remove TypeScript dependencies
npm uninstall typescript @types/node tsx

# Remove tsconfig.json
rm tsconfig.json
rm -rf lib/types/

# Remove npm scripts
npm pkg delete scripts.typecheck
npm pkg delete scripts.build:types
```

### Phase 2 Rollback

```bash
# Restore .js files from before migration
git checkout ts-phase-1-complete -- lib/core/
git checkout ts-phase-1-complete -- lib/analyzers/

# Remove .ts files
rm lib/core/*.ts
rm lib/analyzers/*.ts

# Re-run tests
npm test
```

### Phase 3 Rollback

```bash
# Restore utilities
git checkout ts-phase-2-complete -- lib/utils/
git checkout ts-phase-2-complete -- lib/plugins/

# Remove .ts files
rm lib/utils/*.ts
rm lib/plugins/*.ts
```

### Phase 4 Rollback

```bash
# Full rollback to pre-TypeScript state
git checkout ts-phase-1-start

# Clean install
rm -rf node_modules
npm install
npm test
```

### Per-File Rollback

For individual files that cause issues:

```bash
# Restore specific file from checkpoint
git checkout ts-phase-N-complete -- lib/path/to/file.js

# Or manually convert .ts back to .js
mv lib/path/to/file.ts lib/path/to/file.js

# Remove type annotations manually or use sed
sed -i 's/: string//g; s/: number//g; s/: boolean//g' lib/path/to/file.js
```

---

## Compatibility Notes

### ES Modules (ESM) with TypeScript

**Important**: Ctxman uses `"type": "module"` in package.json, which requires specific TypeScript configuration:

#### tsconfig.json for ESM

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022"
  }
}
```

#### Import Extensions

All local imports **must** include `.js` extension (TypeScript resolves to `.ts` automatically):

```typescript
// ❌ Wrong (will fail in ESM)
import { Scanner } from './Scanner';
import { logger } from '../utils/logger';

// ✅ Correct (ESM compatible)
import { Scanner } from './Scanner.js';
import { logger } from '../utils/logger.js';
```

#### Named vs Default Exports

```typescript
// lib/types/index.ts
export interface ScannerOptions {
  /* ... */
}
export interface FileInfo {
  /* ... */
}

// Usage
import type { ScannerOptions, FileInfo } from '../types/index.js';

// Default exports
export default class Scanner {
  /* ... */
}

// Usage
import Scanner from './Scanner.js';
```

### NodeNext Module Resolution

The `NodeNext` moduleResolution handles:

1. **Conditional exports** in package.json
2. **Dual CJS/ESM** packages
3. **Extensionless imports** for Node.js built-ins only

```typescript
// Built-ins: no extension needed
import fs from 'fs';
import path from 'path';

// Local files: extension required
import { Scanner } from './Scanner.js';
```

### Declaration File Generation

```json
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true
  }
}
```

This generates `.d.ts` files for type consumers:

```
lib/
├── core/
│   ├── Scanner.ts
│   └── Scanner.d.ts    # Generated
├── types/
│   ├── index.ts
│   └── index.d.ts      # Generated
```

---

## Testing Strategy During Migration

### Test Organization

```
test/
├── unit/
│   ├── core/
│   │   ├── Scanner.test.ts    # Migrated
│   │   └── Scanner.test.js    # Original (during migration)
│   └── analyzers/
│       ├── method-analyzer.test.ts
│       └── token-calculator.test.ts
├── integration/
│   └── cli.test.ts
└── types/
    └── type-checks.test.ts     # New: TypeScript type tests
```

### Type Testing

Create type tests using `tsd` or TypeScript's type assertions:

```typescript
// test/types/scanner-types.test.ts
import { expectType } from 'tsd';
import type { ScannerOptions, FileInfo, ScanResult } from '../../lib/types/index.js';
import { Scanner } from '../../lib/core/Scanner.js';

expectType<string>({} as ScannerOptions['root']);
expectType<number>({} as FileInfo['size']);
```

### Continuous Testing During Migration

```bash
# Run tests in watch mode
npm run test:watch

# Run type checking in watch mode
npm run typecheck:watch

# Run both in parallel terminals
# Terminal 1:
npm run test:watch

# Terminal 2:
npm run typecheck:watch
```

### Migration Test Checklist

For each migrated file:

- [ ] Type check passes: `npx tsc --noEmit path/to/file.ts`
- [ ] Unit tests pass: `npm test path/to/file.test.js`
- [ ] Integration tests pass: `npm test`
- [ ] CLI functionality works: `node bin/cli.js --cli`
- [ ] No runtime errors in development
- [ ] No runtime errors in production scenarios

---

## CI/CD Integration

### GitHub Actions Workflow

Create `.github/workflows/typescript-check.yml`:

```yaml
name: TypeScript Check

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  typecheck:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [20.x, 22.x]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Run tests
        run: npm test

      - name: Build types
        run: npm run build:types

      - name: Verify type exports
        run: |
          if [ ! -f "dist/index.d.ts" ]; then
            echo "Type definition files not generated"
            exit 1
          fi
```

### Pre-commit Hook Update

Update `.husky/pre-commit` or lint-staged config:

```json
{
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"],
    "*.{js,ts}": ["npm run typecheck -- --filter="]
  }
}
```

### Pre-push Hook

Add type checking to pre-push verification:

```bash
#!/usr/bin/env bash
# .husky/pre-push

# Run tests
npm test || exit 1

# Run type check (non-blocking during migration, remove || true when complete)
npm run typecheck || true
```

### CI Pipeline Stages

```yaml
# .github/workflows/ci.yml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    needs: [lint, typecheck]
    strategy:
      matrix:
        node: [20, 22]
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm test

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build:types
      - uses: actions/upload-artifact@v4
        with:
          name: type-definitions
          path: dist/*.d.ts
```

### Status Badges

Add to README.md after Phase 1:

```markdown
[![TypeScript Check](https://github.com/owner/ctxman/actions/workflows/typescript-check.yml/badge.svg)](https://github.com/owner/ctxman/actions/workflows/typescript-check.yml)
```

---

## Success Metrics

### Quantitative Metrics

| Metric           | Before | Target | Phase 1 | Phase 2 | Phase 4 |
| ---------------- | ------ | ------ | ------- | ------- | ------- |
| Files with types | 0%     | 100%   | 10%     | 50%     | 100%    |
| Type coverage    | 0%     | 90%    | 20%     | 60%     | 90%     |
| `any` usage      | N/A    | <5%    | <50%    | <20%    | <5%     |
| Build errors     | N/A    | 0      | <100    | <50     | 0       |
| Type check time  | N/A    | <5s    | <2s     | <3s     | <5s     |

### Qualitative Metrics

- [ ] IDE autocompletion works for public API
- [ ] Plugin developers can use type definitions
- [ ] Refactoring confidence improved
- [ ] API documentation generated from types

---

## Risk Assessment

| Risk                              | Probability | Impact | Mitigation                               |
| --------------------------------- | ----------- | ------ | ---------------------------------------- |
| Breaking changes during migration | Medium      | High   | Incremental migration, extensive testing |
| Performance degradation           | Low         | Medium | Profile build times, optimize includes   |
| Contributor friction              | Medium      | Medium | Provide type documentation, training     |
| Dependency type conflicts         | Medium      | Low    | Use `skipLibCheck`, report upstream      |

---

## Migration Checklist

### Per-File Migration Steps

- [ ] Rename `.js` to `.ts`
- [ ] Add explicit type annotations
- [ ] Remove JSDoc type comments
- [ ] Fix type errors
- [ ] Run tests
- [ ] Update imports in dependent files
- [ ] Review with `tsc --noEmit`

### Module Migration Order

1. **lib/types/** - Create type definitions first
2. **lib/utils/logger.js** - High utility, low complexity
3. **lib/core/Scanner.js** - Core functionality
4. **lib/core/Analyzer.js** - Core functionality
5. **lib/analyzers/\*.js** - Core features
6. **lib/plugins/\*.js** - Plugin architecture
7. **lib/api/\*.js** - API layer
8. **bin/cli.js** - Entry point last

---

## Benefits Summary

### Immediate Benefits (Phase 1)

- Type checking for JSDoc-annotated code
- IDE improvements for core modules
- Type definitions for plugin developers

### Medium-term Benefits (Phase 2-3)

- Catch errors at compile time
- Safer refactoring
- Better API documentation

### Long-term Benefits (Phase 4)

- Full type safety
- Reduced bug rate
- Improved contributor experience
- Plugin ecosystem growth

---

## Timeline

| Phase          | Duration | Start   | End     |
| -------------- | -------- | ------- | ------- |
| Foundation     | 2 weeks  | Q2 2025 | Q2 2025 |
| Core Modules   | 4 weeks  | Q2 2025 | Q3 2025 |
| Utilities      | 4 weeks  | Q3 2025 | Q3 2025 |
| Full Migration | 2 weeks  | Q3 2025 | Q3 2025 |

**Total Estimated Effort**: 12 weeks

---

## References

- [TypeScript Migration Guide](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [JSDoc Reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
- [NodeNext Module Resolution](https://www.typescriptlang.org/docs/handbook/modules/reference.html#node16-nodenext)
- [ES Modules in Node.js](https://nodejs.org/api/esm.html)

---

_Planned by: Ctxman Development Team_
_Target: Q2-Q3 2025_
