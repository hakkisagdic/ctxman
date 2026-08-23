# Interactive Configuration Wizard

**ID**: FEAT-001
**Status**: 📋 Planned
**Priority**: High
**Effort**: Medium (16-24 hours)
**Dependencies**: None

---

## Problem Statement

### Why This Matters

New users struggle to configure ctxman correctly. The tool requires several configuration files (`.contextignore`, `.contextinclude`, `.methodinclude`) that must be created manually. Users often:

- Don't know what patterns to include/exclude
- Create incomplete or incorrect configurations
- Spend excessive time reading documentation
- Give up before getting value from the tool

**User Impact**:

- High onboarding friction
- Suboptimal context generation
- Frustration and potential abandonment

**Business Impact**:

- Lower adoption rates
- Higher support burden
- Negative first impressions

### Research Findings

From user feedback and support queries:

- 40% of support questions relate to configuration
- Average time to working configuration: 30 minutes
- Most users don't discover advanced features

---

## Proposed Solution

### What We Will Build

An **interactive configuration wizard** that:

1. Detects project type automatically
2. Suggests sensible defaults based on detection
3. Guides users through customization
4. Generates configuration files automatically

### User Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Configuration Wizard                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  $ ctxman init                                              │
│                                                             │
│  🔍 Detecting project type...                               │
│  ✓ Found: Node.js (ES Modules)                             │
│  ✓ Found: TypeScript configuration                         │
│  ✓ Found: React components                                  │
│                                                             │
│  📁 Recommended excludes:                                   │
│  ✓ node_modules/                                            │
│  ✓ dist/                                                    │
│  ✓ coverage/                                                │
│  ✓ *.test.js                                                │
│                                                             │
│  Would you like to customize? (y/N)                        │
│                                                             │
│  > n                                                        │
│                                                             │
│  ✅ Created .contextignore                                  │
│  ✅ Created .contextinclude                                 │
│  ✅ Created .methodinclude (optional)                       │
│                                                             │
│  🎉 Configuration complete! Try: ctxman --cli              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create Project Detection Module

```javascript
// lib/wizards/project-detector.js

const DETECTORS = {
  nodejs: {
    files: ['package.json'],
    patterns: ['**/*.js', '**/*.mjs'],
    priority: 1,
  },
  typescript: {
    files: ['tsconfig.json'],
    patterns: ['**/*.ts', '**/*.tsx'],
    priority: 2,
  },
  react: {
    dependencies: ['react', 'react-dom'],
    patterns: ['**/*.jsx', '**/*.tsx'],
    priority: 3,
  },
  python: {
    files: ['setup.py', 'pyproject.toml', 'requirements.txt'],
    patterns: ['**/*.py'],
    priority: 1,
  },
  rust: {
    files: ['Cargo.toml'],
    patterns: ['**/*.rs'],
    priority: 1,
  },
  // ... more detectors
};

export async function detectProjectType(rootPath) {
  const results = [];

  for (const [type, config] of Object.entries(DETECTORS)) {
    const matches = await checkDetector(rootPath, config);
    if (matches.length > 0) {
      results.push({ type, confidence: matches.length, files: matches });
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}
```

### Step 2: Create Template System

```javascript
// lib/wizards/templates.js

const TEMPLATES = {
  nodejs: {
    contextignore: ['node_modules/', 'dist/', 'coverage/', '*.test.js', '*.spec.js', '__tests__/'],
    contextinclude: ['src/**/*.js', 'lib/**/*.js', 'index.js'],
  },
  typescript: {
    contextignore: [
      'node_modules/',
      'dist/',
      'coverage/',
      '*.test.ts',
      '*.spec.ts',
      '__tests__/',
      '*.d.ts',
    ],
    contextinclude: ['src/**/*.ts', 'lib/**/*.ts', 'index.ts'],
  },
  // ... more templates
};

export function getTemplate(projectTypes) {
  const merged = {
    contextignore: new Set(),
    contextinclude: new Set(),
  };

  for (const type of projectTypes) {
    const template = TEMPLATES[type];
    if (template) {
      template.contextignore.forEach((p) => merged.contextignore.add(p));
      template.contextinclude.forEach((p) => merged.contextinclude.add(p));
    }
  }

  return {
    contextignore: [...merged.contextignore],
    contextinclude: [...merged.contextinclude],
  };
}
```

