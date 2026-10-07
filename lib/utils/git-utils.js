/**
 * Git Integration Utilities
 * Handles GitHub URL parsing, repository cloning, and GitIngest generation
 * v2.3.6+
 */

import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import TokenCalculator from '../analyzers/token-calculator.js';
import GitIngestFormatter from '../formatters/gitingest-formatter.js';
import { isValidGitRef } from '../integrations/git/GitClient.js';

class GitUtils {
  constructor(options = {}) {
    this.tempDir = options.tempDir || path.join(process.cwd(), '.ctxman', 'temp');
    this.outputDir = options.outputDir || path.join(process.cwd(), 'docs');
    this.verbose = options.verbose || false;
  }

  /**
   * Parse GitHub URL and extract repo info
   */
  parseGitHubURL(url) {
    // Support various GitHub URL formats:
    // - https://github.com/owner/repo
    // - https://github.com/owner/repo.git
    // - git@github.com:owner/repo.git
    // - github.com/owner/repo
    // - owner/repo

    let cleanUrl = url.trim();

    // Remove git@ prefix
    if (cleanUrl.startsWith('git@')) {
      cleanUrl = cleanUrl.replace('git@github.com:', 'https://github.com/');
    }

    // Add https if missing
    if (!cleanUrl.startsWith('http')) {
      if (cleanUrl.includes('/')) {
        cleanUrl = `https://github.com/${cleanUrl}`;
      }
    }

    // Remove .git suffix
    cleanUrl = cleanUrl.replace(/\.git$/, '');

    // Parse URL
    try {
      const urlObj = new URL(cleanUrl);
      const pathParts = urlObj.pathname.split('/').filter((p) => p);

      if (pathParts.length < 2) {
        throw new Error('Invalid GitHub URL: must include owner and repo');
      }

      const owner = pathParts[0];
      const repo = pathParts[1];
      const branchFromUrl = Boolean(pathParts[3]); // /owner/repo/tree/<branch>
      const branch = pathParts[3] || 'main';

      return {
        owner,
        repo,
        branch,
        branchFromUrl,
        fullName: `${owner}/${repo}`,
        cloneUrl: `https://github.com/${owner}/${repo}.git`,
        apiUrl: `https://api.github.com/repos/${owner}/${repo}`,
        rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`,
        originalUrl: url,
      };
    } catch (error) {
      throw new Error(`Failed to parse GitHub URL: ${error.message}`);
    }
  }

  /**
   * Check if git is installed
   */
  isGitInstalled() {
    try {
      execSync('git --version', { stdio: 'pipe' });
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Clone repository to temp directory
   */
  cloneRepository(repoInfo, options = {}) {
    if (!this.isGitInstalled()) {
      throw new Error('Git is not installed. Please install git to use this feature.');
    }

    const { shallow = true, depth = 1 } = options;
    const repoPath = path.join(this.tempDir, repoInfo.fullName.replace('/', '-'));

    // Create temp directory
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Remove existing clone if present
    if (fs.existsSync(repoPath)) {
      if (this.verbose) {
        console.log(`♻️  Removing existing clone: ${repoPath}`);
      }
      fs.rmSync(repoPath, { recursive: true, force: true });
    }

    // Clone repository
    if (this.verbose) {
      console.log(`📥 Cloning ${repoInfo.fullName}...`);
    }

    if (repoInfo.branch && !isValidGitRef(repoInfo.branch)) {
      throw new Error(`Invalid branch name: ${JSON.stringify(repoInfo.branch)}`);
    }

    // Argument list, no shell. Option values are attached (`--branch=x`) so none of them
    // is a standalone argument, and `--` ends option parsing before the URL and path
    // Without a branch, git clones the remote's default branch
    const branchArgs = repoInfo.branch ? [`--branch=${repoInfo.branch}`] : [];
    const shallowArgs = shallow
      ? [`--depth=${Number.parseInt(depth, 10) || 1}`, '--single-branch', ...branchArgs]
      : branchArgs;
    const cloneArgs = ['clone', ...shallowArgs, '--', repoInfo.cloneUrl, repoPath];

    try {
      execFileSync('git', cloneArgs, {
        stdio: this.verbose ? 'inherit' : 'pipe',
      });

      if (this.verbose) {
        console.log(`✅ Repository cloned to: ${repoPath}`);
      }

      return repoPath;
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }

  /**
   * Generate GitIngest digest from GitHub URL
   */
  async generateFromGitHub(url, options = {}) {
    const { outputFile, cleanup = true, shallow = true, analyzerOptions = {} } = options;

    // Parse GitHub URL. An explicit branch wins, then one named in the URL (/tree/<branch>);
    // otherwise the clone uses the remote's default branch
    const repoInfo = this.parseGitHubURL(url);
    repoInfo.branch = options.branch || (repoInfo.branchFromUrl ? repoInfo.branch : null);
    console.log(`\n📦 Processing GitHub Repository: ${repoInfo.fullName}`);
    console.log(`   Branch: ${repoInfo.branch || '(default)'}`);

    // Clone repository
    console.log(`\n📥 Cloning repository...`);
    const repoPath = this.cloneRepository(repoInfo, { shallow });

    // Generate GitIngest digest
    console.log(`\n🔍 Analyzing repository...`);

    const analyzer = new TokenCalculator(repoPath, {
      verbose: this.verbose,
      ...analyzerOptions,
    });

    // Run analysis
    const results = analyzer.analyze();

    // Generate digest
    const formatter = new GitIngestFormatter(
      repoPath,
      analyzer.stats,
      results,
      options.formatterOptions || {}
    );

    // Determine output file
    const outputFileName =
      outputFile ||
      `${repoInfo.fullName.replace('/', '-')}-gitingest-${Date.now().toString(36)}.txt`;

    const outputPath = path.isAbsolute(outputFileName)
      ? outputFileName
      : path.join(this.outputDir, outputFileName);

    // Ensure output directory exists
    const outputDirPath = path.dirname(outputPath);
    if (!fs.existsSync(outputDirPath)) {
      fs.mkdirSync(outputDirPath, { recursive: true });
    }

    // Save digest (a chunked digest is written as one file per chunk)
    const digestLength = formatter.saveToFile(outputPath);

    const stats = {
      repository: repoInfo.fullName,
      branch: repoInfo.branch,
      url: repoInfo.originalUrl,
      localPath: repoPath,
      outputFile: formatter.chunkFiles.length ? formatter.chunkFiles[0] : outputPath,
      chunkFiles: formatter.chunkFiles,
      digestSize: digestLength,
      digestSizeKB: (digestLength / 1024).toFixed(2),
      files: analyzer.stats.totalFiles,
      tokens: analyzer.stats.totalTokens,
      lines: analyzer.stats.totalLines,
    };

    // Cleanup temp directory if requested
    if (cleanup) {
      console.log(`\n🧹 Cleaning up temporary files...`);
      fs.rmSync(repoPath, { recursive: true, force: true });
    }

    console.log(`\n✅ GitIngest digest generated!`);
    if (stats.chunkFiles.length) {
      console.log(`   Output: ${stats.chunkFiles.length} chunk files`);
      stats.chunkFiles.forEach((file) => console.log(`     ${file}`));
    } else {
      console.log(`   Output: ${outputPath}`);
    }
    console.log(`   Size: ${stats.digestSizeKB} KB`);
    console.log(`   Files: ${stats.files}`);
    console.log(`   Tokens: ${stats.tokens.toLocaleString()}`);

    return stats;
  }

  /**
   * Fetch file from GitHub raw URL (without cloning)
   */
  async fetchFileFromGitHub(url) {
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve(data);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        })
        .on('error', reject);
    });
  }

  /**
   * Get repository info from GitHub API
   */
  async getRepositoryInfo(repoInfo) {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'ctxman-git-utils',
        },
      };

      https
        .get(repoInfo.apiUrl, options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const repo = JSON.parse(data);
              if (res.statusCode !== 200) {
                reject(
                  new Error(`GitHub API returned ${res.statusCode}: ${repo.message || 'error'}`)
                );
                return;
              }
              resolve({
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                defaultBranch: repo.default_branch,
                size: repo.size,
                language: repo.language,
                updatedAt: repo.updated_at,
              });
            } catch (error) {
              reject(new Error(`Failed to parse GitHub API response: ${error.message}`));
            }
          });
        })
        .on('error', reject);
    });
  }

  /**
   * Cleanup temp directory
   */
  cleanupTemp() {
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
      if (this.verbose) {
        console.log(`🧹 Cleaned up: ${this.tempDir}`);
      }
    }
  }

  /**
   * List cached repositories
   */
  listCachedRepos() {
    if (!fs.existsSync(this.tempDir)) {
      return [];
    }

    return fs
      .readdirSync(this.tempDir)
      .filter((name) => fs.statSync(path.join(this.tempDir, name)).isDirectory())
      .map((name) => ({
        name,
        path: path.join(this.tempDir, name),
        size: this.getDirectorySize(path.join(this.tempDir, name)),
      }));
  }

  /**
   * Get directory size recursively
   */
  getDirectorySize(dir) {
    let size = 0;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        size += this.getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    }

    return size;
  }
}

export default GitUtils;
