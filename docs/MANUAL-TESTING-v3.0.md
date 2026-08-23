# Manual Testing Guide - v3.0.0

Complete manual testing guide for Ctxman v3.0.0 Platform Foundation release.

**Version:** 3.0.0
**Test Environment:** Express.js repository (test-repos/express)
**Date:** 2025-11-05

---

## 🎯 Test Objectives

Validate all v3.0.0 features:

- ✅ Modular Core Architecture
- ✅ Plugin System
- ✅ Git Integration
- ✅ Watch Mode
- ✅ REST API Server
- ✅ Performance & Caching

---

## 🚀 Setup

### Prerequisites

```bash
# 1. Ensure you're on v3.0.0
ctxman --version
# Expected: Ctxman v3.0.0

# 2. Navigate to project root
cd /Users/hakki.sagdic/Documents/GitHub/ctxman

# 3. Verify Express submodule
ls test-repos/express
# Expected: Express.js files and directories
```

### Test Environment

```bash
# Express repo stats (approximate)
# Files: ~150-200 JavaScript files
# Tokens: ~50k-100k
# History: 10,000+ commits
# Contributors: 300+
```

---

## 📋 Test Plan

### Section 1: Basic Functionality (Backward Compatibility)

#### Test 1.1: Basic Analysis

```bash
cd test-repos/express
ctxman --cli

Expected Output:
✅ Scans files
✅ Calculates tokens
✅ Shows statistics
✅ No errors
```

#### Test 1.2: Method-Level Analysis

```bash
cd test-repos/express
ctxman --cli -m --output json

Expected Output:
✅ Extracts methods from JavaScript files
✅ Shows method count
✅ JSON format valid
```

#### Test 1.3: TOON Format

```bash
cd test-repos/express
ctxman --cli --output toon

Expected Output:
✅ TOON format generated
✅ 40-50% token reduction vs JSON
✅ Valid TOON syntax
```

---

### Section 2: LLM Optimization (v2.3.7)

#### Test 2.1: Auto-Detect LLM

```bash
cd test-repos/express

# Set environment variable
export ANTHROPIC_API_KEY=sk-test-12345

# Run with auto-detection
ctxman --cli --auto-detect-llm

Expected Output:
✅ Auto-detected LLM: Claude Sonnet 4.5
✅ Context Fit Analysis displayed
✅ Recommendation shown (fits/chunks)
```

#### Test 2.2: Explicit Model Selection

```bash
cd test-repos/express
ctxman --cli --target-model gpt-4o

Expected Output:
📊 Context Window Analysis:
   Target Model: GPT-4o
   Available Context: 128,000 tokens
   Your Repository: ~70,000 tokens
   ✅ PERFECT FIT! Your entire codebase fits in one context.
```

#### Test 2.3: List LLMs

```bash
ctxman --list-llms

Expected Output:
✅ Shows 9+ models grouped by vendor
✅ Anthropic, OpenAI, Google, DeepSeek
```

---

### Section 3: Git Integration (v3.0.0) ⭐

#### Test 3.1: Changed Files Only

```bash
cd test-repos/express

# Make a test change
echo "// test comment" >> lib/router/index.js

# Analyze only changed files
ctxman --cli --changed-only

Expected Output:
🔀 Git Integration - Analyzing Changed Files
📝 Found 1 changed files
   Impact: MEDIUM (score: XX)
✅ Analyzes only lib/router/index.js
```

#### Test 3.2: Changed Since Commit

```bash
cd test-repos/express

# Analyze changes since v5.0.0
ctxman --cli --changed-since v5.0.0

Expected Output:
📝 Found XX changed files
   Since: v5.0.0
   Impact: HIGH/MEDIUM/LOW
✅ Lists all files changed between v5.0.0 and HEAD
```

#### Test 3.3: Changed Since Branch

```bash
cd test-repos/express

# Check current branch
git branch

# Analyze changes since main (if on a feature branch)
ctxman --cli --changed-since main

Expected Output:
✅ Shows files changed in current branch vs main
```

---

### Section 4: Watch Mode (v3.0.0) ⭐

#### Test 4.1: Basic Watch Mode

```bash
cd test-repos/express

# Terminal 1: Start watch mode
ctxman watch

Expected Output:
👁️ Watch mode active
Press Ctrl+C to stop

# Terminal 2: Make a change
echo "// watch test" >> lib/application.js

# Back to Terminal 1
Expected Output:
📝 File change: lib/application.js
   ✅ Analysis complete: XXXX tokens (XXms)
   📊 Total: XXX files, XXXXX tokens
```

#### Test 4.2: Watch with Method-Level

```bash
cd test-repos/express
ctxman watch -m

# Make a change
echo "function testFunc() {}" >> lib/router/index.js

Expected Output:
📝 File change: lib/router/index.js
   ✅ Analysis complete: XXXX tokens (XXms)
   🔧 Methods: XX
```

