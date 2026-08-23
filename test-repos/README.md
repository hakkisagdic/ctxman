# Test Repositories

This directory contains real-world repositories used for manual testing and validation of Ctxman features.

## Purpose

- **Manual Testing**: Test v3.0.0+ features with real codebases
- **Performance Validation**: Benchmark analysis speed on production repos
- **Feature Testing**: Validate Git integration, watch mode, API server
- **Regression Testing**: Ensure features work on diverse codebases

## Current Test Repositories

### 1. Express.js (expressjs/express)

**Repository:** https://github.com/expressjs/express
**Added:** v3.0.0
**Type:** Git Submodule
**Version:** v5.1.0+

**Stats:**

- **Language**: JavaScript (Node.js)
- **Size**: ~150-200 files
- **History**: 2009-present (15+ years)
- **Commits**: 10,000+
- **Contributors**: 300+
- **Stars**: 65,000+

**Why Express?**

- Industry-standard Node.js framework
- Rich Git history for testing git integration
- Multiple contributors for author tracking
- Well-organized codebase
- Perfect size for testing (not too small, not too large)
- Method extraction works perfectly (JavaScript)

**Test Scenarios:**

```bash
# Navigate to Express
cd test-repos/express

# Basic analysis
ctxman --cli

# Method-level analysis
ctxman --cli -m --output toon

# Git integration tests
ctxman --changed-since v4.18.0
ctxman --changed-only
ctxman --with-authors

# Watch mode test
ctxman watch

# API server test (from project root)
cd ../../
ctxman serve --port 3000
# Then: curl http://localhost:3000/api/v1/analyze?path=./test-repos/express
```

---

## Adding New Test Repositories

### As Git Submodule (Recommended)

```bash
# Add submodule
git submodule add <REPO_URL> test-repos/<NAME>

# Example: Add Fastify
git submodule add https://github.com/fastify/fastify.git test-repos/fastify

# Update all submodules
git submodule update --init --recursive

# Update to latest
cd test-repos/<NAME>
git pull origin main
cd ../..
git add test-repos/<NAME>
git commit -m "chore: Update test repo <NAME>"
```

### As Regular Clone (Alternative)

```bash
# Clone repo
git clone <REPO_URL> test-repos/<NAME>

# Note: Add to .gitignore if you don't want to track it
echo "test-repos/<NAME>" >> .gitignore
```

---

## Test Repository Criteria

Good test repositories should have:

✅ **Size**: 50-500 files (manageable for manual testing)
✅ **Language**: Supported by Ctxman (preferably JS/TS/Python/Rust)
✅ **Git History**: Active development, multiple contributors
✅ **Structure**: Well-organized, modular codebase
✅ **Popularity**: Well-known projects (demonstrates production use)

---

## Recommended Test Repos (Future)

### Small (<100 files)

- **Hono** - Minimal web framework (~30 files, TypeScript)
- **Nano Stores** - State management (~20 files, TypeScript)

### Medium (100-300 files)

- **Fastify** - Fast web framework (~150 files, JavaScript)
- **Vitest** - Modern test framework (~200 files, TypeScript)
- **Vite** - Build tool (~250 files, TypeScript)

### Large (300-1000 files)

- **Next.js** - React framework (~500 files, TypeScript)
- **Astro** - Static site generator (~400 files, TypeScript)
- **Prisma** - Database ORM (~600 files, TypeScript)

### Multi-Language

- **Tauri** - Desktop framework (Rust + JS)
- **Deno** - Runtime (Rust + TypeScript)

---

## Running Tests

### Quick Test (Current Repo)

```bash
# From project root
ctxman --cli

# Expected: Analyze ctxman itself
```

### Express Test

```bash
# Navigate to Express
cd test-repos/express

# Run analysis
ctxman --cli -m

# Expected output:
# 📊 ~150-200 files
# 📊 ~50k-100k tokens
# 🔧 ~500-1000 methods
```

### Git Integration Test

```bash
cd test-repos/express

# Analyze recent changes
ctxman --changed-since v5.0.0

# Expected: Files changed since v5.0.0
```

### Watch Mode Test

```bash
cd test-repos/express

# Start watch
ctxman watch

# In another terminal:
echo "// test change" >> lib/router/index.js

# Expected: Auto-detection and re-analysis
```

### API Server Test

```bash
# Start server (from project root)
ctxman serve --port 3000

# Call API
curl "http://localhost:3000/api/v1/analyze?path=./test-repos/express&methods=true"

# Expected: JSON response with analysis
```

---

## Test Checklist

Use this checklist when testing new Ctxman versions:

### Basic Features

- [ ] File scanning works
- [ ] Token counting accurate
- [ ] Method extraction works
- [ ] Output formats generate correctly (TOON, JSON, etc.)
- [ ] Filtering rules respected (.contextignore, .contextinclude)

### v2.3.0+ Features

- [ ] TOON format (40-50% token reduction)
- [ ] GitIngest chunking
- [ ] Wizard mode
- [ ] Dashboard mode
- [ ] Format conversion

### v2.3.7+ Features

- [ ] LLM auto-detection
- [ ] Context fit analysis
- [ ] Model-specific optimization

### v3.0.0+ Features

- [ ] Git integration (--changed-only, --changed-since)
- [ ] Watch mode (real-time file monitoring)
- [ ] API server (all 6 endpoints)
- [ ] Plugin system (loading/unloading)
- [ ] Caching system
- [ ] Performance improvements

---

## Maintenance

### Update Submodules

```bash
# Update all submodules to latest
git submodule update --remote

# Update specific submodule
cd test-repos/express
git pull origin main
cd ../..
git add test-repos/express
git commit -m "chore: Update Express test repo"
```

### Remove Submodule

```bash
# Remove submodule
git submodule deinit -f test-repos/<NAME>
git rm -f test-repos/<NAME>
rm -rf .git/modules/test-repos/<NAME>
git commit -m "chore: Remove test repo <NAME>"
```

---

## Notes

- Submodules are tracked by git automatically
- Don't modify files in test-repos directly
- Each test repo maintains its own git history
- Submodules are at specific commits (update manually when needed)

---

**Created:** 2025-11-05
**Version:** v3.0.0
**Author:** Ctxman Team
