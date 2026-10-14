# Contributing to Ctxman

Thank you for your interest in contributing to Ctxman! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Code Style](#code-style)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [Releasing](#releasing)

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## Development Setup

### Prerequisites

- **Node.js**: Version 22 or newer (tested on 22 LTS and 24 LTS; see `.nvmrc`)
- **npm**: Comes with Node.js
- **Git**: For version control

### Installation

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/ctxman.git
   cd ctxman
   ```

2. **Install dependencies**

   ```bash
   npm ci --prefer-offline --no-audit
   ```

3. **Verify installation**

   ```bash
   npm run test
   npm run lint
   ```

### Development Workflow

1. **Create a feature branch**

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes**

   - Follow the [code style](#code-style) guidelines
   - Write tests for new functionality
   - Update documentation as needed

3. **Test your changes**

   ```bash
   # Run all tests
   npm run test

   # Run with coverage
   npm run test:coverage

   # Run linting
   npm run lint

   # Format code
   npm run format
   ```

4. **Commit your changes**

   ```bash
   git commit -m "feat: add new feature"
   ```

   See [Commit Conventions](#commit-conventions) for details.

## Project Structure

```
ctxman/
├── bin/                  # CLI entry points
│   ├── cli.js           # Main CLI
│   ├── mcp-server.js    # MCP server
│   └── cm-gitingest.js  # GitHub integration
├── lib/                  # Core library modules
│   ├── analyzers/       # Token and method analysis
│   ├── api/             # REST API and MCP server
│   ├── cache/           # Caching system
│   ├── core/            # Core modules (Scanner, Analyzer, etc.)
│   ├── formatters/      # Output formatters (JSON, YAML, TOON, etc.)
│   ├── parsers/         # Git ignore and method filter parsers
│   ├── plugins/         # Plugin system
│   ├── ui/              # Terminal UI components (Ink-based)
│   ├── utils/           # Utility functions
│   ├── watch/           # File watching
│   └── wizards/         # Interactive wizards
├── test/                 # Test files
├── docs/                 # Documentation
└── scripts/              # Installation scripts
```

## Code Style

### JavaScript/ES Modules

- **Module System**: ES Modules (ESM) with `type: "module"` in package.json
- **Syntax**: ES9+ JavaScript
- **Imports**: Use `import`/`export` (not `require`/`module.exports`)

### Formatting

We use **Prettier** for consistent code formatting. Configuration is in `.prettierrc`.

```bash
# Format all files
npm run format

# Check formatting without changes
npm run format -- --check
```

### Linting

We use **ESLint 9.x** with flat config (`eslint.config.js`).

```bash
# Run linter
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Code Conventions

1. **Naming**

   - `camelCase` for variables and functions
   - `PascalCase` for classes and exported components
   - `UPPER_SNAKE_CASE` for constants

2. **Async/Await**

   - Prefer `async/await` over `.then()/.catch()`
   - Use `try/catch` for error handling

3. **Error Handling**

   ```javascript
   // Good
   try {
     const result = await someAsyncOperation();
     return result;
   } catch (error) {
     logger.error(`Operation failed: ${error.message}`);
     throw error;
   }
   ```

4. **Logging**

   - Use the built-in logger: `import { getLogger } from '../utils/logger.js'`
   - Log levels: `debug`, `info`, `warn`, `error`

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                         |
| ---------- | ----------------------------------- |
| `feat`     | New feature                         |
| `fix`      | Bug fix                             |
| `docs`     | Documentation only                  |
| `style`    | Code style (formatting, semicolons) |
| `refactor` | Code refactoring                    |
| `perf`     | Performance improvement             |
| `test`     | Adding or updating tests            |
| `chore`    | Maintenance tasks                   |
| `ci`       | CI/CD changes                       |

### Examples

```bash
# Feature
git commit -m "feat: add support for Python files"

# Bug fix
git commit -m "fix: correct token count for large files"

# Breaking change
git commit -m "feat!: change API response format

BREAKING CHANGE: The API now returns nested objects instead of flat arrays"

# With scope
git commit -m "feat(analyzer): add method-level analysis for Go"
```

### Pre-commit Hooks

Husky runs lint-staged on every commit:

- ESLint on `.js` files
- Prettier on all supported files

## Pull Request Process

### Before Submitting

1. **Update from main**

   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run all checks**

   ```bash
   npm run test
   npm run lint
   npm run format -- --check
   ```

3. **Update documentation**

   - Update README.md if adding new features
   - Update or create docs in `docs/` directory
   - Add JSDoc comments to new functions/classes

### PR Requirements

- **Title**: Follow conventional commit format
- **Description**: Explain what and why (not just how)
- **Tests**: All new code must have tests
- **Documentation**: Update relevant docs
- **CI**: All CI checks must pass

### PR Template

When you create a PR, fill out the template:

```markdown
## Description

[Describe your changes]

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

[Describe testing done]

## Checklist

- [ ] Tests pass
- [ ] Linting passes
- [ ] Documentation updated
```

### Review Process

1. Automated checks run on all PRs
2. At least one maintainer review required
3. Address all review comments
4. Squash and merge when approved

## Testing Requirements

### Test Framework

We use **Vitest** for testing.

```bash
# Run all tests
npm run test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Test Structure

```
test/
├── unit/                 # Unit tests
├── integration/          # Integration tests
├── e2e/                  # End-to-end tests
└── fixtures/             # Test fixtures
```

### Writing Tests

1. **File naming**: `*.test.js` or `*.spec.js`
2. **Test structure**:

   ```javascript
   import { describe, it, expect, beforeEach } from 'vitest';

   describe('MyModule', () => {
     beforeEach(() => {
       // Setup
     });

     it('should do something', () => {
       const result = myFunction();
       expect(result).toBe(expected);
     });
   });
   ```

3. **Coverage requirements**:
   - New code: Aim for 80%+ coverage
   - Critical paths: Must have tests
   - Edge cases: Include boundary tests

### Test Categories

| Category        | Command                 | Description              |
| --------------- | ----------------------- | ------------------------ |
| All             | `npm run test`          | Run all tests            |
| Coverage        | `npm run test:coverage` | Generate coverage report |
| V3 Features     | `npm run test:v3`       | Platform features tests  |
| Git Integration | `npm run test:git`      | Git features tests       |
| Plugin System   | `npm run test:plugin`   | Plugin tests             |
| API Server      | `npm run test:api`      | REST API tests           |

## Documentation

### Types of Documentation

1. **README.md**: User-facing overview and quick start
2. **docs/**: Detailed documentation
3. **JSDoc**: Inline API documentation
4. **Code comments**: Complex logic explanation

### Documentation Style

- **Clear and concise**: Get to the point quickly
- **Include examples**: Show, don't just tell
- **Keep updated**: Update docs with code changes
- **Bilingual**: Provide both English and Turkish versions

### Creating New Documentation

1. Create English version in appropriate location
2. Create Turkish translation with `-tr` suffix
3. Update README.md to link to new docs
4. Follow existing document structure

## Releasing

Releases are cut from `main` by pushing a version tag; maintainers only.

1. On a branch, bump the version without tagging: `npm version minor --no-git-tag-version`
   (or `patch` / `major`).
2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and start a new empty
   `## [Unreleased]` section above it. Open a PR and merge it once CI is green.
3. Tag the merge commit and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.

The tag push starts two workflows. `release.yml` checks that the tag matches `package.json`, runs
lint and tests, and creates the GitHub Release with the `## [X.Y.Z]` changelog section as notes.
`npm-publish.yml` publishes to npm with provenance through npm Trusted Publishing (OIDC), and
skips the publish if that version is already on the registry. `ctxman update` reads GitHub
Releases, so every npm version should have a tag.

## Getting Help

- **Issues**: Open a GitHub issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check existing docs first

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Ctxman! 🎉
