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
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
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
        const gitArgs = args.filter(arg => arg !== 'github' && arg !== 'git');
        execSync(`node "${commandPath}" ${gitArgs.join(' ')}`, { stdio: 'inherit' });
        return;
    }

    // Check for RAG 'ask' mode (v3.1.0)
    if (args.includes('ask')) {
        const commandPath = resolve(__dirname, './cm-ask.js');
        const askArgs = args.filter(arg => arg !== 'ask');
        // Pass remaining args as the query
        execSync(`node "${commandPath}" "${askArgs.join(' ')}"`, { stdio: 'inherit' });
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
    const hasAnalysisFlags = args.some(arg =>
        arg.startsWith('-') &&
        arg !== '--cli' &&
        arg !== '--wizard' &&
        arg !== '--dashboard'
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
                targetModel: options.targetModel
            });

            // Merge template config with options (options take precedence)
            options = {
                ...options,
                templateConfig,
                // Use template's target model if not explicitly set
                targetModel: options.targetModel || templateConfig.targetModel
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
                targetModel: options.targetModel
            });

            // Merge profile config with options (options take precedence)
            options = {
                ...options,
                profileConfig,
                // Use profile's target model if not explicitly set
                targetModel: options.targetModel || profileConfig.targetModel,
                methodLevel: options.methodLevel || profileConfig.methodLevel
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

    printStartupInfo(options);

    const analyzer = new TokenAnalyzer(options.projectRoot, options);
    analyzer.run();
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

        // UI options (v2.3.0)
        simple: args.includes('--simple'),
        dashboard: args.includes('--dashboard'),

        // Chunking options (v2.3.0)
        chunking: {
            enabled: args.includes('--chunk'),
            strategy: getChunkStrategy(args),
            maxTokensPerChunk: getChunkSize(args)
        },

        projectRoot: process.cwd()
    };
}

function getOutputFormat(args) {
    const formatIndex = args.findIndex(arg => arg === '--output' || arg === '-o');
    if (formatIndex !== -1 && args[formatIndex + 1]) {
        return args[formatIndex + 1];
    }
    return 'toon'; // Default to TOON format in v2.3.0
}

function getChunkStrategy(args) {
    const strategyIndex = args.findIndex(arg => arg === '--chunk-strategy');
    if (strategyIndex !== -1 && args[strategyIndex + 1]) {
        return args[strategyIndex + 1];
    }
    return 'smart'; // Default strategy
}

function getChunkSize(args) {
    const sizeIndex = args.findIndex(arg => arg === '--chunk-size');
    if (sizeIndex !== -1 && args[sizeIndex + 1]) {
        return parseInt(args[sizeIndex + 1], 10);
    }
    return 100000; // Default 100k tokens
}

function getTargetModel(args) {
    // Check for explicit model flag
    const modelIndex = args.findIndex(arg => arg === '--target-model');
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
    models.forEach(model => {
        if (!byVendor[model.vendor]) {
            byVendor[model.vendor] = [];
        }
        byVendor[model.vendor].push(model);
    });

    // Display by vendor
    Object.entries(byVendor).forEach(([vendor, models]) => {
        console.log(`\n${vendor}:`);
        models.forEach(model => {
            const contextDisplay = model.contextWindow >= 1000000
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
    const hasOptions = options.outputFormat || options.methodLevel || options.chunking?.enabled ||
        options.saveReport || options.verbose || options.contextExport ||
        options.contextToClipboard || options.gitingest;

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
            console.log(`  Chunking: ${options.chunking.strategy} (${options.chunking.maxTokensPerChunk.toLocaleString()} tokens/chunk)`);
        }
        console.log();
    }
}

function printHelp() {
    console.log('Ctxman v3.0.0 - AI Development Platform with Plugin Architecture and Git Integration');
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
    console.log();
    console.log('Output Options (v2.3.0):');
    console.log('  -o, --output FORMAT      Output format (default: toon)');
    console.log('                           Formats: toon, json, yaml, csv, xml, markdown, gitingest');
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
        console.log(
            name.padEnd(15) +
            info.description.substring(0, 48).padEnd(50) +
            info.extension
        );
    }

    console.log();
    console.log('Usage: ctxman --output <format>');
    console.log('Example: ctxman --output toon --context-clipboard');
}

function getChangedSince(args) {
    const sinceIndex = args.findIndex(arg => arg === '--changed-since');
    if (sinceIndex !== -1 && args[sinceIndex + 1]) {
        return args[sinceIndex + 1];
    }
    return null;
}

function getTemplate(args) {
    const templateIndex = args.findIndex(arg => arg === '--template' || arg === '-t');
    if (templateIndex !== -1 && args[templateIndex + 1]) {
        return args[templateIndex + 1];
    }
    return null;
}

function getProfile(args) {
    const profileIndex = args.findIndex(arg => arg === '--profile');
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
    const profileIndex = args.findIndex(arg => arg === '--create-profile');
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
            methodLevel: false
        }
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
    const profileIndex = args.findIndex(arg => arg === '--export-profile');
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
    const portIndex = args.findIndex(arg => arg === '--port');
    const port = portIndex !== -1 && args[portIndex + 1]
        ? parseInt(args[portIndex + 1], 10)
        : 3000;

    const authTokenIndex = args.findIndex(arg => arg === '--auth-token');
    const authToken = authTokenIndex !== -1 && args[authTokenIndex + 1]
        ? args[authTokenIndex + 1]
        : null;

    const server = new APIServer({ port, authToken });

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

    // Analyze only changed files
    const analyzer = new TokenAnalyzer(options.projectRoot, {
        ...options,
        fileFilter: (filePath) => changes.changedFiles.includes(filePath)
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
        console.log(`   📊 Total: ${stats.totalFiles} files, ${stats.totalTokens.toLocaleString()} tokens`);
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
                        simple: true,      // No export menu
                        contextExport: true, // Auto-export to file
                        template: answers.profile !== 'custom' ? answers.profile : null
                    };

                    const analyzer = new TokenAnalyzer(options.projectRoot, options);
                    analyzer.run();

                    console.log('\n✅ Analysis complete! Context exported to llm-context.json\n');
                }
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
            dashboard: true // Skip export handling
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
                }
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
            yes: args.includes('--yes') || args.includes('-y')
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
                    methodinclude: []
                };
            } else {
                const types = projects.map(p => p.type);
                config = detector.getMergedConfig(types);
            }

            // Generate config files
            const result = generator.generate(config, {
                force: options.force,
                minimal: options.minimal
            });

            // Display results
            console.log('Configuration generated:\n');
            result.created.forEach(f => console.log(`  ✓ Created ${f.filename}`));
            result.overwritten.forEach(f => console.log(`  ✓ Updated ${f.filename}`));
            result.skipped.forEach(f => console.log(`  ⊘ Skipped ${f.filename} (${f.reason})`));

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
                }
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
function runCostEstimation(args) {
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
        dashboard: true // Skip export handling
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

function runFormatConversion(args) {
    // v2.3.2: Format conversion utility
    const converter = new FormatConverter();

    // Parse arguments
    const fromIndex = args.findIndex(arg => arg === '--from');
    const toIndex = args.findIndex(arg => arg === '--to');
    const inputIndex = args.findIndex(arg => arg === 'convert') + 1;

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

// ESM entry point
main().catch(error => {
    console.error('❌ Error:', error.message);
    // Exit codes:
    // 0: Success
    // 1: General error
    // 2: Validation/argument error
    process.exit(1);
});
