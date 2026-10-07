import fs from 'fs';
import path from 'path';
import readline from 'readline';
import TokenUtils from '../utils/token-utils.js';
import FileUtils from '../utils/file-utils.js';
import ClipboardUtils from '../utils/clipboard-utils.js';
import ConfigUtils from '../utils/config-utils.js';
import MethodAnalyzer from './method-analyzer.js';
import GitIngestFormatter from '../formatters/gitingest-formatter.js';
import FormatRegistry from '../formatters/format-registry.js';
import { formatRedactionSummary } from '../utils/secret-redactor.js';
import { LLMDetector } from '../utils/llm-detector.js';

// What ctxman itself writes into a project: reports, context exports and digests in the root,
// and its state under .ctxman/. A later run must not count them as project files.
const OWN_OUTPUT_PATHS = [
  /^token-analysis-report\.json$/,
  /^llm-context\.\w+$/,
  /^digest(-chunk-\d+-of-\d+)?\.txt$/,
  /^(ai-suggestions-report|dependency-context|restored-context)\.json$/,
  /^performance-report\.txt$/,
  /^\.ctxman[/\\](versions|snapshots|metrics|logs|temp|self-knowledge|rag-store)$/,
];

class TokenCalculator {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = { verbose: false, compactContext: true, methodLevel: false, ...options };
    this.stats = this.initStats();
    this.gitIgnore = this.initGitIgnore();
    this.patternFilters = this.initPatternFilters();
    this.methodAnalyzer = new MethodAnalyzer();
    this.methodFilter = this.options.methodLevel ? this.initMethodFilter() : null;
    this.methodStats = { totalMethods: 0, includedMethods: 0, methodTokens: {} };
  }

  initMethodFilter() {
    return ConfigUtils.initMethodFilter(this.projectRoot);
  }

  initStats() {
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

  initGitIgnore() {
    return ConfigUtils.initGitIgnore(this.projectRoot);
  }

  /**
   * Include/exclude patterns of --template and --profile, with .contextinclude /
   * .contextignore syntax. A file must pass every active set.
   */
  initPatternFilters() {
    const toRegex = (pattern) => this.gitIgnore.convertToRegex(pattern);
    return [this.options.templateConfig, this.options.profileConfig]
      .filter(Boolean)
      .map((config) => ({
        include: (config.includePatterns || []).map(toRegex),
        exclude: (config.ignorePatterns || []).map(toRegex),
      }));
  }

  passesPatternFilters(relativePath) {
    return this.patternFilters.every(({ include, exclude }) => {
      if (include.length > 0 && !this.gitIgnore.testPatternsWithNegation(include, relativePath)) {
        return false;
      }
      // Last matching pattern wins, as in .contextignore
      let excluded = false;
      for (const pattern of exclude) {
        if (pattern.regex.test(relativePath)) excluded = !pattern.isNegation;
      }
      return !excluded;
    });
  }

  calculateTokens(content, filePath) {
    const tokens = TokenUtils.calculate(content, filePath);
    return tokens;
  }

  isTextFile(filePath) {
    return FileUtils.isText(filePath);
  }

  analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const stats = fs.statSync(filePath);

      const fileInfo = {
        path: filePath,
        relativePath: path.relative(this.projectRoot, filePath),
        sizeBytes: stats.size,
        tokens: this.calculateTokens(content, filePath),
        lines: content.split('\n').length,
        extension: path.extname(filePath).toLowerCase() || 'no-extension',
      };

      // Method-level analysis if enabled
      if (this.options.methodLevel && this.isCodeFile(filePath)) {
        fileInfo.methods = this.analyzeFileMethods(content, filePath);
      }

      return fileInfo;
    } catch (error) {
      return {
        path: filePath,
        relativePath: path.relative(this.projectRoot, filePath),
        sizeBytes: 0,
        tokens: 0,
        lines: 0,
        extension: 'error',
        error: error.message,
      };
    }
  }

  isCodeFile(filePath) {
    return FileUtils.isCode(filePath);
  }

  analyzeFileMethods(content, filePath) {
    const methods = this.methodAnalyzer.extractMethods(content, filePath);
    const fileName = path.basename(filePath, path.extname(filePath));
    const filteredMethods = [];

    this.methodStats.totalMethods += methods.length;

    for (const method of methods) {
      if (!this.methodFilter || this.methodFilter.shouldIncludeMethod(method.name, fileName)) {
        const methodContent = this.methodAnalyzer.extractMethodContent(content, method.name);
        const methodTokens = methodContent ? this.calculateTokens(methodContent, filePath) : 0;

        const methodInfo = {
          ...method,
          tokens: methodTokens,
          content: methodContent,
        };

        filteredMethods.push(methodInfo);
        this.methodStats.includedMethods++;
        this.methodStats.methodTokens[`${fileName}.${method.name}`] = methodTokens;
      }
    }

    return filteredMethods;
  }

  scanDirectory(dir) {
    const files = [];

    try {
      for (const item of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, item);
        const relativePath = path.relative(this.projectRoot, fullPath);

        if (this.gitIgnore.isIgnored(fullPath, relativePath)) {
          this.countIgnoredFiles(fullPath);
          continue;
        }

        if (this.isOwnOutput(relativePath)) {
          continue;
        }

        const stat = fs.statSync(fullPath);
        // Template/profile patterns select files; directories are always traversed
        if (!stat.isDirectory() && !this.passesPatternFilters(relativePath)) {
          continue;
        }
        if (stat.isDirectory()) {
          if (
            !['node_modules', '.git', '.svn', '.hg', 'coverage', 'dist', 'build'].includes(item)
          ) {
            files.push(...this.scanDirectory(fullPath));
          }
        } else if (this.isTextFile(fullPath) && this.passesFileFilter(relativePath)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error.message);
    }

    return files;
  }

  /**
   * Optional caller-supplied filter (e.g. --changed-only) on project-relative paths
   * @param {string} relativePath
   * @returns {boolean}
   */
  passesFileFilter(relativePath) {
    return typeof this.options.fileFilter !== 'function' || this.options.fileFilter(relativePath);
  }

  /**
   * @param {string} relativePath - Path relative to the project root
   * @returns {boolean} True for a report, export, digest or state folder written by ctxman
   */
  isOwnOutput(relativePath) {
    return OWN_OUTPUT_PATHS.some((pattern) => pattern.test(relativePath));
  }

  countIgnoredFiles(filePath) {
    // Reasons set by GitIgnoreParser for .contextignore / .contextinclude matches
    const isCalculatorIgnored = ['context', 'context-include'].includes(
      this.gitIgnore._lastIgnoreReason
    );

    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const count = this.countFilesInDirectory(filePath);
        if (isCalculatorIgnored) {
          this.stats.calculatorIgnoredFiles += count;
        } else {
          this.stats.ignoredFiles += count;
        }
      } else {
        if (isCalculatorIgnored) {
          this.stats.calculatorIgnoredFiles++;
        } else {
          this.stats.ignoredFiles++;
        }
      }
    } catch {}
  }

  countFilesInDirectory(dirPath) {
    let count = 0;
    try {
      for (const item of fs.readdirSync(dirPath)) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          count += this.countFilesInDirectory(fullPath);
        } else if (this.isTextFile(fullPath)) {
          count++;
        }
      }
    } catch {}
    return count;
  }

  updateStats(fileInfo) {
    if (fileInfo.error) return;

    const { extension, tokens, sizeBytes, lines } = fileInfo;

    this.stats.totalFiles++;
    this.stats.totalTokens += tokens;
    this.stats.totalBytes += sizeBytes;
    this.stats.totalLines += lines;
    this.stats.largestFiles.push(fileInfo);

    // Update extension stats
    this.stats.byExtension[extension] = this.stats.byExtension[extension] || {
      count: 0,
      tokens: 0,
      bytes: 0,
      lines: 0,
    };
    const extStats = this.stats.byExtension[extension];
    extStats.count++;
    extStats.tokens += tokens;
    extStats.bytes += sizeBytes;
    extStats.lines += lines;

    // Update directory stats
    const topDir = fileInfo.relativePath.split('/')[0];
    this.stats.byDirectory[topDir] = this.stats.byDirectory[topDir] || {
      count: 0,
      tokens: 0,
      bytes: 0,
      lines: 0,
    };
    const dirStats = this.stats.byDirectory[topDir];
    dirStats.count++;
    dirStats.tokens += tokens;
    dirStats.bytes += sizeBytes;
    dirStats.lines += lines;
  }

  generateLLMContext(analysisResults) {
    const context = {
      project: {
        root: path.basename(this.projectRoot),
        totalFiles: this.stats.totalFiles,
        totalTokens: this.stats.totalTokens,
      },
    };

    if (this.options.methodLevel) {
      context.methods = this.generateMethodContext(analysisResults.files || analysisResults);
      context.methodStats = {
        totalMethods: this.methodStats.totalMethods,
        includedMethods: this.methodStats.includedMethods,
        totalMethodTokens: Object.values(this.methodStats.methodTokens).reduce(
          (sum, tokens) => sum + tokens,
          0
        ),
      };
    } else {
      context.paths = this.generateCompactPaths(analysisResults.files || analysisResults);
    }

    return context;
  }

  generateMethodContext(analysisResults) {
    const methodContext = {};

    for (const fileInfo of analysisResults) {
      if (fileInfo.methods && fileInfo.methods.length > 0) {
        methodContext[fileInfo.relativePath] = fileInfo.methods.map((method) => ({
          name: method.name,
          line: method.line,
          tokens: method.tokens,
        }));
      }
    }

    return methodContext;
  }

  generateCompactPaths(analysisResults) {
    const sortedFiles = analysisResults.sort((a, b) => b.tokens - a.tokens);
    const pathGroups = {};

    sortedFiles.forEach((file) => {
      const filePath = file.relativePath;
      const parts = filePath.split('/');

      // Group files by their directory path
      // If file is in root, use '/' as key, otherwise use directory path with trailing slash
      const categoryPath = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '/';

      if (!pathGroups[categoryPath]) {
        pathGroups[categoryPath] = [];
      }

      const filename = parts[parts.length - 1];
      pathGroups[categoryPath].push(filename);
    });

    return pathGroups;
  }

  /**
   * Format chosen with -o/--output for context exports (JSON when not set)
   * @returns {string}
   */
  getContextFormat() {
    const format = this.options.outputFormat;
    return format && format !== 'gitingest' ? format : 'json';
  }

  /**
   * Serialize the LLM context in the selected output format
   * @param {object} context
   * @returns {string}
   */
  formatContext(context) {
    const format = this.getContextFormat();
    if (format === 'json') return JSON.stringify(context, null, 2);
    return new FormatRegistry().encode(format, context);
  }

  exportContextToClipboard(context) {
    const contextString = this.formatContext(context);
    const success = ClipboardUtils.copy(contextString);

    if (!success) {
      console.log('💡 Clipboard unavailable, saving to a file instead');
      this.saveContextToFile(context);
    }
  }

  saveContextToFile(context) {
    const format = this.getContextFormat();
    const extension = format === 'json' ? '.json' : new FormatRegistry().getInfo(format).extension;
    const contextPath = path.join(this.projectRoot, `llm-context${extension}`);
    fs.writeFileSync(contextPath, this.formatContext(context));
    console.log(`💾 Context saved to: ${contextPath}`);
  }

  promptForExport(analysisResults) {
    console.log('\n📤 Export Options:');
    console.log('1) Save detailed JSON report (token-analysis-report.json)');
    console.log('2) Generate LLM context file (llm-context.json)');
    console.log('3) Copy LLM context to clipboard');
    console.log('4) Generate GitIngest digest (digest.txt)');
    console.log('5) No export (skip)');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('🤔 Which export option would you like? (1-5): ', (answer) => {
      const trimmed = answer.trim();

      // Handle empty input (just Enter pressed) - default to option 5 (skip)
      if (trimmed === '') {
        console.log('\n✅ Analysis complete. No export selected.');
        rl.close();
        return;
      }

      const choice = parseInt(trimmed);

      // Validate input is a number between 1-5
      if (isNaN(choice) || choice < 1 || choice > 5) {
        console.log('\n❌ Invalid option. Please enter a number between 1-5.');
        console.log('   Skipping export.');
        rl.close();
        return;
      }

      switch (choice) {
        case 1:
          console.log('\n💾 Saving detailed JSON report...');
          this.saveDetailedReport(analysisResults);
          break;
        case 2:
          console.log('\n🤖 Generating LLM context file...');
          const context = this.generateLLMContext(analysisResults);
          this.saveContextToFile(context);
          break;
        case 3:
          console.log('\n🤖 Generating LLM context for clipboard...');
          const clipboardContext = this.generateLLMContext(analysisResults);
          this.exportContextToClipboard(clipboardContext);
          break;
        case 4:
          console.log('\n📄 Generating GitIngest digest...');
          this.saveGitIngestDigest(analysisResults);
          break;
        case 5:
          console.log('\n✅ Analysis complete. No export selected.');
          break;
      }

      rl.close();
    });
  }

  saveGitIngestDigest(analysisResults) {
    const formatter = new GitIngestFormatter(this.projectRoot, this.stats, analysisResults, {
      redactSecrets: this.options.redactSecrets !== false,
      chunking: this.options.chunking,
    });
    const digestPath = path.join(this.projectRoot, 'digest.txt');
    const digestSize = formatter.saveToFile(digestPath);

    if (formatter.chunkFiles?.length) {
      console.log(`💾 GitIngest digest saved as ${formatter.chunkFiles.length} chunks:`);
      formatter.chunkFiles.forEach((file) => console.log(`   ${path.basename(file)}`));
    } else {
      console.log(`💾 GitIngest digest saved to: digest.txt`);
    }
    console.log(`📊 Digest size: ${(digestSize / 1024).toFixed(1)} KB`);
    const redactions = formatter.redactions ?? {};
    if (Object.keys(redactions).length > 0) {
      console.log(
        `🔒 Redacted secrets: ${formatRedactionSummary(redactions)} (disable with --no-redact)`
      );
    }
  }

  /**
   * Scan and analyze the project without printing or exporting
   * @returns {Array<object>} Per-file analysis results
   */
  analyze() {
    return this.analyzeFiles(this.scanDirectory(this.projectRoot));
  }

  analyzeFiles(files) {
    const analysisResults = [];
    for (const file of files) {
      const fileInfo = this.analyzeFile(file);
      this.updateStats(fileInfo);
      analysisResults.push(fileInfo);
    }

    this.stats.largestFiles.sort((a, b) => b.tokens - a.tokens);
    return analysisResults;
  }

  run() {
    this.printHeader();

    const allFiles = this.scanDirectory(this.projectRoot);
    this.printScanResults(allFiles);

    const analysisResults = this.analyzeFiles(allFiles);
    this.printReport();

    // Context Fit Analysis (v2.3.7)
    if (this.options.targetModel && !this.options.dashboard) {
      this.printContextFitAnalysis();
    }

    // Handle exports (skip for dashboard mode)
    if (!this.options.dashboard) {
      this.handleExports(analysisResults);
    }

    // Return stats for programmatic usage (e.g., Dashboard)
    return this.stats;
  }

  printHeader() {
    console.log('🔍 Analyzing project: ' + this.projectRoot);
    console.log('📝 Respecting .gitignore rules...');

    const configPath = this.gitIgnore.hasIncludeFile
      ? ConfigUtils.findConfigFile(this.projectRoot, '.contextinclude')
      : ConfigUtils.findConfigFile(this.projectRoot, '.contextignore');

    if (configPath) {
      const mode = this.gitIgnore.hasIncludeFile ? 'INCLUDE' : 'EXCLUDE';
      console.log(`📅 Found calculator config - using ${mode} mode`);
      console.log('   Location: ' + path.relative(this.projectRoot, configPath));
    }

    console.log(
      '🎯 Token calculation: ' +
        (TokenUtils.hasExactCounting() ? '✅ Exact (using tiktoken)' : '⚠️  Estimated')
    );

    if (this.options.methodLevel) {
      console.log('🔧 Method-level analysis: ✅ Enabled');
      if (this.methodFilter) {
        const hasInclude = this.methodFilter.hasIncludeFile;
        const mode = hasInclude ? 'INCLUDE' : 'EXCLUDE';
        console.log(`   Method filtering: ${mode} mode active`);
      }
    }

    console.log();
  }

  printScanResults(allFiles) {
    console.log(`📁 Found ${allFiles.length} text files to analyze`);
    console.log(`🚫 Ignored ${this.stats.ignoredFiles} files due to .gitignore rules`);
    if (this.stats.calculatorIgnoredFiles > 0) {
      const rules = this.gitIgnore.hasIncludeFile ? '.contextinclude' : '.contextignore';
      console.log(
        `📋 Filtered ${this.stats.calculatorIgnoredFiles} additional files due to ${rules} rules`
      );
    }

    if (this.options.methodLevel) {
      console.log(`🔧 Total methods found: ${this.methodStats.totalMethods}`);
      console.log(`✅ Methods included: ${this.methodStats.includedMethods}`);
    }

    console.log();
  }

  printReport() {
    console.log('='.repeat(80));
    console.log('🎯 PROJECT TOKEN ANALYSIS REPORT');
    console.log('='.repeat(80));
    console.log(`📊 Total files analyzed: ${this.stats.totalFiles.toLocaleString()}`);
    console.log(`🔢 Total tokens: ${this.stats.totalTokens.toLocaleString()}`);
    console.log(`💾 Total size: ${(this.stats.totalBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📄 Total lines: ${this.stats.totalLines.toLocaleString()}`);

    const avgTokens =
      this.stats.totalFiles > 0
        ? Math.round(this.stats.totalTokens / this.stats.totalFiles).toLocaleString()
        : 'N/A';
    console.log(`📈 Average tokens per file: ${avgTokens}`);
    console.log(`🚫 Files ignored by .gitignore: ${this.stats.ignoredFiles.toLocaleString()}`);
    if (this.stats.calculatorIgnoredFiles > 0) {
      console.log(
        `📋 Files ignored by context rules: ${this.stats.calculatorIgnoredFiles.toLocaleString()}`
      );
    }
    console.log();

    this.printExtensionStats();
    this.printTopFiles();
    this.printTopDirectories();
    if (this.options.verbose) {
      this.printIncludedFiles();
    }

    console.log('\n💡 Tip: Use --save-report flag to save detailed analysis to JSON file');
  }

  printExtensionStats() {
    console.log('📋 BY FILE TYPE:');
    console.log('-'.repeat(80));
    console.log(
      'Extension'.padEnd(15) +
        'Files'.padStart(8) +
        'Tokens'.padStart(12) +
        'Size (KB)'.padStart(12) +
        'Lines'.padStart(10)
    );
    console.log('-'.repeat(80));

    Object.entries(this.stats.byExtension)
      .sort((a, b) => b[1].tokens - a[1].tokens)
      .forEach(([ext, data]) => {
        console.log(
          ext.padEnd(15) +
            data.count.toString().padStart(8) +
            data.tokens.toLocaleString().padStart(12) +
            (data.bytes / 1024).toFixed(1).padStart(12) +
            data.lines.toLocaleString().padStart(10)
        );
      });
  }

  printTopFiles() {
    console.log('\n🏆 TOP 5 LARGEST FILES BY TOKEN COUNT:');
    console.log('-'.repeat(80));
    this.stats.largestFiles.slice(0, 5).forEach((file, index) => {
      const percentage = ((file.tokens / this.stats.totalTokens) * 100).toFixed(1);
      const sizeKB = (file.sizeBytes / 1024).toFixed(1);
      console.log(
        `${(index + 1).toString().padStart(2)}. ${file.tokens.toLocaleString().padStart(8)} tokens (${percentage}%) - ${file.relativePath}`
      );
      console.log(
        `    💾 ${sizeKB.padStart(8)} KB, 📄 ${file.lines.toLocaleString().padStart(6)} lines`
      );
    });
  }

  printTopDirectories() {
    const largestDirectories = Object.entries(this.stats.byDirectory)
      .map(([dir, stats]) => ({ directory: dir, ...stats }))
      .sort((a, b) => b.tokens - a.tokens);

    console.log('\n📁 TOP 5 LARGEST DIRECTORIES BY TOKEN COUNT:');
    console.log('-'.repeat(80));
    largestDirectories.slice(0, 5).forEach((dir, index) => {
      const percentage = ((dir.tokens / this.stats.totalTokens) * 100).toFixed(1);
      const avgTokensPerFile = Math.round(dir.tokens / dir.count);
      console.log(
        `${(index + 1).toString().padStart(2)}. ${dir.tokens.toLocaleString().padStart(8)} tokens (${percentage}%) - ${dir.directory}/`
      );
      console.log(
        `    📄 ${dir.count.toString().padStart(3)} files, 📈 ${avgTokensPerFile.toLocaleString().padStart(6)} avg tokens/file`
      );
    });
  }

  printIncludedFiles() {
    console.log(`\n📄 INCLUDED FILES (${this.stats.largestFiles.length}):`);
    console.log('-'.repeat(80));
    [...this.stats.largestFiles]
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
      .forEach((file) => {
        console.log(`${file.tokens.toLocaleString().padStart(8)} tokens - ${file.relativePath}`);
      });
  }

  handleExports(analysisResults) {
    const { saveReport, contextExport, contextToClipboard } = this.options;
    // -o gitingest and --chunk both mean "produce the GitIngest digest"
    const gitingest =
      this.options.gitingest ||
      this.options.outputFormat === 'gitingest' ||
      Boolean(this.options.chunking?.enabled);

    if (contextExport || contextToClipboard || saveReport || gitingest) {
      if (contextExport || contextToClipboard) {
        console.log('\n🤖 Generating LLM Context...');
        const context = this.generateLLMContext(analysisResults);

        if (contextToClipboard) {
          this.exportContextToClipboard(context);
        } else {
          this.saveContextToFile(context);
        }
      }

      if (saveReport) {
        this.saveDetailedReport(analysisResults);
      }

      if (gitingest) {
        console.log('\n📄 Generating GitIngest digest...');
        this.saveGitIngestDigest(analysisResults);
      }
    } else if (!this.options.simple) {
      this.promptForExport(analysisResults);
    }
  }

  saveDetailedReport(analysisResults) {
    const report = {
      metadata: {
        generatedAt: new Date().toISOString(),
        projectRoot: this.projectRoot,
        gitignoreRules: this.gitIgnore.patterns.map((p) => p.original),
        calculatorRules: this.gitIgnore.contextPatterns.map((p) => p.original),
      },
      summary: this.stats,
      files: analysisResults.sort((a, b) => b.tokens - a.tokens),
    };

    const reportPath = path.join(this.projectRoot, 'token-analysis-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log('💾 Detailed analysis saved to: token-analysis-report.json');
  }

  /**
   * Print Context Fit Analysis (v2.3.7)
   * Shows if repository fits in target LLM's context window
   */
  printContextFitAnalysis() {
    try {
      const profile = LLMDetector.getProfile(this.options.targetModel);
      const repoStats = {
        totalTokens: this.stats.totalTokens,
        totalFiles: this.stats.totalFiles,
      };

      // Pass largest files for suggestions
      const analysis = LLMDetector.analyzeContextFit(profile, repoStats, this.stats.largestFiles);
      const formatted = LLMDetector.formatAnalysis(analysis);

      console.log(formatted);
    } catch (_error) {
      // Silently fail if context fit analysis fails
      // Don't break the main workflow
    }
  }
}

export default TokenCalculator;
