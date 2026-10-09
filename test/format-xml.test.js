import { describe, test, expect } from 'vitest';
import FormatRegistry from '../lib/formatters/format-registry.js';

// Minimal well-formedness check: one declaration at the very start, and every
// start tag closed in order.
function assertWellFormed(xml) {
  expect(xml.match(/<\?xml/g)).toHaveLength(1);
  expect(xml.startsWith('<?xml')).toBe(true);
  const body = xml.replace(/^<\?xml[^?]*\?>/, '');
  const stack = [];
  for (const [, closing, name] of body.matchAll(/<(\/?)([^\s>/]+)>/g)) {
    if (closing) {
      expect(stack.pop()).toBe(name);
    } else {
      stack.push(name);
    }
  }
  expect(stack).toEqual([]);
}

describe('FormatRegistry XML output', () => {
  const registry = new FormatRegistry();

  test('emits a single declaration and puts scalars directly inside their elements', () => {
    const xml = registry.encode('xml', {
      project: { root: 'x', totalFiles: 2 },
      paths: { 'src/': ['a.js', 'b.js'] },
    });

    assertWellFormed(xml);
    expect(xml).toContain('<root>x</root>');
    expect(xml).toContain('<totalFiles>2</totalFiles>');
    expect(xml).toContain('<item>a.js</item>');
  });

  test('nests objects that appear inside arrays', () => {
    const xml = registry.encode('xml', {
      methods: { 'src/app.js': [{ name: 'main', line: 3, tokens: 12 }] },
    });

    assertWellFormed(xml);
    expect(xml).toMatch(
      /<item>\s*<name>main<\/name>\s*<line>3<\/line>\s*<tokens>12<\/tokens>\s*<\/item>/
    );
  });
});
