# API Documentation

This document describes the REST API endpoints provided by Ctxman v3.0.0.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [GET /api/v1/analyze](#get-apiv1analyze)
  - [GET /api/v1/methods](#get-apiv1methods)
  - [GET /api/v1/stats](#get-apiv1stats)
  - [GET /api/v1/diff](#get-apiv1diff)
  - [POST /api/v1/context](#post-apiv1context)
  - [GET /api/v1/docs](#get-apiv1docs)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Overview

Ctxman provides a REST API server for programmatic access to its analysis capabilities. The API enables integration with CI/CD pipelines, IDE extensions, and other tools.

### Base URL

```
http://localhost:3000/api/v1
```

### Content Type

All requests and responses use JSON:

```
Content-Type: application/json
```

## Getting Started

### Starting the Server

```bash
# Start with default settings
ctxman serve

# Start with custom port
ctxman serve --port 8080

# Start with authentication
ctxman serve --port 3000 --auth-token your-secret-token
```

### Server Options

| Option | Default | Description |
|--------|---------|-------------|
| `--port` | 3000 | Port number to listen on |
| `--host` | localhost | Host address to bind |
| `--auth-token` | null | Optional authentication token |
| `--cors` | true | Enable CORS headers |

## Authentication

When authentication is enabled (`--auth-token`), include the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer your-secret-token" http://localhost:3000/api/v1/analyze
```

## Endpoints

### GET /api/v1/analyze

Analyze project files and get comprehensive token counts.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | No | Project path (defaults to current directory) |
| `methods` | boolean | No | Include method-level analysis (default: false) |

#### Example Request

```bash
# Analyze current directory
curl http://localhost:3000/api/v1/analyze

# Analyze specific project
curl "http://localhost:3000/api/v1/analyze?path=/path/to/project"

# Include method analysis
curl "http://localhost:3000/api/v1/analyze?methods=true"
```

#### Response

```json
{
  "files": [
    {
      "path": "/absolute/path/to/file.js",
      "relativePath": "src/file.js",
      "name": "file.js",
      "extension": ".js",
      "size": 1234,
      "tokens": 456,
      "lines": 50,
      "language": "JavaScript",
      "methods": []
    }
  ],
  "stats": {
    "totalFiles": 64,
    "totalTokens": 181480,
    "totalSize": 819200,
    "totalMethods": 0,
    "byLanguage": {
      "JavaScript": {
        "files": 64,
        "tokens": 181480,
        "size": 819200
      }
    },
    "largestFiles": [
      {
        "path": "src/server.js",
        "tokens": 12388,
        "size": 51200
      }
    ],
    "analysisTime": 150
  }
}
```

---

### GET /api/v1/methods

Extract methods from a specific file.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | string | Yes | Absolute or relative path to the file |

#### Example Request

```bash
curl "http://localhost:3000/api/v1/methods?file=src/server.js"
```

#### Response

```json
{
  "file": "src/server.js",
  "methods": [
    {
      "name": "handleRequest",
      "line": 15,
      "tokens": 234,
      "type": "function",
      "async": true
    },
    {
      "name": "validateInput",
      "line": 45,
      "tokens": 156,
      "type": "function",
      "async": false
    }
  ],
  "totalMethods": 2
}
```

#### Error Response

```json
{
  "error": "Missing \"file\" parameter",
  "statusCode": 400
}
```

---

### GET /api/v1/stats

Get project statistics without full file details.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | No | Project path (defaults to current directory) |

#### Example Request

```bash
curl http://localhost:3000/api/v1/stats
curl "http://localhost:3000/api/v1/stats?path=/path/to/project"
```

#### Response

```json
{
  "totalFiles": 64,
  "totalTokens": 181480,
  "totalSize": 819200,
  "totalMethods": 0,
  "byLanguage": {
    "JavaScript": {
      "files": 64,
      "tokens": 181480,
      "size": 819200
    }
  },
  "largestFiles": [
    {
      "path": "src/server.js",
      "tokens": 12388,
      "size": 51200
    }
  ],
  "analysisTime": 150
}
```

---

### GET /api/v1/diff

Analyze git diff to see changed files and their impact.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | No | Project path (defaults to current directory) |
| `since` | string | No | Git reference (branch, tag, or commit) |

#### Example Request

```bash
# Analyze uncommitted changes
curl http://localhost:3000/api/v1/diff

# Analyze changes since a branch
curl "http://localhost:3000/api/v1/diff?since=main"

# Analyze changes since a commit
curl "http://localhost:3000/api/v1/diff?since=HEAD~5"

# Analyze changes since a tag
curl "http://localhost:3000/api/v1/diff?since=v2.0.0"
```

#### Response

```json
{
  "changedFiles": [
    {
      "path": "src/server.js",
      "status": "modified",
      "tokens": 12388,
      "additions": 15,
      "deletions": 3
    }
  ],
  "impact": {
    "level": "medium",
    "score": 25,
    "affectedModules": ["core", "api"]
  },
  "authors": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "commits": 5
    }
  ],
  "summary": {
    "totalFiles": 3,
    "totalAdditions": 45,
    "totalDeletions": 12,
    "totalTokens": 15000
  }
}
```

---

### POST /api/v1/context

Generate optimized LLM context based on parameters.

#### Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | No | Project path (defaults to current directory) |
| `methodLevel` | boolean | No | Include method-level analysis |
| `targetModel` | string | No | Target LLM model (e.g., "claude-sonnet-4.5") |
| `targetTokens` | number | No | Target token budget |
| `useCase` | string | No | Use case template (bug-fix, feature, code-review, etc.) |

#### Example Request

```bash
curl -X POST http://localhost:3000/api/v1/context \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/path/to/project",
    "methodLevel": true,
    "targetModel": "claude-sonnet-4.5",
    "targetTokens": 50000
  }'
```

#### Response

```json
{
  "context": {
    "project": {
      "root": "my-project",
      "totalFiles": 64,
      "totalTokens": 181480
    },
    "paths": {
      "src/core/": ["server.js", "handler.js"],
      "src/utils/": ["helper.js", "validator.js"]
    },
    "methods": {
      "src/server.js": [
        {
          "name": "handleRequest",
          "line": 15,
          "tokens": 234
        }
      ]
    }
  },
  "metadata": {
    "targetModel": "claude-sonnet-4.5",
    "contextWindow": 200000,
    "fitStatus": "fits",
    "recommendedFormat": "toon"
  }
}
```

---

### GET /api/v1/docs

Get API documentation in JSON format.

#### Example Request

```bash
curl http://localhost:3000/api/v1/docs
```

#### Response

```json
{
  "version": "v1",
  "endpoints": [
    {
      "path": "/api/v1/analyze",
      "method": "GET",
      "description": "Analyze project files and get token counts",
      "parameters": {
        "path": "Project path (optional, defaults to cwd)",
        "methods": "Include method-level analysis (true/false)"
      }
    }
  ]
}
```

## Error Handling

### Error Response Format

All errors return a consistent JSON structure:

```json
{
  "error": "Error message describing what went wrong",
  "statusCode": 400
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request (missing parameters, invalid input) |
| 401 | Unauthorized (invalid or missing auth token) |
| 404 | Not Found (endpoint or resource not found) |
| 500 | Internal Server Error |

### Common Errors

#### Missing Parameter

```json
{
  "error": "Missing \"file\" parameter",
  "statusCode": 400
}
```

#### Unauthorized

```json
{
  "error": "Unauthorized",
  "statusCode": 401
}
```

#### Not Found

```json
{
  "error": "Endpoint not found",
  "statusCode": 404
}
```

## Examples

### Full Analysis Workflow

```bash
# 1. Start the server
ctxman serve --port 3000 &

# 2. Analyze the project
curl http://localhost:3000/api/v1/analyze > analysis.json

# 3. Get statistics
curl http://localhost:3000/api/v1/stats > stats.json

# 4. Check git changes
curl "http://localhost:3000/api/v1/diff?since=main" > diff.json

# 5. Generate context for Claude
curl -X POST http://localhost:3000/api/v1/context \
  -H "Content-Type: application/json" \
  -d '{"targetModel": "claude-sonnet-4.5"}' > context.json
```

### CI/CD Integration

```bash
#!/bin/bash
# ci-check.sh

# Start server in background
ctxman serve --port 3000 &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Get stats
STATS=$(curl -s http://localhost:3000/api/v1/stats)
TOTAL_TOKENS=$(echo $STATS | jq '.totalTokens')

# Check token budget
if [ $TOTAL_TOKENS -gt 100000 ]; then
  echo "⚠️ Warning: Project exceeds 100k tokens"
  exit 1
fi

# Cleanup
kill $SERVER_PID
```

### JavaScript Integration

```javascript
const API_BASE = 'http://localhost:3000/api/v1';

async function analyzeProject(projectPath) {
  const response = await fetch(
    `${API_BASE}/analyze?path=${encodeURIComponent(projectPath)}`
  );
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}

async function generateContext(options) {
  const response = await fetch(`${API_BASE}/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  
  return response.json();
}

// Usage
const analysis = await analyzeProject('/path/to/project');
const context = await generateContext({
  targetModel: 'claude-sonnet-4.5',
  methodLevel: true
});
```

## CORS

CORS is enabled by default. The following headers are set:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

## Rate Limiting

The API does not implement rate limiting by default. For production use, consider:

1. Running behind a reverse proxy (nginx, Apache)
2. Using the `--auth-token` option
3. Implementing rate limiting at the infrastructure level

## WebSocket Support

WebSocket support for real-time updates is planned for a future release. Currently, use polling or watch mode CLI for real-time analysis.

---

*API Version: v1 | Ctxman Version: 3.0.0*
