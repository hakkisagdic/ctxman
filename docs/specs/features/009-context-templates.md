# Context Templates

**ID**: FEAT-009
**Status**: Planned
**Priority**: High
**Effort**: Low (4-6 hours)
**Dependencies**: None

---

## Problem Statement

### Why This Matters

Users must manually configure context for different development tasks:

**Repeated Configuration Effort**:
- Bug fixes need focused, minimal context
- Features need broader context with interfaces
- Refactoring needs comprehensive context
- Code review needs change-focused context

**Current Friction**:
- Manual pattern tuning per task type
- Inconsistent context quality
- Learning curve for optimal configuration
- Time wasted on trial and error

**User Impact**:
- Suboptimal LLM responses due to wrong context
- 5-10 minutes per task configuring context
- Frustration with tool complexity
- Inconsistent results across team

**Business Impact**:
- Reduced tool adoption
- Lower productivity gains
- Increased support burden
- Competitive disadvantage

---

## Proposed Solution

### What We Will Build

A **context template system** that:

1. Provides pre-built templates for common use cases
2. Auto-selects appropriate template based on task description
3. Allows custom template creation and sharing
4. Integrates with interactive wizard

### User Experience

```
+-------------------------------------------------------------+
|                    Context Templates                         |
+-------------------------------------------------------------+
|                                                             |
|  $ ctxman --template bug-fix                                |
|                                                             |
|  Using template: Bug Fix                                    |
|  - Focused context (excluded test files, docs)              |
|  - Method-level analysis enabled                            |
|  - Target: ~10K tokens optimal                              |
|                                                             |
|  Available templates:                                       |
|                                                             |
|  +---------------------------------------------------+      |
|  | Template      | Description              | Tokens |      |
|  +---------------------------------------------------+      |
|  | bug-fix       | Minimal focused context  | ~10K   |      |
|  | feature       | Full interface context   | ~30K   |      |
|  | refactor      | Comprehensive analysis   | ~50K   |      |
|  | code-review   | Change-focused context   | varies |      |
|  | documentation | Public API surface       | ~15K   |      |
|  | test          | Implementation context   | ~20K   |      |
|  +---------------------------------------------------+      |
|                                                             |
|  $ ctxman --template feature --describe "Add OAuth login"   |
|                                                             |
|  Matched template: feature                                  |
|  Auto-detected context:                                     |
|  - auth/** (OAuth related)                                  |
|  - middleware/** (authentication)                           |
|  - models/User.js (user management)                         |
|  - config/security.js                                       |
|                                                             |
|  Estimated tokens: 18,450                                   |
|                                                             |
+-------------------------------------------------------------+
```

---

## Implementation Steps

### Step 1: Define Template Schema

```javascript
// lib/templates/TemplateSchema.js

export const TEMPLATE_SCHEMA = {
  name: 'string (required)',
  description: 'string (required)',
  category: 'bug-fix | feature | refactor | review | docs | test',
  tokenTarget: 'number (recommended max tokens)',
  config: {
    ignorePatterns: ['string'],
    includePatterns: ['string'],
    methodLevel: 'boolean',
    methodInclude: ['string'],
    options: {
      compact: 'boolean',
      gitingest: 'boolean',
    },
  },
  rules: [
    {
      match: 'string (regex or keyword)',
      include: ['string'],
      exclude: ['string'],
    },
  ],
};

export const BUILTIN_TEMPLATES = {
  'bug-fix': {
    name: 'Bug Fix',
    description: 'Minimal focused context for debugging',
    category: 'bug-fix',
    tokenTarget: 10000,
    config: {
      ignorePatterns: [
        '**/*.test.js',
        '**/*.spec.js',
        'docs/**',
        '**/*.md',
        'examples/**',
      ],
      methodLevel: true,
      options: {
        compact: true,
      },
    },
    rules: [
      {
        match: 'fix|bug|error|issue|broken',
        include: ['src/**'],
        exclude: ['**/*.test.js'],
      },
    ],
  },

  'feature': {
    name: 'Feature Development',
    description: 'Full interface context for new features',
    category: 'feature',
    tokenTarget: 30000,
    config: {
      ignorePatterns: [
        '**/*.test.js',
        'docs/**',
        'examples/**',
      ],
      methodLevel: false,
      options: {
        compact: true,
      },
    },
    rules: [
      {
        match: 'add|implement|create|new feature',
        include: ['src/**', 'lib/**'],
      },
    ],
  },

  'refactor': {
    name: 'Refactoring',
    description: 'Comprehensive context for restructuring',
    category: 'refactor',
    tokenTarget: 50000,
    config: {
      ignorePatterns: [
        'docs/**',
        '**/*.md',
      ],
      methodLevel: true,
      options: {
        compact: false,
      },
    },
    rules: [
      {
        match: 'refactor|cleanup|restructure|optimize',
        include: ['src/**', 'lib/**', 'test/**'],
      },
    ],
  },

  'code-review': {
    name: 'Code Review',
    description: 'Change-focused context for reviews',
    category: 'review',
    tokenTarget: 20000,
    config: {
      methodLevel: true,
      options: {
        gitChanged: true,
      },
    },
  },

  'documentation': {
    name: 'Documentation',
    description: 'Public API surface for docs',
    category: 'docs',
    tokenTarget: 15000,
    config: {
      ignorePatterns: [
        '**/*.test.js',
        'test/**',
        'examples/**',
      ],
      methodLevel: true,
      methodInclude: ['*'], // Public methods only (no underscore prefix)
      options: {
        compact: true,
      },
    },
  },

  'test': {
    name: 'Test Writing',
    description: 'Implementation context for tests',
    category: 'test',
    tokenTarget: 20000,
    config: {
      ignorePatterns: [
        'docs/**',
        '**/*.md',
      ],
      methodLevel: true,
      options: {
        includePrivate: true,
      },
    },
  },
};
```

