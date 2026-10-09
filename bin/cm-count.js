#!/usr/bin/env node
/**
 * ctxman count — token count for a target model, exact for Claude through the API
 */

import fs from 'fs';
import path from 'path';
import { countForModel } from '../lib/count/index.js';
import { LLMDetector } from '../lib/utils/llm-detector.js';
import { getLogger } from '../lib/utils/logger.js';

// stdout carries only the result (it may be JSON); progress, notices and warnings go to stderr
const print = (line = '') => process.stdout.write(`${line}\n`);
console.log = console.error;
getLogger().level = 'warn';

const HELP = `Usage: ctxman count [path | -] [options]

Count the tokens of a project (or of text piped to stdin with "-") for a target model,
and check them against the model's context window.

Options:
  --model, -m ID     Target model (default: ${LLMDetector.getDefaultModelId()}; see ctxman --list-llms)
  --api              Claude models: count exactly with Anthropic's count_tokens API.
                     Sends the (secret-redacted) text to Anthropic; needs ANTHROPIC_API_KEY
                     and the @anthropic-ai/sdk package. Counting is free and generates nothing.
  --top N            Show the N largest files (default 5, 0 to hide)
  --json             Print the result as JSON
  -h, --help         Show this help

Without --api, OpenAI models are counted exactly with their tiktoken encoding
(o200k_base or cl100k_base); other vendors' models use their own tokenizers, so
their counts are approximate.

Examples:
  ctxman count --model gpt-6.1-sol
  ctxman count --model claude-opus-5-5 --api
  ctxman pack | ctxman count - --model claude-sonnet-5-5 --api`;

function parseArgs(argv) {
  const options = { top: 5 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--model' || arg === '-m') options.model = argv[++i];
    else if (arg === '--api') options.api = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--top') options.top = Number.parseInt(argv[++i], 10);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '-' || !arg.startsWith('-')) options.target = arg;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.model === undefined && argv.includes('--model')) {
    throw new Error('--model needs a model id');
  }
  if (!Number.isInteger(options.top) || options.top < 0) {
    throw new Error('--top needs a number of files');
  }
  return options;
}

const n = (value) => value.toLocaleString('en-US');

function printResult(result, top) {
  const label =
    result.method === 'anthropic-api'
      ? `exact, Anthropic count_tokens API (${result.requests} request${result.requests === 1 ? '' : 's'})`
      : result.encoding === 'estimate'
        ? 'estimate (install tiktoken for exact counts)'
        : result.exact
          ? `exact, tiktoken ${result.encoding}`
          : `approximate, tiktoken ${result.encoding}; ${result.vendor} models use their own tokenizer`;

  print(`Model:   ${result.modelName} (${result.model})`);
  print(`Files:   ${n(result.files)}`);
  print(`Tokens:  ${n(result.tokens)}  [${label}]`);
  if (result.method === 'anthropic-api' && result.ratio) {
    print(
      `         ${n(result.localTokens)} with cl100k_base; Claude counts ${result.ratio.toFixed(2)}x as many`
    );
  }
  print(
    `Window:  ${n(result.contextWindow)} tokens — ${result.percentOfWindow.toFixed(1)}% used, ${result.fits ? 'fits' : "doesn't fit"}`
  );
  if (result.method === 'local' && !result.exact && result.vendor === 'Anthropic') {
    print(`         For an exact count: ctxman count --model ${result.model} --api`);
  }

  const largest = result.largestFiles.slice(0, top);
  if (largest.length > 1) {
    const scale = result.method === 'anthropic-api' && result.ratio ? result.ratio : 1;
    print(`\nLargest files${scale !== 1 ? ' (≈, scaled to the API count)' : ''}:`);
    for (const file of largest) {
      print(`  ${n(Math.round(file.tokens * scale)).padStart(9)}  ${file.path}`);
    }
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${error.message}\n\n${HELP}`);
    process.exit(1);
  }
  if (options.help) {
    print(HELP);
    return;
  }

  const root = path.resolve(options.target && options.target !== '-' ? options.target : '.');
  const text = options.target === '-' ? fs.readFileSync(0, 'utf8') : undefined;
  if (text === undefined && !fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`❌ Not a directory: ${root}`);
    process.exit(1);
  }

  const model = options.model || LLMDetector.getDefaultModelId();
  if (options.api && LLMDetector.getProfile(model).vendor === 'Anthropic') {
    console.error('Sending the redacted text to the Anthropic API to count tokens...');
  }

  try {
    const result = await countForModel(root, {
      model,
      api: options.api,
      text,
      onProgress: (done, total) => {
        if (total > 1) process.stderr.write(`\r  request ${done}/${total}`);
        if (total > 1 && done === total) process.stderr.write('\n');
      },
    });
    if (options.json) {
      const { largestFiles, ...summary } = result;
      print(
        JSON.stringify({ ...summary, largestFiles: largestFiles.slice(0, options.top) }, null, 2)
      );
    } else {
      printResult(result, options.top);
    }
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

main();
