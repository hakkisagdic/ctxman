# Team Configuration Profiles

**ID**: FEAT-004
**Status**: 📋 Planned
**Priority**: Medium
**Effort**: Low (6-8 hours)
**Dependencies**: None

---

## Problem Statement

### Why This Matters

When multiple developers work on the same project, context generation should be consistent. Currently:

**Configuration Inconsistency**:

- Each developer creates their own `.contextignore`
- Team members get different context for same project
- LLM responses vary based on who generated context

**Onboarding Overhead**:

- New team members must recreate configurations
- No way to share best practices
- Knowledge loss when developers leave

**CI/CD Challenges**:

- Different local vs CI configurations
- Automated context generation differs from manual
- Difficult to standardize across environments

**User Impact**:

- Inconsistent AI assistance across team
- Repeated configuration work
- Confusion when comparing LLM outputs

**Business Impact**:

- Wasted developer time
- Inconsistent code review assistance
- Reduced team productivity

---

## Proposed Solution

### What We Will Build

A **team profile system** that:

1. Stores configuration in shareable `.ctxmanrc.json`
2. Supports multiple named profiles per project
3. Can be committed to version control
4. Provides profile selection at runtime

### User Experience

```
┌─────────────────────────────────────────────────────────────┐
│                    Team Profile System                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  $ ctxman profile create                                    │
│                                                             │
│  ? Profile name: frontend                                   │
│  ? Description: Frontend development context                │
│                                                             │
│  ✅ Created profile 'frontend' in .ctxmanrc.json           │
│                                                             │
│  $ ctxman --profile frontend                                │
│                                                             │
│  Using profile: frontend                                    │
│  Total tokens: 23,450                                       │
│                                                             │
│  $ cat .ctxmanrc.json                                       │
│  {                                                          │
│    "profiles": {                                            │
│      "frontend": {                                          │
│        "description": "Frontend development context",       │
│        "ignore": ["**/*.test.js", "backend/**"],           │
│        "include": ["src/**", "components/**"]              │
│      },                                                     │
│      "backend": {                                           │
│        "description": "Backend API context",                │
│        "ignore": ["**/*.test.js", "frontend/**"],          │
│        "include": ["api/**", "lib/**"]                     │
│      }                                                      │
│    }                                                        │
│  }                                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Define Profile Schema

```javascript
// lib/config/TeamProfile.js

const PROFILE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    version: { type: 'string', default: '1.0' },
    defaultProfile: { type: 'string' },
    profiles: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          ignore: { type: 'array', items: { type: 'string' } },
          include: { type: 'array', items: { type: 'string' } },
          methodInclude: { type: 'array', items: { type: 'string' } },
          budget: { type: 'string' },
          options: {
            type: 'object',
            properties: {
              methodLevel: { type: 'boolean' },
              gitingest: { type: 'boolean' },
              output: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

export class TeamProfile {
  constructor(projectRoot) {
    this.configPath = path.join(projectRoot, '.ctxmanrc.json');
  }

  async load() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return { version: '1.0', profiles: {} };
    }
  }

  async save(config) {
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  async getProfile(name) {
    const config = await this.load();
    return config.profiles[name] || null;
  }

  async createProfile(name, settings) {
    const config = await this.load();
    config.profiles[name] = settings;
    await this.save(config);
  }

  async setDefault(name) {
    const config = await this.load();
    if (!config.profiles[name]) {
      throw new Error(`Profile '${name}' not found`);
    }
    config.defaultProfile = name;
    await this.save(config);
  }
}
```

### Step 2: Create Profile Manager

```javascript
// lib/config/ProfileManager.js

export class ProfileManager {
  constructor(projectRoot) {
    this.teamProfile = new TeamProfile(projectRoot);
  }

  async applyProfile(name, options = {}) {
    const profile = await this.teamProfile.getProfile(name);

    if (!profile) {
      throw new Error(`Profile '${name}' not found`);
    }

    // Merge profile settings with CLI options
    return {
      ignorePatterns: [...(profile.ignore || []), ...(options.ignorePatterns || [])],
      includePatterns: [...(profile.include || []), ...(options.includePatterns || [])],
      methodInclude: profile.methodInclude,
      budget: profile.budget || options.budget,
      ...profile.options,
      ...options,
    };
  }

  async createProfileInteractive(name) {
    const inquirer = (await import('inquirer')).default;

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Profile description:',
      },
      {
        type: 'input',
        name: 'ignore',
        message: 'Ignore patterns (comma-separated):',
        filter: (input) =>
          input
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
      },
      {
        type: 'input',
        name: 'include',
        message: 'Include patterns (comma-separated):',
        filter: (input) =>
          input
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
      },
      {
        type: 'confirm',
        name: 'methodLevel',
        message: 'Enable method-level analysis?',
        default: false,
      },
    ]);

    await this.teamProfile.createProfile(name, answers);
    console.log(`\n✅ Created profile '${name}' in .ctxmanrc.json\n`);
  }

  async listProfiles() {
    const config = await this.teamProfile.load();
    const profiles = Object.entries(config.profiles);

    if (profiles.length === 0) {
      console.log('No profiles configured. Run: ctxman profile create');
      return;
    }

    console.log('\n📋 Available profiles:\n');
    for (const [name, profile] of profiles) {
      const isDefault = config.defaultProfile === name;
      console.log(`  ${isDefault ? '★' : ' '} ${name}`);
      if (profile.description) {
        console.log(`    ${profile.description}`);
      }
    }
    console.log('');
  }
}
```

### Step 3: Add CLI Commands

```javascript
// bin/cli.js

