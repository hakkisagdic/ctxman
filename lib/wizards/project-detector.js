/**
 * Project Detector
 * Automatically detects project type based on files and dependencies
 * FEAT-001: Configuration Wizard
 */

import fs from 'fs';
import path from 'path';

/**
 * Project type detectors configuration
 * Each detector has files to check, dependencies to look for, and priority
 */
const DETECTORS = {
  monorepo: {
    name: 'Monorepo',
    files: ['lerna.json', 'nx.json', 'pnpm-workspace.yaml', 'turbo.json'],
    checkDirs: ['packages', 'apps'],
    priority: 10,
    patterns: ['**/packages/*', '**/apps/*'],
  },
  typescript: {
    name: 'TypeScript',
    files: ['tsconfig.json'],
    extensions: ['.ts', '.tsx'],
    priority: 5,
    dependencies: ['typescript'],
  },
  react: {
    name: 'React',
    dependencies: ['react', 'react-dom'],
    extensions: ['.jsx', '.tsx'],
    files: ['.reactrc', 'react.config.js'],
    priority: 4,
  },
  nextjs: {
    name: 'Next.js',
    dependencies: ['next'],
    files: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    priority: 6,
  },
  vue: {
    name: 'Vue.js',
    dependencies: ['vue'],
    extensions: ['.vue'],
    files: ['vue.config.js', 'vite.config.js'],
    priority: 4,
  },
  svelte: {
    name: 'Svelte',
    dependencies: ['svelte'],
    extensions: ['.svelte'],
    files: ['svelte.config.js'],
    priority: 4,
  },
  angular: {
    name: 'Angular',
    dependencies: ['@angular/core'],
    files: ['angular.json'],
    priority: 5,
  },
  nodejs: {
    name: 'Node.js',
    files: ['package.json'],
    extensions: ['.js', '.mjs', '.cjs'],
    priority: 1,
  },
  python: {
    name: 'Python',
    files: ['setup.py', 'pyproject.toml', 'requirements.txt', 'Pipfile', 'poetry.lock'],
    extensions: ['.py'],
    priority: 1,
  },
  rust: {
    name: 'Rust',
    files: ['Cargo.toml'],
    extensions: ['.rs'],
    priority: 1,
  },
  go: {
    name: 'Go',
    files: ['go.mod', 'go.sum'],
    extensions: ['.go'],
    priority: 1,
  },
  java: {
    name: 'Java',
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    extensions: ['.java'],
    priority: 1,
  },
  ruby: {
    name: 'Ruby',
    files: ['Gemfile', 'Rakefile'],
    extensions: ['.rb'],
    priority: 1,
  },
  php: {
    name: 'PHP',
    files: ['composer.json'],
    extensions: ['.php'],
    priority: 1,
  },
  dotnet: {
    name: '.NET',
    files: ['*.sln', '*.csproj'],
    extensions: ['.cs'],
    priority: 1,
  },
};

/**
 * Default configuration templates for each project type
 */
