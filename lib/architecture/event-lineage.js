import fs from 'node:fs';
import path from 'node:path';
import { buildRepoGraph } from '../map/index.js';

const EMIT_RE = /\.\s*(?:emit|publish|dispatch|sendEvent|trigger)\s*\(\s*['"]([^'"]+)['"]/g;
const SUBSCRIBE_RE = /\.\s*(?:on|once|subscribe|addListener|handleEvent)\s*\(\s*['"]([^'"]+)['"]/g;

const IGNORED_BUILTIN_EVENTS = new Set([
  'data',
  'end',
  'error',
  'close',
  'open',
  'finish',
  'drain',
  'exit',
  'message',
  'connection',
  'listening',
  'SIGINT',
  'SIGTERM',
  'uncaughtException',
  'unhandledRejection',
]);

/**
 * Map producer (`emit`/`publish`/`dispatch`) and consumer (`on`/`subscribe`) event
 * topics across repository files and identify orphan topics (`F6-5`: Event Topic Lineage Mapper).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options]
 * @param {object} [options.graph] - Optional prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function mapEventLineage(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });

  const topics = new Map();

  const ensureTopic = (name) => {
    if (!topics.has(name)) {
      topics.set(name, { topic: name, producers: [], consumers: [] });
    }
    return topics.get(name);
  };

  for (const node of graph.nodes || []) {
    if (!node || !node.path) continue;
    const fullPath = path.join(absRoot, node.path);
    if (!fs.existsSync(fullPath)) continue;

    let src = '';
    try {
      src = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const lines = src.split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const lineNum = idx + 1;

      let m;
      EMIT_RE.lastIndex = 0;
      while ((m = EMIT_RE.exec(line)) !== null) {
        const topic = m[1];
        if (!topic || IGNORED_BUILTIN_EVENTS.has(topic)) continue;
        ensureTopic(topic).producers.push({ file: node.path, line: lineNum });
      }

      SUBSCRIBE_RE.lastIndex = 0;
      while ((m = SUBSCRIBE_RE.exec(line)) !== null) {
        const topic = m[1];
        if (!topic || IGNORED_BUILTIN_EVENTS.has(topic)) continue;
        ensureTopic(topic).consumers.push({ file: node.path, line: lineNum });
      }
    }
  }

  const allTopics = [...topics.values()].sort((a, b) => a.topic.localeCompare(b.topic));
  const deadProducers = allTopics.filter((t) => t.producers.length > 0 && t.consumers.length === 0);
  const deadConsumers = allTopics.filter((t) => t.consumers.length > 0 && t.producers.length === 0);

  return {
    root: absRoot,
    totalTopics: allTopics.length,
    topics: allTopics,
    deadProducerCount: deadProducers.length,
    deadConsumerCount: deadConsumers.length,
    deadProducers,
    deadConsumers,
  };
}
