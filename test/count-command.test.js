import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { countForModel } from '../lib/count/index.js';
import { ClaudeTokenCounter } from '../lib/utils/claude-token-counter.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const FAKE_KEY = 'sk-ant-api03-' + 'x'.repeat(40);

/** Stand-in for the Anthropic client: 2 tokens of framing + one token per 4 characters */
function fakeClient() {
  const calls = [];
  return {
    calls,
    messages: {
      countTokens: async (request) => {
        calls.push(request);
        const text = request.messages[0].content;
        return { input_tokens: 2 + Math.ceil(text.length / 4) };
      },
    },
  };
}

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-count-'));
  fs.writeFileSync(path.join(root, 'a.js'), 'export const add = (a, b) => a + b;\n'.repeat(40));
  fs.writeFileSync(path.join(root, 'config.js'), `export const key = '${FAKE_KEY}';\n`);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('countForModel', () => {
  test('counts OpenAI models exactly with their tiktoken encoding', async () => {
    const result = await countForModel(root, { model: 'gpt-5.5' });
    expect(result).toMatchObject({ model: 'gpt-5.5', encoding: 'o200k_base', exact: true });
    expect(result.files).toBe(2);
    expect(result.tokens).toBe(result.localTokens);
    expect(result.largestFiles[0].path).toBe('a.js');
  });

  test('marks counts for other vendors and for GPT-6 as approximate', async () => {
    const claude = await countForModel(root, { model: 'claude-sonnet-5-5' });
    expect(claude).toMatchObject({ encoding: 'cl100k_base', exact: false, method: 'local' });
    const gpt6 = await countForModel(root, { model: 'gpt-6.1-sol' });
    expect(gpt6).toMatchObject({ encoding: 'o200k_base', exact: false });
  });

  test('resolves old model ids and compares with the window', async () => {
    const result = await countForModel(root, { model: 'claude-sonnet-4.5' });
    expect(result.model).toBe('claude-sonnet-4-5');
    expect(result.contextWindow).toBe(200000);
    expect(result.fits).toBe(true);
    expect(result.percentOfWindow).toBeCloseTo((result.tokens / 200000) * 100);
  });

  test('counts piped text instead of the project', async () => {
    const result = await countForModel(root, { model: 'gpt-4o', text: 'hello world' });
    expect(result.files).toBe(1);
    expect(result.largestFiles[0].path).toBe('<stdin>');
    expect(result.tokens).toBe(2);
  });

  test('--api counts Claude models through count_tokens with secrets redacted', async () => {
    const client = fakeClient();
    const result = await countForModel(root, { model: 'claude-opus-5-5', api: true, client });

    expect(result).toMatchObject({
      method: 'anthropic-api',
      exact: true,
      model: 'claude-opus-5-5',
    });
    // One framing probe, then both files in one batch
    expect(client.calls).toHaveLength(2);
    expect(client.calls.every((call) => call.model === 'claude-opus-5-5')).toBe(true);
    const sent = client.calls[1].messages[0].content;
    expect(sent).toContain('[REDACTED:anthropic-api-key]');
    expect(sent).not.toContain(FAKE_KEY);
    // The framing (2 tokens) is subtracted
    expect(result.tokens).toBe(Math.ceil(sent.length / 4));
    expect(result.ratio).toBeCloseTo(result.tokens / result.localTokens);
  });

  test('--api refuses non-Claude models', async () => {
    await expect(
      countForModel(root, { model: 'gpt-6.1-sol', api: true, client: fakeClient() })
    ).rejects.toThrow(/needs a Claude model/);
  });
});

describe('ClaudeTokenCounter', () => {
  test('groups documents into requests under the batch size', async () => {
    const client = fakeClient();
    const counter = new ClaudeTokenCounter({ model: 'claude-haiku-5-5', client });
    const documents = Array.from({ length: 5 }, (_, i) => ({
      path: `f${i}.txt`,
      content: 'word '.repeat(300),
    }));
    const { batches, requests } = await counter.countDocuments(documents, { batchTokens: 650 });
    expect(batches).toBe(3); // two files (600 tokens) per request
    expect(requests).toBe(4); // plus the framing probe
  });

  test('splits a single document that is larger than one request', async () => {
    const client = fakeClient();
    const counter = new ClaudeTokenCounter({ model: 'claude-haiku-5-5', client });
    const content = Array.from({ length: 50 }, (_, i) => `line ${i} `.repeat(10)).join('\n');
    const { batches } = await counter.countDocuments([{ path: 'big.txt', content }], {
      batchTokens: 200,
    });
    expect(batches).toBeGreaterThan(1);
    for (const call of client.calls.slice(1)) {
      expect(call.messages[0].content.length).toBeLessThan(2000);
    }
  });

  test('needs a model id', () => {
    expect(() => new ClaudeTokenCounter({ client: fakeClient() })).toThrow(/model id/);
  });
});

describe('ctxman count CLI', () => {
  const run = (args, input) =>
    spawnSync(process.execPath, [CLI, 'count', ...args], { cwd: root, input, encoding: 'utf8' });

  test('prints its own help', () => {
    const result = run(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: ctxman count');
  });

  test('--json keeps stdout parseable', () => {
    const result = run(['--model', 'gpt-5.5', '--json', '--top', '1']);
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json).toMatchObject({ model: 'gpt-5.5', files: 2, exact: true });
    expect(json.largestFiles).toHaveLength(1);
  });

  test('reads stdin with -', () => {
    const result = run(['-', '--model', 'gpt-5.5', '--json'], 'one two three');
    expect(JSON.parse(result.stdout).largestFiles[0].path).toBe('<stdin>');
  });

  test('points Claude users at the exact count', () => {
    const result = run(['--model', 'claude-opus-5-5']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('approximate');
    expect(result.stdout).toContain('ctxman count --model claude-opus-5-5 --api');
  });

  test('rejects unknown options and bad paths', () => {
    expect(run(['--bogus']).status).toBe(1);
    expect(run(['missing-dir']).status).toBe(1);
  });
});
