#!/usr/bin/env node

import { TokenAnalyzer } from '../index.js';
import FormatRegistry from '../lib/formatters/format-registry.js';
import FormatConverter from '../lib/utils/format-converter.js';
import { LLMDetector } from '../lib/utils/llm-detector.js';
import { LLMCostEstimator } from '../lib/utils/llm-cost-estimator.js';
import APIServer from '../lib/api/rest/server.js';
import FileWatcher from '../lib/watch/FileWatcher.js';
import IncrementalAnalyzer from '../lib/watch/IncrementalAnalyzer.js';
import DiffAnalyzer from '../lib/integrations/git/DiffAnalyzer.js';
import TemplateManager from '../lib/utils/template-manager.js';
import ProfileManager from '../lib/utils/profile-manager.js';
import { AISuggester } from '../lib/analyzers/ai-suggester.js';
import { DependencyScanner } from '../lib/analyzers/dependency-scanner.js';
import { ImportTracker } from '../lib/analyzers/import-tracker.js';
import MultiRepoManager from '../lib/utils/multi-repo-manager.js';
import SnapshotManager from '../lib/utils/snapshot-manager.js';
import ContextVersioning from '../lib/utils/context-versioning.js';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, sep } from 'path';
import { readFileSync } from 'fs';

// ESM equivalents for __dirname and __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load package.json
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  // Check for version flag
  if (args.includes('--version')) {
    console.log(`Ctxman v${pkg.version}`);
    return;
  }

  // Check for profile listing (FEAT-004)
  if (args.includes('--list-profiles')) {
    listProfiles();
    return;
  }

  // Check for profile creation (FEAT-004)
  if (args.includes('--create-profile')) {
    createProfile(args);
    return;
  }

  // Check for profile export (FEAT-004)
  if (args.includes('--export-profile')) {
    exportProfile(args);
    return;
  }

  // Check for template listing (FEAT-009)
  if (args.includes('--list-templates')) {
    listTemplates();
    return;
  }

  // Check for format listing
  if (args.includes('--list-formats')) {
    listFormats();
    return;
  }

  // Check for LLM model listing (v2.3.7)
  if (args.includes('--list-llms')) {
    listLLMs();
    return;
  }

  // Check for cost estimation (FEAT-010)
  if (args.includes('--estimate-cost')) {
    runCostEstimation(args);
    return;
  }

  // Check for multi-repo commands (FEAT-006)
  if (args.includes('--add-repo')) {
    addRepo(args);
    return;
  }

  if (args.includes('--remove-repo')) {
    removeRepo(args);
    return;
  }

  if (args.includes('--list-repos')) {
    listRepos();
    return;
  }

  // Check for AI suggestions (FEAT-005)
  if (args.includes('--ai-suggest')) {
    await runAISuggest(args);
    return;
  }

  // Check for snapshot commands (FEAT-003)
  if (args.includes('--snapshot')) {
    await runSnapshot(args);
    return;
  }

  if (args.includes('--list-snapshots')) {
    await listSnapshots();
    return;
  }

  if (args.includes('--diff-last')) {
    await runDiffLast(args);
    return;
  }

  if (args.includes('--diff-snapshot')) {
    await runDiffSnapshot(args);
    return;
  }

  if (args.includes('--snapshot-trend')) {
    await runSnapshotTrend(args);
    return;
  }

  // Check for context versioning commands (FEAT-012)
  if (args.includes('--list-versions')) {
    await listVersions();
    return;
  }

  if (args.includes('--restore-version')) {
    await restoreVersion(args);
    return;
  }

  if (args.includes('--compare-versions')) {
    await compareVersions(args);
    return;
  }

  // Check for performance dashboard (FEAT-001)
  if (args.includes('--perf-dashboard')) {
    await runPerfDashboard(args);
    return;
  }

  // Check for dependency scanning (FEAT-002)
  if (args.includes('--scan-dependencies')) {
    await runDependencyScan(args);
    return;
  }

  // Check for format conversion mode (v2.3.2)
  if (args.includes('convert')) {
    runFormatConversion(args);
    return;
  }

  // Check for init command (FEAT-001: Configuration Wizard)
  if (args.includes('init')) {
    await runInitWizard(args);
    return;
  }

  // Check for GitHub GitIngest mode (v2.3.6+)
  if (args.includes('github') || args.includes('git')) {
    const commandPath = resolve(__dirname, './cm-gitingest.js');
    const gitArgs = args.filter((arg) => arg !== 'github' && arg !== 'git');
    const result = spawnSync(process.execPath, [commandPath, ...gitArgs], { stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
    return;
  }

  // Check for RAG 'ask' mode (v3.1.0)
  if (args.includes('ask')) {
    const commandPath = resolve(__dirname, './cm-ask.js');
    const askArgs = args.filter((arg) => arg !== 'ask');
    // Pass remaining args as the query (cm-ask joins them)
    const result = spawnSync(process.execPath, [commandPath, ...askArgs], { stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
    return;
  }

  // Check for API server mode (v3.0.0)
  if (args.includes('serve')) {
    await runAPIServer(args);
    return;
  }

  // Check for watch mode (v3.0.0)
  if (args.includes('watch')) {
    await runWatchMode(args);
    return;
  }

  // Check for explicit dashboard mode
  if (args.includes('--dashboard')) {
    try {
      await runDashboard();
      return;
    } catch (error) {
      console.error('⚠️  Live dashboard failed.');
      console.error('   Error:', error.message);
      console.error('   Falling back to standard mode...\n');
    }
  }

  // Check if CLI mode is explicitly requested OR any analysis flags are present
  const hasAnalysisFlags = args.some(
    (arg) => arg.startsWith('-') && arg !== '--cli' && arg !== '--wizard' && arg !== '--dashboard'
  );

  const cliMode = args.includes('--cli') || hasAnalysisFlags;

  // DEFAULT: Run wizard mode unless --cli flag or other flags are present
  if (!cliMode) {
    try {
      await runWizard();
      return;
    } catch (error) {
      // If wizard fails, fall through to normal mode
      console.error('⚠️  Interactive wizard mode failed.');
      console.error('   Error:', error.message);
      console.error('   Falling back to CLI mode...\n');
      console.error('   Tip: Use --cli flag to skip wizard mode\n');
    }
  }

  // CLI Mode: Run traditional command-line analysis
  let options = parseArguments(args);

  // Apply template if specified (FEAT-009)
  if (options.template) {
    try {
      const manager = new TemplateManager(process.cwd());
      const templateConfig = manager.apply(options.template, {
        targetModel: options.targetModel,
      });

      // Merge template config with options (options take precedence)
      options = {
        ...options,
        templateConfig,
        // Use template's target model if not explicitly set
        targetModel: options.targetModel || templateConfig.targetModel,
      };
    } catch (error) {
      console.error(`❌ Template error: ${error.message}`);
      process.exit(1);
    }
  }

  // Apply profile if specified (FEAT-004)
  if (options.profile) {
    try {
      const manager = new ProfileManager(process.cwd());
      const profileConfig = manager.apply(options.profile, {
        targetModel: options.targetModel,
      });

      // Merge profile config with options (options take precedence)
      options = {
        ...options,
        profileConfig,
        // Use profile's target model if not explicitly set
        targetModel: options.targetModel || profileConfig.targetModel,
        methodLevel: options.methodLevel || profileConfig.methodLevel,
      };
    } catch (error) {
      console.error(`❌ Profile error: ${error.message}`);
      process.exit(1);
    }
  }

  // Git integration: Filter to changed files only (v3.0.0)
  if (options.changedOnly || options.changedSince) {
    await runChangedFilesAnalysis(options);
    return;
  }

  // Multi-repository analysis (FEAT-006)
  if (options.multiRepo) {
    await runMultiRepoAnalysis(options);
    return;
  }

  printStartupInfo(options);

  const analyzer = new TokenAnalyzer(options.projectRoot, options);
  const stats = analyzer.run();

  // Auto-create context version when using --cli (FEAT-012)
  if (args.includes('--cli') && stats) {
    await autoCreateVersion(stats, options);
  }
}

function parseArguments(args) {
  return {
    // Output options
    saveReport: args.includes('--save-report') || args.includes('-s'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    contextExport: args.includes('--context-export'),
    contextToClipboard: args.includes('--context-clipboard'),
    json: args.includes('--json'), // NEW: JSON output mode

    // Analysis options
    methodLevel: args.includes('--method-level') || args.includes('-m'),
    gitingest: args.includes('--gitingest') || args.includes('-g'),
    redactSecrets: !args.includes('--no-redact'),
    aiSuggest: args.includes('--ai-suggest'), // FEAT-005: AI suggestions

    // Profile options (FEAT-004)
    profile: getProfile(args),

    // Template options (FEAT-009)
    template: getTemplate(args),

    // Format options (v2.3.0)
    outputFormat: getOutputFormat(args),

    // LLM options (v2.3.7)
    targetModel: getTargetModel(args),
    autoDetectLLM: args.includes('--auto-detect-llm'),

    // Git options (v3.0.0)
    changedOnly: args.includes('--changed-only'),
    changedSince: getChangedSince(args),
    withAuthors: args.includes('--with-authors'),
    withHistory: args.includes('--with-history'),

    // Multi-repo options (FEAT-006)
    multiRepo: args.includes('--multi-repo'),

    // UI options (v2.3.0)
    simple: args.includes('--simple'),
    dashboard: args.includes('--dashboard'),

    // Chunking options (v2.3.0)
    chunking: {
      enabled: args.includes('--chunk'),
      strategy: getChunkStrategy(args),
      maxTokensPerChunk: getChunkSize(args),
    },

    projectRoot: process.cwd(),
  };
}

function getOutputFormat(args) {
  const formatIndex = args.findIndex((arg) => arg === '--output' || arg === '-o');
  if (formatIndex !== -1 && args[formatIndex + 1]) {
    return args[formatIndex + 1];
  }
  return null; // Not set: context exports stay JSON (llm-context.json)
}

function getChunkStrategy(args) {
  const strategyIndex = args.findIndex((arg) => arg === '--chunk-strategy');
  if (strategyIndex !== -1 && args[strategyIndex + 1]) {
    return args[strategyIndex + 1];
  }
  return 'smart'; // Default strategy
}

function getChunkSize(args) {
  const sizeIndex = args.findIndex((arg) => arg === '--chunk-size');
  if (sizeIndex !== -1 && args[sizeIndex + 1]) {
    return parseInt(args[sizeIndex + 1], 10);
  }
  return 100000; // Default 100k tokens
}

function getTargetModel(args) {
  // Check for explicit model flag
  const modelIndex = args.findIndex((arg) => arg === '--target-model');
  if (modelIndex !== -1 && args[modelIndex + 1]) {
    return args[modelIndex + 1];
  }

  // Check for auto-detect flag
  if (args.includes('--auto-detect-llm')) {
    const detected = LLMDetector.detect();
    if (detected !== 'unknown') {
      console.log(`✅ Auto-detected LLM: ${LLMDetector.getProfile(detected).name}`);
      return detected;
    }
  }

  return null; // No model specified
}

function listLLMs() {
  console.log('\n📋 Supported LLM Models (v2.3.7):\n');
  console.log('═'.repeat(70));

  const models = LLMDetector.getModelList();

  // Group by vendor
  const byVendor = {};
  models.forEach((model) => {
    if (!byVendor[model.vendor]) {
      byVendor[model.vendor] = [];
    }
    byVendor[model.vendor].push(model);
  });

  // Display by vendor
  Object.entries(byVendor).forEach(([vendor, models]) => {
    console.log(`\n${vendor}:`);
    models.forEach((model) => {
      const contextDisplay =
        model.contextWindow >= 1000000
          ? `${(model.contextWindow / 1000000).toFixed(1)}M`
          : `${Math.floor(model.contextWindow / 1000)}k`;
      console.log(`  ${model.id.padEnd(25)} ${model.name.padEnd(25)} (${contextDisplay} context)`);
    });
  });

  console.log('\n' + '═'.repeat(70));
  console.log('\nUsage:');
  console.log('  ctxman --target-model <MODEL_ID>');
  console.log('  ctxman --auto-detect-llm');
  console.log('\nExample:');
  console.log('  ctxman --target-model claude-sonnet-4.5');
  console.log('  ctxman --auto-detect-llm --cli\n');
}

function printStartupInfo(options) {
  console.log('🚀 Ctxman v3.0.0');
  console.log('='.repeat(50));

  // Show profile info if used
  if (options.profile) {
    const manager = new ProfileManager(process.cwd());
    const profile = manager.get(options.profile);
    if (profile) {
      console.log(`📋 Using profile: ${profile.name}`);
      console.log(`   Description: ${profile.description}`);
      console.log();
    }
  }

  // Show template info if used
  if (options.template) {
    const manager = new TemplateManager(process.cwd());
    const template = manager.get(options.template);
    if (template) {
      console.log(`📋 Using template: ${template.name}`);
      console.log(`   Description: ${template.description}`);
      console.log();
    }
  }

  // Only show active options if any are set
  const hasOptions =
    options.outputFormat ||
    options.methodLevel ||
    options.chunking?.enabled ||
    options.saveReport ||
    options.verbose ||
    options.contextExport ||
    options.contextToClipboard ||
    options.gitingest;

  if (hasOptions) {
    console.log('📋 Active options:');
    if (options.outputFormat) {
      console.log(`  Output format: ${options.outputFormat}`);
    }
    if (options.methodLevel) {
      console.log('  Method-level analysis: enabled');
    }
    if (options.saveReport) {
      console.log('  Save report: enabled');
    }
    if (options.gitingest) {
      console.log('  GitIngest format: enabled');
    }
    if (options.contextExport) {
      console.log('  Context export: enabled');
    }
    if (options.contextToClipboard) {
      console.log('  Copy to clipboard: enabled');
    }
    if (options.chunking?.enabled) {
      console.log(
        `  Chunking: ${options.chunking.strategy} (${options.chunking.maxTokensPerChunk.toLocaleString()} tokens/chunk)`
      );
    }
    console.log();
  }
}

function printHelp() {
  console.log(
    'Ctxman v3.0.0 - AI Development Platform with Plugin Architecture and Git Integration'
  );
  console.log();
  console.log('Usage: ctxman [options]');
  console.log();
  console.log('Initialization (FEAT-001):');
  console.log('  init                     Initialize ctxman configuration with interactive wizard');
  console.log('    --force, -f            Overwrite existing configuration files');
  console.log('    --minimal              Create minimal configuration only');
  console.log('    --yes, -y              Skip prompts and use defaults');
  console.log();
  console.log('Default Mode:');
  console.log('  ctxman          Launch interactive wizard (DEFAULT)');
  console.log('  --cli                    Use CLI mode instead of wizard');
  console.log();
  console.log('Profile Options (FEAT-004):');
  console.log('  --profile <name>         Use a team configuration profile');
  console.log('  --list-profiles          List available profiles');
  console.log('  --create-profile <name>  Create a new custom profile');
  console.log('  --export-profile <name>  Export a profile to JSON');
  console.log();
  console.log('Template Options (FEAT-009):');
  console.log('  -t, --template <name>    Use a pre-built context template');
  console.log('  --list-templates         List available templates');
  console.log();
  console.log('Analysis Options:');
  console.log('  -s, --save-report        Save detailed JSON report');
  console.log('  -v, --verbose            Show all included files');
  console.log('  -m, --method-level       Enable method-level analysis');
  console.log('  -g, --gitingest          Generate GitIngest-style digest');
  console.log('  --no-redact              Keep API keys/tokens/private keys in the digest');
  console.log('  --ai-suggest             Get AI-powered context optimization suggestions');
  console.log();
  console.log('Output Options (v2.3.0):');
  console.log(
    '  -o, --output FORMAT      Format of --context-export/--context-clipboard (default: json)'
  );
  console.log(
    '                           Formats: toon, json, yaml, csv, xml, markdown, gitingest'
  );
  console.log('  --context-export         Generate LLM context file');
  console.log('  --context-clipboard      Copy context to clipboard');
  console.log('  --list-formats           List all available output formats');
  console.log();
  console.log('UI Options (v2.3.0):');
  console.log('  --simple                 Simple text-based output (no fancy UI)');
  console.log('  --dashboard              Live dashboard mode');
  console.log('  --wizard                 Force interactive wizard mode');
  console.log();
  console.log('Chunking Options (v2.3.0):');
  console.log('  --chunk                  Enable smart chunking for large repos');
  console.log('  --chunk-strategy TYPE    Chunking strategy (smart, size, file, directory)');
  console.log('  --chunk-size TOKENS      Max tokens per chunk (default: 100000)');
  console.log();
  console.log('LLM Optimization (v2.3.7):');
  console.log('  --target-model MODEL     Optimize for specific LLM (e.g., claude-sonnet-4.5)');
  console.log('  --auto-detect-llm        Auto-detect LLM from environment variables');
  console.log('  --list-llms              List all supported LLM models');
  console.log();
  console.log('Cost Estimation (FEAT-010):');
  console.log('  --estimate-cost          Show cost estimates for all LLM providers');
  console.log();
  console.log('Snapshot & Diff (FEAT-003):');
  console.log('  --snapshot [message]     Create a snapshot of current token state');
  console.log('  --list-snapshots         List all saved snapshots');
  console.log('  --diff-last              Compare current state with last snapshot');
  console.log('  --diff-snapshot <id1> <id2>  Compare two specific snapshots');
  console.log('  --snapshot-trend         Show token growth trend across snapshots');
  console.log('    --limit N              Limit snapshots to analyze (default: 10)');
  console.log('    --json                 Output in JSON format');
  console.log();
  console.log('Context Versioning (FEAT-012):');
  console.log('  --cli                    Run analysis and auto-create context version');
  console.log('  --list-versions          List all saved context versions');
  console.log('  --restore-version <id>   Restore a previous context version');
  console.log('  --compare-versions <id1> <id2>  Compare two context versions');
  console.log('    --json                 Output in JSON format (for compare)');
  console.log();
  console.log('Performance Dashboard (FEAT-001):');
  console.log('  --perf-dashboard         Display text-based performance dashboard');
  console.log('    --period <period>      Time period: 7d (default), 30d, all');
  console.log('    --save-report          Save dashboard output to file');
  console.log();
  console.log('Dependency Scanner (FEAT-002):');
  console.log('  --scan-dependencies      Analyze node_modules for token impact');
  console.log('    --dependency-depth N   How deep to scan (default: 1)');
  console.log('    --include-types         Include TypeScript definitions');
  console.log('    --check-security        Check for security vulnerabilities (npm audit)');
  console.log();
  console.log('Multi-Repository (FEAT-006):');
  console.log('  --multi-repo             Analyze all configured repositories');
  console.log('  --add-repo <path>        Add a repository to configuration');
  console.log('  --remove-repo <path>     Remove a repository from configuration');
  console.log('  --list-repos             List all configured repositories');
  console.log();
  console.log('Git Integration (v3.0.0):');
  console.log('  --changed-only           Analyze only files with uncommitted changes');
  console.log('  --changed-since REF      Analyze files changed since commit/branch');
  console.log('  --with-authors           Include author information');
  console.log('  --with-history           Include commit history');
  console.log();
  console.log('Platform Features (v3.0.0):');
  console.log('  serve [options]          Start REST API server');
  console.log('    --port PORT            Server port (default: 3000)');
  console.log('    --auth-token TOKEN     API authentication token');
  console.log('    --host HOST            Address to bind (default: localhost)');
  console.log('    --cors                 Send CORS headers (off by default)');
  console.log('  watch [options]          Watch mode with auto-analysis');
  console.log('    --debounce MS          Debounce delay (default: 1000ms)');
  console.log();
  console.log('General Options:');
  console.log('  -h, --help               Show this help');
  console.log('  --version                Show version number');
  console.log();
  console.log('Template Examples:');
  console.log('  ctxman --template bug-fix              Use bug-fix template');
  console.log('  ctxman -t feature --cli                Feature template in CLI mode');
  console.log('  ctxman --list-templates                Show all templates');
  console.log();
  console.log('Configuration Files:');
  console.log('  .contextinclude          Include only specified files');
  console.log('  .contextignore           Exclude specified files');
  console.log('  .methodinclude           Include only specified methods');
  console.log('  .methodignore             Exclude specified methods');
  console.log('  .ctxman/templates/*.json Custom template files');
  console.log('  .ctxman/profiles/*.json  Custom team profile files');
  console.log();
  console.log('Format Conversion (v2.3.2):');
  console.log('  convert INPUT --from FORMAT --to FORMAT');
  console.log('                           Convert between formats');
  console.log('  Examples:');
  console.log('    ctxman convert report.json --from json --to toon');
  console.log('    ctxman convert data.toon --from toon --to yaml');
  console.log('    ctxman convert context.yaml --from yaml --to json');
  console.log();
  console.log('GitHub Integration (v2.3.6+):');
  console.log('  github URL [options]     Generate GitIngest from GitHub repository');
  console.log('  git URL [options]        Alias for github command');
  console.log('  Examples:');
  console.log('    ctxman github facebook/react');
  console.log('    ctxman github https://github.com/vercel/next.js --branch canary');
  console.log('    ctxman git angular/angular -o docs/angular.txt');
  console.log();
  console.log('Examples:');
  console.log('  ctxman                                  # Launch interactive wizard (DEFAULT)');
  console.log('  ctxman --cli                            # Use CLI mode');
  console.log('  ctxman --cli -o json --save-report      # CLI: JSON format + save report');
  console.log('  ctxman --cli -o toon --context-clipboard   # CLI: TOON to clipboard');
  console.log('  ctxman --cli --gitingest --chunk        # CLI: GitIngest with chunking');
  console.log('  ctxman --cli -m -o yaml                 # CLI: Method-level + YAML format');
  console.log('  ctxman --cli --chunk --chunk-strategy smart   # CLI: Smart chunking');
  console.log('  ctxman convert data.json --from json --to toon  # Convert formats');
  console.log();
  console.log('Format Comparison (token efficiency):');
  console.log('  TOON:     40-50% reduction (most efficient)');
  console.log('  JSON:     Standard format (baseline)');
  console.log('  YAML:     Human-readable (5-10% larger than JSON)');
  console.log('  Markdown: Documentation-friendly (20-30% larger)');
  console.log();
  console.log('For more information: https://github.com/hakkisagdic/ctxman');
}

function listFormats() {
  const registry = new FormatRegistry();
  const formats = registry.getAllInfo();

  console.log('📋 Available Output Formats:\n');
  console.log('Format'.padEnd(15) + 'Description'.padEnd(50) + 'Extension');
  console.log('='.repeat(80));

  for (const [name, info] of Object.entries(formats)) {
    console.log(name.padEnd(15) + info.description.substring(0, 48).padEnd(50) + info.extension);
  }

  console.log();
  console.log('Usage: ctxman --output <format>');
  console.log('Example: ctxman --output toon --context-clipboard');
}

function getChangedSince(args) {
  const sinceIndex = args.findIndex((arg) => arg === '--changed-since');
  if (sinceIndex !== -1 && args[sinceIndex + 1]) {
    return args[sinceIndex + 1];
  }
  return null;
}

function getTemplate(args) {
  const templateIndex = args.findIndex((arg) => arg === '--template' || arg === '-t');
  if (templateIndex !== -1 && args[templateIndex + 1]) {
    return args[templateIndex + 1];
  }
  return null;
}

function getProfile(args) {
  const profileIndex = args.findIndex((arg) => arg === '--profile');
  if (profileIndex !== -1 && args[profileIndex + 1]) {
    return args[profileIndex + 1];
  }
  return null;
}

function listTemplates() {
  const manager = new TemplateManager(process.cwd());
  console.log(manager.formatList());
}

function listProfiles() {
  const manager = new ProfileManager(process.cwd());
  console.log(manager.formatList());
}

function createProfile(args) {
  const profileIndex = args.findIndex((arg) => arg === '--create-profile');
  const profileName = profileIndex !== -1 && args[profileIndex + 1] ? args[profileIndex + 1] : null;

  if (!profileName) {
    console.error('❌ Profile name required');
    console.error('   Usage: ctxman --create-profile <name>');
    process.exit(1);
  }

  const manager = new ProfileManager(process.cwd());

  // Create a basic profile template
  const profile = {
    name: `${profileName} Profile`,
    description: `Configuration for ${profileName}`,
    createdBy: process.env.USER || 'unknown',
    config: {
      exclude: ['**/*.test.js', '**/*.spec.js', 'node_modules/**'],
      include: ['src/**', 'lib/**'],
      targetModel: 'claude-sonnet-4.5',
      methodLevel: false,
    },
  };

  try {
    const filePath = manager.createCustom(profileName, profile);
    console.log(`\n✅ Created profile '${profileName}'`);
    console.log(`   Location: ${filePath}\n`);
    console.log('   Edit the file to customize your team configuration.\n');
  } catch (error) {
    console.error(`❌ Failed to create profile: ${error.message}`);
    process.exit(1);
  }
}

function exportProfile(args) {
  const profileIndex = args.findIndex((arg) => arg === '--export-profile');
  const profileName = profileIndex !== -1 && args[profileIndex + 1] ? args[profileIndex + 1] : null;

  if (!profileName) {
    console.error('❌ Profile name required');
    console.error('   Usage: ctxman --export-profile <name>');
    process.exit(1);
  }

  const manager = new ProfileManager(process.cwd());

  try {
    const profile = manager.export(profileName);
    console.log(JSON.stringify(profile, null, 2));
  } catch (error) {
    console.error(`❌ Failed to export profile: ${error.message}`);
    process.exit(1);
  }
}

async function runAPIServer(args) {
  const portIndex = args.findIndex((arg) => arg === '--port');
  const port = portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1], 10) : 3000;

  const authTokenIndex = args.findIndex((arg) => arg === '--auth-token');
  const authToken =
    authTokenIndex !== -1 && args[authTokenIndex + 1] ? args[authTokenIndex + 1] : null;

  const hostIndex = args.findIndex((arg) => arg === '--host');
  const host = hostIndex !== -1 && args[hostIndex + 1] ? args[hostIndex + 1] : 'localhost';
  const cors = args.includes('--cors');

  if (!authToken && cors) {
    console.warn('⚠️  --cors without --auth-token: any web page you open can read the responses.');
  }
  if (!authToken && !['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.warn(
      `⚠️  Listening on ${host} without --auth-token: anyone on the network can query it.`
    );
  }

  const server = new APIServer({ port, host, authToken, cors });

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down server...');
    server.stop();
    process.exit(0);
  });

  server.start();
}

