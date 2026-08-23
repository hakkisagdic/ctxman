#!/usr/bin/env node
/**
 * GitHub GitIngest Command
 * Generate GitIngest digest from GitHub repositories
 */

const GitUtils = require('../lib/utils/git-utils');
const { getLogger } = require('../lib/utils/logger');

const logger = getLogger({ level: 'info' });

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const url = args[0];
  const verbose = args.includes('--verbose') || args.includes('-v');
  const keepClone = args.includes('--keep-clone');
  const shallow = !args.includes('--full-clone');

  // Parse options
  const outputIndex = args.findIndex((arg) => arg === '--output' || arg === '-o');
  const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : null;

  const branchIndex = args.findIndex((arg) => arg === '--branch' || arg === '-b');
  const branch = branchIndex !== -1 ? args[branchIndex + 1] : 'main';

  const chunkSize = args.includes('--chunk-size')
    ? parseInt(args[args.findIndex((arg) => arg === '--chunk-size') + 1])
    : null;

  try {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║        GitHub GitIngest Generator v2.3.6              ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const gitUtils = new GitUtils({
      verbose,
      outputDir: 'docs',
    });

    // Get repository info first
    console.log('📋 Fetching repository information...');
    const repoInfo = gitUtils.parseGitHubURL(url);
    repoInfo.branch = branch; // Override branch if specified

    const repoData = await gitUtils.getRepositoryInfo(repoInfo);
    console.log(`\n📊 Repository Info:`);
    console.log(`   Name: ${repoData.fullName}`);
    console.log(`   Description: ${repoData.description || 'N/A'}`);
    console.log(`   Stars: ⭐ ${repoData.stars.toLocaleString()}`);
    console.log(`   Language: ${repoData.language || 'Multiple'}`);
    console.log(`   Default Branch: ${repoData.defaultBranch}`);

    // Generate GitIngest
    const options = {
      outputFile,
      cleanup: !keepClone,
      shallow,
      formatterOptions: chunkSize
        ? {
            chunking: {
              enabled: true,
              maxTokensPerChunk: chunkSize,
            },
          }
        : {},
    };

    const stats = await gitUtils.generateFromGitHub(url, options);

    // Log to file
    logger.info('GitHub GitIngest generated', {
      repository: stats.repository,
      outputFile: stats.outputFile,
      files: stats.files,
      tokens: stats.tokens,
    });

    console.log('\n✅ Complete!\n');

    // Show next steps
    console.log('📝 Next steps:');
    console.log(`   1. View digest: cat "${stats.outputFile}"`);
    console.log(`   2. Use in LLM: Copy to clipboard`);
    console.log(`   3. Cleanup: npm run clean\n`);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    logger.error('GitHub GitIngest failed', { error: error.message });
    process.exit(1);
  }
}

function printHelp() {
  console.log('GitHub GitIngest Generator - Generate digest from GitHub repositories\n');
  console.log('Usage: ctxman github <url> [options]\n');
  console.log('Arguments:');
  console.log('  url                      GitHub repository URL or owner/repo\n');
  console.log('Options:');
  console.log(
    '  -o, --output FILE        Output file path (default: docs/{repo}-gitingest-{hash}.txt)'
  );
  console.log('  -b, --branch BRANCH      Branch to clone (default: main)');
  console.log('  -v, --verbose            Verbose output');
  console.log("  --keep-clone             Keep cloned repository (don't cleanup)");
  console.log('  --full-clone             Full clone (default: shallow)');
  console.log('  --chunk-size TOKENS      Enable chunking with max tokens per chunk');
  console.log('  -h, --help               Show this help\n');
  console.log('URL Formats:');
  console.log('  https://github.com/owner/repo');
  console.log('  https://github.com/owner/repo.git');
  console.log('  git@github.com:owner/repo.git');
  console.log('  github.com/owner/repo');
  console.log('  owner/repo\n');
  console.log('Examples:');
  console.log('  # Basic usage');
  console.log('  ctxman github https://github.com/facebook/react\n');
  console.log('  # Short format');
  console.log('  ctxman github facebook/react\n');
  console.log('  # Specific branch');
  console.log('  ctxman github vercel/next.js --branch canary\n');
  console.log('  # Custom output location');
  console.log('  ctxman github angular/angular -o docs/angular-digest.txt\n');
  console.log('  # With chunking');
  console.log('  ctxman github microsoft/vscode --chunk-size 100000\n');
  console.log('  # Keep clone for inspection');
  console.log('  ctxman github nodejs/node --keep-clone --verbose\n');
  console.log('Output:');
  console.log('  Generated digest file in docs/ directory');
  console.log('  Automatic cleanup of temporary clone (unless --keep-clone)\n');
}

main();