### Step 2: Create Template Manager

```javascript
// lib/templates/TemplateManager.js

import { BUILTIN_TEMPLATES } from './TemplateSchema.js';

export class TemplateManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.customTemplatesPath = path.join(projectRoot, '.ctxman', 'templates');
  }

  list() {
    const builtIn = Object.entries(BUILTIN_TEMPLATES).map(([id, template]) => ({
      id,
      ...template,
      source: 'builtin',
    }));

    const custom = this.loadCustomTemplates();

    return [...builtIn, ...custom];
  }

  get(templateId) {
    // Check built-in first
    if (BUILTIN_TEMPLATES[templateId]) {
      return {
        id: templateId,
        ...BUILTIN_TEMPLATES[templateId],
        source: 'builtin',
      };
    }

    // Check custom templates
    const custom = this.loadCustomTemplates();
    return custom.find(t => t.id === templateId) || null;
  }

  async apply(templateId, options = {}) {
    const template = this.get(templateId);

    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    // Merge template config with options
    const config = {
      ...template.config,
      ...options,
    };

    // Apply rules if task description provided
    if (options.description) {
      const rules = this.matchRules(template, options.description);
      if (rules) {
        config.includePatterns = [
          ...(config.includePatterns || []),
          ...(rules.include || []),
        ];
        config.ignorePatterns = [
          ...(config.ignorePatterns || []),
          ...(rules.exclude || []),
        ];
      }
    }

    return config;
  }

  matchRules(template, description) {
    const descLower = description.toLowerCase();

    for (const rule of template.rules || []) {
      const matchPattern = new RegExp(rule.match, 'i');
      if (matchPattern.test(description)) {
        return {
          include: rule.include,
          exclude: rule.exclude,
        };
      }
    }

    return null;
  }

  loadCustomTemplates() {
    try {
      const files = fs.readdirSync(this.customTemplatesPath);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const content = fs.readFileSync(
            path.join(this.customTemplatesPath, f),
            'utf-8'
          );
          return {
            id: path.basename(f, '.json'),
            ...JSON.parse(content),
            source: 'custom',
          };
        });
    } catch {
      return [];
    }
  }

  async createCustom(id, template) {
    const dir = this.customTemplatesPath;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filepath = path.join(dir, `${id}.json`);
    fs.writeFileSync(filepath, JSON.stringify(template, null, 2));

    return filepath;
  }
}
```

### Step 3: Add CLI Integration