async function runChangedFilesAnalysis(options) {
  console.log('🔀 Git Integration - Analyzing Changed Files');
  console.log('═'.repeat(60));
  console.log();

  const diffAnalyzer = new DiffAnalyzer(options.projectRoot);
  const changes = diffAnalyzer.analyzeChanges(options.changedSince);

  console.log(`📝 Found ${changes.totalChangedFiles} changed files`);
  if (options.changedSince) {
    console.log(`   Since: ${options.changedSince}`);
  }
  console.log(`   Impact: ${changes.impact.level.toUpperCase()} (score: ${changes.impact.score})`);
  console.log();

  if (changes.totalChangedFiles === 0) {
    console.log('✅ No changed files to analyze');
    return;
  }

  // Analyze only changed files; git reports them relative to the repository root
  const changedFiles = new Set(changes.changedFiles);
  const analyzer = new TokenAnalyzer(options.projectRoot, {
    ...options,
    fileFilter: (relativePath) => changedFiles.has(relativePath.split(sep).join('/')),
  });

  analyzer.run();
}

async function runWatchMode(args) {
  console.log('👁️  Starting watch mode...\n');

  const projectRoot = process.cwd();
  const debounce = args.includes('--debounce')
    ? parseInt(args[args.indexOf('--debounce') + 1], 10) || 1000
    : 1000;

  const watcher = new FileWatcher(projectRoot, { debounce });
  const analyzer = new IncrementalAnalyzer({ methodLevel: args.includes('-m') });

  // Handle file changes
  watcher.on('file:changed', async (event) => {
    console.log(`\n📝 File ${event.type}: ${event.relativePath}`);
    await analyzer.analyzeChange(event);
  });

  // Handle analysis complete
  analyzer.on('analysis:complete', (event) => {
    console.log(`   ✅ Analysis complete: ${event.analysis.tokens} tokens (${event.elapsed}ms)`);

    const stats = analyzer.getStats();
    console.log(
      `   📊 Total: ${stats.totalFiles} files, ${stats.totalTokens.toLocaleString()} tokens`
    );
  });

  // Handle file deletion
  analyzer.on('file:deleted', (event) => {
    console.log(`   🗑️  File deleted: ${event.file} (-${event.oldTokens} tokens)`);
  });

  // Start watching
  watcher.start();

  console.log('✅ Watch mode active');
  console.log('   Press Ctrl+C to stop\n');

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Stopping watch mode...');
    watcher.stop();
    process.exit(0);
  });
}