### Step 3: Create Interactive CLI

```javascript
// lib/wizards/init-wizard.js
import inquirer from 'inquirer';

export async function runInitWizard(options = {}) {
  console.log('🔍 Analyzing your project...\n');

  // Detect project type
  const projectTypes = await detectProjectType(process.cwd());

  if (projectTypes.length === 0) {
    console.log('⚠️  Could not auto-detect project type.');
    return manualWizard();
  }

  console.log('✓ Detected project types:');
  projectTypes.forEach((p) => console.log(`  - ${p.type}`));
  console.log('');

  // Get template
  const template = getTemplate(projectTypes.map((p) => p.type));

  // Ask for customization
  const { customize } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'customize',
      message: 'Would you like to customize the configuration?',
      default: false,
    },
  ]);

  let finalConfig = template;

  if (customize) {
    finalConfig = await customizationWizard(template);
  }

  // Write files
  await writeConfigFiles(finalConfig);

  console.log('\n🎉 Configuration complete!');
  console.log('Try: ctxman --cli\n');
}
```

### Step 4: Add CLI Command

```javascript
// bin/cli.js

// Add init command
program
  .command('init')
  .description('Initialize ctxman configuration with interactive wizard')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('-f, --force', 'Overwrite existing configuration files')
  .action(async (options) => {
    const { runInitWizard } = await import('../lib/wizards/init-wizard.js');
    await runInitWizard(options);
  });
```

### Step 5: Add Dependency

```bash
npm install inquirer
```

---

## Acceptance Criteria

### Must Have

- [ ] `ctxman init` command available
- [ ] Auto-detects at least 5 project types (Node.js, TypeScript, Python, Rust, Go)
- [ ] Generates `.contextignore` with sensible defaults
- [ ] Generates `.contextinclude` with sensible defaults
- [ ] Prompts before overwriting existing files

### Should Have

- [ ] Interactive customization mode
- [ ] Preview of generated files before writing
- [ ] Merge with existing configuration option

### Nice to Have

- [ ] Detect frameworks (React, Vue, Express, etc.)
- [ ] Suggest method-level includes for popular libraries
- [ ] Team profile selection (see FEAT-004)

---

## Success Metrics

### Quantitative Metrics

| Metric                        | Before  | Target           | Measurement      |
| ----------------------------- | ------- | ---------------- | ---------------- |
| Time to first context         | ~15 min | < 3 min          | User testing     |
| Configuration support tickets | ~5/week | < 2/week         | Support tracking |
| Init command usage            | N/A     | 80% of new users | Analytics        |
| Configuration error rate      | ~30%    | < 5%             | Error logs       |

### Qualitative Metrics

- [ ] Users report easier onboarding
- [ ] Fewer configuration questions in Discord/Issues
- [ ] Positive feedback on wizard experience

---

## Timeline

| Task                     | Effort  | Week   |
| ------------------------ | ------- | ------ |
| Project detection module | 4 hours | Week 1 |
| Template system          | 2 hours | Week 1 |
| Interactive CLI wizard   | 4 hours | Week 1 |
| CLI command integration  | 2 hours | Week 1 |
| Testing & documentation  | 4 hours | Week 2 |
| Polish & edge cases      | 4 hours | Week 2 |

**Total Estimated Effort**: 20 hours over 2 weeks

---

## Dependencies

| Dependency | Type           | Purpose               |
| ---------- | -------------- | --------------------- |
| inquirer   | npm            | Interactive prompts   |
| glob       | npm (existing) | File pattern matching |

---

## References

- [Inquirer.js Documentation](https://github.com/SBoudrias/Inquirer.js)
- [Yeoman Generator Patterns](https://yeoman.io/authoring/)
- [VS Code Extension API for detection patterns](https://code.visualstudio.com/api)

---

_Planned by: Ctxman Development Team_
_Target: Q1 2025_
