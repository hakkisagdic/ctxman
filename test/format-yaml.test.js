import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import FormatRegistry from '../lib/formatters/format-registry.js';
import FormatConverter from '../lib/utils/format-converter.js';

// Shaped like the llm-context.json that `ctxman convert` is documented to take
const context = {
  project: { root: 'demo', totalFiles: 3, totalTokens: 181 },
  paths: {
    'src/': ['app.js', 'util.js'],
    '/': ['README.md'],
  },
  methods: {
    'src/app.js': [
      { name: 'main', line: 3, tokens: 40 },
      { name: 'helper', line: 12, tokens: 9 },
    ],
  },
  methodStats: { totalMethods: 2, includedMethods: 2 },
  matrix: [
    [1, 2],
    [3, 4],
  ],
  empty: {},
  none: [],
  missing: null,
};

describe('YAML round-trip', () => {
  const registry = new FormatRegistry();
  const converter = new FormatConverter();
  let tmpDir;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  test('parse(encode(x)) keeps nested objects and arrays', () => {
    const yaml = registry.encode('yaml', context);
    expect(converter.parse(yaml, 'yaml')).toEqual(context);
  });

  test('json -> yaml -> json through convertFile is lossless', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-yaml-'));
    const jsonIn = path.join(tmpDir, 'ctx.json');
    const yamlFile = path.join(tmpDir, 'ctx.yaml');
    const jsonOut = path.join(tmpDir, 'back.json');
    fs.writeFileSync(jsonIn, JSON.stringify(context, null, 2));

    converter.convertFile(jsonIn, yamlFile, 'json', 'yaml');
    converter.convertFile(yamlFile, jsonOut, 'yaml', 'json');

    expect(JSON.parse(fs.readFileSync(jsonOut, 'utf8'))).toEqual(context);
  });

  test('still reads sequences written at the same indent as their key', () => {
    const yaml = 'project:\n  root: demo\nfiles:\n- a.js\n- b.js\nnext: 1\n';
    expect(converter.parse(yaml, 'yaml')).toEqual({
      project: { root: 'demo' },
      files: ['a.js', 'b.js'],
      next: 1,
    });
  });
});

describe('YAML scalar quoting', () => {
  const registry = new FormatRegistry();
  const converter = new FormatConverter();

  test('strings that look like other types or hold YAML syntax read back unchanged', () => {
    const data = {
      numeric: '42',
      float: '1.5',
      bool: 'true',
      nul: 'null',
      empty: '',
      quoted: '"q"',
      multiline: 'line one\nline two',
      padded: ' x ',
      escapes: 'a\\nb: c',
      dash: '- x',
      braces: '{}',
      list: ['007', 'false', ''],
      42: 'numeric key',
      'a: b': 'key with a colon',
      '#hash': 'key that looks like a comment',
      '- dash': 'key that looks like a list item',
    };

    expect(converter.parse(registry.encode('yaml', data), 'yaml')).toEqual(data);
  });

  test('plain strings and keys stay unquoted', () => {
    const yaml = registry.encode('yaml', { 'src/': ['app.js'], root: 'my project' });
    expect(yaml).toContain('src/:');
    expect(yaml).toContain('- app.js');
    expect(yaml).toContain('root: my project');
  });
});