program
  .option('-p, --profile <name>', 'Use a named configuration profile')
  .hook('preAction', async (thisCommand) => {
    const options = thisCommand.opts();
    if (options.profile) {
      const manager = new ProfileManager(process.cwd());
      const profileConfig = await manager.applyProfile(options.profile);
      // Merge profile config into options
      Object.assign(options, profileConfig);
    }
  });

program
  .command('profile')
  .description('Manage team configuration profiles')
  .command('create [name]')
  .description('Create a new profile')
  .action(async (name) => {
    const manager = new ProfileManager(process.cwd());
    const profileName = name || (await promptProfileName());
    await manager.createProfileInteractive(profileName);
  });

program
  .command('profile')
  .command('list')
  .description('List available profiles')
  .action(async () => {
    const manager = new ProfileManager(process.cwd());
    await manager.listProfiles();
  });

program
  .command('profile')
  .command('default [name]')
  .description('Set default profile')
  .action(async (name) => {
    const teamProfile = new TeamProfile(process.cwd());
    await teamProfile.setDefault(name);
    console.log(`\n✅ Default profile set to '${name}'\n`);
  });
```

### Step 4: Update Scanner to Use Profiles

```javascript
// lib/core/Scanner.js

async scan(options = {}) {
  // Load profile if specified
  if (options.profile) {
    const manager = new ProfileManager(options.root);
    const profileConfig = await manager.applyProfile(options.profile);
    options = { ...profileConfig, ...options };
  }

  // Continue with existing scan logic
  // ...
}
```

---

## Acceptance Criteria

### Must Have

- [ ] `.ctxmanrc.json` file format defined
- [ ] `ctxman --profile <name>` selects profile
- [ ] `ctxman profile create <name>` creates profile
- [ ] `ctxman profile list` shows available profiles
- [ ] Profile config merges with CLI options

### Should Have

- [ ] `ctxman profile default <name>` sets default
- [ ] Profile validation against schema
- [ ] Profile export/import

### Nice to Have

- [ ] Profile inheritance (extend base profile)
- [ ] Remote profile fetching (URL)
- [ ] Profile encryption for secrets

---

## Success Metrics

### Quantitative Metrics

| Metric                    | Target                 | Measurement    |
| ------------------------- | ---------------------- | -------------- |
| Teams using profiles      | 40% of multi-dev teams | Analytics      |
| Profile file adoption     | 50% of projects        | File detection |
| Configuration consistency | 95% match across team  | Diff reports   |

### Qualitative Metrics

- [ ] Teams report easier onboarding
- [ ] Consistent LLM outputs across team
- [ ] Reduced configuration questions

---

## Timeline

| Task                     | Effort  | Week   |
| ------------------------ | ------- | ------ |
| Profile schema & storage | 2 hours | Week 1 |
| Profile manager          | 2 hours | Week 1 |
| CLI commands             | 2 hours | Week 1 |
| Scanner integration      | 1 hour  | Week 1 |
| Testing & docs           | 2 hours | Week 1 |

**Total Estimated Effort**: 9 hours over 1 week

---

## File Format

### .ctxmanrc.json Example

```json
{
  "version": "1.0",
  "defaultProfile": "full-stack",
  "profiles": {
    "full-stack": {
      "description": "Complete project context",
      "ignore": ["**/*.test.js", "coverage/**", "node_modules/**"],
      "include": ["src/**", "lib/**", "api/**"]
    },
    "frontend": {
      "description": "Frontend development only",
      "ignore": ["**/*.test.js", "api/**", "lib/core/**"],
      "include": ["src/**", "components/**"],
      "budget": "gpt-4-turbo"
    },
    "backend": {
      "description": "Backend API development",
      "ignore": ["**/*.test.js", "src/components/**"],
      "include": ["api/**", "lib/**"],
      "options": {
        "methodLevel": true
      }
    }
  }
}
```

---

## References

- [ESLint Configuration Files](https://eslint.org/docs/latest/use/configure/configuration-files) (inspiration)
- [Prettier Configuration](https://prettier.io/docs/en/configuration.html)
- [JSON Schema](https://json-schema.org/)

---

_Planned by: Ctxman Development Team_
_Target: Q1 2025_