const CONFIG_TEMPLATES = {
  monorepo: {
    contextignore: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '**/*.test.js',
      '**/*.spec.js',
      '**/test/',
      '**/tests/',
      '**/__tests__/',
      '**/*.d.ts',
      '.git/',
      '.nx/',
      '.turbo/',
    ],
    contextinclude: ['packages/**/src/**', 'apps/**/src/**', '**/README.md', '**/package.json'],
    methodinclude: [],
  },
  typescript: {
    contextignore: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '*.test.ts',
      '*.spec.ts',
      '__tests__/',
      '*.d.ts',
      '.git/',
    ],
    contextinclude: ['src/**/*.ts', 'src/**/*.tsx', 'lib/**/*.ts', 'index.ts'],
    methodinclude: [],
  },
  react: {
    contextignore: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '*.test.js',
      '*.test.jsx',
      '*.test.ts',
      '*.test.tsx',
      '*.spec.js',
      '*.spec.jsx',
      '*.spec.ts',
      '*.spec.tsx',
      '__tests__/',
      '__snapshots__/',
      '.git/',
    ],
    contextinclude: [
      'src/**/*.js',
      'src/**/*.jsx',
      'src/**/*.ts',
      'src/**/*.tsx',
      'src/**/*.css',
      'src/**/*.scss',
      'src/**/*.sass',
      'components/**',
      'pages/**',
      'hooks/**',
      'utils/**',
      'services/**',
    ],
    methodinclude: [],
  },
  nextjs: {
    contextignore: [
      'node_modules/',
      '.next/',
      'out/',
      'coverage/',
      '*.test.js',
      '*.test.ts',
      '*.test.tsx',
      '*.spec.*',
      '__tests__/',
      '.git/',
    ],
    contextinclude: [
      'src/**',
      'app/**',
      'pages/**',
      'components/**',
      'lib/**',
      'utils/**',
      'styles/**',
      'public/**',
      'middleware.ts',
      'next.config.*',
    ],
    methodinclude: [],
  },
  vue: {
    contextignore: [
      'node_modules/',
      'dist/',
      'coverage/',
      '*.test.js',
      '*.spec.js',
      '__tests__/',
      '.git/',
    ],
    contextinclude: [
      'src/**/*.vue',
      'src/**/*.js',
      'src/**/*.ts',
      'src/**/*.css',
      'components/**',
      'views/**',
      'store/**',
      'router/**',
    ],
    methodinclude: [],
  },
  svelte: {
    contextignore: [
      'node_modules/',
      'dist/',
      '.svelte-kit/',
      'coverage/',
      '*.test.js',
      '*.spec.js',
      '.git/',
    ],
    contextinclude: [
      'src/**/*.svelte',
      'src/**/*.js',
      'src/**/*.ts',
      'src/**/*.css',
      'routes/**',
      'lib/**',
    ],
    methodinclude: [],
  },
  angular: {
    contextignore: [
      'node_modules/',
      'dist/',
      'coverage/',
      '*.spec.ts',
      '**/*.spec.ts',
      '.git/',
      '.angular/',
    ],
    contextinclude: [
      'src/**/*.ts',
      'src/**/*.html',
      'src/**/*.css',
      'src/**/*.scss',
      'app/**',
      'environments/**',
    ],
    methodinclude: [],
  },
  nodejs: {
    contextignore: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '*.test.js',
      '*.spec.js',
      '__tests__/',
      '.git/',
      '*.log',
    ],
    contextinclude: ['src/**/*.js', 'lib/**/*.js', 'index.js', 'bin/**'],
    methodinclude: [],
  },
  python: {
    contextignore: [
      '__pycache__/',
      '*.pyc',
      '*.pyo',
      '.pytest_cache/',
      '.tox/',
      '.venv/',
      'venv/',
      'env/',
      '*.egg-info/',
      'dist/',
      'build/',
      '.git/',
      'node_modules/',
    ],
    contextinclude: ['**/*.py', 'requirements.txt', 'pyproject.toml', 'setup.py'],
    methodinclude: [],
  },
  rust: {
    contextignore: ['target/', 'Cargo.lock', '.git/', '**/*.rs.bk'],
    contextinclude: ['**/*.rs', 'Cargo.toml', 'src/**'],
    methodinclude: [],
  },
  go: {
    contextignore: ['vendor/', '.git/', '*.test', '*.out'],
    contextinclude: ['**/*.go', 'go.mod', 'go.sum'],
    methodinclude: [],
  },
  java: {
    contextignore: ['target/', 'build/', '.gradle/', 'out/', '.git/', '*.class', '*.jar', '*.war'],
    contextinclude: ['src/**/*.java', 'pom.xml', 'build.gradle', 'build.gradle.kts'],
    methodinclude: [],
  },
  ruby: {
    contextignore: ['vendor/', '.bundle/', 'coverage/', '.git/', 'node_modules/'],
    contextinclude: ['**/*.rb', 'lib/**', 'app/**', 'Gemfile', 'Rakefile'],
    methodinclude: [],
  },
  php: {
    contextignore: ['vendor/', 'node_modules/', '.git/', 'storage/', 'bootstrap/cache/'],
    contextinclude: ['**/*.php', 'app/**', 'src/**', 'config/**', 'routes/**', 'composer.json'],
    methodinclude: [],
  },
  dotnet: {
    contextignore: ['bin/', 'obj/', '.git/', 'node_modules/', '*.user', '*.suo'],
    contextinclude: ['**/*.cs', '*.csproj', '*.sln', 'Program.cs', 'Startup.cs'],
    methodinclude: [],
  },
};

