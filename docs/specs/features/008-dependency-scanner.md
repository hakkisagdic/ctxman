# Dependency Context Scanner

**ID**: FEAT-008
**Status**: Planned
**Priority**: Low
**Effort**: Medium (12-16 hours)
**Dependencies**: None

---

## Problem Statement

### Why This Matters

Modern projects depend heavily on external packages, but these dependencies are often invisible in context analysis:

**Dependency Blind Spots**:

- No visibility into node_modules token impact
- External dependency APIs not included in context
- Version-specific behavior unknown
- Security vulnerabilities in dependencies missed

**Debugging Challenges**:

- LLM lacks context about external libraries
- Incorrect API usage suggestions
- Missing type definitions from dependencies
- Unclear error messages from dependency code

**User Impact**:

- Incomplete debugging context
- LLM hallucinations about library APIs
- Manual documentation lookup required
- Longer troubleshooting cycles

**Business Impact**:

- Reduced developer productivity
- Incorrect LLM-assisted code
- Missed security considerations
- Longer time-to-resolution for bugs

---

## Proposed Solution

### What We Will Build

A **dependency scanner** that:

1. Analyzes node_modules for token impact
2. Extracts type definitions from dependencies
3. Identifies actively used dependency code paths
4. Generates dependency context summary
5. Flags security concerns in dependencies

### User Experience

```
+-------------------------------------------------------------+
|                 Dependency Context Scanner                   |
+-------------------------------------------------------------+
|                                                             |
|  $ ctxman --scan-dependencies                               |
|                                                             |
|  Analyzing dependencies...                                  |
|                                                             |
|  +---------------------------------------------------+      |
|  | Package          | Version | Tokens | Security   |      |
|  +---------------------------------------------------+      |
|  | express          | 4.18.2  | 45,230 | OK         |      |
|  | lodash           | 4.17.21 | 32,180 | REVIEW     |      |
|  | mongoose         | 7.6.0   | 28,450 | OK         |      |
|  | react            | 18.2.0  | 67,890 | OK         |      |
|  +---------------------------------------------------+      |
|                                                             |
|  Total dependency tokens: 173,750                           |
|  Active imports in your code: 12 packages                   |
|                                                             |
|  Security Alerts:                                           |
|   - lodash@4.17.21: 1 moderate vulnerability (prototype     |
|     pollution) - Consider upgrading to 4.17.32              |
|                                                             |
|  Generated dependency context:                              |
|   - Type definitions: 45 files extracted                    |
|   - API signatures: 234 methods documented                  |
|   - Usage patterns: Based on your imports                   |
|                                                             |
|  Save to context? [Y/n] y                                   |
|                                                             |
|  +dependency-context.json created (2,340 tokens)            |
|                                                             |
+-------------------------------------------------------------+
```

---

## Implementation Steps

### Step 1: Create Dependency Analyzer

```javascript
// lib/analyzers/DependencyAnalyzer.js

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class DependencyAnalyzer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.packageJson = this.loadPackageJson();
  }

  loadPackageJson() {
    const path = join(this.projectRoot, 'package.json');
    if (!existsSync(path)) {
      throw new Error('No package.json found');
    }
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  async analyze() {
    const dependencies = this.getAllDependencies();
    const results = [];

    for (const [name, version] of Object.entries(dependencies)) {
      const depPath = this.findDependencyPath(name);

      if (!depPath) {
        results.push({
          name,
          version,
          status: 'missing',
          tokens: 0,
        });
        continue;
      }

      const analysis = await this.analyzeDependency(name, depPath);
      results.push(analysis);
    }

    return {
      dependencies: results,
      summary: this.generateSummary(results),
    };
  }

  getAllDependencies() {
    return {
      ...this.packageJson.dependencies,
      ...this.packageJson.devDependencies,
    };
  }

  findDependencyPath(name) {
    const possiblePaths = [
      join(this.projectRoot, 'node_modules', name),
      join(this.projectRoot, 'node_modules', '.pnpm', name),
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  async analyzeDependency(name, depPath) {
    const scanner = new Scanner({ root: depPath });
    const result = await scanner.scan();

    return {
      name,
      version: this.getInstalledVersion(name, depPath),
      tokens: result.totalTokens,
      files: result.files.length,
      security: await this.checkSecurity(name),
      types: this.extractTypes(depPath),
      exports: this.extractExports(depPath),
    };
  }

  extractTypes(depPath) {
    const types = [];
    const typesPath = join(depPath, 'dist', '*.d.ts');

    // Look for TypeScript definitions
    const dtsFiles = glob.sync(typesPath, { nodir: true });

    for (const file of dtsFiles.slice(0, 5)) {
      // Limit to 5 files
      types.push({
        path: file,
        content: readFileSync(file, 'utf-8'),
      });
    }

    return types;
  }

  extractExports(depPath) {
    // Parse package.json exports field
    const pkg = JSON.parse(readFileSync(join(depPath, 'package.json'), 'utf-8'));
    return pkg.exports || pkg.main || 'index.js';
  }
}
```

