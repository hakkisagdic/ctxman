import { describe, test, expect, vi, beforeEach } from 'vitest';
import MethodAnalyzer from '../lib/analyzers/method-analyzer.js';
import GoMethodAnalyzer from '../lib/analyzers/go-method-analyzer.js';

vi.mock('../lib/analyzers/go-method-analyzer.js');

describe('MethodAnalyzer Coverage', () => {
  let analyzer;

  beforeEach(() => {
    vi.clearAllMocks();
    GoMethodAnalyzer.mockImplementation(function () {
      return {
        extractMethods: vi.fn().mockReturnValue([{ name: 'goMethod' }]),
      };
    });
    analyzer = new MethodAnalyzer();
  });

  describe('Language Routing', () => {
    test('routes to Go analyzer', () => {
      const result = analyzer.extractMethods('package main', 'test.go');
      expect(result[0].name).toBe('goMethod');
    });

    test('routes to Rust analyzer', () => {
      const content = 'fn main() {}';
      const result = analyzer.extractMethods(content, 'test.rs');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('main');
    });

    // Add other routings implicitly via specific language tests
  });

  describe('JavaScript/TypeScript', () => {
    test('extracts functions', () => {
      const content = `
                function normalFunc() {}
                async function asyncFunc() {}
                export function exportedFunc() {}
            `;
      const result = analyzer.extractMethods(content, 'test.js');
      expect(result.map((m) => m.name)).toEqual(['normalFunc', 'asyncFunc', 'exportedFunc']);
    });

    test('extracts object methods', () => {
      const content = `
                const obj = {
                    method: function() {},
                    asyncMethod: async function() {}
                };
            `;
      const result = analyzer.extractMethods(content, 'test.js');
      expect(result.map((m) => m.name)).toEqual(['method', 'asyncMethod']);
    });

    test('extracts arrow functions', () => {
      const content = `
                const arrow = () => {};
                let asyncArrow = async () => {};
            `;
      const result = analyzer.extractMethods(content, 'test.js');
      expect(result.map((m) => m.name)).toEqual(['arrow', 'asyncArrow']);
    });

    test('extracts typed TypeScript arrow functions', () => {
      const content = `export const tsArrow = (s: string): string => s;
const sumValues = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const load = async (id: string): Promise<User | null> => {
  return null;
};
export const handler: Handler<Req, Res> = async (event) => {};
const multiLine = (
  a: string,
  b: number
): { a: string } => ({ a });
`;
      const result = analyzer.extractMethods(content, 'test.ts');
      expect(result.map((m) => `${m.name}@${m.line}`)).toEqual([
        'tsArrow@1',
        'sumValues@2',
        'load@3',
        'handler@6',
        'multiLine@7',
      ]);
    });

    test('does not report typed variables, calls or ternaries as arrow functions', () => {
      const content = `if (ready) {
  run();
}
const total: number = compute(a, b);
const label = (flag) ? 'on' : 'off';
let maybe: string | undefined;
const typed: Map<string, number> = new Map();
items.map((item): Item => item);
const loaded = (opts.path ? import(
  opts.path
) : Promise.resolve()).catch((cause) => {
  throw cause;
});
`;
      const result = analyzer.extractMethods(content, 'test.ts');
      expect(result.map((m) => m.name)).toEqual([]);
    });

    test('extracts accessors', () => {
      const content = `
                class Foo {
                    get bar() {}
                    set bar(v) {}
                }
            `;
      const result = analyzer.extractMethods(content, 'test.js');
      expect(result.map((m) => m.name)).toEqual(['get bar', 'set bar']);
    });

    test('extracts class methods (shorthand)', () => {
      const content = `
                class Foo {
                    method() {}
                    async asyncMethod() {}
                }
            `;
      const result = analyzer.extractMethods(content, 'test.js');
      expect(result.map((m) => m.name)).toEqual(['method', 'asyncMethod']);
    });

    test('extracts typescript class methods with a return type', () => {
      const content = `
class UserService {
  getUser(id: string): User {
    return this.users[id];
  }
  private save(): void {}
  async load(ids: string[]): Promise<Map<string, User>> {
    return new Map();
  }
}
`;
      const result = analyzer.extractMethods(content, 'test.ts');
      expect(result.map((m) => m.name)).toEqual(['getUser', 'save', 'load']);
    });

    test('does not take ternaries or template text for typed methods', () => {
      const content = `
const extra = enabled ? pick(options) : {};
const message = \`Format error (\${format}): \${error.message}\`;
`;
      const result = analyzer.extractMethods(content, 'test.ts');
      expect(result.map((m) => m.name)).toEqual([]);
    });

    test('ignores keywords', () => {
      const content = `
                if (true) {}
                while (false) {}
                function if() {} // Should be ignored if logic works, though syntax error
            `;
      const result = analyzer.extractMethods(content, 'test.js');
      expect(result.map((m) => m.name)).not.toContain('if');
      expect(result.map((m) => m.name)).not.toContain('while');
    });
  });

  describe('Java', () => {
    test('extracts methods', () => {
      const content = `
                public void publicMethod() {}
                private static String staticMethod() {}
                protected final int finalMethod() {}
            `;
      const result = analyzer.extractMethods(content, 'test.java');
      expect(result.map((m) => m.name)).toEqual(['publicMethod', 'staticMethod', 'finalMethod']);
    });

    test('extracts constructors', () => {
      const content = `
                public MyClass() {}
                private MyClass(int a) throws Exception {}
            `;
      const result = analyzer.extractMethods(content, 'MyClass.java');
      expect(result.map((m) => m.name)).toEqual(['MyClass', 'MyClass']);
    });

    test('ignores keywords', () => {
      const content = `
                public void if() {}
                public void String() {} 
            `;
      const result = analyzer.extractMethods(content, 'test.java');
      expect(result.map((m) => m.name)).not.toContain('if');
      expect(result.map((m) => m.name)).not.toContain('String');
    });
  });

  describe('C#', () => {
    test('extracts methods', () => {
      const content = `
                public void Method1() {}
                private static async Task<int> Method2() {}
                internal override string Method3<T>() {}
            `;
      const result = analyzer.extractMethods(content, 'test.cs');
      expect(result.map((m) => m.name)).toEqual(['Method1', 'Method2', 'Method3']);
    });

    test('extracts properties', () => {
      const content = `
                public int Prop1 { get; set; }
                private string Prop2 { get; }
            `;
      const result = analyzer.extractMethods(content, 'test.cs');
      expect(result.map((m) => m.name)).toEqual(['Prop1', 'Prop2']);
    });

    test('extracts expression-bodied members', () => {
      const content = `
                public int Method() => 42;
            `;
      const result = analyzer.extractMethods(content, 'test.cs');
      expect(result.map((m) => m.name)).toEqual(['Method']);
    });

    test('ignores keywords', () => {
      const content = `
                public void if() {}
                public void using() {}
            `;
      const result = analyzer.extractMethods(content, 'test.cs');
      expect(result.map((m) => m.name)).not.toContain('if');
      expect(result.map((m) => m.name)).not.toContain('using');
    });
  });

  describe('Python', () => {
    test('extracts functions', () => {
      const content = `
                def func1(): pass
                async def func2(): pass
            `;
      const result = analyzer.extractMethods(content, 'test.py');
      expect(result.map((m) => m.name)).toEqual(['func1', 'func2']);
    });

    test('extracts decorated methods', () => {
      const content = `
                @staticmethod
                def static_method(): pass
                @classmethod
                def class_method(): pass
            `;
      const result = analyzer.extractMethods(content, 'test.py');
      expect(result.map((m) => m.name)).toEqual(['static_method', 'class_method']);
    });

    test('ignores keywords', () => {
      const content = `def if(): pass`;
      const result = analyzer.extractMethods(content, 'test.py');
      expect(result.map((m) => m.name)).not.toContain('if');
    });
  });

  describe('PHP', () => {
    test('extracts functions', () => {
      const content = `
                function myFunc() {}
                public static function myMethod() {}
            `;
      const result = analyzer.extractMethods(content, 'test.php');
      expect(result.map((m) => m.name)).toEqual(['myFunc', 'myMethod']);
    });
  });

  describe('Ruby', () => {
    test('extracts methods', () => {
      const content = `
                def my_method
                end
                def self.static_method
                end
            `;
      const result = analyzer.extractMethods(content, 'test.rb');
      expect(result.map((m) => m.name)).toEqual(['my_method', 'static_method']);
    });

    test('ignores keywords', () => {
      const content = `def if; end`;
      const result = analyzer.extractMethods(content, 'test.rb');
      expect(result.map((m) => m.name)).not.toContain('if');
    });
  });

  describe('Kotlin', () => {
    test('extracts functions', () => {
      const content = `
                fun myFunc() {}
                suspend fun asyncFunc() {}
                private inline fun <T> genericFunc() {}
            `;
      const result = analyzer.extractMethods(content, 'test.kt');
      expect(result.map((m) => m.name)).toEqual(['myFunc', 'asyncFunc', 'genericFunc']);
    });

    test('ignores keywords', () => {
      const content = `fun if() {}`;
      const result = analyzer.extractMethods(content, 'test.kt');
      expect(result.map((m) => m.name)).not.toContain('if');
    });
  });

  describe('Swift', () => {
    test('extracts functions', () => {
      const content = `
                func myFunc() {}
                public static func staticFunc() {}
            `;
      const result = analyzer.extractMethods(content, 'test.swift');
      expect(result.map((m) => m.name)).toEqual(['myFunc', 'staticFunc']);
    });

    test('extracts init', () => {
      const content = `class View: UIView {
    init() {}
    convenience init(name: String) { self.init() }
    required init?(coder: NSCoder) { super.init(coder: coder) }
    public init<T>(value: T) {}
}
`;
      const result = analyzer.extractMethods(content, 'test.swift');
      expect(result.map((m) => `${m.name}@${m.line}`)).toEqual([
        'init@2',
        'init@3',
        'init@4',
        'init@5',
      ]);
    });

    test('does not report init calls or names ending in init as initializers', () => {
      const content = `func reinit() {}
let view = View.init(frame: .zero)
super.init(coder: coder)
`;
      const result = analyzer.extractMethods(content, 'test.swift');
      expect(result.map((m) => m.name)).toEqual(['reinit']);
    });

    test('ignores keywords', () => {
      const content = `func if() {}`;
      const result = analyzer.extractMethods(content, 'test.swift');
      expect(result.map((m) => m.name)).not.toContain('if');
    });
  });

  describe('C++', () => {
    test('extracts functions', () => {
      const content = `
                void myFunction() {}
                int Class::method() {}
                virtual void virtualMethod() override {}
            `;
      const result = analyzer.extractMethods(content, 'test.cpp');
      expect(result.map((m) => m.name)).toEqual(['myFunction', 'method', 'virtualMethod']);
    });

    test('extracts constructors', () => {
      const content = `
                MyClass::MyClass() : x{1} {}
            `;
      const result = analyzer.extractMethods(content, 'test.cpp');
      expect(result.map((m) => m.name)).toEqual(['MyClass']);
    });
  });

  describe('Scala', () => {
    test('extracts methods', () => {
      const content = `
                def myMethod() = {}
                override def otherMethod[T]() {}
            `;
      const result = analyzer.extractMethods(content, 'test.scala');
      expect(result.map((m) => m.name)).toEqual(['myMethod', 'otherMethod']);
    });

    test('extracts val functions', () => {
      const content = `
                val myFunc = (x: Int) => x + 1
            `;
      const result = analyzer.extractMethods(content, 'test.scala');
      expect(result.map((m) => m.name)).toEqual(['myFunc']);
    });

    test('ignores keywords', () => {
      const content = `def if() {}`;
      const result = analyzer.extractMethods(content, 'test.scala');
      expect(result.map((m) => m.name)).not.toContain('if');
    });
  });

  describe('Rust', () => {
    test('extracts functions', () => {
      const content = `
                fn main() {}
                pub async fn process() {}
            `;
      const result = analyzer.extractMethods(content, 'test.rs');
      expect(result.map((m) => m.name)).toEqual(['main', 'process']);
    });

    test('ignores keywords', () => {
      const content = `fn if() {}`;
      const result = analyzer.extractMethods(content, 'test.rs');
      expect(result.map((m) => m.name)).not.toContain('if');
    });
  });

  describe('extractMethodContent', () => {
    test('extracts JS function content', () => {
      const content = `
                function test() {
                    return 1;
                }
            `;
      const result = analyzer.extractMethodContent(content, 'test');
      expect(result).toContain('return 1');
    });

    test('extracts JS object method content', () => {
      const content = `
                test: function() {
                    return 2;
                }
            `;
      const result = analyzer.extractMethodContent(content, 'test');
      expect(result).toContain('return 2');
    });

    test('returns null if not found', () => {
      const result = analyzer.extractMethodContent('function other() {}', 'test');
      expect(result).toBeNull();
    });
  });
});
