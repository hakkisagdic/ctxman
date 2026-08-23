#!/usr/bin/env node

/**
 * Ctxman - Main Orchestrator
 * LLM context optimization with method-level filtering and GitIngest support
 */

import fs from 'fs';
import path from 'path';
import TokenCalculator from './lib/analyzers/token-calculator.js';
import GitIngestFormatter from './lib/formatters/gitingest-formatter.js';
import TokenUtils from './lib/utils/token-utils.js';

/**
 * Generate GitIngest digest from token-analysis-report.json
 */
function generateDigestFromReport(reportPath) {
  console.log('📄 Loading token analysis report...');

  if (!fs.existsSync(reportPath)) {
    console.error(`❌ Error: Report file not found: ${reportPath}`);
    process.exit(1);
  }

  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    if (!report.metadata || !report.summary || !report.files) {
      console.error('❌ Error: Invalid report format. Missing required fields.');
      process.exit(1);
    }

    const projectRoot = report.metadata.projectRoot || process.cwd();

    console.log(`✅ Report loaded: ${report.files.length} files`);
    console.log('📄 Generating GitIngest digest from report...\n');

    const formatter = new GitIngestFormatter(projectRoot, report.summary, report.files);

    const digestPath = path.join(process.cwd(), 'digest.txt');
    const digestSize = formatter.saveToFile(digestPath);

    console.log(`💾 GitIngest digest saved to: digest.txt`);
    console.log(`📊 Digest size: ${(digestSize / 1024).toFixed(1)} KB`);
    console.log(`✨ Generated from: ${path.basename(reportPath)}`);
  } catch (error) {
    console.error(`❌ Error processing report: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Generate GitIngest digest from llm-context.json
 */
function generateDigestFromContext(contextPath) {
  console.log('📄 Loading LLM context file...');

  if (!fs.existsSync(contextPath)) {
    console.error(`❌ Error: Context file not found: ${contextPath}`);
    process.exit(1);
  }

  try {
    const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));

    if (!context.project || !context.paths) {
      console.error('❌ Error: Invalid context format. Missing required fields.');
      process.exit(1);
    }

    console.log(`✅ Context loaded: ${context.project.totalFiles} files`);
    console.log('📄 Generating GitIngest digest from context...\n');

    // Extract files from context.paths structure
    const files = [];
    for (const [dirPath, fileNames] of Object.entries(context.paths)) {
      for (const fileName of fileNames) {
        const relativePath = dirPath === '/' ? fileName : `${dirPath}${fileName}`;

        const fullPath = path.join(process.cwd(), relativePath);

        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          files.push({
            path: fullPath,
            relativePath: relativePath,
            sizeBytes: stats.size,
            tokens: 0,
            lines: 0,
          });
        }
      }
    }

    console.log(`📁 Found ${files.length} accessible files`);

    const stats = {
      totalFiles: files.length,
      totalTokens: context.project.totalTokens,
      totalBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
      totalLines: 0,
    };

    const formatter = new GitIngestFormatter(process.cwd(), stats, files);

    const digestPath = path.join(process.cwd(), 'digest.txt');
    const digestSize = formatter.saveToFile(digestPath);

    console.log(`💾 GitIngest digest saved to: digest.txt`);
    console.log(`📊 Digest size: ${(digestSize / 1024).toFixed(1)} KB`);
    console.log(`✨ Generated from: ${path.basename(contextPath)}`);
  } catch (error) {
    console.error(`❌ Error processing context: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main execution
 */
async function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  // Handle --gitingest-from-report
  const reportFlagIndex = args.indexOf('--gitingest-from-report');
  if (reportFlagIndex !== -1) {
    const reportPath = args[reportFlagIndex + 1] || 'token-analysis-report.json';
    generateDigestFromReport(reportPath);
    return;
  }

  // Handle --gitingest-from-context
  const contextFlagIndex = args.indexOf('--gitingest-from-context');
  if (contextFlagIndex !== -1) {
    const contextPath = args[contextFlagIndex + 1] || 'llm-context.json';
    generateDigestFromContext(contextPath);
    return;
  }

  const options = {
    saveReport: args.includes('--save-report') || args.includes('-s'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    contextExport: args.includes('--context-export'),
    contextToClipboard: args.includes('--context-clipboard'),
    methodLevel: args.includes('--method-level') || args.includes('-m'),
    gitingest: args.includes('--gitingest') || args.includes('-g'),
  };

  printStartupInfo();

  const calculator = new TokenCalculator(process.cwd(), options);
  await calculator.run();
}

function printStartupInfo() {
  console.log('🚀 Code Analyzer by Hakkı Sağdıç');
  console.log('='.repeat(50));
  console.log('📋 Available options:');
  console.log('  --save-report, -s     Save detailed JSON report');
  console.log('  --verbose, -v         Show included files and directories');
  console.log('  --context-export      Generate LLM context file list');
  console.log('  --context-clipboard   Copy context to clipboard');
  console.log('  --method-level, -m    Enable method-level analysis');
  console.log('  --gitingest, -g       Generate GitIngest-style digest');
  console.log('  --help, -h           Show this help message');

  if (!TokenUtils.hasExactCounting()) {
    console.log('\n💡 For exact token counts, install tiktoken: npm install tiktoken');
  }
  console.log();
}

function printHelp() {
  console.log('Ctxman - LLM context optimization with method-level filtering');
  console.log();
  console.log('Usage: ctxman [options]');
  console.log('       node ctxman.js [options]  # Direct usage');
  console.log();
  console.log('Options:');
  console.log('  -s, --save-report                    Save detailed JSON report');
  console.log('  -v, --verbose                        Show all included files');
  console.log('  --context-export                     Generate LLM context file');
  console.log('  --context-clipboard                  Copy context to clipboard');
  console.log('  -m, --method-level                   Enable method-level analysis');
  console.log('  -g, --gitingest                      Generate GitIngest-style digest');
  console.log('  --gitingest-from-report <file>       Generate digest from report JSON');
  console.log('  --gitingest-from-context <file>      Generate digest from context JSON');
  console.log('  -h, --help                           Show this help');
  console.log();
  console.log('Method-level Configuration:');
  console.log('  .methodinclude                       Include only specified methods');
  console.log('  .methodignore                        Exclude specified methods');
  console.log();
  console.log('Examples:');
  console.log('  # Standard workflow');
  console.log('  ctxman                      # Interactive export selection');
  console.log('  ctxman --save-report        # Save JSON report');
  console.log('  ctxman --gitingest          # Generate digest.txt');
  console.log('  ctxman -g -s                # Both digest + report');
  console.log();
  console.log('  # Generate digest from existing JSON files (fast, no re-scan)');
  console.log('  ctxman --gitingest-from-report token-analysis-report.json');
  console.log('  ctxman --gitingest-from-context llm-context.json');
  console.log();
  console.log('  # Two-step workflow');
  console.log('  ctxman -s                   # Step 1: Analyze and save report');
  console.log('  ctxman --gitingest-from-report token-analysis-report.json');
  console.log('                                       # Step 2: Generate digest (instant)');
}

// ESM entry point check
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { TokenCalculator, generateDigestFromReport, generateDigestFromContext, main };
