# AI-Powered Context Optimization Suggestions

**ID**: FEAT-005
**Status**: 📋 Planned
**Priority**: Medium
**Effort**: High (24-40 hours)
**Dependencies**: AI integration

---

## Problem Statement

### Why This Matters

Not all context is equally valuable. Developers often include too much or too little context:

**Context Optimization Challenges**:

- Including irrelevant files wastes tokens
- Missing critical files causes LLM hallucinations
- Different tasks need different context
- Manual optimization is time-consuming

**Current Experience**:

```
$ ctxman --cli

# User sends all 50,000 tokens to LLM for a simple bug fix
# LLM gets confused by irrelevant context
# User doesn't know what to include/exclude
```

**User Impact**:

- Higher LLM costs
- Lower quality responses
- Time spent tuning context

**Business Impact**:

- Reduced value proposition
- User frustration
- Competitive disadvantage

---

## Proposed Solution

### What We Will Build

An **AI-powered suggestion system** that:

1. Analyzes task type from user prompt
2. Identifies relevant files and methods
3. Suggests optimal context configuration
4. Learns from user feedback

### User Experience

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Context Suggestions                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  $ ctxman suggest "Fix the authentication bug in login"     │
│                                                             │
│  🤖 Analyzing task: Bug fix - Authentication               │
│                                                             │
│  📁 Recommended files (high relevance):                     │
│  ├── lib/api/auth.js (95% match)                           │
│  │   └── Methods: login, validateToken, refreshToken       │
│  ├── lib/middleware/auth.js (88% match)                    │
│  │   └── Methods: authenticate, authorize                   │
│  └── lib/models/User.js (75% match)                        │
│      └── Methods: findByCredentials, updateLastLogin       │
│                                                             │
│  📁 Related files (medium relevance):                       │
│  ├── lib/utils/jwt.js (60% match)                          │
│  └── lib/config/security.js (45% match)                    │
│                                                             │
│  📁 Files to exclude:                                       │
│  ├── test/api/auth.test.js (test file)                     │
│  ├── lib/frontend/** (unrelated to backend)                │
│  └── docs/api/** (documentation)                            │
│                                                             │
│  💾 Estimated tokens: 3,450 (vs 45,000 full project)        │
│                                                             │
│  Apply suggestions? [Y/n] y                                 │
│                                                             │
│  ✅ Generated optimized context                             │
│  Run: ctxman --cli --include @suggested                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create Task Analyzer

```javascript
// lib/suggestions/TaskAnalyzer.js

const TASK_PATTERNS = {
  bugFix: {
    keywords: ['fix', 'bug', 'error', 'issue', 'broken', 'crash', 'fail'],
    contextType: 'minimal',
    includeTests: false,
  },
  feature: {
    keywords: ['add', 'implement', 'create', 'new feature', 'extend'],
    contextType: 'full',
    includeTests: true,
  },
  refactor: {
    keywords: ['refactor', 'cleanup', 'restructure', 'optimize'],
    contextType: 'broad',
    includeTests: true,
  },
  documentation: {
    keywords: ['document', 'docs', 'readme', 'comment'],
    contextType: 'minimal',
    includeTests: false,
  },
  test: {
    keywords: ['test', 'spec', 'coverage'],
    contextType: 'implementation',
    includeTests: false,
  },
};

export class TaskAnalyzer {
  analyze(prompt) {
    const promptLower = prompt.toLowerCase();

    // Detect task type
    let taskType = 'general';
    let maxMatch = 0;

    for (const [type, config] of Object.entries(TASK_PATTERNS)) {
      const matchCount = config.keywords.filter((kw) => promptLower.includes(kw)).length;
      if (matchCount > maxMatch) {
        maxMatch = matchCount;
        taskType = type;
      }
    }

    // Extract entities (file names, function names, etc.)
    const entities = this.extractEntities(prompt);

    return {
      type: taskType,
      entities,
      confidence: maxMatch > 0 ? 0.7 : 0.3,
    };
  }

  extractEntities(prompt) {
    const entities = {
      files: [],
      functions: [],
      modules: [],
    };

    // Extract quoted strings (likely file/function names)
    const quoted = prompt.match(/["']([^"']+)["']/g);
    if (quoted) {
      quoted.forEach((q) => {
        const content = q.slice(1, -1);
        if (content.includes('.')) {
          entities.files.push(content);
        } else {
          entities.functions.push(content);
        }
      });
    }

    // Extract capitalized words (likely class/module names)
    const capitalized = prompt.match(/\b[A-Z][a-zA-Z]+\b/g);
    if (capitalized) {
      entities.modules.push(...capitalized);
    }

    return entities;
  }
}
```

### Step 2: Create Relevance Scorer

```javascript
// lib/suggestions/RelevanceScorer.js

export class RelevanceScorer {
  constructor(fileIndex) {
    this.fileIndex = fileIndex;
  }

  async score(taskAnalysis) {
    const scores = [];
    const { type, entities } = taskAnalysis;

    for (const file of this.fileIndex.files) {
      const score = this.calculateScore(file, taskAnalysis);
      scores.push({
        file: file.path,
        score,
        relevance: this.categorizeRelevance(score),
        methods: this.selectMethods(file, taskAnalysis),
      });
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  calculateScore(file, analysis) {
    let score = 0;
    const { type, entities } = analysis;

    // Check if file matches mentioned entities
    for (const fileName of entities.files) {
      if (file.path.includes(fileName)) {
        score += 50;
      }
    }

    // Check if file contains mentioned functions
    if (file.methods) {
      for (const func of entities.functions) {
        if (file.methods.some((m) => m.name === func)) {
          score += 30;
        }
      }
    }

    // Check module relevance
    for (const module of entities.modules) {
      if (file.path.toLowerCase().includes(module.toLowerCase())) {
        score += 20;
      }
    }

    // Apply task-type specific scoring
    score += this.applyTaskTypeScoring(file, type);

    // Reduce score for test files (unless task is about tests)
    if (file.path.includes('.test.') || file.path.includes('.spec.')) {
      if (type !== 'test') {
        score -= 30;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  applyTaskTypeScoring(file, type) {
    let bonus = 0;

    switch (type) {
      case 'bugFix':
        // Prioritize implementation files
        if (!file.path.includes('.test.') && !file.path.includes('docs/')) {
          bonus += 10;
        }
        break;
      case 'feature':
        // Prioritize interfaces and core files
        if (file.path.includes('index.') || file.path.includes('interface.')) {
          bonus += 15;
        }
        break;
      case 'refactor':
        // Prioritize larger files (more impact)
        if (file.lines > 200) {
          bonus += 10;
        }
        break;
    }

    return bonus;
  }

  categorizeRelevance(score) {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'exclude';
  }

  selectMethods(file, analysis) {
    if (!file.methods) return [];

    const relevantMethods = file.methods.filter((method) => {
      for (const func of analysis.entities.functions) {
        if (method.name === func) return true;
      }
      return false;
    });

    return relevantMethods.map((m) => m.name);
  }
}
```

### Step 3: Create Suggestion Engine

```javascript
// lib/suggestions/SuggestionEngine.js

export class SuggestionEngine {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.taskAnalyzer = new TaskAnalyzer();
    this.scorer = null; // Initialized after indexing
  }

  async suggest(prompt) {
    // Analyze the task
    const analysis = this.taskAnalyzer.analyze(prompt);

    // Index project files if not already done
    const fileIndex = await this.indexProject();
    this.scorer = new RelevanceScorer(fileIndex);

    // Score all files
    const scores = await this.scorer.score(analysis);

    // Generate suggestions
    const suggestions = {
      analysis,
      include: scores.filter((s) => s.relevance === 'high'),
      consider: scores.filter((s) => s.relevance === 'medium'),
      exclude: scores.filter((s) => s.relevance === 'exclude'),
      estimatedTokens: this.estimateTokens(scores.filter((s) => s.relevance !== 'exclude')),
    };

    return suggestions;
  }

  async indexProject() {
    const scanner = new Scanner({ root: this.projectRoot });
    const result = await scanner.scan();

    return {
      files: result.files,
      totalTokens: result.totalTokens,
    };
  }

  estimateTokens(files) {
    return files.reduce((sum, f) => {
      const fileData = this.scorer.fileIndex.files.find((fi) => fi.path === f.file);
      return sum + (fileData ? fileData.tokens : 0);
    }, 0);
  }

  async applySuggestions(suggestions) {
    // Generate include patterns
    const includePatterns = suggestions.include.map((s) => s.file);

    // Create temporary suggestion file
    const suggestionFile = path.join(this.projectRoot, '.ctxman', 'suggested-context.json');
    await fs.writeFile(
      suggestionFile,
      JSON.stringify(
        {
          include: includePatterns,
          methods: suggestions.include.flatMap((s) => s.methods.map((m) => `${s.file}:${m}`)),
        },
        null,
        2
      )
    );

    return suggestionFile;
  }
}
```

### Step 4: Add CLI Command

```javascript
// bin/cli.js

program
  .command('suggest <prompt>')
  .description('Get AI-powered context suggestions for a task')
  .option('-a, --apply', 'Apply suggestions automatically')
  .option('-o, --output <file>', 'Save suggestions to file')
  .action(async (prompt, options) => {
    const engine = new SuggestionEngine(process.cwd());

    console.log(`\n🤖 Analyzing task: ${prompt}\n`);

    const suggestions = await engine.suggest(prompt);

    // Display results
    displaySuggestions(suggestions);

    if (options.apply) {
      await engine.applySuggestions(suggestions);
      console.log('\n✅ Suggestions applied\n');
    }
  });

function displaySuggestions(suggestions) {
  const { include, consider, exclude, estimatedTokens } = suggestions;

  if (include.length > 0) {
    console.log('📁 Recommended files (high relevance):');
    include.forEach((f) => {
      console.log(`├── ${f.file} (${f.score}% match)`);
      if (f.methods.length > 0) {
        console.log(`│   └── Methods: ${f.methods.join(', ')}`);
      }
    });
    console.log('');
  }

  if (consider.length > 0) {
    console.log('📁 Related files (medium relevance):');
    consider.slice(0, 5).forEach((f) => {
      console.log(`├── ${f.file} (${f.score}% match)`);
    });
    console.log('');
  }

  if (exclude.length > 0) {
    console.log('📁 Files to exclude:');
    exclude.slice(0, 5).forEach((f) => {
      console.log(`├── ${f.file}`);
    });
    console.log('');
  }

  console.log(`💾 Estimated tokens: ${estimatedTokens.toLocaleString()}`);
}
```

---

## Acceptance Criteria

### Must Have

- [ ] `ctxman suggest <prompt>` analyzes task
- [ ] Returns relevant file suggestions
- [ ] Shows relevance scores
- [ ] Estimates token savings

### Should Have

- [ ] Method-level suggestions
- [ ] Learn from user feedback
- [ ] Task type detection

### Nice to Have

- [ ] Integration with LLM for better analysis
- [ ] Historical suggestion tracking
- [ ] Team-based learning

---

## Success Metrics

### Quantitative Metrics

| Metric              | Target              | Measurement       |
| ------------------- | ------------------- | ----------------- |
| Suggestion accuracy | 80% user acceptance | Feedback tracking |
| Token reduction     | 50% average         | Token comparison  |
| Time saved          | 5 min per query     | User testing      |

### Qualitative Metrics

- [ ] Users report better LLM results
- [ ] Reduced context tuning time
- [ ] Positive user feedback

---

## Timeline

| Task                 | Effort  | Week     |
| -------------------- | ------- | -------- |
| Task analyzer        | 6 hours | Week 1-2 |
| Relevance scorer     | 8 hours | Week 2-3 |
| Suggestion engine    | 8 hours | Week 3-4 |
| CLI integration      | 4 hours | Week 4   |
| Testing & refinement | 8 hours | Week 4-5 |

**Total Estimated Effort**: 34 hours over 5 weeks

---

## References

- [Information Retrieval Scoring](https://nlp.stanford.edu/IR-book/)
- [Semantic Code Search](https://github.com/github/semantic)
- [CodeBERT for Code Understanding](https://github.com/microsoft/CodeBERT)

---

_Planned by: Ctxman Development Team_
_Target: Q2 2025_