### Step 2: Create Import Tracker

```javascript
// lib/analyzers/ImportTracker.js

export class ImportTracker {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }

  async trackImports(sourceFiles) {
    const imports = new Map();

    for (const file of sourceFiles) {
      const content = readFileSync(file.path, 'utf-8');
      const fileImports = this.parseImports(content);

      for (const imp of fileImports) {
        if (!imports.has(imp.package)) {
          imports.set(imp.package, {
            package: imp.package,
            imports: [],
            files: [],
          });
        }

        const record = imports.get(imp.package);
        record.imports.push(...imp.symbols);
        record.files.push(file.path);
      }
    }

    // Deduplicate
    for (const record of imports.values()) {
      record.imports = [...new Set(record.imports)];
      record.files = [...new Set(record.files)];
    }

    return Array.from(imports.values());
  }

  parseImports(content) {
    const imports = [];

    // ES6 imports
    const es6Pattern = /import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = es6Pattern.exec(content)) !== null) {
      const symbols = [];
      if (match[1]) symbols.push(...match[1].split(',').map((s) => s.trim()));
      if (match[2]) symbols.push(`* as ${match[2]}`);
      if (match[3]) symbols.push(match[3]);

      imports.push({
        package: match[4],
        symbols,
      });
    }

    // CommonJS requires
    const cjsPattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = cjsPattern.exec(content)) !== null) {
      imports.push({
        package: match[1],
        symbols: ['*'],
      });
    }

    return imports;
  }
}
```

### Step 3: Create Security Checker

```javascript
// lib/analyzers/SecurityChecker.js

export class SecurityChecker {
  async check(packageName, version) {
    try {
      // Use npm audit API
      const response = await fetch(`https://registry.npmjs.org/-/npm/v1/security/audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [packageName]: [version],
        }),
      });

      const data = await response.json();
      return this.formatSecurityReport(data);
    } catch (error) {
      return { status: 'unknown', vulnerabilities: [] };
    }
  }

  formatSecurityReport(data) {
    const vulnerabilities = [];

    for (const [id, vuln] of Object.entries(data.vulnerabilities || {})) {
      vulnerabilities.push({
        id,
        severity: vuln.severity,
        title: vuln.name,
        description: vuln.url,
        fixedIn: vuln.fixAvailable?.version,
      });
    }

    return {
      status: vulnerabilities.length === 0 ? 'ok' : 'review',
      vulnerabilities,
    };
  }
}
```

### Step 4: Create Context Generator

````javascript
// lib/generators/DependencyContextGenerator.js

export class DependencyContextGenerator {
  generate(analysis, activeImports) {
    const context = {
      generated: new Date().toISOString(),
      summary: {
        totalDependencies: analysis.dependencies.length,
        activeDependencies: activeImports.length,
        totalTokens: analysis.summary.totalTokens,
      },
      packages: [],
    };

    // Focus on actively used packages
    for (const imp of activeImports) {
      const dep = analysis.dependencies.find((d) => d.name === imp.package);

      if (!dep) continue;

      context.packages.push({
        name: dep.name,
        version: dep.version,
        imports: imp.imports,
        usedIn: imp.files.slice(0, 3), // Limit file references
        types: dep.types?.slice(0, 3), // Include type definitions
        security: dep.security?.status,
      });
    }

    return context;
  }

  generateCompact(context) {
    // Generate ultra-compact format
    let output = '# Dependencies\n\n';

    for (const pkg of context.packages) {
      output += `## ${pkg.name}@${pkg.version}\n`;

      if (pkg.types?.length > 0) {
        output += '### Types\n```typescript\n';
        for (const type of pkg.types) {
          output += type.content.slice(0, 500); // Truncate
        }
        output += '\n```\n';
      }

      if (pkg.imports.length > 0) {
        output += `### Used: ${pkg.imports.join(', ')}\n`;
      }

      if (pkg.security !== 'ok') {
        output += `### Security: ${pkg.security}\n`;
      }

      output += '\n';
    }

    return output;
  }
}
````

