/**
 * Dependency Scanner - Analyzes node_modules for token impact
 * v3.0.0 - FEAT-002
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import TokenUtils from '../utils/token-utils.js';
import FileUtils from '../utils/file-utils.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('DependencyScanner');

/**
 * DependencyScanner class
 * Analyzes node_modules for token impact, tracks imports, and checks security
 */
export class DependencyScanner {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      depth: options.depth || 1,
      includeTypes: options.includeTypes || false,
      checkSecurity: options.checkSecurity !== false,
      ...options
    };
    this.packageJson = null;
    this.stats = {
      totalDependencies: 0,
      activeDependencies: 0,
      totalTokens: 0,
      securityIssues: 0,
      typesExtracted: 0
    };
  }

  /**
   * Load and parse package.json
   */
  loadPackageJson() {
    // Return cached value if already loaded
    if (this.packageJson) {
      return this.packageJson;
    }
    
    const packagePath = path.join(this.projectRoot, 'package.json');
    
    if (!fs.existsSync(packagePath)) {
      throw new Error('No package.json found in project root');
    }

    try {
      const content = fs.readFileSync(packagePath, 'utf-8');
      this.packageJson = JSON.parse(content);
      return this.packageJson;
    } catch (error) {
      throw new Error(`Failed to parse package.json: ${error.message}`);
    }
  }

  /**
   * Get all dependencies (dependencies + devDependencies)
   */
  getAllDependencies() {
    if (!this.packageJson) {
      this.loadPackageJson();
    }

    const deps = {
      ...this.packageJson.dependencies,
      ...this.packageJson.devDependencies
    };

    return deps;
  }

  /**
   * Find the path to a dependency in node_modules
   * Supports both npm and pnpm directory structures
   */
  findDependencyPath(packageName) {
    const possiblePaths = [
      // Standard npm structure
      path.join(this.projectRoot, 'node_modules', packageName),
      // pnpm structure (node_modules/.pnpm/package@version/node_modules/package)
      path.join(this.projectRoot, 'node_modules', '.pnpm')
    ];

    // Check standard npm path first
    if (fs.existsSync(possiblePaths[0])) {
      return possiblePaths[0];
    }

    // For pnpm, we need to search in .pnpm directory
    const pnpmDir = possiblePaths[1];
    if (fs.existsSync(pnpmDir)) {
      // Look for package directories matching the pattern package@version
      const entries = fs.readdirSync(pnpmDir);
      for (const entry of entries) {
        if (entry.startsWith(packageName + '@') || entry.includes('/' + packageName + '@')) {
          // Handle scoped packages (e.g., @babel/core -> @babel+core@version)
          const pnpmPkgPath = path.join(pnpmDir, entry, 'node_modules', packageName);
          if (fs.existsSync(pnpmPkgPath)) {
            return pnpmPkgPath;
          }
        }
      }
    }

    return null;
  }

  /**
   * Get the installed version of a package
   */
  getInstalledVersion(packageName, depPath) {
    try {
      const pkgJsonPath = path.join(depPath, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        return pkgJson.version || 'unknown';
      }
    } catch (error) {
      logger.warn(`Could not read version for ${packageName}: ${error.message}`);
    }
    return 'unknown';
  }

  /**
   * Scan a dependency directory and count tokens
   */
  scanDependencyTokens(depPath) {
    let totalTokens = 0;
    let fileCount = 0;
    const startTime = Date.now();
    const maxTime = 5000; // 5 second timeout per dependency

    const scanDir = (dir) => {
      // Check timeout
      if (Date.now() - startTime > maxTime) {
        return;
      }

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          // Check timeout in loop
          if (Date.now() - startTime > maxTime) {
            break;
          }
          
          const fullPath = path.join(dir, entry.name);
          
          // Skip common non-essential directories
          if (entry.isDirectory()) {
            if (['test', 'tests', '__tests__', 'examples', 'docs', '.github', 'coverage', 'node_modules'].includes(entry.name)) {
              continue;
            }
            scanDir(fullPath);
          } else if (entry.isFile()) {
            // Only count text files
            if (FileUtils.isText(fullPath)) {
              try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const tokens = TokenUtils.calculate(content, fullPath);
                totalTokens += tokens;
                fileCount++;
              } catch (error) {
                // Skip files that can't be read
              }
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    scanDir(depPath);

    return { tokens: totalTokens, files: fileCount };
  }

  /**
   * Extract TypeScript definitions from a dependency
   */
  extractTypeDefinitions(depPath, packageName) {
    const types = [];
    const maxFiles = 10; // Limit to avoid excessive output

    const findDtsFiles = (dir) => {
      if (types.length >= maxFiles) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (types.length >= maxFiles) break;

          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Skip test directories
            if (['test', 'tests', '__tests__', 'node_modules'].includes(entry.name)) {
              continue;
            }
            findDtsFiles(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              // Truncate large files
              const truncatedContent = content.length > 5000 
                ? content.substring(0, 5000) + '\n// ... truncated'
                : content;
              
              types.push({
                file: path.relative(depPath, fullPath),
                content: truncatedContent,
                tokens: TokenUtils.calculate(truncatedContent, fullPath)
              });
            } catch (error) {
              // Skip files that can't be read
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    // Check for bundled types
    findDtsFiles(depPath);

    // Also check for @types/package
    if (types.length === 0) {
      const typesPackagePath = this.findDependencyPath(`@types/${packageName}`);
      if (typesPackagePath) {
        findDtsFiles(typesPackagePath);
      }
    }

    return types;
  }

  /**
   * Check for security vulnerabilities using npm audit
   */
  async checkSecurity(packageName, version) {
    if (!this.options.checkSecurity) {
      return { status: 'skipped', vulnerabilities: [] };
    }

    try {
      // Run npm audit for specific package
      const auditResult = this.runNpmAudit(packageName);
      return auditResult;
    } catch (error) {
      logger.warn(`Security check failed for ${packageName}: ${error.message}`);
      return { status: 'unknown', vulnerabilities: [] };
    }
  }

  /**
   * Run npm audit for security vulnerabilities
   */
  runNpmAudit(packageName) {
    try {
      // Run npm audit --json to get structured output
      const result = execSync('npm audit --json --omit=dev 2>/dev/null', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        timeout: 30000
      });

      const audit = JSON.parse(result);
      return this.parseAuditResult(audit, packageName);
    } catch (error) {
      // npm audit returns non-zero exit code when vulnerabilities are found
      if (error.stdout) {
        try {
          const audit = JSON.parse(error.stdout);
          return this.parseAuditResult(audit, packageName);
        } catch (parseError) {
          // Ignore parse errors
        }
      }
      return { status: 'unknown', vulnerabilities: [] };
    }
  }

  /**
   * Parse npm audit result for a specific package
   */
  parseAuditResult(audit, packageName) {
    const vulnerabilities = [];

    if (audit.vulnerabilities) {
      for (const [name, vuln] of Object.entries(audit.vulnerabilities)) {
        if (name === packageName || (vuln.via && vuln.via.some(v => v.name === packageName))) {
          vulnerabilities.push({
            name: name,
            severity: vuln.severity,
            title: vuln.name || name,
            fixAvailable: vuln.fixAvailable || false
          });
        }
      }
    }

    return {
      status: vulnerabilities.length > 0 ? 'review' : 'ok',
      vulnerabilities
    };
  }

  /**
   * Analyze a single dependency
   */
  async analyzeDependency(packageName, version) {
    const depPath = this.findDependencyPath(packageName);

    if (!depPath) {
      return {
        name: packageName,
        version: version,
        status: 'missing',
        tokens: 0,
        files: 0,
        security: { status: 'unknown', vulnerabilities: [] },
        types: [],
        active: false
      };
    }

    const installedVersion = this.getInstalledVersion(packageName, depPath);
    const tokenInfo = this.scanDependencyTokens(depPath);
    
    // Extract type definitions if requested
    const types = this.options.includeTypes 
      ? this.extractTypeDefinitions(depPath, packageName)
      : [];

    // Check security
    const security = await this.checkSecurity(packageName, installedVersion);

    return {
      name: packageName,
      version: installedVersion,
      declaredVersion: version,
      status: 'installed',
      tokens: tokenInfo.tokens,
      files: tokenInfo.files,
      path: depPath,
      security,
      types,
      active: false // Will be set by import tracker
    };
  }

  /**
   * Main analysis method
   */
  async analyze(activeImports = []) {
    logger.info('Starting dependency analysis...');

    // Load package.json
    this.loadPackageJson();

    // Get all dependencies
    const dependencies = this.getAllDependencies();
    const results = [];

    // Analyze each dependency
    for (const [name, version] of Object.entries(dependencies)) {
      logger.debug(`Analyzing ${name}@${version}`);
      
      const analysis = await this.analyzeDependency(name, version);
      
      // Mark as active if in activeImports
      if (activeImports.some(imp => imp.package === name || imp.package.startsWith(name + '/'))) {
        analysis.active = true;
      }
      
      results.push(analysis);
    }

    // Update stats
    this.stats.totalDependencies = results.length;
    this.stats.activeDependencies = results.filter(r => r.active).length;
    this.stats.totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);
    this.stats.securityIssues = results.reduce(
      (sum, r) => sum + r.security.vulnerabilities.length, 0
    );
    this.stats.typesExtracted = results.reduce(
      (sum, r) => sum + r.types.length, 0
    );

    // Sort by token count (descending)
    results.sort((a, b) => b.tokens - a.tokens);

    return {
      dependencies: results,
      summary: this.generateSummary(results)
    };
  }

  /**
   * Generate summary of dependency analysis
   */
  generateSummary(results) {
    return {
      totalDependencies: results.length,
      installedDependencies: results.filter(r => r.status === 'installed').length,
      missingDependencies: results.filter(r => r.status === 'missing').length,
      activeDependencies: results.filter(r => r.active).length,
      totalTokens: this.stats.totalTokens,
      securityIssues: this.stats.securityIssues,
      typesExtracted: this.stats.typesExtracted,
      largestDependencies: results.slice(0, 5).map(r => ({
        name: r.name,
        tokens: r.tokens
      }))
    };
  }

  /**
   * Generate dependency-context.json
   */
  generateContext(analysis, activeImports) {
    const context = {
      generated: new Date().toISOString(),
      projectRoot: this.projectRoot,
      summary: {
        totalDependencies: analysis.summary.totalDependencies,
        activeDependencies: analysis.summary.activeDependencies,
        totalTokens: analysis.summary.totalTokens,
        securityIssues: analysis.summary.securityIssues
      },
      packages: []
    };

    // Focus on actively used packages first
    const sortedDeps = [...analysis.dependencies].sort((a, b) => {
      if (a.active && !b.active) return -1;
      if (!a.active && b.active) return 1;
      return b.tokens - a.tokens;
    });

    for (const dep of sortedDeps) {
      const pkgContext = {
        name: dep.name,
        version: dep.version,
        active: dep.active,
        tokens: dep.tokens,
        security: dep.security.status
      };

      // Add imports if active
      if (dep.active) {
        const imports = activeImports.find(imp => imp.package === dep.name);
        if (imports) {
          pkgContext.imports = imports.imports;
          pkgContext.usedIn = imports.files.slice(0, 5);
        }
      }

      // Add type definitions if available and requested
      if (this.options.includeTypes && dep.types.length > 0) {
        pkgContext.types = dep.types.slice(0, 3).map(t => ({
          file: t.file,
          tokens: t.tokens
        }));
      }

      // Add security details if issues found
      if (dep.security?.vulnerabilities?.length > 0) {
        pkgContext.vulnerabilities = dep.security.vulnerabilities;
      }

      context.packages.push(pkgContext);
    }

    return context;
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

export default DependencyScanner;