#### Test 4.3: Watch with Custom Debounce

```bash
cd test-repos/express
ctxman watch --debounce 2000

# Make rapid changes
echo "// change 1" >> lib/router/index.js
echo "// change 2" >> lib/router/index.js
echo "// change 3" >> lib/router/index.js

Expected Output:
✅ Only ONE analysis after 2 seconds (debounced)
```

#### Test 4.4: Stop Watch Mode

```bash
# In watch mode terminal
Press Ctrl+C

Expected Output:
🛑 Stopping watch mode...
✅ Clean exit
```

---

### Section 5: REST API Server (v3.0.0) ⭐

#### Test 5.1: Start API Server

```bash
# Terminal 1: Start server
cd /Users/hakki.sagdic/Documents/GitHub/ctxman
ctxman serve

Expected Output:
🌐 Ctxman API Server
   Listening on: http://localhost:3000
   API Version: v1
   Documentation: http://localhost:3000/api/v1/docs
```

#### Test 5.2: API Endpoint - Analyze

```bash
# Terminal 2: Test analyze endpoint
curl "http://localhost:3000/api/v1/analyze?path=./test-repos/express&methods=true"

Expected Output:
✅ JSON response with analysis results
✅ Contains: files, stats, methods
```

#### Test 5.3: API Endpoint - Methods

```bash
curl "http://localhost:3000/api/v1/methods?file=test-repos/express/lib/router/index.js"

Expected Output:
{
  "file": "test-repos/express/lib/router/index.js",
  "methods": [ ... ],
  "totalMethods": XX
}
```

#### Test 5.4: API Endpoint - Stats

```bash
curl "http://localhost:3000/api/v1/stats?path=./test-repos/express"

Expected Output:
{
  "totalFiles": XXX,
  "totalTokens": XXXXX,
  "byLanguage": { ... },
  "largestFiles": [ ... ]
}
```

#### Test 5.5: API Endpoint - Diff

```bash
curl "http://localhost:3000/api/v1/diff?path=./test-repos/express&since=v5.0.0"

Expected Output:
{
  "changedFiles": [ ... ],
  "totalChangedFiles": XX,
  "impact": { ... }
}
```

#### Test 5.6: API Endpoint - Context (POST)

```bash
curl -X POST http://localhost:3000/api/v1/context \
  -H "Content-Type: application/json" \
  -d '{
    "path": "./test-repos/express",
    "methodLevel": true,
    "targetModel": "claude-sonnet-4.5",
    "useCase": "code-review"
  }'

Expected Output:
{
  "metadata": { ... },
  "files": { ... },
  "methods": { ... },
  "statistics": { ... }
}
```

#### Test 5.7: API Endpoint - Docs

```bash
curl http://localhost:3000/api/v1/docs

Expected Output:
{
  "version": "v1",
  "endpoints": [ ... ]
}
```

#### Test 5.8: Custom Port

```bash
# Stop previous server (Ctrl+C)
ctxman serve --port 8080

Expected Output:
✅ Server starts on port 8080
```

#### Test 5.9: Authentication

```bash
ctxman serve --port 3000 --auth-token my-secret

# Without token
curl http://localhost:3000/api/v1/analyze

Expected Output:
{
  "error": "Unauthorized",
  "statusCode": 401
}

# With token
curl -H "Authorization: Bearer my-secret" http://localhost:3000/api/v1/analyze

Expected Output:
✅ Success (200 OK)
```

---

### Section 6: Performance & Caching

#### Test 6.1: First Run (Cold Cache)

```bash
cd test-repos/express
ctxman --cli

Expected Output:
✅ Analysis time: XXXms (baseline)
```

#### Test 6.2: Second Run (Warm Cache)

```bash
# Run again immediately
ctxman --cli

Expected Output:
✅ Analysis time: <50% of first run (cache working)
✅ Cache hit rate: >80%
```

#### Test 6.3: Parallel Processing

```bash
cd test-repos/express
ctxman --cli --verbose

Expected Output:
✅ Files processed in parallel (visible in logs)
✅ Faster than sequential processing
```

---

### Section 7: Error Handling

#### Test 7.1: Invalid LLM Model

```bash
ctxman --cli --target-model invalid-model

Expected Output:
⚠️ Unknown LLM model: invalid-model, using default profile
✅ Continues with defaults (no crash)
```

#### Test 7.2: Non-Git Repository

```bash
cd /tmp
mkdir test-no-git
cd test-no-git
ctxman --changed-only

Expected Output:
❌ Error: Not a git repository
✅ Graceful error message
```

#### Test 7.3: Invalid API Port

```bash
# Port already in use
ctxman serve --port 3000 &
ctxman serve --port 3000

Expected Output:
❌ Port 3000 is already in use
Try a different port: ctxman serve --port 3001
```

---

## 📊 Success Criteria

### Performance Targets

