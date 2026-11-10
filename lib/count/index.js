/**
 * Token count for a target model
 * Counts a project, multi-repository workspace, or piped text with the target model's
 * tokenizer where one is available offline (tiktoken for OpenAI models), and, on request,
 * exactly through Anthropic's count_tokens API for Claude models.
 */

import fs from 'fs';
import path from 'path';
import Scanner from '../core/Scanner.js';
import TokenUtils from '../utils/token-utils.js';
import { LLMDetector } from '../utils/llm-detector.js';
import { ClaudeTokenCounter } from '../utils/claude-token-counter.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import { resolveWorkspaceRepos } from '../workspace/index.js';

/**
 * Read the documents to count from a single project or multi-repository workspace
 * @param {string} root - Project root (ignored when `text` is given)
 * @param {string} [text] - A single piped text instead of the project files
 * @param {Array<string|{root: string, alias?: string}>} [repos] - Additional repository roots
 * @returns {{documents: {path: string, content: string, repo?: string}[], resolvedRepos: {root: string, alias: string}[] | null}}
 */
function readDocuments(root, text, repos) {
  if (text !== undefined) {
    return {
      documents: [{ path: '<stdin>', content: text }],
      resolvedRepos: null,
    };
  }

  const extraRepos = Array.isArray(repos) ? repos.filter(Boolean) : [];
  if (extraRepos.length > 0) {
    const resolvedRepos = resolveWorkspaceRepos([root, ...extraRepos]);
    const documents = [];
    for (const repo of resolvedRepos) {
      const scanned = new Scanner(repo.root, { policy: repo.policy }).scan();
      for (const file of scanned) {
        try {
          const relPosix = file.relativePath.split(path.sep).join('/');
          documents.push({
            path: `${repo.alias}/${relPosix}`,
            repo: repo.alias,
            content: fs.readFileSync(file.path, 'utf8'),
          });
        } catch (_error) {
          // Skip unreadable files
        }
      }
    }
    return { documents, resolvedRepos };
  }

  const documents = new Scanner(root).scan().flatMap((file) => {
    try {
      return [{ path: file.relativePath, content: fs.readFileSync(file.path, 'utf8') }];
    } catch (_error) {
      return [];
    }
  });
  return { documents, resolvedRepos: null };
}

/**
 * Count tokens for a target model across a project, multi-repo workspace, or piped text
 * @param {string} root - Project root
 * @param {object} [options]
 * @param {string} [options.model] - Target model id or alias (default: DEFAULT_TARGET_MODEL)
 * @param {string} [options.text] - Count this text instead of the project
 * @param {Array<string|{root: string, alias?: string}>} [options.repos] - Additional workspace repository roots
 * @param {boolean} [options.api=false] - Count exactly with the Anthropic API (Claude only)
 * @param {object} [options.client] - Anthropic client stand-in (tests)
 * @param {(done: number, total: number) => void} [options.onProgress]
 * @returns {Promise<object>} Count result
 */
export async function countForModel(root, options = {}) {
  const requested = options.model || LLMDetector.getDefaultModelId();
  const profile = LLMDetector.getProfile(requested);
  const modelId = profile.id || requested;
  const encoding = TokenUtils.encodingFor(modelId);
  const { documents, resolvedRepos } = readDocuments(root, options.text, options.repos);

  const files = documents
    .map((doc) => ({
      path: doc.path,
      tokens: TokenUtils.calculate(doc.content, doc.path, encoding),
      ...(doc.repo ? { repo: doc.repo } : {}),
    }))
    .sort((a, b) => b.tokens - a.tokens);
  const localTokens = files.reduce((sum, file) => sum + file.tokens, 0);

  const result = {
    model: modelId,
    modelName: profile.name,
    vendor: profile.vendor,
    files: files.length,
    encoding: TokenUtils.isExact() ? encoding : 'estimate',
    localTokens,
    tokens: localTokens,
    method: 'local',
    // tiktoken matches OpenAI models whose encoding is published; others are approximations
    exact: TokenUtils.isExact() && profile.tokenizer?.exact === true,
    contextWindow: profile.contextWindow,
    largestFiles: files.map(({ path: filePath, tokens }) => ({ path: filePath, tokens })),
  };

  if (options.api) {
    if (profile.vendor !== 'Anthropic') {
      throw new Error(
        `--api counts with Anthropic's API, so it needs a Claude model (got ${requested})`
      );
    }
    const counter = await ClaudeTokenCounter.create({ model: modelId, client: options.client });
    // Secrets never leave the machine, even for counting
    const redacted = documents.map((doc) => ({
      path: doc.path,
      content: redactSecrets(doc.content).text,
    }));
    const { total, requests } = await counter.countDocuments(redacted, {
      onProgress: options.onProgress,
    });
    result.tokens = total;
    result.method = 'anthropic-api';
    result.exact = true;
    result.requests = requests;
    result.ratio = localTokens > 0 ? total / localTokens : 1;
    // The API counts batches, not single files; scale each file's local count by the
    // observed ratio so the per-file breakdown matches the model too
    result.largestFiles = files.map(({ path: filePath, tokens }) => ({
      path: filePath,
      tokens: Math.round(tokens * result.ratio),
    }));
  }

  const window = result.contextWindow || 0;
  result.fits = window > 0 ? result.tokens <= window : true;
  result.percentOfWindow = window > 0 ? (result.tokens / window) * 100 : 0;

  if (resolvedRepos) {
    const ratio = result.method === 'anthropic-api' && result.ratio ? result.ratio : 1;
    result.repos = resolvedRepos.map((repo) => {
      const repoFiles = files.filter((f) => f.repo === repo.alias);
      const repoLocalTokens = repoFiles.reduce((sum, f) => sum + f.tokens, 0);
      const repoTokens =
        result.method === 'anthropic-api' ? Math.round(repoLocalTokens * ratio) : repoLocalTokens;
      return {
        alias: repo.alias,
        root: repo.root,
        files: repoFiles.length,
        localTokens: repoLocalTokens,
        tokens: repoTokens,
        percentOfWindow: window > 0 ? (repoTokens / window) * 100 : 0,
      };
    });
  }

  return result;
}

export default countForModel;
