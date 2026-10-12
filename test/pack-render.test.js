import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { packContext, addLineNumbers } from '../lib/pack/index.js';
import { fenceFor } from '../lib/pack/renderers/markdown.js';
import { protectContent } from '../lib/pack/renderers/xml.js';
import { buildTree } from '../lib/pack/tree.js';
import { languageOf } from '../lib/pack/renderers/common.js';
import TokenUtils from '../lib/utils/token-utils.js';

const FAKE_AWS_KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

describe('pack rendering', () => {
  let root;
  const write = (relativePath, content) => {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pack-render-'));
    write('src/add.js', 'export function add(a, b) {\n  return a + b;\n}\n');
    write('README.md', '# Demo\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('xml (default)', () => {
    it("renders Anthropic's long-context document format", async () => {
      const result = await packContext(root);

      expect(result.style).toBe('xml');
      expect(result.text).toBe(
        [
          '<directory_structure>',
          'src/',
          '  add.js',
          'README.md',
          '</directory_structure>',
          '',
          '<documents>',
          '<document index="1">',
          '<source>README.md</source>',
          '<document_content>',
          '# Demo',
          '</document_content>',
          '</document>',
          '<document index="2">',
          '<source>src/add.js</source>',
          '<document_content>',
          'export function add(a, b) {',
          '  return a + b;',
          '}',
          '</document_content>',
          '</document>',
          '</documents>',
          '',
        ].join('\n')
      );
    });

    it('does not escape code but neutralises closing wrapper tags', async () => {
      write(
        'tricky.md',
        'a < b && c > d\n</document_content>\n</DOCUMENT >\n</documents>\n<source>x</source>\n'
      );
      const result = await packContext(root, { files: ['tricky.md'], tree: false });

      expect(result.text).toContain('a < b && c > d\n');
      expect(result.text).toContain('&lt;/document_content>\n&lt;/DOCUMENT >\n&lt;/documents>');
      expect(result.text).toContain('<source>x</source>\n</document_content>');
      // Exactly one real closing tag per document
      expect(result.text.match(/^<\/document_content>$/gm)).toHaveLength(1);
      expect(result.text.match(/^<\/documents>$/gm)).toHaveLength(1);
    });

    // `<` and `>` are not allowed in Windows file names
    it.skipIf(process.platform === 'win32')(
      'escapes paths in <source> and in the tree',
      async () => {
        write('a&b<c>.md', 'x\n');
        const result = await packContext(root, { files: ['a&b<c>.md'] });

        expect(result.text).toContain('<source>a&amp;b&lt;c&gt;.md</source>');
        expect(result.text).toContain('<directory_structure>\na&amp;b&lt;c&gt;.md\n');
      }
    );

    it('protectContent only touches the wrapper closing tags', () => {
      expect(protectContent('</div></document_content></documentation>')).toBe(
        '</div>&lt;/document_content></documentation>'
      );
    });
  });

  describe('markdown', () => {
    it('renders headings and fenced code with the language of the extension', async () => {
      const result = await packContext(root, { style: 'markdown' });

      expect(result.text).toContain(
        '## Directory structure\n\n```\nsrc/\n  add.js\nREADME.md\n```'
      );
      expect(result.text).toContain('### src/add.js\n\n```javascript\nexport function add');
      expect(result.text).toContain('### README.md\n\n```markdown\n# Demo\n```');
    });

    it('uses a fence longer than any backtick run in the file', async () => {
      write('doc.md', 'Example:\n\n````js\nconst a = `x`;\n````\n');
      const result = await packContext(root, { style: 'markdown', files: ['doc.md'] });

      expect(result.text).toContain('`````markdown\nExample:');
      expect(result.text).toContain('````\n`````');
      expect(fenceFor('no backticks')).toBe('```');
      expect(fenceFor('a ``` b')).toBe('````');
    });

    it('maps extensions and special names to fence languages', () => {
      expect(languageOf('a/b.py')).toBe('python');
      expect(languageOf('main.rs')).toBe('rust');
      expect(languageOf('Dockerfile')).toBe('dockerfile');
      expect(languageOf('notes')).toBe('');
      expect(languageOf('.env')).toBe('');
    });
  });

  describe('plain', () => {
    it('separates files with === path === lines', async () => {
      const result = await packContext(root, { style: 'plain', tree: false });

      expect(result.text).toBe(
        '=== README.md ===\n# Demo\n\n=== src/add.js ===\nexport function add(a, b) {\n  return a + b;\n}\n'
      );
    });
  });

  describe('json', () => {
    it('renders files with path, tokens and content', async () => {
      const result = await packContext(root, {
        style: 'json',
        header: 'Head',
        instructions: 'Do it',
      });
      const parsed = JSON.parse(result.text);

      expect(Object.keys(parsed)).toEqual(['header', 'tree', 'files', 'instructions']);
      expect(parsed.files).toEqual([
        { path: 'README.md', tokens: result.files[0].tokens, content: '# Demo\n' },
        {
          path: 'src/add.js',
          tokens: result.files[1].tokens,
          content: 'export function add(a, b) {\n  return a + b;\n}\n',
        },
      ]);
      expect(parsed.tree).toBe('src/\n  add.js\nREADME.md');
      expect(parsed.instructions).toBe('Do it');
    });
  });

  describe('tree', () => {
    it('can be left out', async () => {
      const result = await packContext(root, { tree: false });

      expect(result.text).not.toContain('<directory_structure>');
      expect(result.text.startsWith('<documents>\n')).toBe(true);
    });

    it('lists directories first, then files, each sorted', () => {
      expect(buildTree(['b.js', 'a/z.js', 'a/b/c.js', 'A.md'])).toBe(
        'a/\n  b/\n    c.js\n  z.js\nA.md\nb.js'
      );
    });
  });

  describe('header and instructions', () => {
    it('puts the header first and the instructions last in every style', async () => {
      for (const style of ['xml', 'markdown', 'plain']) {
        const result = await packContext(root, {
          style,
          header: 'Codebase of Demo',
          instructions: 'Find the bug.\n',
        });

        expect(result.text.startsWith('Codebase of Demo\n\n')).toBe(true);
        const end = { xml: '</instructions>', markdown: 'Find the bug.', plain: 'Find the bug.' };
        expect(result.text.trimEnd().endsWith(end[style])).toBe(true);
        expect(result.text.indexOf('Find the bug.')).toBeGreaterThan(
          result.text.indexOf('return a + b;')
        );
      }
    });

    it('wraps xml instructions in <instructions>', async () => {
      const result = await packContext(root, { instructions: 'Explain add().' });

      expect(
        result.text.endsWith('</documents>\n\n<instructions>\nExplain add().\n</instructions>\n')
      ).toBe(true);
    });
  });

  describe('line numbers', () => {
    it('numbers every line, padded to the widest number', async () => {
      write('ten.txt', Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join('\n') + '\n');
      const result = await packContext(root, {
        files: ['ten.txt'],
        lineNumbers: true,
        style: 'plain',
        tree: false,
      });

      expect(result.text).toContain('=== ten.txt ===\n 1 | l1\n 2 | l2\n');
      expect(result.text).toContain('\n10 | l10\n');
    });

    it('keeps blank lines without trailing spaces', () => {
      expect(addLineNumbers('a\n\nb\n')).toBe('1 | a\n2 |\n3 | b\n');
      expect(addLineNumbers('x\ny', [7, 12])).toBe(' 7 | x\n12 | y');
    });
  });

  describe('redaction', () => {
    beforeEach(() => {
      write('config.js', `export const key = '${FAKE_AWS_KEY}';\n`);
    });

    it('masks secrets by default and counts them', async () => {
      const result = await packContext(root, { header: `header ${FAKE_AWS_KEY}` });

      expect(result.text).not.toContain(FAKE_AWS_KEY);
      expect(result.text).toContain("export const key = '[REDACTED:aws-access-key-id]';");
      expect(result.redactions).toEqual({ total: 2, byType: { 'aws-access-key-id': 2 } });
    });

    it('keeps secrets with redact: false', async () => {
      const result = await packContext(root, { redact: false });

      expect(result.text).toContain(FAKE_AWS_KEY);
      expect(result.redactions.total).toBe(0);
    });

    it('keeps line numbers aligned when a multi-line key is masked', async () => {
      write(
        'key.pem',
        [
          'before',
          '-----BEGIN RSA PRIVATE KEY-----',
          'MIIEowIBAAKCAQEA',
          '-----END RSA PRIVATE KEY-----',
          'after',
          '',
        ].join('\n')
      );
      const result = await packContext(root, {
        files: ['key.pem'],
        lineNumbers: true,
        style: 'plain',
        tree: false,
      });

      expect(result.text).toContain('1 | before\n2 | [REDACTED:private-key]\n5 | after\n');
    });
  });

  it('reports total tokens of the rendered document and per-file tokens', async () => {
    const result = await packContext(root);

    expect(result.totalTokens).toBe(TokenUtils.calculate(result.text, 'pack.xml'));
    expect(result.files).toEqual([
      {
        path: 'README.md',
        tokens: TokenUtils.calculate('# Demo\n', 'x'),
        lines: 1,
        compressed: false,
      },
      expect.objectContaining({ path: 'src/add.js', lines: 3 }),
    ]);
    expect(result.encoding).toBe(TokenUtils.isExact() ? 'cl100k_base' : 'estimate');
    expect(result.budget).toBeNull();
    expect(result.model).toBeNull();
    expect(result.parts).toBeNull();
  });
});
