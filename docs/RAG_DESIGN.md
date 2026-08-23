# Local RAG Design for Ctxman

This document outlines the design for the local Retrieval-Augmented Generation (RAG) engine.

## Architecture

The RAG engine consists of two main components:

1.  **Embedding Provider**: Converts text into vector embeddings.
2.  **Vector Store**: Stores embeddings and metadata, and performs semantic search.

### Libraries Used

- **Vector DB**: `@lancedb/lancedb` (embedded, zero-config, runs in-process).
- **Embeddings**: `@xenova/transformers` (local ONNX runtime, default model: `Xenova/all-MiniLM-L6-v2`).

### Components

#### 1. EmbeddingProvider (`lib/rag/EmbeddingProvider.js`)

Abstracts the embedding generation.

- `TransformersEmbeddingProvider`: Uses local ONNX models.
- `MockEmbeddingProvider`: For testing.

#### 2. VectorStore (`lib/rag/VectorStore.js`)

Manages the LanceDB connection and document lifecycle.

- **Storage**: Filesystem based (default: `.ctxman/rag-store`).
- **Schema**:
  - `vector`: Float32 array (dimension depends on model, e.g., 384).
  - `text`: Original text content.
  - `id`: Unique identifier.
  - `timestamp`: Insertion time.
  - `metadata`: JSON object for arbitrary metadata (source, language, etc.).

## Usage

```javascript
import { TransformersEmbeddingProvider } from '../lib/rag/EmbeddingProvider.js';
import { VectorStore } from '../lib/rag/VectorStore.js';

// Initialize
const provider = new TransformersEmbeddingProvider();
const store = new VectorStore(provider);

// Indexing
await store.addDocument('function hello() { console.log("world"); }', {
  source: 'src/main.js',
  language: 'javascript',
});

// Search
const results = await store.search('hello world function');
console.log(results);
// Output: [{ text: '...', score: 0.12, metadata: { ... } }]
```

## Integration Plan

1.  When indexing code files, pass content to `VectorStore.addDocument`.
2.  Store file path and other context in `metadata`.
3.  During context generation, query `VectorStore` with the user prompt to retrieve relevant code snippets.