### Step 5: Add CLI Flag

```javascript
// bin/cli.js

program
  .option('--scan-dependencies', 'Include dependency analysis in context')
  .option('--dependency-depth <number>', 'How deep to scan dependencies', '1')
  .option('--include-types', 'Include TypeScript definitions from dependencies')
  .action(async (options) => {
    if (options.scanDependencies) {
      const analyzer = new DependencyAnalyzer(process.cwd());
      const analysis = await analyzer.analyze();

      const tracker = new ImportTracker(process.cwd());
      const imports = await tracker.trackImports(analysis.files);

      const generator = new DependencyContextGenerator();
      const context = generator.generate(analysis, imports);

      if (options.includeTypes) {
        // Include full type definitions
      }

      await fs.writeFile('dependency-context.json', JSON.stringify(context, null, 2));

      console.log(`\n+dependency-context.json created`);
      console.log(`Active dependencies: ${imports.length}`);
      console.log(`Estimated tokens: ${context.summary.totalTokens}\n`);
    }
  });
```

---

## Acceptance Criteria

### Must Have

- [ ] `--scan-dependencies` flag analyzes node_modules
- [ ] Lists all dependencies with token counts
- [ ] Identifies actively imported packages
- [ ] Generates dependency-context.json

### Should Have

- [ ] Security vulnerability checking
- [ ] TypeScript definition extraction
- [ ] Import usage tracking per file
- [ ] Compact output format

### Nice to Have

- [ ] Dependency graph visualization
- [ ] License compliance checking
- [ ] Outdated package detection
- [ ] Bundle size impact analysis

---

## Success Metrics

### Quantitative Metrics

| Metric                       | Target                   | Measurement   |
| ---------------------------- | ------------------------ | ------------- |
| Dependency scan usage        | 15% of users             | Analytics     |
| Security issues found        | 5+ per month             | User reports  |
| Context accuracy improvement | 20% better LLM responses | User feedback |

### Qualitative Metrics

- [ ] Users report fewer library-related LLM hallucinations
- [ ] Faster debugging with dependency context
- [ ] Proactive security awareness

---

## Timeline

| Task                | Effort  | Week   |
| ------------------- | ------- | ------ |
| Dependency analyzer | 4 hours | Week 1 |
| Import tracker      | 3 hours | Week 1 |
| Security checker    | 2 hours | Week 1 |
| Context generator   | 3 hours | Week 1 |
| CLI integration     | 2 hours | Week 1 |
| Testing & docs      | 4 hours | Week 2 |

**Total Estimated Effort**: 18 hours over 2 weeks

---

## References

- [npm audit API](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [Node.js Module Resolution](https://nodejs.org/api/modules.html#modules_all_together)
- [TypeScript Declaration Files](https://www.typescriptlang.org/docs/handbook/declaration-files/)

---

_Planned by: Ctxman Development Team_
_Target: Q3 2025_