async function runWizard() {
  try {
    // Dynamic imports for ESM modules
    const ReactModule = await import('react');
    const React = ReactModule.default || ReactModule;
    const { render } = await import('ink');
    const Wizard = (await import('../lib/ui/wizard.js')).default;

    // Clear screen for clean wizard display
    console.clear();
    console.log('🧙 Starting interactive wizard...\n');

    const instance = render(
      React.createElement(Wizard, {
        onComplete: (answers) => {
          instance.unmount();

          console.log('\n✨ Wizard complete! Running analysis with your configuration...\n');

          // Show template info if profile is used
          if (answers.profile && answers.profile !== 'custom') {
            console.log(`📋 Using template: ${answers.profile}`);
            if (answers.profileMetadata) {
              console.log(`   Description: ${answers.profileMetadata.description}`);
            }
            console.log();
          }

          // Run analyzer with wizard configuration
          const options = {
            outputFormat: answers.outputFormat,
            useCase: answers.useCase,
            targetModel: answers.targetModel,
            projectRoot: process.cwd(),
            simple: true, // No export menu
            contextExport: true, // Auto-export to file
            template: answers.profile !== 'custom' ? answers.profile : null,
          };

          const analyzer = new TokenAnalyzer(options.projectRoot, options);
          analyzer.run();

          console.log('\n✅ Analysis complete! Context exported to llm-context.json\n');
        },
      })
    );
  } catch (error) {
    throw error; // Re-throw to be caught by main()
  }
}

