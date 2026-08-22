# Express 5.x Stability Assessment

**Status**: 📋 Planned
**Priority**: Medium
**Effort**: Low (2-4 hours)
**Dependencies**: None

---

## Problem Statement

### Why This Matters

Ctxman currently uses **Express 5.1.0**, which is a **release candidate** version. While Express 5.x has been in development for several years, it has not reached stable release status.

**User Impact**:
- Potential API changes in future releases
- Unexpected breaking changes without notice
- Production stability concerns

**Business Impact**:
- Enterprise users may hesitate to adopt ctxman
- Support burden for Express-related issues
- Compatibility questions from security teams

**Technical Impact**:
- API differences from Express 4.x
- Middleware compatibility issues
- Documentation may be incomplete

---

## Proposed Solution

### Option A: Document and Monitor (Recommended for now)

**Approach**: Acknowledge Express 5.x RC status, document any differences, and monitor for stable release.

**Rationale**:
- Express 5.x has been relatively stable in RC form
- ctxman's API usage is minimal and well-tested
- Downgrading would require code changes

### Option B: Downgrade to Express 4.x

**Approach**: Migrate back to Express 4.x LTS for guaranteed stability.

**Rationale**:
- Long-term support guaranteed
- Extensive middleware ecosystem
- Well-documented behavior

### Option C: Monitor and Migrate on Stable Release

**Approach**: Stay on current version and migrate when Express 5.x goes stable.

**Rationale**:
- Minimal immediate disruption
- Can plan migration properly
- Avoid RC-specific issues

---

## Current Express 5.x Usage Analysis

### API Endpoints in ctxman

```javascript
// Current usage in lib/api/
import express from 'express';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/analyze', analyzeHandler);
app.post('/api/context', contextHandler);
app.get('/health', healthHandler);
```

### Express 5.x Specific Features Used

| Feature | Express 4.x | Express 5.x | Used by ctxman |
|---------|-------------|-------------|----------------|
| Promise support | Manual try/catch | Automatic | ✅ Used |
| Router improvements | Basic | Enhanced | Partial |
| Body parser | Separate package | Built-in | ✅ Used |
| Error handling | 4 params | Promise-aware | ✅ Used |

### Breaking Changes from Express 4.x

1. **`app.del()` removed** - Use `app.delete()` (ctxman uses correct method)
2. **`res.json()` status changes** - 200 default maintained
3. **Promise rejection handling** - Better in 5.x
4. **Router promise support** - ctxman benefits from this

---

## Implementation Steps

### Step 1: Audit Express Usage

```bash
# Find all Express-related code
grep -r "express" lib/ --include="*.js"

# Check for deprecated patterns
grep -r "app.del\|app.param(" lib/ --include="*.js"
```

### Step 2: Document API Usage

Create `docs/API_SERVER.md`:

```markdown
# API Server Documentation

## Express Version

ctxman uses Express 5.1.0 (Release Candidate). Key differences from Express 4.x:

1. Built-in body parsing (no separate body-parser needed)
2. Promise-aware route handlers
3. Improved error handling for async functions

## Endpoints

- GET /api/analyze - Analyze project
- POST /api/context - Generate context
- GET /health - Health check
```

### Step 3: Add Version Check

```javascript
// lib/api/server.js
import express from 'express';

// Log Express version on startup
console.log(`Express version: ${express.version || 'unknown'}`);

// Check for Express 5.x features
const hasPromiseSupport = typeof express.Router === 'function';
if (!hasPromiseSupport) {
  console.warn('Warning: Express version may not support async handlers');
}
```

### Step 4: Create Migration Plan (if downgrading)

```javascript
// If downgrading to Express 4.x, changes needed:
// 1. Add body-parser dependency
// 2. Update import statements
// 3. Add async handler wrapper

import bodyParser from 'body-parser';
app.use(bodyParser.json());

// Wrap async handlers
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.get('/api/analyze', asyncHandler(analyzeHandler));
```

---

## Decision Matrix

| Criterion | Option A (Document) | Option B (Downgrade) | Option C (Monitor) |
|-----------|---------------------|----------------------|---------------------|
| Stability | Medium | High | Medium |
| Effort | Low | Medium | Low |
| Risk | Medium | Low | Low |
| Future-proof | High | Low | High |
| User trust | Medium | High | Medium |

**Recommendation**: **Option A** with **Option C** fallback

Document current usage, add monitoring for Express 5.x stable release, and plan migration when stable.

---

## Success Metrics

### Quantitative Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| API uptime | 99.9% | Health check monitoring |
| Error rate | <0.1% | API error logs |
| Response time | <100ms | Performance monitoring |
| Express-related issues | 0 | Issue tracker |

### Qualitative Metrics

- [ ] Express version documented
- [ ] API behavior documented
- [ ] No Express-related production issues
- [ ] Migration path documented for stable release

---

## Monitoring Plan

### Weekly Checks

- [npm Express page](https://www.npmjs.com/package/express) for stable release
- [Express GitHub releases](https://github.com/expressjs/express/releases)
- [Express changelog](https://github.com/expressjs/express/blob/master/History.md)

### Automated Alerts

```yaml
# .github/workflows/express-check.yml
name: Express Version Check

on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday check

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check Express stable release
        run: |
          CURRENT=$(node -p "require('./package.json').dependencies.express")
          LATEST=$(npm view express version)
          echo "Current: $CURRENT"
          echo "Latest stable: $LATEST"
```

---

## Communication Plan

### For Users

Add note to README.md:

```markdown
## API Server

ctxman includes a built-in API server using Express 5.x. The API provides:

- `GET /api/analyze` - Analyze project
- `POST /api/context` - Generate context

> **Note**: Express 5.x is currently in release candidate status. We monitor the
> Express release cycle and will update to stable when available.
```

### For Contributors

Add to CONTRIBUTING.md:

```markdown
## API Development

When modifying the API server, note that we use Express 5.x which has some
differences from Express 4.x:

- Built-in body parsing
- Native async/await support in route handlers
- Changed error handling behavior
```

---

## Timeline

| Task | Effort | Week |
|------|--------|------|
| Audit Express usage | 1 hour | Week 1 |
| Document differences | 1 hour | Week 1 |
| Add version monitoring | 1 hour | Week 1 |
| Update user documentation | 1 hour | Week 1 |

**Total Estimated Effort**: 4 hours

---

## References

- [Express 5.x Migration Guide](https://expressjs.com/en/guide/migrating-5.html)
- [Express GitHub Repository](https://github.com/expressjs/express)
- [Express 5.x Documentation](https://expressjs.com/en/5x/api.html)
- [Express Status Discussion](https://github.com/expressjs/express/issues)

---

*Planned by: Ctxman Development Team*
*Target: Q1 2025*
