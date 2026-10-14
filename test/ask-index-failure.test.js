import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { Indexer } from '../lib/rag/Indexer.js';
import { DataSourcePlugin } from '../lib/rag/DataSourcePlugin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASK = path.join(__dirname, '..', 'bin', 'cm-ask.js');

class StaticSource extends DataSourcePlugin {
  constructor(name, texts) {
    super(name);
    this.texts = texts;
  }

  async *collect() {
    for (const [i, text] of this.texts.entries()) {
      yield { id: `${this.name}-${i}`, text, metadata: {} };
    }
  }
}

// Store whose embedding step fails for one source, like a model that cannot be downloaded
class FlakyStore {
  constructor(failingSource) {
    this.failingSource = failingSource;
    this.added = [];
  }

  async addDocuments(docs) {
    if (docs.some((d) => d.metadata.source === this.failingSource)) {
      throw new Error('model download blocked');
    }
    this.added.push(...docs);
  }
}

function resolveOptional(specifier) {
  try {
    return createRequire(import.meta.url).resolve(specifier);
  } catch {
    return null;
  }
}

describe('Indexer failure reporting', () => {
  it('rejects when a source fails, after indexing the other sources', async () => {
    const store = new FlakyStore('broken');
    const indexer = new Indexer(store);
    indexer.registerSource(new StaticSource('broken', ['a']));
    indexer.registerSource(new StaticSource('healthy', ['b', 'c']));

    await expect(indexer.index()).rejects.toThrow(
      'Indexing failed for broken: model download blocked'
    );
    expect(store.added.map((d) => d.text)).toEqual(['b', 'c']);
  });

  it('resolves when every source succeeds', async () => {
    const store = new FlakyStore('none');
    const indexer = new Indexer(store);
    indexer.registerSource(new StaticSource('healthy', ['b']));

    await expect(indexer.index('healthy')).resolves.toBeUndefined();
    expect(store.added).toHaveLength(1);
  });
});

const transformersPath = resolveOptional('@xenova/transformers');
const lancedbAvailable = resolveOptional('@lancedb/lancedb') !== null;

describe.skipIf(!transformersPath || !lancedbAvailable)('ctxman ask without a usable model', () => {
  let workDir;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-ask-fail-'));
    fs.mkdirSync(path.join(workDir, 'project', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'project', 'src', 'app.js'),
      'export function startServer() {\n  return 1;\n}\n'
    );
    // Offline and with empty model/cache dirs, loading the embedding model fails the same
    // way a blocked download does, without touching the network
    fs.writeFileSync(
      path.join(workDir, 'offline-models.mjs'),
      [
        `import { env } from ${JSON.stringify(pathToFileURL(transformersPath).href)};`,
        'env.allowRemoteModels = false;',
        `env.localModelPath = ${JSON.stringify(path.join(workDir, 'models') + path.sep)};`,
        `env.cacheDir = ${JSON.stringify(path.join(workDir, 'cache') + path.sep)};`,
      ].join('\n')
    );
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('reports the indexing failure and exits non-zero', () => {
    const preload = pathToFileURL(path.join(workDir, 'offline-models.mjs')).href;
    const r = spawnSync(
      process.execPath,
      ['--import', preload, ASK, 'where is startServer defined'],
      { cwd: path.join(workDir, 'project'), encoding: 'utf8', stdio: 'pipe', timeout: 60000 }
    );

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Indexing failed for local-files');
    expect(r.stdout).not.toContain('Indexing complete');
    expect(r.stdout).not.toContain('No relevant context found');
  }, 70000);
});
