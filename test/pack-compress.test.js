import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { compressCode } from '../lib/pack/compress.js';
import { lexCode, familyOf, CODE, COMMENT, STRING } from '../lib/pack/code-lexer.js';
import { packContext } from '../lib/pack/index.js';

const lines = (...text) => `${text.join('\n')}\n`;

describe('pack --compress', () => {
  describe('brace languages', () => {
    it('replaces JavaScript function and method bodies with a comment placeholder', () => {
      const source = lines(
        "import fs from 'fs';",
        '',
        '/** Reads a file */',
        'export function read(file) {',
        "  const text = fs.readFileSync(file, 'utf8');",
        '  return text.trim();',
        '}',
        '',
        'class Store {',
        '  constructor(dir) {',
        '    this.dir = dir;',
        '    this.cache = new Map();',
        '  }',
        '',
        '  async load(key) {',
        '    const value = await read(key);',
        '    this.cache.set(key, value);',
        '    return value;',
        '  }',
        '}',
        '',
        'const double = (n) => {',
        '  const result = n * 2;',
        '  return result;',
        '};'
      );
      const result = compressCode(source, 'src/store.js');

      expect(result.text).toBe(
        lines(
          "import fs from 'fs';",
          '',
          '/** Reads a file */',
          'export function read(file) { /* … 2 lines */ }',
          '',
          'class Store {',
          '  constructor(dir) { /* … 2 lines */ }',
          '',
          '  async load(key) { /* … 3 lines */ }',
          '}',
          '',
          'const double = (n) => { /* … 2 lines */ };'
        )
      );
      expect(result.elided).toBe(4);
      expect(result.supported).toBe(true);
    });

    it('does not double-elide nested functions', () => {
      const source = lines(
        'function outer(list) {',
        '  function inner(item) {',
        '    return item * 2;',
        '  }',
        '  return list.map(inner);',
        '}'
      );
      const result = compressCode(source, 'a.js');

      expect(result.text).toBe(lines('function outer(list) { /* … 4 lines */ }'));
      expect(result.elided).toBe(1);
    });

    it('is not fooled by braces in strings, comments, templates and regexes', () => {
      const source = lines(
        'function tricky(a) {',
        "  const s = '}';",
        '  // }',
        '  const t = `${a} }`;',
        '  const r = /[}]/;',
        '  return s + t + r;',
        '}',
        'function after() {',
        '  return 1 + 2 + 3 + 4;',
        '}'
      );
      const result = compressCode(source, 'a.js');

      expect(result.text).toBe(
        lines('function tricky(a) { /* … 5 lines */ }', 'function after() { /* … 1 line */ }')
      );
    });

    it('keeps the file whole when its brackets do not balance', () => {
      const source = lines('function broken(a) {', '  if (a) {', '    return 1;', '}');
      const result = compressCode(source, 'a.js');

      expect(result.text).toBe(source);
      expect(result.elided).toBe(0);
      expect(result.lineMap).toBeNull();
    });

    it('keeps one-line bodies that are shorter than the placeholder', () => {
      const source = lines('function id(x) {', '  return x;', '}');

      expect(compressCode(source, 'a.js').text).toBe(source);
    });

    it('leaves declarations without bodies alone (TypeScript overloads, interfaces)', () => {
      const source = lines(
        'export function parse(input: string): number;',
        'export function parse(input: number): number;',
        'export function parse(input: any): number {',
        '  const value = Number(input);',
        '  return Number.isNaN(value) ? 0 : value;',
        '}',
        'interface Reader {',
        '  read(path: string): Promise<string>;',
        '}'
      );
      const result = compressCode(source, 'a.ts');

      expect(result.text).toBe(
        lines(
          'export function parse(input: string): number;',
          'export function parse(input: number): number;',
          'export function parse(input: any): number { /* … 2 lines */ }',
          'interface Reader {',
          '  read(path: string): Promise<string>;',
          '}'
        )
      );
    });

    it('handles Go receivers, Java throws clauses and anonymous classes', () => {
      const go = lines(
        'func (s *Server) Start(port int) error {',
        '\tif port == 0 {',
        '\t\treturn errors.New("bad port")',
        '\t}',
        '\treturn nil',
        '}'
      );
      expect(compressCode(go, 'server.go').text).toBe(
        lines('func (s *Server) Start(port int) error { /* … 4 lines */ }')
      );

      const java = lines(
        'public class A {',
        '    public int add(int m) throws IllegalStateException {',
        '        if (m < 0) {',
        '            throw new IllegalStateException("neg");',
        '        }',
        '        return m + 1;',
        '    }',
        '}'
      );
      expect(compressCode(java, 'A.java').text).toBe(
        lines(
          'public class A {',
          '    public int add(int m) throws IllegalStateException { /* … 4 lines */ }',
          '}'
        )
      );
    });

    it('handles Rust lifetimes, raw strings and multi-line where clauses', () => {
      const source = lines(
        'impl Point {',
        "    pub fn label<'a>(&'a self) -> &'a str {",
        '        let s = r#"{"x": 1}"#;',
        '        s',
        '    }',
        '',
        '    pub fn dist<T>(&self, other: &T) -> f64',
        '    where',
        '        T: Into<Point>,',
        '    {',
        '        let p = other.into();',
        '        (self.x - p.x).abs()',
        '    }',
        '}'
      );
      expect(compressCode(source, 'point.rs').text).toBe(
        lines(
          'impl Point {',
          "    pub fn label<'a>(&'a self) -> &'a str { /* … 2 lines */ }",
          '',
          '    pub fn dist<T>(&self, other: &T) -> f64',
          '    where',
          '        T: Into<Point>,',
          '    { /* … 2 lines */ }',
          '}'
        )
      );
    });
  });

  describe('python and ruby', () => {
    it('replaces Python bodies with an indented ellipsis and keeps docstrings', () => {
      const source = lines(
        'class Greeter:',
        '    @staticmethod',
        '    def helper(x):',
        '        def inner(y):',
        '            return y * 2',
        '        return inner(x) + 1',
        '',
        '    async def greet(self, loud=False) -> str:',
        '        """Say hello.',
        '',
        '        Loudly if asked.',
        '        """',
        '        text = f"hello {self.name}"',
        '        return text.upper() if loud else text',
        '',
        'def top(a,',
        '        b):',
        '    s = """',
        'def fake():',
        '    pass',
        '"""',
        '    return a + b'
      );
      const result = compressCode(source, 'greeter.py');

      expect(result.text).toBe(
        lines(
          'class Greeter:',
          '    @staticmethod',
          '    def helper(x):',
          '        ...  # 3 lines',
          '',
          '    async def greet(self, loud=False) -> str:',
          '        """Say hello.',
          '',
          '        Loudly if asked.',
          '        """',
          '        ...  # 2 lines',
          '',
          'def top(a,',
          '        b):',
          '    ...  # 5 lines'
        )
      );
    });

    it('keeps one-line Python definitions and docstring-only functions', () => {
      const source = lines(
        'def short(a): return a',
        '',
        'def documented():',
        '    """Nothing else here, the docstring is the body."""'
      );

      expect(compressCode(source, 'a.py').text).toBe(source);
    });

    it('replaces Ruby bodies between def and end', () => {
      const source = lines(
        'class Foo',
        '  def bar?(other)',
        '    @a > other.size && @b > other.size',
        '  end',
        '',
        '  def self.build(x)',
        '    new(x)',
        '  end',
        'end'
      );

      expect(compressCode(source, 'foo.rb').text).toBe(
        lines(
          'class Foo',
          '  def bar?(other)',
          '    # … 1 line',
          '  end',
          '',
          '  def self.build(x)',
          '    new(x)',
          '  end',
          'end'
        )
      );
    });
  });

  describe('line map', () => {
    it('maps every output line to its original line', () => {
      const source = lines('// head', 'function a() {', '  one();', '  two();', '}', 'tail();');
      const result = compressCode(source, 'a.js');

      expect(result.text).toBe(lines('// head', 'function a() { /* … 2 lines */ }', 'tail();'));
      expect(result.lineMap).toEqual([1, 2, 6, 7]);
    });
  });

  it('leaves unsupported languages unchanged', () => {
    const result = compressCode('fn main() {\n  body\n}\n', 'notes.md');

    expect(result).toEqual({
      text: 'fn main() {\n  body\n}\n',
      lineMap: null,
      elided: 0,
      supported: false,
    });
  });

  describe('lexer', () => {
    it('marks comments and strings and pairs code brackets', () => {
      const src = 'f("(", /* { */ x) { y }';
      const lexed = lexCode(src, 'js');

      expect(lexed.balanced).toBe(true);
      expect(lexed.kinds[src.indexOf('"')]).toBe(STRING);
      expect(lexed.kinds[src.indexOf('/*')]).toBe(COMMENT);
      expect(lexed.kinds[src.indexOf('x')]).toBe(CODE);
      expect(lexed.match[1]).toBe(src.indexOf(')'));
      expect(lexed.match[src.indexOf('{ y')]).toBe(src.length - 1);
    });

    it('reports unbalanced brackets and maps extensions to families', () => {
      expect(lexCode('f(', 'js').balanced).toBe(false);
      expect(familyOf('a/b.TSX')).toBe('js');
      expect(familyOf('lib.rs')).toBe('rust');
      expect(familyOf('README.md')).toBeNull();
    });
  });

  describe('in packContext', () => {
    let root;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pack-compress-'));
      fs.writeFileSync(
        path.join(root, 'calc.js'),
        lines(
          'export function sum(values) {',
          '  let total = 0;',
          '  for (const value of values) total += value;',
          '  return total;',
          '}',
          '',
          'export function mean(values) {',
          '  return values.length ? sum(values) / values.length : 0;',
          '}'
        )
      );
      fs.writeFileSync(path.join(root, 'notes.md'), '# Notes\n');
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('compresses supported files and reports the tokens saved', async () => {
      const result = await packContext(root, { compress: true, style: 'plain', tree: false });

      expect(result.text).toContain('export function sum(values) { /* … 3 lines */ }');
      expect(result.text).toContain('# Notes');
      expect(result.files).toEqual([
        expect.objectContaining({ path: 'calc.js', compressed: true, lines: 9 }),
        expect.objectContaining({ path: 'notes.md', compressed: false }),
      ]);
      expect(result.compression.files).toBe(1);
      expect(result.compression.bodies).toBe(2);
      expect(result.compression.savedTokens).toBe(
        result.compression.originalTokens - result.compression.compressedTokens
      );
      expect(result.compression.savedTokens).toBeGreaterThan(0);
    });

    it('numbers compressed lines with their original line numbers', async () => {
      const result = await packContext(root, {
        compress: true,
        lineNumbers: true,
        files: ['calc.js'],
        style: 'plain',
        tree: false,
      });

      expect(result.text).toBe(
        lines(
          '=== calc.js ===',
          '1 | export function sum(values) { /* … 3 lines */ }',
          '6 |',
          '7 | export function mean(values) { /* … 1 line */ }'
        )
      );
    });

    it('reports no compression without the option', async () => {
      expect((await packContext(root)).compression).toBeNull();
    });
  });
});