async function runDashboard() {
  try {
    // Dynamic imports for ESM modules
    const ReactModule = await import('react');
    const React = ReactModule.default || ReactModule;
    const { render } = await import('ink');
    const Dashboard = (await import('../lib/ui/dashboard.js')).default;

    // Clear console and show loading message
    console.clear();
    console.log('📊 Analyzing project for dashboard...\n');

    // Run analyzer silently (no console output)
    const originalLog = console.log;
    const logs = [];
    console.log = (...args) => logs.push(args); // Capture logs

    const analyzer = new TokenAnalyzer(process.cwd(), {
      simple: true,
      verbose: false,
      dashboard: true, // Skip export handling
    });
    const stats = analyzer.run();

    console.log = originalLog; // Restore console.log

    // Clear and render dashboard
    console.clear();

    const instance = render(
      React.createElement(Dashboard, {
        stats,
        topFiles: stats.largestFiles || [],
        status: 'complete',
        onExit: () => {
          instance.unmount();
          process.exit(0);
        },
      })
    );
  } catch (error) {
    throw error; // Re-throw to be caught by main()
  }
}

/**
 * Run init wizard for configuration setup (FEAT-001)
 * @param {string[]} args - Command line arguments
 */
async function runInitWizard(args) {
  try {
    const options = {
      force: args.includes('--force') || args.includes('-f'),
      minimal: args.includes('--minimal'),
      yes: args.includes('--yes') || args.includes('-y'),
    };

    // Dynamic imports for ESM modules
    const ReactModule = await import('react');
    const React = ReactModule.default || ReactModule;
    const { render } = await import('ink');
    const InitWizard = (await import('../lib/ui/init-wizard-ui.js')).default;

    // Clear screen for clean wizard display
    console.clear();

    // If --yes flag, skip interactive UI and use defaults
    if (options.yes || options.minimal) {
      console.log('🧙 Initializing ctxman configuration...\n');

      const ProjectDetector = (await import('../lib/wizards/project-detector.js')).default;
      const ConfigGenerator = (await import('../lib/wizards/config-generator.js')).default;

      const detector = new ProjectDetector(process.cwd());
      const generator = new ConfigGenerator(process.cwd());

      // Detect project type
      const projects = await detector.detect();

      let config;
      if (options.minimal) {
        config = {
          contextignore: ['node_modules/', '.git/', 'dist/', 'build/', 'coverage/'],
          contextinclude: ['src/**', 'lib/**'],
          methodinclude: [],
        };
      } else {
        const types = projects.map((p) => p.type);
        config = detector.getMergedConfig(types);
      }

      // Generate config files
      const result = generator.generate(config, {
        force: options.force,
        minimal: options.minimal,
      });

      // Display results
      console.log('Configuration generated:\n');
      result.created.forEach((f) => console.log(`  ✓ Created ${f.filename}`));
      result.overwritten.forEach((f) => console.log(`  ✓ Updated ${f.filename}`));
      result.skipped.forEach((f) => console.log(`  ⊘ Skipped ${f.filename} (${f.reason})`));

      console.log('\n✅ Configuration complete! Try: ctxman --cli\n');
      return;
    }

    // Interactive wizard
    const instance = render(
      React.createElement(InitWizard, {
        options,
        onComplete: (result) => {
          instance.unmount();

          if (result) {
            console.log('\n✅ Configuration complete!\n');
          }
        },
      })
    );
  } catch (error) {
    console.error('❌ Init wizard failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Run cost estimation for all LLM providers (FEAT-010)
 * @param {string[]} args - Command line arguments
 */
function runCostEstimation(_args) {
  console.log('💰 LLM Cost Estimator');
  console.log('═'.repeat(60));
  console.log();
  console.log('📊 Analyzing repository...');
  console.log();

  // Run analyzer silently (no console output)
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args); // Capture logs

  const analyzer = new TokenAnalyzer(process.cwd(), {
    simple: true,
    verbose: false,
    dashboard: true, // Skip export handling
  });
  const stats = analyzer.run();

  console.log = originalLog; // Restore console.log

  if (!stats || !stats.totalTokens) {
    console.error('❌ Failed to analyze repository');
    process.exit(1);
  }

  // Create cost estimator
  const estimator = new LLMCostEstimator(stats.totalTokens);

  // Get comparisons and recommendation
  const comparisons = estimator.compareAll();
  const recommendation = estimator.getRecommendation(comparisons);

  // Display formatted output
  console.log(estimator.formatEstimates(comparisons, recommendation));
}

/**
 * Add a repository to multi-repo configuration (FEAT-006)
 * @param {string[]} args - Command line arguments
 */
function addRepo(args) {
  const repoIndex = args.findIndex((arg) => arg === '--add-repo');
  const repoPath = repoIndex !== -1 && args[repoIndex + 1] ? args[repoIndex + 1] : null;

  if (!repoPath) {
    console.error('❌ Repository path required');
    console.error('   Usage: ctxman --add-repo <path>');
    console.error('   Example: ctxman --add-repo ../frontend-app');
    process.exit(1);
  }

  const manager = new MultiRepoManager(process.cwd());

  // Parse optional alias from --alias flag
  const aliasIndex = args.findIndex((arg) => arg === '--alias');
  const alias = aliasIndex !== -1 && args[aliasIndex + 1] ? args[aliasIndex + 1] : null;

  try {
    const repo = manager.addRepo(repoPath, { alias });
    console.log(`\n✅ Added repository: ${repo.alias}`);
    console.log(`   Path: ${repo.path}`);
    console.log(`   ID: ${repo.id}\n`);
  } catch (error) {
    console.error(`❌ Failed to add repository: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Remove a repository from multi-repo configuration (FEAT-006)
 * @param {string[]} args - Command line arguments
 */
function removeRepo(args) {
  const repoIndex = args.findIndex((arg) => arg === '--remove-repo');
  const repoPath = repoIndex !== -1 && args[repoIndex + 1] ? args[repoIndex + 1] : null;

  if (!repoPath) {
    console.error('❌ Repository path required');
    console.error('   Usage: ctxman --remove-repo <path>');
    console.error('   Example: ctxman --remove-repo ../frontend-app');
    process.exit(1);
  }

  const manager = new MultiRepoManager(process.cwd());

  if (manager.removeRepo(repoPath)) {
    console.log(`\n✅ Removed repository: ${repoPath}\n`);
  } else {
    console.error(`❌ Repository not found: ${repoPath}`);
    console.error('   Use --list-repos to see configured repositories.');
    process.exit(1);
  }
}

/**
 * List all configured repositories (FEAT-006)
 */
function listRepos() {
  const manager = new MultiRepoManager(process.cwd());
  console.log(manager.formatList());
}

/**
 * Run multi-repository analysis (FEAT-006)
 * @param {object} options - Analysis options
 */
async function runMultiRepoAnalysis(options) {
  console.log('🔀 Multi-Repository Context Analysis');
  console.log('═'.repeat(60));
  console.log();

  const manager = new MultiRepoManager(process.cwd());
  const repos = manager.listRepos();

  if (repos.length === 0) {
    console.log('⚠️  No repositories configured.');
    console.log();
    console.log('   Add repositories with:');
    console.log('   ctxman --add-repo <path>');
    console.log();
    console.log('   Example:');
    console.log('   ctxman --add-repo ../frontend');
    console.log('   ctxman --add-repo ../api --alias "API Service"');
    console.log();
    return;
  }

  console.log(`📊 Analyzing ${repos.length} repositories...\n`);

  // Run analysis
  const results = manager.analyzeAll(options);

  // Display results
  console.log(manager.formatResults(results));

  // Generate GitIngest digest if requested
  if (options.gitingest) {
    console.log('\n📝 Generating GitIngest digest...\n');
    await generateMultiRepoDigest(results, options);
  }
}

/**
 * Generate GitIngest digest for multi-repo results
 * @param {object} results - Multi-repo analysis results
 * @param {object} options - Generation options
 */
async function generateMultiRepoDigest(results, _options) {
  const fs = await import('fs');
  const path = await import('path');

  let digest = `# Multi-Repository Context\n\n`;
  digest += `Generated: ${new Date().toISOString()}\n\n`;

  // Repository summary
  digest += `## Repository Summary\n\n`;
  digest += `| Repository | Files | Tokens | % of Total |\n`;
  digest += `|------------|-------|--------|------------|\n`;

  for (const repo of results.repos) {
    if (!repo.error) {
      digest += `| ${repo.alias} | ${repo.files.toLocaleString()} | ${repo.tokens.toLocaleString()} | ${repo.percentage}% |\n`;
    }
  }

  digest += `| **Total** | **${results.combined.totalFiles.toLocaleString()}** | **${results.combined.totalTokens.toLocaleString()}** | **100%** |\n\n`;

  // File contents per repository
  digest += `## Repository Contents\n\n`;

  for (const repo of results.repos) {
    if (repo.error) continue;

    digest += `### ${repo.alias}\n\n`;

    // Read and include file contents
    const repoPath = repo.resolvedPath;
    if (fs.existsSync(repoPath)) {
      digest += `Path: ${repo.path}\n\n`;
      digest += `Files: ${repo.files}, Tokens: ${repo.tokens.toLocaleString()}\n\n`;
    }
  }

  // Write digest
  const outputPath = path.join(process.cwd(), 'digest.txt');
  fs.writeFileSync(outputPath, digest);
  console.log(`📁 Generated digest: ${outputPath}\n`);
}

/**
 * Run AI-powered context suggestions (FEAT-005)
 * @param {string[]} args - Command line arguments
 */
async function runAISuggest(args) {
  const json = args.includes('--json');
  // With --json, stdout carries only the JSON document
  const info = json ? console.error : console.log;

  info('🤖 AI Context Suggestions');
  info('═'.repeat(60));
  info();
  info('📊 Analyzing repository for optimization opportunities...');
  info();

  const verbose = args.includes('--verbose') || args.includes('-v');

  // Run analyzer silently (no console output)
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args); // Capture logs

  const analyzer = new TokenAnalyzer(process.cwd(), {
    simple: true,
    verbose: false,
    dashboard: true, // Skip export handling
  });
  const stats = analyzer.run();

  console.log = originalLog; // Restore console.log

  if (!stats || !stats.totalTokens) {
    console.error('❌ Failed to analyze repository');
    process.exit(1);
  }

  // Get the files array from stats
  const files = stats.largestFiles || [];

  // Create AI suggester
  const suggester = new AISuggester({
    projectRoot: process.cwd(),
    verbose,
    json,
  });

  // Run analysis and get suggestions; the suggester's logger writes through console.log
  console.log = info;
  const result = await suggester.analyze(stats, files);
  console.log = originalLog;

  // Display formatted output
  console.log(suggester.formatOutput(result));

  // Save report if requested
  if (args.includes('--save-report') || args.includes('-s')) {
    const reportPath = resolve(process.cwd(), 'ai-suggestions-report.json');
    const fs = await import('fs');
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
    info(`💾 Report saved to: ai-suggestions-report.json`);
  }
}

function runFormatConversion(args) {
  // v2.3.2: Format conversion utility
  const converter = new FormatConverter();

  // Parse arguments
  const fromIndex = args.findIndex((arg) => arg === '--from');
  const toIndex = args.findIndex((arg) => arg === '--to');
  const inputIndex = args.findIndex((arg) => arg === 'convert') + 1;

  if (fromIndex === -1 || toIndex === -1) {
    console.error('❌ Format conversion requires --from and --to flags');
    console.error('   Usage: ctxman convert input.json --from json --to toon');
    process.exit(1);
  }

  const inputFile = args[inputIndex];
  const fromFormat = args[fromIndex + 1];
  const toFormat = args[toIndex + 1];

  if (!inputFile) {
    console.error('❌ No input file specified');
    process.exit(1);
  }

  // Generate output filename
  const outputFile = inputFile.replace(/\.[^.]+$/, `.${toFormat}`);

  console.log('🔄 Converting formats...');
  console.log(`   Input:  ${inputFile} (${fromFormat})`);
  console.log(`   Output: ${outputFile} (${toFormat})`);
  console.log();

  try {
    const result = converter.convertFile(inputFile, outputFile, fromFormat, toFormat);

    console.log('✅ Conversion successful!');
    console.log(`   Input size:  ${result.inputSize.toLocaleString()} chars`);
    console.log(`   Output size: ${result.outputSize.toLocaleString()} chars`);
    console.log(`   Savings:     ${result.savingsPercent} (${result.savings} chars)`);
    console.log(`   Output file: ${result.outputFile}`);
  } catch (error) {
    console.error('❌ Conversion failed:', error.message);
    process.exit(1);
  }
}

/**
 * Create a snapshot (FEAT-003)
 * @param {string[]} args - Command line arguments
 */
async function runSnapshot(args) {
  console.log('📸 Creating Snapshot');
  console.log('═'.repeat(60));
  console.log();

  // Get message from arguments
  const snapshotIndex = args.findIndex((arg) => arg === '--snapshot');
  let message = '';
  if (snapshotIndex !== -1 && args[snapshotIndex + 1] && !args[snapshotIndex + 1].startsWith('-')) {
    message = args[snapshotIndex + 1];
  }

  // Run analyzer silently
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args);

  const analyzer = new TokenAnalyzer(process.cwd(), {
    simple: true,
    verbose: false,
    dashboard: true,
  });
  const stats = analyzer.run();

  console.log = originalLog;

  if (!stats || !stats.totalTokens) {
    console.error('❌ Failed to analyze repository');
    process.exit(1);
  }

  // Create snapshot
  const manager = new SnapshotManager(process.cwd());
  const { id, snapshot } = await manager.createSnapshot(stats, message);

  // Format output
  console.log('\n📸 Snapshot created:', id);
  console.log('   Files:', snapshot.summary.totalFiles.toLocaleString());
  console.log('   Tokens:', snapshot.summary.totalTokens.toLocaleString());
  if (message) {
    console.log('   Message:', message);
  }
  console.log();
}

/**
 * List all snapshots (FEAT-003)
 */
async function listSnapshots() {
  const manager = new SnapshotManager(process.cwd());
  const output = await manager.listSnapshots();
  console.log(output);
}

/**
 * Compare with last snapshot (FEAT-003)
 * @param {string[]} args - Command line arguments
 */
async function runDiffLast(args) {
  const json = args.includes('--json');
  // With --json, stdout carries only the JSON document
  const info = json ? console.error : console.log;

  info('📊 Comparing with Last Snapshot');
  info('═'.repeat(60));
  info();

  // Run current analysis
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args);

  const analyzer = new TokenAnalyzer(process.cwd(), {
    simple: true,
    verbose: false,
    dashboard: true,
  });
  const stats = analyzer.run();

  console.log = originalLog;

  if (!stats || !stats.totalTokens) {
    console.error('❌ Failed to analyze repository');
    process.exit(1);
  }

  // Compare with last snapshot
  const manager = new SnapshotManager(process.cwd());
  const comparison = await manager.compareWithLast(stats);

  if (!comparison) {
    info('\n⚠️  No previous snapshots found.');
    info('   Create one with: ctxman --snapshot "message"\n');
    return;
  }

  if (json) {
    console.log(JSON.stringify(comparison, null, 2));
  } else {
    console.log(manager.formatDiff(comparison));
  }
}

/**
 * Compare two specific snapshots (FEAT-003)
 * @param {string[]} args - Command line arguments
 */
async function runDiffSnapshot(args) {
  const diffIndex = args.findIndex((arg) => arg === '--diff-snapshot');
  const id1 = diffIndex !== -1 && args[diffIndex + 1] ? args[diffIndex + 1] : null;
  const id2 = diffIndex !== -1 && args[diffIndex + 2] ? args[diffIndex + 2] : null;

  const json = args.includes('--json');

  if (!id1 || !id2) {
    console.error('❌ Two snapshot IDs required');
    console.error('   Usage: ctxman --diff-snapshot <id1> <id2>');
    console.error('   Example: ctxman --diff-snapshot snap-001 snap-002');
    process.exit(1);
  }

  const manager = new SnapshotManager(process.cwd());
  const comparison = await manager.compareSnapshots(id1, id2);

  if (!comparison) {
    console.error('❌ One or both snapshots not found');
    console.error(`   ID1: ${id1}`);
    console.error(`   ID2: ${id2}`);
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(comparison, null, 2));
  } else {
    console.log(manager.formatDiff(comparison));
  }
}

