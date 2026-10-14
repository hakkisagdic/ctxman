/**
 * Claude Token Counter
 * Exact Claude token counts from Anthropic's count_tokens endpoint.
 *
 * tiktoken's encodings are OpenAI's. Claude models use their own tokenizer, which
 * produces more tokens for the same text (especially for code), and Anthropic does not
 * publish an offline tokenizer for current models: the API is the only exact source.
 * Counting generates nothing and is free of charge, but it sends the text to Anthropic,
 * so callers must only use it when the user asked for it.
 */

import TokenUtils from './token-utils.js';

// Texts are grouped into requests of about this many cl100k_base tokens. Claude counts
// a little more than that, which still leaves room in the smallest (200K) window.
const DEFAULT_BATCH_TOKENS = 120000;

/**
 * Split a text that is larger than one request into line-aligned pieces
 * @returns {{text: string, tokens: number}[]}
 */
function splitByLines(text, filePath, maxTokens) {
  const tokens = TokenUtils.calculate(text, filePath);
  if (tokens <= maxTokens) return [{ text, tokens }];

  const pieces = [];
  let lines = [];
  let pieceTokens = 0;
  for (const line of text.split('\n')) {
    const lineTokens = TokenUtils.calculate(line + '\n', filePath);
    if (lines.length > 0 && pieceTokens + lineTokens > maxTokens) {
      pieces.push({ text: lines.join('\n'), tokens: pieceTokens });
      lines = [];
      pieceTokens = 0;
    }
    lines.push(line);
    pieceTokens += lineTokens;
  }
  if (lines.length > 0) pieces.push({ text: lines.join('\n'), tokens: pieceTokens });
  return pieces;
}

export class ClaudeTokenCounter {
  /**
   * @param {object} options
   * @param {string} options.model - Claude model id, e.g. `claude-opus-5-5`
   * @param {object} options.client - Anthropic SDK client (or a stand-in with
   *   `messages.countTokens`)
   */
  constructor({ model, client }) {
    if (!model) throw new Error('A Claude model id is required');
    this.model = model;
    this.client = client;
    this.requests = 0;
    this.framing = null;
  }

  /**
   * Create a counter with the official SDK, which reads ANTHROPIC_API_KEY (or another
   * configured credential) from the environment
   * @param {object} options
   * @param {string} options.model - Claude model id
   * @param {object} [options.client] - Pre-built client (tests)
   * @returns {Promise<ClaudeTokenCounter>}
   */
  static async create({ model, client } = {}) {
    if (!client) {
      let Anthropic;
      try {
        ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
      } catch (_error) {
        throw new Error(
          'Counting with the Anthropic API needs the official SDK: npm install @anthropic-ai/sdk'
        );
      }
      client = new Anthropic();
    }
    return new ClaudeTokenCounter({ model, client });
  }

  /**
   * Count one text as a single user message
   * @param {string} text - Non-empty text
   * @returns {Promise<number>} input_tokens reported by the API
   */
  async countMessage(text) {
    this.requests++;
    const response = await this.client.messages.countTokens({
      model: this.model,
      messages: [{ role: 'user', content: text }],
    });
    return response.input_tokens;
  }

  /**
   * Tokens the API adds for the message framing, measured once with a one-token text
   * @returns {Promise<number>}
   */
  async getFraming() {
    this.framing ??= Math.max(0, (await this.countMessage('.')) - 1);
    return this.framing;
  }

  /**
   * Count a text, minus the message framing
   * @param {string} text
   * @returns {Promise<number>}
   */
  async countText(text) {
    if (!text) return 0;
    const framing = await this.getFraming();
    return Math.max(0, (await this.countMessage(text)) - framing);
  }

  /**
   * Count many documents in as few requests as the batch size allows
   * @param {{path: string, content: string}[]} documents
   * @param {object} [options]
   * @param {number} [options.batchTokens] - cl100k_base tokens per request
   * @param {(done: number, total: number) => void} [options.onProgress]
   * @returns {Promise<{total: number, requests: number, batches: number}>}
   */
  async countDocuments(documents, { batchTokens = DEFAULT_BATCH_TOKENS, onProgress } = {}) {
    const batches = [];
    let current = [];
    let currentTokens = 0;
    for (const doc of documents) {
      if (!doc.content) continue;
      for (const piece of splitByLines(doc.content, doc.path, batchTokens)) {
        if (current.length > 0 && currentTokens + piece.tokens > batchTokens) {
          batches.push(current);
          current = [];
          currentTokens = 0;
        }
        current.push(piece.text);
        currentTokens += piece.tokens;
      }
    }
    if (current.length > 0) batches.push(current);

    const before = this.requests;
    let total = 0;
    for (let i = 0; i < batches.length; i++) {
      total += await this.countText(batches[i].join('\n'));
      onProgress?.(i + 1, batches.length);
    }
    return { total, requests: this.requests - before, batches: batches.length };
  }
}

export default ClaudeTokenCounter;
