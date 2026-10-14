import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { packContext } from '../lib/pack/index.js';
import TokenUtils from '../lib/utils/token-utils.js';

const module = (name, count) =>
  Array.from(
    { length: count },
    (_, i) => `export function ${name}${i}(value) {\n  return value + ${i};\n}\n`
  ).join('');

describe('pack --split', () => {
  let root;
  const write = (relativePath, content) => {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pack-split-'));
    for (const name of ['a', 'b', 'c', 'd', 'e']) write(`src/${name}.js`, module(name, 15));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('cuts the document into parts under the limit without splitting files', async () => {
    for (const style of ['xml', 'markdown', 'plain', 'json']) {
      const result = await packContext(root, { style, split: 700 });

      expect(result.parts.length).toBeGreaterThan(1);
      for (const part of result.parts) {
        expect(part.tokens).toBeLessThanOrEqual(700);
        expect(part.tokens).toBe(TokenUtils.calculate(part.text, 'x'));
      }
      // Every file whole, in one part, in the original order
      expect(result.parts.flatMap((part) => part.files)).toEqual(
        ['a', 'b', 'c', 'd', 'e'].map((name) => `src/${name}.js`)
      );
      expect(result.splitFiles).toEqual([]);
    }
  });

  it('labels the parts and numbers documents across them', async () => {
    const result = await packContext(root, {
      split: 700,
      header: 'Header text',
      instructions: 'Final question',
    });
    const { parts } = result;
    const count = parts.length;

    parts.forEach((part, i) => {
      expect(part.index).toBe(i + 1);
      expect(part.text).toContain(`Part ${i + 1} of ${count}`);
    });
    // Header and tree in the first part, instructions in the last
    expect(parts[0].text.startsWith('Header text\n\nPart 1 of')).toBe(true);
    expect(parts[0].text).toContain('<directory_structure>');
    expect(parts[1].text).not.toContain('<directory_structure>');
    expect(
      parts[count - 1].text.endsWith('<instructions>\nFinal question\n</instructions>\n')
    ).toBe(true);
    expect(parts[0].text).not.toContain('Final question');

    const indices = parts.flatMap((part) =>
      [...part.text.matchAll(/<document index="(\d+)">/g)].map((match) => Number(match[1]))
    );
    expect(indices).toEqual([1, 2, 3, 4, 5]);
    // The whole document is still returned
    expect(result.text).toContain('<document index="5">');
  });

  it('includes the json part number and count', async () => {
    const result = await packContext(root, { style: 'json', split: 700 });
    const first = JSON.parse(result.parts[0].text);

    expect(first.part).toBe(1);
    expect(first.parts).toBe(result.parts.length);
    expect(first.tree).toBeDefined();
    expect(JSON.parse(result.parts[1].text).tree).toBeUndefined();
  });

  it('splits a file by lines only when it is larger than a part on its own', async () => {
    write('big.txt', Array.from({ length: 400 }, (_, i) => `row ${i} of the data`).join('\n'));
    const result = await packContext(root, { split: 1000, style: 'plain' });

    expect(result.splitFiles).toEqual([{ path: 'big.txt', pieces: expect.any(Number) }]);
    const pieces = result.splitFiles[0].pieces;
    expect(pieces).toBeGreaterThan(1);
    const labels = result.parts.flatMap((part) => part.files).filter((f) => f.startsWith('big'));
    expect(labels).toHaveLength(pieces);
    expect(labels[0]).toMatch(/^big\.txt \(lines 1-\d+\)$/);
    expect(labels[pieces - 1]).toMatch(/^big\.txt \(lines \d+-400\)$/);
    // Small files stay whole
    expect(result.parts.flatMap((part) => part.files)).toContain('src/a.js');
    for (const part of result.parts) expect(part.tokens).toBeLessThanOrEqual(1000);

    // The pieces carry their line range and, together, every line once
    const text = result.parts.map((part) => part.text).join('\n');
    expect(text).toMatch(/=== big\.txt \(lines 1-\d+ of 400\) ===/);
    for (const row of [0, 199, 399]) {
      expect(text.split(`row ${row} of the data\n`).length - 1).toBe(1);
    }
  });

  it('keeps original line numbers in split pieces of a numbered file', async () => {
    write('big.txt', Array.from({ length: 300 }, (_, i) => `row ${i}`).join('\n'));
    const result = await packContext(root, {
      files: ['big.txt'],
      split: 400,
      lineNumbers: true,
      tree: false,
      style: 'plain',
    });
    const second = result.parts[1].text;
    const first = Number(/\(lines (\d+)-/.exec(second)[1]);

    expect(second).toContain(`${String(first).padStart(3)} | row ${first - 1}\n`);
  });

  it('gives the instructions their own part when the last part is full', async () => {
    const instructions = 'Question. '.repeat(60);
    const result = await packContext(root, { split: 700, instructions });

    for (const part of result.parts) expect(part.tokens).toBeLessThanOrEqual(700);
    expect(result.parts.at(-1).text).toContain(instructions.trimEnd());
  });

  it('fails when the first part cannot hold the header and tree', async () => {
    const error = await packContext(root, { split: 50, header: 'Words '.repeat(80) }).catch(
      (e) => e
    );

    expect(error.code).toBe('SPLIT_TOO_SMALL');
  });

  it('returns a single part when everything fits', async () => {
    const result = await packContext(root, { split: 100000 });

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].text).toContain('Part 1 of 1');
  });
});
