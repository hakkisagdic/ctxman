/**
 * Token count for a target model
 * Counts a project (or a piped text) with the target model's tokenizer where one is
 * available offline (tiktoken for OpenAI models), and, on request, exactly through
 * Anthropic's count_tokens API for Claude models.
 */

import fs from 'fs';
import Scanner from '../core/Scanner.js';
import TokenUtils from '../utils/token-utils.js';
import { LLMDetector } from '../utils/llm-detector.js';
import { ClaudeTokenCounter } from '../utils/claude-token-counter.js';
import { redactSecrets } from '../utils/secret-redactor.js';

/**
 * Read the documents to count
 * @param {string} root - Project root (ignored when `text` is given)
 * @param {string} [text] - A single piped text instead of the project files
 * @returns {{path: string, content: string}[]}
 */
function readDocuments(root, text) {
  if (text !== undefined) return [{ path: '<stdin>', content: text }];
  return new Scanner(root).scan().flatMap((file) => {
    try {
      return [{ path: file.relativePath, content: fs.readFileSync(file.path, 'utf8') }];
    } catch (_error) {
      return [];
    }
  });
}

/**
 * Count tokens for a target model
 * @param {string} root - Project root
 * @param {object} [options]
 * @param {string} [options.model] - Target model id or alias (default: DEFAULT_TARGET_MODEL)
 * @param {string} [options.text] - Count this text instead of the project
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
  const documents = readDocuments(root, options.text);

  const files = documents
    .map((doc) => ({
      path: doc.path,
      tokens: TokenUtils.calculate(doc.content, doc.path, encoding),
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
    largestFiles: files,
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
    result.ratio = localTokens > 0 ? total / localTokens : null;
  }

  result.fits = result.tokens <= result.contextWindow;
  result.percentOfWindow = (result.tokens / result.contextWindow) * 100;
  return result;
}

export default countForModel;
