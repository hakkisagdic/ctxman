# TypeScript Migration Plan

**Status**: 📋 Planned (Optional Future Work)
**Priority**: Medium
**Effort**: High (40-80 hours)
**Dependencies**: Security audit (002) - COMPLETED

---

## Problem Statement

### Why This Matters

Ctxman is currently a pure JavaScript codebase using ES6 modules. While this provides flexibility, it introduces several challenges:

**Developer Experience Issues**:
- No compile-time type checking
- IDE autocompletion limited without JSDoc
- Refactoring is error-prone
- API contracts unclear without documentation

**Code Quality Issues**:
- Runtime type errors not caught early
- Implicit `any` types proliferate
- Interface contracts not enforced
- Plugin API lacks type definitions

**User Impact**:
- Plugin developers struggle with API contracts
- Contributors make type-related mistakes
- Debugging takes longer without type information

**Business Impact**:
- Increased maintenance burden
- Higher bug rate in edge cases
- Contributor onboarding friction
- Plugin ecosystem growth hindered

---

## Proposed Solution

### What We Will Do

Implement an **incremental TypeScript migration** that:
1. Preserves backward compatibility during transition
2. Provides immediate value at each migration phase
3. Enables gradual type strictness increase

### Migration Strategy

```
Phase 1: Foundation (Week 1-2)
├── Add TypeScript tooling
├── Configure tsconfig.json
├── Create type definitions for public API
└── Enable JSDoc-based type checking

Phase 2: Core Modules (Week 3-6)
├── Migrate lib/core/ modules
├── Migrate lib/analyzers/
├── Add plugin type definitions
└── Enable strict mode for migrated files

Phase 3: Utilities & Plugins (Week 7-10)
├── Migrate lib/utils/
├── Migrate lib/plugins/
├── Update CLI entry points
└── Add comprehensive type tests

Phase 4: Full Migration (Week 11-12)
├── Convert remaining .js to .ts
├── Enable project-wide strict mode
├── Update documentation
└── Publish types with package
```

---

## Implementation Steps

### Step 1: Initial Setup

```bash
# Install TypeScript and tooling
npm install --save-dev typescript @types/node tsx

# Create tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["lib/**/*", "index.js", "bin/**/*"],
  "exclude": ["node_modules", "test", "coverage"]
}
EOF
```

### Step 2: Enable JSDoc Type Checking

```javascript
// Add to existing .js files
/**
 * @typedef {import('./types').AnalysisResult} AnalysisResult
 * @typedef {import('./types').ScannerOptions} ScannerOptions
 */

/**
 * Analyze project context
 * @param {ScannerOptions} options - Configuration options
 * @returns {Promise<AnalysisResult>} Analysis results
 */
export async function analyze(options) { ... }
```

### Step 3: Create Type Definitions

```typescript
// lib/types/index.d.ts
export interface ScannerOptions {
  root: string;
  excludePatterns?: string[];
  includePatterns?: string[];
  maxFileSize?: number;
  methodLevel?: boolean;
}

export interface AnalysisResult {
  files: FileInfo[];
  totalTokens: number;
  totalLines: number;
  languages: LanguageStats[];
}

export interface FileInfo {
  path: string;
  tokens: number;
  lines: number;
  language: string;
  methods?: MethodInfo[];
}
```

### Step 4: Migrate Core Module (Example)

```typescript
// lib/core/Scanner.ts
import type { ScannerOptions, FileInfo } from '../types';

export class Scanner {
  private options: ScannerOptions;

  constructor(options: ScannerOptions) {
    this.options = { ...defaultOptions, ...options };
  }

  async scan(): Promise<FileInfo[]> {
    // Implementation
  }
}
```

### Step 5: Update Package.json

```json
{
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./index.js",
      "default": "./index.js"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build:types": "tsc --emitDeclarationOnly"
  }
}
```

---

## Success Metrics

### Quantitative Metrics

| Metric | Before | Target | Phase 1 | Phase 2 | Phase 4 |
|--------|--------|--------|---------|---------|---------|
| Files with types | 0% | 100% | 10% | 50% | 100% |
| Type coverage | 0% | 90% | 20% | 60% | 90% |
| `any` usage | N/A | <5% | <50% | <20% | <5% |
| Build errors | N/A | 0 | <100 | <50 | 0 |
| Type check time | N/A | <5s | <2s | <3s | <5s |

### Qualitative Metrics

- [ ] IDE autocompletion works for public API
- [ ] Plugin developers can use type definitions
- [ ] Refactoring confidence improved
- [ ] API documentation generated from types

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking changes during migration | Medium | High | Incremental migration, extensive testing |
| Performance degradation | Low | Medium | Profile build times, optimize includes |
| Contributor friction | Medium | Medium | Provide type documentation, training |
| Dependency type conflicts | Medium | Low | Use `skipLibCheck`, report upstream |

---

## Migration Checklist

### Per-File Migration Steps

- [ ] Rename `.js` to `.ts`
- [ ] Add explicit type annotations
- [ ] Remove JSDoc type comments
- [ ] Fix type errors
- [ ] Run tests
- [ ] Update imports in dependent files
- [ ] Review with `tsc --noEmit`

### Module Migration Order

1. **lib/types/** - Create type definitions first
2. **lib/utils/logger.js** - High utility, low complexity
3. **lib/core/Scanner.js** - Core functionality
4. **lib/core/Analyzer.js** - Core functionality
5. **lib/analyzers/*.js** - Core features
6. **lib/plugins/*.js** - Plugin architecture
7. **lib/api/*.js** - API layer
8. **bin/cli.js** - Entry point last

---

## Benefits Summary

### Immediate Benefits (Phase 1)
- Type checking for JSDoc-annotated code
- IDE improvements for core modules
- Type definitions for plugin developers

### Medium-term Benefits (Phase 2-3)
- Catch errors at compile time
- Safer refactoring
- Better API documentation

### Long-term Benefits (Phase 4)
- Full type safety
- Reduced bug rate
- Improved contributor experience
- Plugin ecosystem growth

---

## Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Foundation | 2 weeks | Q2 2025 | Q2 2025 |
| Core Modules | 4 weeks | Q2 2025 | Q3 2025 |
| Utilities | 4 weeks | Q3 2025 | Q3 2025 |
| Full Migration | 2 weeks | Q3 2025 | Q3 2025 |

**Total Estimated Effort**: 12 weeks

---

## References

- [TypeScript Migration Guide](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [JSDoc Reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)

---

*Planned by: Ctxman Development Team*
*Target: Q2-Q3 2025*
