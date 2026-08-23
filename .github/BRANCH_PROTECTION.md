# Branch Protection Rules

This document describes the recommended branch protection rules for the ctxman repository.

## Main Branch Protection

Apply these rules to the `main` branch:

### Required Status Checks

Require the following status checks to pass before merging:

1. **CI Workflow**
   - `lint` - Code style and formatting checks
   - `test` - Unit tests (Node 20.x and 22.x)
   - `codeql` - Security analysis

2. **Coverage Requirements**
   - Minimum coverage threshold (recommended: 80%)

### Branch Protection Settings

```yaml
# Recommended settings for 'main' branch

# Require a pull request before merging
required_pull_request_reviews:
  dismiss_stale_reviews: true
  require_code_owner_reviews: true
  required_approving_review_count: 1

# Require status checks to pass
required_status_checks:
  strict: true # Require branches to be up to date
  contexts:
    - 'lint'
    - 'test (Node 20.x, ubuntu-latest)'
    - 'test (Node 22.x, ubuntu-latest)'
    - 'codeql'

# Require conversation resolution
required_conversation_resolution: true

# Restrictions
restrictions: null # No push restrictions (rely on PR reviews)

# Other settings
enforce_admins: true # Apply rules to admins
allow_force_pushes: false
allow_deletions: false

# Linear history (optional, for cleaner git history)
required_linear_history: false # Set to true if you prefer linear history
```

## Develop Branch Protection

Apply similar rules to the `develop` branch with less strict settings:

```yaml
# Recommended settings for 'develop' branch

required_pull_request_reviews:
  dismiss_stale_reviews: true
  required_approving_review_count: 0 # No approval required for develop

required_status_checks:
  strict: false
  contexts:
    - 'lint'
    - 'test (Node 22.x, ubuntu-latest)'

enforce_admins: false
allow_force_pushes: false
allow_deletions: false
```

## GitHub CLI Commands

Apply branch protection rules using GitHub CLI:

### For Main Branch

```bash
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --input - << 'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "test (Node 20.x, ubuntu-latest)", "test (Node 22.x, ubuntu-latest)", "codeql"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF
```

### For Develop Branch

```bash
gh api repos/:owner/:repo/branches/develop/protection \
  --method PUT \
  --input - << 'EOF'
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["lint", "test (Node 22.x, ubuntu-latest)"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

## Semantic Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality additions
- **PATCH** version for backwards-compatible bug fixes

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

#### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `build`: Changes that affect the build system or external dependencies
- `ci`: Changes to CI configuration files and scripts
- `chore`: Other changes that don't modify src or test files
- `revert`: Reverts a previous commit

#### Examples

```bash
feat(cli): add new --json output format
fix(analyzer): correct token counting for multi-byte characters
docs(readme): update installation instructions
ci(workflows): add concurrency groups to prevent duplicate runs
```

## Release Process

1. Create a release branch or update version
2. Update CHANGELOG.md with changes
3. Create a PR and merge to main
4. Create a GitHub Release with tag `vX.Y.Z`
5. The release workflow will automatically:
   - Run tests
   - Generate changelog
   - Create GitHub release
   - Publish to npm