class ProjectDetector {
  /**
   * Create a ProjectDetector instance
   * @param {string} projectRoot - Project root directory
   */
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.packageJson = null;
  }

  /**
   * Detect project types
   * @returns {Promise<Array>} Array of detected project types with confidence scores
   */
  async detect() {
    const results = [];

    // Load package.json if exists
    await this.loadPackageJson();

    // Check each detector
    for (const [type, config] of Object.entries(DETECTORS)) {
      const detection = await this.checkDetector(type, config);
      if (detection.score > 0) {
        results.push({
          type,
          name: config.name,
          score: detection.score,
          evidence: detection.evidence,
          config: CONFIG_TEMPLATES[type] || CONFIG_TEMPLATES.nodejs,
        });
      }
    }

    // Sort by priority/score
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Load package.json if it exists
   */
  async loadPackageJson() {
    const packageJsonPath = path.join(this.projectRoot, 'package.json');
    try {
      if (fs.existsSync(packageJsonPath)) {
        const content = fs.readFileSync(packageJsonPath, 'utf-8');
        this.packageJson = JSON.parse(content);
      }
    } catch (_error) {
      this.packageJson = null;
    }
  }

  /**
   * Check a single detector
   * @param {string} type - Detector type
   * @param {object} config - Detector configuration
   * @returns {Promise<object>} Detection result with score and evidence
   */
  async checkDetector(type, config) {
    let score = 0;
    const evidence = [];

    // Check files
    if (config.files) {
      for (const file of config.files) {
        const filePath = path.join(this.projectRoot, file);
        if (file.includes('*')) {
          // Glob pattern - simple check
          const dir = path.dirname(filePath);
          const baseName = path.basename(file);
          if (fs.existsSync(dir)) {
            try {
              const files = fs.readdirSync(dir);
              if (files.some((f) => this.matchesGlob(f, baseName))) {
                score += 2;
                evidence.push(`Found ${file}`);
              }
            } catch (_e) {
              // Directory not accessible
            }
          }
        } else if (fs.existsSync(filePath)) {
          score += 2;
          evidence.push(`Found ${file}`);
        }
      }
    }

    // Check directories
    if (config.checkDirs) {
      for (const dir of config.checkDirs) {
        const dirPath = path.join(this.projectRoot, dir);
        if (fs.existsSync(dirPath)) {
          score += 3;
          evidence.push(`Found ${dir}/ directory`);
        }
      }
    }

    // Check dependencies in package.json
    if (config.dependencies && this.packageJson) {
      const allDeps = {
        ...this.packageJson.dependencies,
        ...this.packageJson.devDependencies,
        ...this.packageJson.peerDependencies,
      };

      for (const dep of config.dependencies) {
        if (allDeps[dep]) {
          score += 3;
          evidence.push(`Has ${dep} dependency`);
        }
      }
    }

    // Check file extensions
    if (config.extensions) {
      const hasExtensions = await this.hasFilesWithExtensions(config.extensions);
      if (hasExtensions) {
        score += 1;
        evidence.push(`Has ${config.extensions.join(', ')} files`);
      }
    }

    // Add priority weight
    score = score * (config.priority || 1);

    return { score, evidence };
  }

  /**
   * Check if project has files with specific extensions
   * @param {Array<string>} extensions - File extensions to check
   * @returns {Promise<boolean>} True if files found
   */
  async hasFilesWithExtensions(extensions) {
    const checkDir = (dir, depth = 0) => {
      if (depth > 3) return false; // Limit depth

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }

          if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
              return true;
            }
          } else if (entry.isDirectory()) {
            if (checkDir(path.join(dir, entry.name), depth + 1)) {
              return true;
            }
          }
        }
      } catch (_e) {
        // Directory not accessible
      }

      return false;
    };

    return checkDir(this.projectRoot);
  }

  /**
   * Simple glob matching
   * @param {string} filename - Filename to check
   * @param {string} pattern - Glob pattern
   * @returns {boolean} True if matches
   */
  matchesGlob(filename, pattern) {
    const regex = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
    return new RegExp(`^${regex}$`).test(filename);
  }

  /**
   * Get merged configuration for detected project types
   * @param {Array<string>} types - Detected project types
   * @returns {object} Merged configuration
   */
  getMergedConfig(types) {
    const merged = {
      contextignore: new Set(),
      contextinclude: new Set(),
      methodinclude: new Set(),
    };

    // Add base ignores
    merged.contextignore.add('.git/');
    merged.contextignore.add('node_modules/');

    // Merge configs from all detected types
    for (const type of types) {
      const config = CONFIG_TEMPLATES[type];
      if (config) {
        if (config.contextignore) {
          config.contextignore.forEach((p) => merged.contextignore.add(p));
        }
        if (config.contextinclude) {
          config.contextinclude.forEach((p) => merged.contextinclude.add(p));
        }
        if (config.methodinclude) {
          config.methodinclude.forEach((p) => merged.methodinclude.add(p));
        }
      }
    }

    return {
      contextignore: [...merged.contextignore],
      contextinclude: [...merged.contextinclude],
      methodinclude: [...merged.methodinclude],
    };
  }

  /**
   * Get configuration template for a specific type
   * @param {string} type - Project type
   * @returns {object} Configuration template
   */
  getConfigTemplate(type) {
    return CONFIG_TEMPLATES[type] || CONFIG_TEMPLATES.nodejs;
  }
}

export default ProjectDetector;
export { DETECTORS, CONFIG_TEMPLATES };
