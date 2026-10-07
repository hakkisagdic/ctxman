import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import MethodAnalyzer from '../lib/analyzers/method-analyzer.js';
import { Analyzer } from '../lib/core/Analyzer.js';
import { Scanner } from '../lib/core/Scanner.js';
import TokenCalculator from '../lib/analyzers/token-calculator.js';

const sources = (content, file) => {
  const analyzer = new MethodAnalyzer();
  const methods = analyzer.extractMethods(content, file);
  const texts = analyzer.extractMethodSources(content, methods, file);
  return Object.fromEntries(methods.map((method, i) => [method.name, texts[i]]));
};

describe('MethodAnalyzer.extractMethodSources', () => {
  it('takes a class method up to its closing brace, past braces in strings and templates', () => {
    const content = [
      'class Store {',
      '  save(item) {',
      "    const close = '}';",
      '    if (item) { log(`${item}}`); }',
      '    return close;',
      '  }',
      '  load(): Item {',
      '    return {};',
      '  }',
      '}',
    ].join('\n');

    const methods = sources(content, 'store.ts');

    expect(methods.save.split('\n')).toHaveLength(5);
    expect(methods.save.trim().endsWith('}')).toBe(true);
    expect(methods.load).toBe('  load(): Item {\n    return {};\n  }');
  });

  it('keeps an expression-bodied arrow function to its own line', () => {
    const methods = sources(
      'const twice = (n) => n * 2\nfunction next() {\n  return 1;\n}\n',
      'a.js'
    );

    expect(methods.twice).toBe('const twice = (n) => n * 2');
    expect(methods.next).toBe('function next() {\n  return 1;\n}');
  });

  it('follows indentation in Python and `end` in Ruby', () => {
    const python = sources(
      'def run(x):\n    y = x\n\n    return y\n\ndef top():\n    pass\n',
      'a.py'
    );
    const ruby = sources(
      'class A\n  def valid?\n    if x\n      true\n    end\n  end\nend\n',
      'a.rb'
    );

    expect(python.run).toBe('def run(x):\n    y = x\n\n    return y');
    expect(ruby['valid?']).toBe('  def valid?\n    if x\n      true\n    end\n  end');
  });

  it('does not borrow the next method body for a declaration without one', () => {
    const methods = sources('fun short() = 42\nfun long(x: Int): Int {\n  return x\n}\n', 'a.kt');

    expect(methods.short).toBe('fun short() = 42');
  });
});

describe('Analyzer method-level token counts', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-method-tokens-'));
    fs.writeFileSync(
      path.join(dir, 'store.js'),
      'export class Store {\n  save(item) {\n    return this.items.push(item);\n  }\n}\n'
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('counts tokens for class methods', async () => {
    const { files } = await new Analyzer({ methodLevel: true }).analyze(new Scanner(dir).scan());

    const save = files[0].methods.find((method) => method.name === 'save');
    expect(save.tokens).toBeGreaterThan(5);
  });
});

describe('TokenCalculator method-level token counts', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-calc-method-tokens-'));
    fs.writeFileSync(
      path.join(dir, 'store.js'),
      'export class Store {\n  save(item) {\n    return this.items.push(item);\n  }\n}\n'
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('counts tokens for class methods in the CLI analyzer', () => {
    const calculator = new TokenCalculator(dir, { methodLevel: true });

    const [file] = calculator.analyze();

    expect(file.methods.find((method) => method.name === 'save').tokens).toBeGreaterThan(5);
  });
});
