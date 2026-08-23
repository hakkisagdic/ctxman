/**
 * Import Tracker - Parses source files to track package imports
 * v3.0.0 - FEAT-002
 */

import fs from 'fs';
import path from 'path';
import { getLogger } from '../utils/logger.js';
import FileUtils from '../utils/file-utils.js';

const logger = getLogger('ImportTracker');

/**
 * ImportTracker class
 * Parses source files to identify which packages are actively imported
 */
export class ImportTracker {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      excludeNodeModules: options.excludeNodeModules !== false,
      includeDevImports: options.includeDevImports || false,
      ...options,
    };
    this.imports = new Map();
  }

  /**
   * Parse ES6 imports from content
   */
  parseES6Imports(content) {
    const imports = [];

    // Match various import patterns:
    // import defaultExport from 'package'
    // import { named } from 'package'
    // import * as name from 'package'
    // import { a, b as c } from 'package'
    const es6Pattern =
      /import\s+(?:(\{[^}]*\})|(\*\s+as\s+\w+)|(\w+)(?:\s*,\s*(\{[^}]*\}))?)\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = es6Pattern.exec(content)) !== null) {
      const symbols = [];

      // Named imports: { a, b, c }
      if (match[1]) {
        const named = match[1]
          .replace(/[{}]/g, '')
          .split(',')
          .map((s) =>
            s
              .trim()
              .split(/\s+as\s+/)
              .pop()
          )
          .filter((s) => s.length > 0);
        symbols.push(...named);
      }

      // Namespace import: * as name
      if (match[2]) {
        symbols.push(match[2].trim());
      }

      // Default import
      if (match[3]) {
        symbols.push(match[3].trim());
      }

      // Combined: default, { named }
      if (match[4]) {
        const named = match[4]
          .replace(/[{}]/g, '')
          .split(',')
          .map((s) =>
            s
              .trim()
              .split(/\s+as\s+/)
              .pop()
          )
          .filter((s) => s.length > 0);
        symbols.push(...named);
      }

      // Package name
      const packageName = match[5];

      imports.push({
        package: packageName,
        symbols: [...new Set(symbols)],
        type: 'es6',
      });
    }

    // Also catch dynamic imports: import('package')
    const dynamicPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicPattern.exec(content)) !== null) {
      imports.push({
        package: match[1],
        symbols: ['*'],
        type: 'dynamic',
      });
    }

    return imports;
  }

  /**
   * Parse CommonJS requires from content
   */
  parseCommonJSImports(content) {
    const imports = [];

    // Match require('package')
    // Also handle: const { a, b } = require('package')
    // const x = require('package')
    const cjsPattern =
      /(?:const|let|var)\s+(?:(\{[^}]*\})|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match;
    while ((match = cjsPattern.exec(content)) !== null) {
      const symbols = [];

      // Destructured: { a, b }
      if (match[1]) {
        const named = match[1]
          .replace(/[{}]/g, '')
          .split(',')
          .map((s) =>
            s
              .trim()
              .split(/\s+as\s+/)
              .pop()
          )
          .filter((s) => s.length > 0);
        symbols.push(...named);
      }

      // Default: identifier
      if (match[2]) {
        symbols.push(match[2].trim());
      }

      imports.push({
        package: match[3],
        symbols: [...new Set(symbols)],
        type: 'commonjs',
      });
    }

    // Simple require without assignment (side effects)
    const simpleRequirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = simpleRequirePattern.exec(content)) !== null) {
      // Check if it's not already captured
      const existing = imports.find((i) => i.package === match[1]);
      if (!existing) {
        imports.push({
          package: match[1],
          symbols: ['*'],
          type: 'commonjs',
        });
      }
    }

    return imports;
  }

  /**
   * Check if an import is from a package (not a relative path)
   */
  isPackageImport(importPath) {
    // Relative imports start with ./ or ../
    // Absolute imports start with /
    // Package imports are bare identifiers
    if (
      importPath.startsWith('./') ||
      importPath.startsWith('../') ||
      importPath.startsWith('/') ||
      importPath.startsWith('#')
    ) {
      return false;
    }
    return true;
  }

  /**
   * Extract the base package name from an import path
   * e.g., @babel/core -> @babel/core
   * e.g., lodash/fp -> lodash
   */
  getBasePackageName(importPath) {
    // Handle scoped packages (@org/package)
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
      return importPath;
    }

    // Regular packages: package/submodule -> package
    const parts = importPath.split('/');
    return parts[0];
  }

  /**
   * Parse a single file for imports
   */
  parseFile(filePath) {
    const imports = [];

    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Parse ES6 imports
      const es6Imports = this.parseES6Imports(content);
      imports.push(...es6Imports);

      // Parse CommonJS requires
      const cjsImports = this.parseCommonJSImports(content);
      imports.push(...cjsImports);

      // Filter to package imports only and normalize package names
      return imports
        .filter((imp) => this.isPackageImport(imp.package))
        .map((imp) => ({
          ...imp,
          package: this.getBasePackageName(imp.package),
        }));
    } catch (error) {
      logger.warn(`Failed to parse file ${filePath}: ${error.message}`);
      return [];
    }
  }

  /**
   * Scan a directory for source files
   */
  scanSourceFiles(dir, files = []) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules
        if (entry.name === 'node_modules' && this.options.excludeNodeModules) {
          continue;
        }

        // Skip hidden directories
        if (entry.name.startsWith('.') && entry.name !== '.ctxman') {
          continue;
        }

        // Skip common non-source directories
        if (['dist', 'build', 'coverage', '.git'].includes(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          this.scanSourceFiles(fullPath, files);
        } else if (entry.isFile()) {
          // Only parse text files (JS, TS, etc.)
          if (FileUtils.isText(fullPath) && this.isSourceFile(fullPath)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to scan directory ${dir}: ${error.message}`);
    }

    return files;
  }

  /**
   * Check if a file is a source file (JS, TS, etc.)
   */
  isSourceFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const sourceExtensions = [
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.mjs',
      '.cjs',
      '.vue',
      '.svelte',
      '.astro',
    ];
    return sourceExtensions.includes(ext);
  }

  /**
   * Track all imports in the project
   */
  trackImports(sourceFiles = null) {
    logger.info('Tracking imports...');

    // Get source files if not provided
    if (!sourceFiles) {
      sourceFiles = this.scanSourceFiles(this.projectRoot);
    }

    logger.debug(`Found ${sourceFiles.length} source files to analyze`);

    // Parse each file
    for (const file of sourceFiles) {
      const fileImports = this.parseFile(file);

      for (const imp of fileImports) {
        const packageName = imp.package;

        if (!this.imports.has(packageName)) {
          this.imports.set(packageName, {
            package: packageName,
            imports: [],
            files: [],
            types: new Set(),
          });
        }

        const record = this.imports.get(packageName);
        record.imports.push(...imp.symbols);
        record.files.push(path.relative(this.projectRoot, file));
        record.types.add(imp.type);
      }
    }

    // Deduplicate and finalize
    const results = [];
    for (const record of this.imports.values()) {
      results.push({
        package: record.package,
        imports: [...new Set(record.imports)],
        files: [...new Set(record.files)],
        importTypes: [...record.types],
        usageCount: record.files.length,
      });
    }

    // Sort by usage count (descending)
    results.sort((a, b) => b.usageCount - a.usageCount);

    logger.info(`Found ${results.length} packages with active imports`);

    return results;
  }

  /**
   * Get packages that are actively imported
   */
  getActivePackages() {
    return Array.from(this.imports.keys());
  }

  /**
   * Get import details for a specific package
   */
  getPackageImports(packageName) {
    const baseName = this.getBasePackageName(packageName);
    return this.imports.get(baseName) || null;
  }

  /**
   * Check if a package is actively imported
   */
  isPackageActive(packageName) {
    const baseName = this.getBasePackageName(packageName);
    return this.imports.has(baseName);
  }

  /**
   * Reset the tracker
   */
  reset() {
    this.imports = new Map();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalPackages: this.imports.size,
      totalImports: Array.from(this.imports.values()).reduce(
        (sum, record) => sum + record.imports.length,
        0
      ),
      totalFiles: Array.from(this.imports.values()).reduce(
        (sum, record) => sum + record.files.length,
        0
      ),
    };
  }
}

export default ImportTracker;