/**
 * Show snapshot trend (FEAT-003)
 * @param {string[]} args - Command line arguments
 */
async function runSnapshotTrend(args) {
  const json = args.includes('--json');
  // With --json, stdout carries only the JSON document
  const info = json ? console.error : console.log;

  info('📈 Snapshot Trend Analysis');
  info('═'.repeat(60));
  info();

  const limitIndex = args.findIndex((arg) => arg === '--limit');
  const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : 10;

  const manager = new SnapshotManager(process.cwd());
  const trend = await manager.getTrend(limit);

  if (!trend) {
    info('\n⚠️  Need at least 2 snapshots for trend analysis.');
    info('   Create snapshots with: ctxman --snapshot "message"\n');
    return;
  }

  if (json) {
    console.log(JSON.stringify(trend, null, 2));
  } else {
    console.log(manager.formatTrend(trend));
  }
}

/**
 * List all context versions (FEAT-012)
 */
async function listVersions() {
  const manager = new ContextVersioning(process.cwd());
  console.log(await manager.listVersions());
}

/**
 * Restore a context version (FEAT-012)
 * @param {string[]} args - Command line arguments
 */
async function restoreVersion(args) {
  const restoreIndex = args.findIndex((arg) => arg === '--restore-version');
  const versionId = restoreIndex !== -1 && args[restoreIndex + 1] ? args[restoreIndex + 1] : null;

  if (!versionId) {
    console.error('❌ Version ID required');
    console.error('   Usage: ctxman --restore-version <id>');
    console.error('   Example: ctxman --restore-version ctx-v001');
    process.exit(1);
  }

  const manager = new ContextVersioning(process.cwd());
  const version = await manager.restoreVersion(versionId);

  if (!version) {
    console.error(`❌ Version not found: ${versionId}`);
    console.error('   Use --list-versions to see available versions.');
    process.exit(1);
  }

  console.log(`\n✅ Restored context version: ${versionId}`);
  console.log(`   Created: ${version.timestamp}`);
  console.log(`   Files: ${version.summary.totalFiles.toLocaleString()}`);
  console.log(`   Tokens: ${version.summary.totalTokens.toLocaleString()}`);
  if (version.config.targetModel) {
    console.log(`   Model: ${version.config.targetModel}`);
  }
  if (version.gitCommit) {
    console.log(`   Git: ${version.gitCommit}`);
  }
  console.log();

  // Export restored context to file
  const fs = await import('fs');
  const outputPath = 'restored-context.json';
  fs.writeFileSync(outputPath, JSON.stringify(version, null, 2));
  console.log(`📁 Saved to: ${outputPath}\n`);
}

