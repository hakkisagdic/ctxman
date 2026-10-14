import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// @xenova/transformers and @lancedb/lancedb are optionalDependencies that only
// `ctxman ask` uses. Run the RAG modules in a child Node process whose resolver
// reports both packages as not installed, the way `npm i --omit=optional` leaves them.
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const HIDE_OPTIONAL_DEPS = `data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === '@xenova/transformers' || specifier === '@lancedb/lancedb') {
    const error = new Error("Cannot find package '" + specifier + "'");
    error.code = 'ERR_MODULE_NOT_FOUND';
    throw error;
  }
  return next(specifier, context);
}`)}`;

const REGISTER_HOOK = `data:text/javascript,${encodeURIComponent(
  `import { register } from 'node:module'; register(${JSON.stringify(HIDE_OPTIONAL_DEPS)});`
)}`;

function runWithoutOptionalDeps(code) {
  const result = spawnSync(
    process.execPath,
    ['--import', REGISTER_HOOK, '--input-type=module', '-e', code],
    { cwd: ROOT, encoding: 'utf-8' }
  );
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}

const moduleUrl = (relativePath) => JSON.stringify(pathToFileURL(ROOT + relativePath).href);

describe('RAG optional dependencies', () => {
  it('imports EmbeddingProvider without @xenova/transformers and explains how to install it', () => {
    const { status, stdout, stderr } = runWithoutOptionalDeps(`
      const { TransformersEmbeddingProvider, MockEmbeddingProvider } = await import(${moduleUrl('lib/rag/EmbeddingProvider.js')});
      console.log((await new MockEmbeddingProvider(4).embed('text')).length);
      await new TransformersEmbeddingProvider().init().catch((error) => console.log(error.message));
    `);

    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('4');
    expect(stdout).toContain('npm install @xenova/transformers');
  });

  it('imports LanceDBStore without @lancedb/lancedb and explains how to install it', () => {
    const { status, stdout, stderr } = runWithoutOptionalDeps(`
      const { LanceDBStore } = await import(${moduleUrl('lib/rag/stores/LanceDBStore.js')});
      const { MockEmbeddingProvider } = await import(${moduleUrl('lib/rag/EmbeddingProvider.js')});
      const store = new LanceDBStore(new MockEmbeddingProvider(), '.ctxman/test-rag-missing');
      await store.init().catch((error) => console.log(error.message));
    `);

    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('npm install @lancedb/lancedb');
  });
});
