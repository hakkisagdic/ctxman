import { describe, test, expect } from 'vitest';
import GoMethodAnalyzer from '../lib/analyzers/go-method-analyzer.js';

describe('Go Method Analyzer', () => {
  describe('Function Extraction', () => {
    test('extracts standard functions', () => {
      const analyzer = new GoMethodAnalyzer();
      const goCode = `
package main

import "fmt"

// Public function
func HelloWorld() {
    fmt.Println("Hello, World!")
}

// Function with parameters and return
func Add(a int, b int) int {
    return a + b
}

// Multiple return values
func Divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, fmt.Errorf("division by zero")
    }
    return a / b, nil
}
`;
      const methods = analyzer.extractMethods(goCode, '/test/sample.go');

      expect(methods.length).toBe(3);
      expect(methods.some((m) => m.name === 'HelloWorld')).toBe(true);
      expect(methods.some((m) => m.name === 'Add')).toBe(true);
      expect(methods.some((m) => m.name === 'Divide')).toBe(true);
    });
  });

  describe('Method Extraction', () => {
    test('extracts methods with receivers', () => {
      const analyzer = new GoMethodAnalyzer();
      const goCode = `
package main

type Calculator struct {
    value int
}

// Method with pointer receiver
func (c *Calculator) Add(n int) {
    c.value += n
}

// Method with value receiver
func (c Calculator) GetValue() int {
    return c.value
}

// Method with multiple parameters
func (c *Calculator) Multiply(a, b int) int {
    return a * b
}
`;
      const methods = analyzer.extractMethods(goCode, '/test/calculator.go');

      expect(methods.length).toBe(3);
      expect(methods.some((m) => m.name === 'Add')).toBe(true);
      expect(methods.some((m) => m.name === 'GetValue')).toBe(true);
      expect(methods.some((m) => m.name === 'Multiply')).toBe(true);
    });
  });

  describe('Interface Extraction', () => {
    test('extracts interface methods', () => {
      const analyzer = new GoMethodAnalyzer();
      const goCode = `
package main

type Reader interface {
    Read(p []byte) (n int, err error)
    Close() error
}

type Writer interface {
    Write(p []byte) (n int, err error)
    Flush() error
}
`;
      const methods = analyzer.extractMethods(goCode, '/test/interfaces.go');

      expect(methods.length).toBeGreaterThanOrEqual(4);
      expect(methods.some((m) => m.name === 'Read')).toBe(true);
      expect(methods.some((m) => m.name === 'Close')).toBe(true);
      expect(methods.some((m) => m.name === 'Write')).toBe(true);
      expect(methods.some((m) => m.name === 'Flush')).toBe(true);
    });
  });

  describe('Comment Filtering', () => {
    test('ignores functions inside comments', () => {
      const analyzer = new GoMethodAnalyzer();
      const goCode = `
package main

// This is a comment with func FakeFunction() syntax
/* Multi-line comment
   func AnotherFake() {
   }
*/

// Real function
func RealFunction() {
    // func NotAFunction() inside comment
    println("real")
}
`;
      const methods = analyzer.extractMethods(goCode, '/test/comments.go');

      expect(methods.length).toBe(1);
      expect(methods[0].name).toBe('RealFunction');
    });
  });

  describe('Keyword Filtering', () => {
    test('filters Go keywords', () => {
      const analyzer = new GoMethodAnalyzer();
      const keywords = ['func', 'var', 'const', 'type', 'struct', 'interface'];

      keywords.forEach((keyword) => {
        expect(analyzer.isKeyword(keyword)).toBe(true);
      });
    });
  });
});