/**
 * Compare two context versions (FEAT-012)
 * @param {string[]} args - Command line arguments
 */
async function compareVersions(args) {
  const compareIndex = args.findIndex((arg) => arg === '--compare-versions');
  const id1 = compareIndex !== -1 && args[compareIndex + 1] ? args[compareIndex + 1] : null;
  const id2 = compareIndex !== -1 && args[compareIndex + 2] ? args[compareIndex + 2] : null;

  if (!id1 || !id2) {
    console.error('❌ Two version IDs required');
    console.error('   Usage: ctxman --compare-versions <id1> <id2>');
    console.error('   Example: ctxman --compare-versions ctx-v001 ctx-v002');
    process.exit(1);
  }

  const manager = new ContextVersioning(process.cwd());
  const comparison = await manager.compareVersions(id1, id2);

  if (!comparison) {
    console.error('❌ One or both versions not found');
    console.error(`   ID1: ${id1}`);
    console.error(`   ID2: ${id2}`);
    process.exit(1);
  }

  const json = args.includes('--json');
  if (json) {
    console.log(JSON.stringify(comparison, null, 2));
  } else {
    console.log(manager.formatComparison(comparison));
  }
}

/**
 * Run dependency scan (FEAT-002)
 * @param {string[]} args - Command line arguments
 */
