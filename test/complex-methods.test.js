import { describe, test, expect } from 'vitest';
import MethodAnalyzer from '../lib/analyzers/method-analyzer.js';

describe('Complex Method Analysis', () => {
  const analyzer = new MethodAnalyzer();

  test('Go: Generic Methods', () => {
    const code = `
            package main
            type Stack[T any] struct { items []T }
            func (s *Stack[T]) Push(item T) {
                s.items = append(s.items, item)
            }
            func (s *Stack[T]) Pop() T {
                return s.items[len(s.items)-1]
            }
        `;
    const methods = analyzer.extractMethods(code, 'stack.go');
    // Beklenti: Push ve Pop metodlarını bulmalı
    expect(methods.map((m) => m.name)).toContain('Push');
    expect(methods.map((m) => m.name)).toContain('Pop');
  });

  test('Rust: Trait Implementation with Generics', () => {
    const code = `
            impl<T: Display> ToString for Wrapper<T> {
                fn to_string(&self) -> String {
                    format!("{}", self.0)
                }
            }
            impl Wrapper {
                pub fn new(val: i32) -> Self {
                    Wrapper(val)
                }
            }
        `;
    const methods = analyzer.extractMethods(code, 'wrapper.rs');
    // Beklenti: to_string ve new metodlarını bulmalı
    expect(methods.map((m) => m.name)).toContain('to_string');
    expect(methods.map((m) => m.name)).toContain('new');
  });
});
