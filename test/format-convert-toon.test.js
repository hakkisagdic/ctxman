import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { encode } from '@toon-format/toon';
import FormatConverter from '../lib/utils/format-converter.js';

const context = {
  project: { root: 'demo', totalFiles: 3, totalTokens: 181 },
  paths: { 'src/': ['app.js', 'util.js'], '/': ['README.md'] },
  methods: {
    'src/app.js': [
      { name: 'main', line: 3, tokens: 40 },
      { name: 'helper', line: 12, tokens: 9 },
    ],
  },
};

describe('FormatConverter TOON input', () => {
  const converter = new FormatConverter();
  let tmpDir;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  test('parses TOON into the data it encodes', () => {
    expect(converter.parse(encode(context), 'toon')).toEqual(context);
  });

  test('convert data.toon --from toon --to yaml writes the same data as YAML', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-toon-'));
    const toonFile = path.join(tmpDir, 'data.toon');
    const yamlFile = path.join(tmpDir, 'data.yaml');
    fs.writeFileSync(toonFile, encode(context));

    converter.convertFile(toonFile, yamlFile, 'toon', 'yaml');

    expect(converter.parse(fs.readFileSync(yamlFile, 'utf8'), 'yaml')).toEqual(context);
  });

  test('rejects malformed TOON with a parse error', () => {
    expect(() => converter.parse('items[3]: a,b', 'toon')).toThrow();
  });
});