async function runDependencyScan(args) {
  console.log('📦 Dependency Context Scanner');
  console.log('═'.repeat(60));
  console.log();

  // Parse options
  const depthIndex = args.findIndex((arg) => arg === '--dependency-depth');
  const depth = depthIndex !== -1 && args[depthIndex + 1] ? parseInt(args[depthIndex + 1], 10) : 1;

  const includeTypes = args.includes('--include-types');
  const checkSecurity = args.includes('--check-security');

  try {
    // Initialize scanner
    const scanner = new DependencyScanner(process.cwd(), {
      depth,
      includeTypes,
      checkSecurity,
    });

    // Initialize import tracker
    const tracker = new ImportTracker(process.cwd());

    console.log('🔍 Scanning source files for imports...');
    const activeImports = tracker.trackImports();

    console.log(`📋 Found ${activeImports.length} actively imported packages`);
    console.log();

    console.log('🔍 Analyzing dependencies...');
    const analysis = await scanner.analyze(activeImports);

    // Display results
    console.log('═'.repeat(60));
    console.log('📊 DEPENDENCY ANALYSIS REPORT');
    console.log('═'.repeat(60));
    console.log();

    console.log(`Total dependencies: ${analysis.summary.totalDependencies}`);
    console.log(`Installed: ${analysis.summary.installedDependencies}`);
    console.log(`Missing: ${analysis.summary.missingDependencies}`);
    console.log(`Active in codebase: ${analysis.summary.activeDependencies}`);
    console.log(`Total tokens: ${analysis.summary.totalTokens.toLocaleString()}`);

    if (analysis.summary.securityIssues > 0) {
      console.log(`⚠️  Security issues: ${analysis.summary.securityIssues}`);
    }
    console.log();

    // Display table
    console.log('─'.repeat(80));
    console.log(
      'Package'.padEnd(30) +
        'Version'.padEnd(12) +
        'Tokens'.padStart(12) +
        'Status'.padStart(10) +
        'Security'.padStart(10)
    );
    console.log('─'.repeat(80));

    for (const dep of analysis.dependencies.slice(0, 20)) {
      const active = dep.active ? '✓' : ' ';
      const security = dep.security?.status || 'unknown';
      const securityIcon = security === 'ok' ? '✅' : security === 'review' ? '⚠️' : '❓';

      console.log(
        `${active} ${dep.name}`.substring(0, 30).padEnd(30) +
          dep.version.substring(0, 10).padEnd(12) +
          dep.tokens.toLocaleString().padStart(12) +
          dep.status.padStart(10) +
          securityIcon.padStart(8)
      );
    }

    if (analysis.dependencies.length > 20) {
      console.log(`... and ${analysis.dependencies.length - 20} more dependencies`);
    }
    console.log();

    // Display security alerts
    const securityIssues = analysis.dependencies.filter(
      (d) => d.security?.vulnerabilities?.length > 0
    );

    if (securityIssues.length > 0) {
      console.log('⚠️  SECURITY ALERTS:');
      console.log('─'.repeat(60));

      for (const dep of securityIssues) {
        for (const vuln of dep.security.vulnerabilities) {
          console.log(
            `  - ${dep.name}@${dep.version}: ${vuln.severity.toUpperCase()} - ${vuln.title}`
          );
          if (vuln.fixAvailable) {
            console.log(`    💡 Fix available - consider upgrading`);
          }
        }
      }
      console.log();
    }

    // Generate dependency context
    console.log('📄 Generating dependency context...');
    const context = scanner.generateContext(analysis, activeImports);

    // Write to file
    const outputPath = resolve(process.cwd(), 'dependency-context.json');
    const fs = await import('fs');
    fs.writeFileSync(outputPath, JSON.stringify(context, null, 2));

    const contextTokens = JSON.stringify(context).length / 4; // Rough estimate
    console.log(
      `✅ dependency-context.json created (~${Math.round(contextTokens).toLocaleString()} tokens)`
    );
    console.log(`   Active dependencies: ${analysis.summary.activeDependencies}`);
    console.log(
      `   Total tokens in dependencies: ${analysis.summary.totalTokens.toLocaleString()}`
    );
    console.log();

    // Display type definitions if extracted
    if (includeTypes && analysis.summary.typesExtracted > 0) {
      console.log(`📝 TypeScript definitions extracted: ${analysis.summary.typesExtracted} files`);
      console.log();
    }

    // Display largest dependencies
    if (analysis.summary.largestDependencies.length > 0) {
      console.log('🏆 LARGEST DEPENDENCIES BY TOKEN COUNT:');
      console.log('─'.repeat(40));
      for (const dep of analysis.summary.largestDependencies.slice(0, 5)) {
        console.log(`  ${dep.name.padEnd(25)} ${dep.tokens.toLocaleString().padStart(10)} tokens`);
      }
      console.log();
    }
  } catch (error) {
    console.error('❌ Dependency scan failed:', error.message);
    console.error();
    console.error('Make sure you are in a Node.js project with package.json and node_modules.');
    process.exit(1);
  }
}