```javascript
// bin/cli.js

program
  .option('-t, --template <name>', 'Use a pre-built context template')
  .option('--describe <text>', 'Task description for smart template matching')
  .option('--list-templates', 'List available templates')
  .hook('preAction', async (thisCommand) => {
    const options = thisCommand.opts();

    if (options.listTemplates) {
      const manager = new TemplateManager(process.cwd());
      const templates = manager.list();

      console.log('\n📋 Available Templates:\n');
      for (const t of templates) {
        console.log(`  ${t.id.padEnd(15)} ${t.description}`);
      }
      console.log('');
      process.exit(0);
    }

    if (options.template) {
      const manager = new TemplateManager(process.cwd());
      const templateConfig = await manager.apply(options.template, {
        description: options.describe,
      });

      // Merge into options
      Object.assign(options, templateConfig);
    }
  });

program
  .command('template')
  .description('Manage context templates')
  .command('create <name>')
  .description('Create a custom template')
  .option('--from <template>', 'Base template to copy from')
  .action(async (name, options) => {
    const manager = new TemplateManager(process.cwd());

    if (options.from) {
      const base = manager.get(options.from);
      if (!base) {
        console.error(`Template '${options.from}' not found`);
        process.exit(1);
      }
      await manager.createCustom(name, base);
    } else {
      // Interactive creation
      const inquirer = (await import('inquirer')).default;
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: 'Template description:',
        },
        {
          type: 'number',
          name: 'tokenTarget',
          message: 'Target token count:',
          default: 20000,
        },
        // ... more prompts
      ]);

      await manager.createCustom(name, answers);
    }

    console.log(`\n✅ Created template '${name}'\n`);
  });
```

### Step 4: Integrate with Wizard

```javascript
// lib/ui/WizardUI.js (update existing wizard)

const TEMPLATE_CHOICES = [
  { name: 'Bug Fix - Minimal focused context', value: 'bug-fix' },
  { name: 'Feature - Full interface context', value: 'feature' },
  { name: 'Refactor - Comprehensive analysis', value: 'refactor' },
  { name: 'Code Review - Change-focused', value: 'code-review' },
  { name: 'Documentation - API surface', value: 'documentation' },
  { name: 'Test Writing - Implementation context', value: 'test' },
  { name: 'Custom - Manual configuration', value: 'custom' },
];

async function runWizard() {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'template',
      message: 'What are you working on?',
      choices: TEMPLATE_CHOICES,
    },
    // ... conditional questions based on template
  ]);

  if (answers.template !== 'custom') {
    const manager = new TemplateManager(process.cwd());
    return manager.apply(answers.template);
  }

  // ... existing custom flow
}
```

---

## Acceptance Criteria

### Must Have
- [ ] 6 built-in templates (bug-fix, feature, refactor, code-review, documentation, test)
- [ ] `--template <name>` CLI flag
- [ ] `--list-templates` shows available templates
- [ ] Template applies configuration automatically
- [ ] Template selection in interactive wizard

### Should Have
- [ ] `--describe <text>` matches template rules
- [ ] Custom template creation via CLI
- [ ] Template inheritance (extend base template)
- [ ] Team template sharing (.ctxman/templates/)

### Nice to Have
- [ ] Community template registry
- [ ] Template validation against schema
- [ ] Template preview before applying
- [ ] Auto-suggest template based on git changes

---

## Success Metrics

### Quantitative Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Template usage | 70% of analyses | Analytics |
| Time saved | 5 min per analysis | User testing |
| Configuration errors | -50% reduction | Error tracking |

### Qualitative Metrics

- [ ] Users report easier tool adoption
- [ ] More consistent LLM results per task type
- [ ] Positive feedback on template usefulness

---

## Timeline

| Task | Effort | Week |
|------|--------|------|
| Template schema & built-ins | 2 hours | Week 1 |
| Template manager | 2 hours | Week 1 |
| CLI integration | 1 hour | Week 1 |
| Wizard integration | 1 hour | Week 1 |

**Total Estimated Effort**: 6 hours over 1 week

---

## Template Examples

### Bug Fix Template

```json
{
  "name": "Bug Fix",
  "description": "Minimal focused context for debugging",
  "tokenTarget": 10000,
  "config": {
    "ignorePatterns": ["**/*.test.js", "docs/**", "**/*.md"],
    "methodLevel": true,
    "options": { "compact": true }
  }
}
```

### Feature Template

```json
{
  "name": "Feature Development",
  "description": "Full interface context for new features",
  "tokenTarget": 30000,
  "config": {
    "ignorePatterns": ["**/*.test.js", "docs/**"],
    "methodLevel": false,
    "options": { "compact": true }
  }
}
```

---

## References

- [VS Code Task Templates](https://code.visualstudio.com/docs/editor/tasks)
- [GitHub Issue Templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests)
- [Cookiecutter Templates](https://www.cookiecutter.io/)

---

*Planned by: Ctxman Development Team*
*Target: Q1 2025*
