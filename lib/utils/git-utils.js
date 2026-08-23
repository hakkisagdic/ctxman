/**
 * Git Integration Utilities
 * Handles GitHub URL parsing, repository cloning, and GitIngest generation
 * v2.3.6+
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import TokenCalculator from '../analyzers/token-calculator.js';
import GitIngestFormatter from '../formatters/gitingest-formatter.js';

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
      const branch = pathParts[3] || 'main'; // If /tree/branch specified

      return {
        owner,
        repo,
        branch,
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

    const cloneCommand = shallow
      ? `git clone --depth ${depth} --single-branch --branch ${repoInfo.branch} ${repoInfo.cloneUrl} "${repoPath}"`
      : `git clone ${repoInfo.cloneUrl} "${repoPath}"`;

    try {
      execSync(cloneCommand, {
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

    // Parse GitHub URL
    const repoInfo = this.parseGitHubURL(url);
    console.log(`\n📦 Processing GitHub Repository: ${repoInfo.fullName}`);
    console.log(`   Branch: ${repoInfo.branch}`);

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

    const digest = formatter.generateDigest();

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

    // Save digest
    fs.writeFileSync(outputPath, digest, 'utf8');

    const stats = {
      repository: repoInfo.fullName,
      branch: repoInfo.branch,
      url: repoInfo.originalUrl,
      localPath: repoPath,
      outputFile: outputPath,
      digestSize: digest.length,
      digestSizeKB: (digest.length / 1024).toFixed(2),
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
    console.log(`   Output: ${outputPath}`);
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