/**
 * Run performance dashboard (FEAT-001)
 * @param {string[]} args - Command line arguments
 */
async function runPerfDashboard(args) {
  console.log('📊 Ctxman Performance Dashboard');
  console.log('═'.repeat(60));
  console.log();

  // Parse period argument
  const periodIndex = args.findIndex((arg) => arg === '--period');
  const period = periodIndex !== -1 && args[periodIndex + 1] ? args[periodIndex + 1] : '7d';

  // Dynamic import for PerformanceDashboard
  const { PerformanceDashboard } = await import('../lib/analyzers/performance-dashboard.js');

  const dashboard = new PerformanceDashboard({
    projectRoot: process.cwd(),
  });

  // Run current analysis first to collect fresh metrics
  console.log('🔄 Running analysis to collect current metrics...');
  console.log();

  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args);

  try {
    await dashboard.runAnalysis();
  } catch (_error) {
    // Continue even if analysis fails - we may have historical data
  }

  console.log = originalLog;

  // Display the dashboard
  dashboard.display({ period });

  // Save report if requested
  if (args.includes('--save-report')) {
    const reportPath = resolve(process.cwd(), 'performance-report.txt');
    const fs = await import('fs');
    fs.writeFileSync(reportPath, dashboard.render({ period }));
    console.log(`💾 Report saved to: performance-report.txt`);
    console.log();
  }
}

/**
 * Create a context version automatically after CLI analysis (FEAT-012)
 * @param {object} stats - Analysis stats
 * @param {object} options - CLI options
 */
async function autoCreateVersion(stats, options) {
  const manager = new ContextVersioning(process.cwd());

  const config = {
    exclude: options.exclude || [],
    include: options.include || [],
    targetModel: options.targetModel || null,
  };

  const { id, version } = await manager.createVersion(stats, config, '');

  console.log(`\n📜 Context version created: ${id}`);
  console.log(`   Files: ${version.summary.totalFiles.toLocaleString()}`);
  console.log(`   Tokens: ${version.summary.totalTokens.toLocaleString()}`);
  if (version.gitCommit) {
    console.log(`   Git: ${version.gitCommit}`);
  }
  console.log();
}

// ESM entry point
main().catch((error) => {
  console.error('❌ Error:', error.message);
  // Exit codes:
  // 0: Success
  // 1: General error
  // 2: Validation/argument error
  process.exit(1);
});