| Metric            | Target | Pass/Fail |
| ----------------- | ------ | --------- |
| Scan 150 files    | <100ms | ⬜        |
| Analyze 150 files | <5s    | ⬜        |
| Plugin load       | <50ms  | ⬜        |
| Cache hit rate    | >80%   | ⬜        |
| API response      | <200ms | ⬜        |
| Watch latency     | <500ms | ⬜        |

### Feature Completeness

| Feature         | Status         | Pass/Fail |
| --------------- | -------------- | --------- |
| Git Integration | ✅ Implemented | ⬜        |
| Watch Mode      | ✅ Implemented | ⬜        |
| REST API        | ✅ Implemented | ⬜        |
| Plugin System   | ✅ Implemented | ⬜        |
| Caching         | ✅ Implemented | ⬜        |
| Core Modules    | ✅ Implemented | ⬜        |

---

## 🐛 Bug Tracking

Use this section to track bugs found during manual testing:

### Known Issues

1. **GitIgnoreParser Warning** - FIXED ✅
   - Issue: Directory passed instead of file path
   - Fix: Pass correct file paths to constructor
   - Status: Resolved in v3.0.0

### Bugs Found During Testing

_Document any bugs found here with reproduction steps_

---

## 📝 Test Results

### Test Run: [DATE]

**Tester:** [NAME]
**Version:** 3.0.0
**Environment:** macOS / Linux / Windows

**Results:**

- Section 1 (Basic): ⬜ Pass / ⬜ Fail
- Section 2 (LLM): ⬜ Pass / ⬜ Fail
- Section 3 (Git): ⬜ Pass / ⬜ Fail
- Section 4 (Watch): ⬜ Pass / ⬜ Fail
- Section 5 (API): ⬜ Pass / ⬜ Fail
- Section 6 (Performance): ⬜ Pass / ⬜ Fail
- Section 7 (Errors): ⬜ Pass / ⬜ Fail

**Overall:** ⬜ Pass / ⬜ Fail

**Notes:**
_Add any observations or issues here_

---

## 🔧 Troubleshooting

### Watch Mode Doesn't Detect Changes

```bash
# Check file watcher limits (Linux)
cat /proc/sys/fs/inotify/max_user_watches

# Increase if needed
sudo sysctl fs.inotify.max_user_watches=524288
```

### API Server Won't Start

```bash
# Check if port is in use
lsof -i :3000

# Kill existing process
kill -9 <PID>

# Or use different port
ctxman serve --port 3001
```

### Submodule Not Loaded

```bash
# Initialize and update submodule
git submodule update --init --recursive

# Verify
ls test-repos/express
```

---

## 🚀 Quick Test Script

Run all essential tests quickly:

```bash
#!/bin/bash

echo "🧪 Quick v3.0.0 Test Suite"
echo "========================="

cd test-repos/express

# Test 1: Basic analysis
echo "\n1. Basic Analysis..."
ctxman --cli --no-verbose > /dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 2: LLM optimization
echo "2. LLM Optimization..."
ctxman --cli --target-model claude-sonnet-4.5 --no-verbose > /dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 3: Git integration
echo "3. Git Integration..."
ctxman --cli --changed-since v5.0.0 --no-verbose > /dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 4: API server (start in background)
echo "4. API Server..."
cd ../..
ctxman serve --port 3333 &
SERVER_PID=$!
sleep 2
curl -s http://localhost:3333/api/v1/docs > /dev/null && echo "✅ PASS" || echo "❌ FAIL"
kill $SERVER_PID 2>/dev/null

echo "\n✅ Quick tests complete!"
```

Save as `scripts/quick-test-v3.sh` and run:

```bash
chmod +x scripts/quick-test-v3.sh
./scripts/quick-test-v3.sh
```

---

## 📸 Expected Screenshots

### 1. Watch Mode in Action

```
👁️ Watch mode active
Press Ctrl+C to stop

📝 File change: lib/router/index.js
   ✅ Analysis complete: 2,450 tokens (35ms)
   📊 Total: 156 files, 67,230 tokens
```

### 2. API Server Running

```
🌐 Ctxman API Server
   Listening on: http://localhost:3000
   API Version: v1
   Documentation: http://localhost:3000/api/v1/docs
```

### 3. Git Integration Output

```
🔀 Git Integration - Analyzing Changed Files
══════════════════════════════════════════════════════════

📝 Found 12 changed files
   Since: v5.0.0
   Impact: HIGH (score: 87)

📁 FILES & TOKENS:
   Total Files: 12
   Total Tokens: 8,450
```

---

## ✅ Sign-Off

**Tested By:** _____________
**Date:** _____________
**Version:** 3.0.0
**Status:** ⬜ Pass / ⬜ Fail

**Signature:** _____________

---

**Document Version:** 1.0
**Last Updated:** 2025-11-05
**Next Review:** After v3.1.0 release
