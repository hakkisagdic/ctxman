import { describe, test, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TokenAnalyzer, MethodAnalyzer, GitIgnoreParser, MethodFilterParser } from '../index.js';

describe('MethodAnalyzer', () => {
  const methodAnalyzer = new MethodAnalyzer();

  test('Extracts basic function', () => {
    const code = 'function testFunc() { return 42; }';
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(1);
    expect(methods[0].name).toBe('testFunc');
  });

  test('Extracts arrow function', () => {
    const code = 'const arrowFunc = () => { return 42; };';
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(1);
    expect(methods[0].name).toBe('arrowFunc');
  });

  test('Extracts async function', () => {
    const code = 'async function asyncFunc() { return await Promise.resolve(42); }';
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(1);
    expect(methods[0].name).toBe('asyncFunc');
  });

  test('Extracts class methods', () => {
    const code = `
        class MyClass {
            myMethod() { return 42; }
            async asyncMethod() { return await Promise.resolve(42); }
        }
    `;
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(2);
  });

  test('Extracts getters and setters', () => {
    const code = `
        class MyClass {
            get value() { return this._value; }
            set value(v) { this._value = v; }
        }
    `;
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(2);
  });

  test('Extracts exported function', () => {
    const code = 'export function exportedFunc() { return 42; }';
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(1);
    expect(methods[0].name).toBe('exportedFunc');
  });

  test('No duplicate methods', () => {
    const code = `
        function test() { return 42; }
        const arrow = () => {};
        class C { method() {} }
    `;
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    const names = methods.map((m) => `${m.name}:${m.line}`);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  test('Handles empty code', () => {
    const code = '';
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(0);
  });

  test('Handles code with no methods', () => {
    const code = 'const x = 42; console.log(x);';
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(0);
  });

  test('Filters out keywords', () => {
    const code = 'function if() {} function return() {}';
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(0);
  });

  test('Accurate line numbers', () => {
    const code = `
// Line 1
function first() {}
// Line 3
function second() {}
    `;
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(2);
    expect(methods[0].line).toBe(3);
    expect(methods[1].line).toBe(5);
  });
});

describe('Go Method Analyzer', () => {
  const methodAnalyzer = new MethodAnalyzer();

  test('Extracts Go functions', () => {
    const code = `
package main

func HelloWorld() {
    println("hello")
}

func Add(a, b int) int {
    return a + b
}
    `;
    const methods = methodAnalyzer.extractMethods(code, 'test.go');
    expect(methods).toHaveLength(2);
  });

  test('Extracts Go methods with receivers', () => {
    const code = `
package main

type Calculator struct {
    value int
}

func (c *Calculator) Add(n int) {
    c.value += n
}

func (c Calculator) GetValue() int {
    return c.value
}
    `;
    const methods = methodAnalyzer.extractMethods(code, 'test.go');
    expect(methods).toHaveLength(2);
  });

  test('Extracts interface methods', () => {
    const code = `
package main

type Reader interface {
    Read(p []byte) (n int, err error)
    Close() error
}
    `;
    const methods = methodAnalyzer.extractMethods(code, 'test.go');
    expect(methods.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Java Method Analyzer', () => {
  const methodAnalyzer = new MethodAnalyzer();

  test('Extracts Java methods', () => {
    const code = `
public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }

    private void validateInput(int x) {
        if (x < 0) throw new IllegalArgumentException();
    }
}
    `;
    const methods = methodAnalyzer.extractMethods(code, 'Calculator.java');
    expect(methods.length).toBeGreaterThanOrEqual(2);
  });

  test('Extracts constructors and methods', () => {
    const code = `
public class Person {
    private String name;

    public Person(String name) {
        this.name = name;
    }

    public String getName() {
        return this.name;
    }
}
    `;
    const methods = methodAnalyzer.extractMethods(code, 'Person.java');
    expect(methods.length).toBeGreaterThanOrEqual(2);
  });

  test('Multi-language support (JS/Go/Java)', () => {
    const jsCode = 'function jsFunc() { return 42; }';
    const goCode = 'func GoFunc() { println("hello") }';
    const javaCode = 'public int javaMethod() { return 42; }';

    const jsMethods = methodAnalyzer.extractMethods(jsCode, 'test.js');
    const goMethods = methodAnalyzer.extractMethods(goCode, 'test.go');
    const javaMethods = methodAnalyzer.extractMethods(javaCode, 'Test.java');

    expect(jsMethods).toHaveLength(1);
    expect(goMethods).toHaveLength(1);
    expect(javaMethods.length).toBeGreaterThanOrEqual(1);
  });
});

describe('TokenAnalyzer', () => {
  test('Successful instantiation', () => {
    const analyzer = new TokenAnalyzer(process.cwd(), { methodLevel: false });
    expect(analyzer).toBeDefined();
  });

  test('Method-level option enabled', () => {
    const analyzer = new TokenAnalyzer(process.cwd(), { methodLevel: true });
    expect(analyzer.options.methodLevel).toBe(true);
  });

  test('Calculates tokens', () => {
    const analyzer = new TokenAnalyzer(process.cwd(), { methodLevel: false });
    const testContent = 'function test() { return 42; }';
    const tokens = analyzer.calculateTokens(testContent, 'test.js');
    expect(typeof tokens).toBe('number');
    expect(tokens).toBeGreaterThan(0);
  });

  test('Detects text files', () => {
    const analyzer = new TokenAnalyzer(process.cwd(), { methodLevel: false });
    expect(analyzer.isTextFile('test.js')).toBe(true);
    expect(analyzer.isTextFile('test.ts')).toBe(true);
    expect(analyzer.isTextFile('test.md')).toBe(true);
    expect(analyzer.isTextFile('test.bin')).toBe(false);
  });

  test('Detects code files', () => {
    const analyzer = new TokenAnalyzer(process.cwd(), { methodLevel: false });
    expect(analyzer.isCodeFile('test.js')).toBe(true);
    expect(analyzer.isCodeFile('test.ts')).toBe(true);
    expect(analyzer.isCodeFile('test.md')).toBe(false);
  });

  test('Respects options', () => {
    const analyzer = new TokenAnalyzer(process.cwd(), {
      methodLevel: true,
      verbose: false,
      saveReport: true,
    });
    expect(analyzer.options.methodLevel).toBe(true);
    expect(analyzer.options.verbose).toBe(false);
    expect(analyzer.options.saveReport).toBe(true);
  });

  test('Stats initialization', () => {
    const analyzer = new TokenAnalyzer(process.cwd(), { methodLevel: false });
    const stats = analyzer.stats;

    expect(typeof stats.totalFiles).toBe('number');
    expect(typeof stats.totalTokens).toBe('number');
    expect(typeof stats.totalBytes).toBe('number');
    expect(typeof stats.totalLines).toBe('number');
    expect(stats.byExtension).toBeDefined();
    expect(stats.byDirectory).toBeDefined();
    expect(Array.isArray(stats.largestFiles)).toBe(true);
  });
});

describe('GitIgnoreParser', () => {
  test('Basic wildcard pattern matches', () => {
    const parser = new GitIgnoreParser(path.join(process.cwd(), '.gitignore'), null, null);
    const pattern1 = parser.convertToRegex('*.js');
    expect(pattern1.regex.test('test.js')).toBe(true);
  });

  test('Directory pattern matches', () => {
    const parser = new GitIgnoreParser(path.join(process.cwd(), '.gitignore'), null, null);
    const pattern2 = parser.convertToRegex('node_modules/');
    expect(pattern2.regex.test('node_modules/package.json')).toBe(true);
  });

  test('Detects negation pattern', () => {
    const parser = new GitIgnoreParser(path.join(process.cwd(), '.gitignore'), null, null);
    const pattern = parser.convertToRegex('!important.js');
    expect(pattern.isNegation).toBe(true);
  });
});

describe('MethodFilterParser', () => {
  test('Method filtering with patterns', () => {
    const testDir = path.join(process.cwd(), 'test-temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }

    const includeFile = path.join(testDir, '.methodinclude');
    fs.writeFileSync(includeFile, '*Handler\n*Validator\ncalculateTokens');

    try {
      const parser = new MethodFilterParser(includeFile, null);

      expect(parser.shouldIncludeMethod('requestHandler', 'test.js')).toBe(true);
      expect(parser.shouldIncludeMethod('inputValidator', 'test.js')).toBe(true);
      expect(parser.shouldIncludeMethod('calculateTokens', 'test.js')).toBe(true);
      expect(parser.shouldIncludeMethod('randomMethod', 'test.js')).toBe(false);
    } finally {
      // Cleanup
      if (fs.existsSync(includeFile)) fs.unlinkSync(includeFile);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    }
  });

  test('Detects include mode', () => {
    const testDir = path.join(process.cwd(), 'test-temp-include');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }
    const includeFile = path.join(testDir, '.methodinclude');
    fs.writeFileSync(includeFile, '*');

    try {
      const parser = new MethodFilterParser(includeFile, null);
      expect(parser.hasIncludeFile).toBe(true);
      expect(Array.isArray(parser.includePatterns)).toBe(true);
    } finally {
      if (fs.existsSync(includeFile)) fs.unlinkSync(includeFile);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    }
  });
});

describe('Edge Cases & Error Handling', () => {
  const methodAnalyzer = new MethodAnalyzer();

  test('Handles very long method names', () => {
    const longName = 'a'.repeat(1000);
    const code = `function ${longName}() { return 42; }`;
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(1);
    expect(methods[0].name).toBe(longName);
  });

  test('Handles special characters in method names', () => {
    const code = `function test$_123() { return "test"; }`;
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(1);
  });

  test('Detects nested functions', () => {
    const code = `
        function outer() {
            function inner() {
                return 42;
            }
            return inner;
        }
    `;
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(2);
  });

  test('Handles multiple functions on same line', () => {
    const code = 'function a() {} function b() {}';
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods).toHaveLength(2);
  });

  test('Extracts real function despite comments', () => {
    const code = `
        // function commentFunc() {}
        /* function blockCommentFunc() {} */
        function realFunc() {}
    `;
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods.some((m) => m.name === 'realFunc')).toBe(true);
  });

  test('Handles Unicode without crashing', () => {
    const code = 'function тест() { return 42; }'; // Cyrillic
    const methods = methodAnalyzer.extractMethods(code, 'test.js');
    expect(methods.length).toBeGreaterThanOrEqual(0);
  });
});
