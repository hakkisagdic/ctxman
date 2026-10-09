/**
 * Method-Level Code Analyzer
 * Extracts methods from JavaScript/TypeScript/Rust/C#/Go/Java/Python/PHP/Ruby/Kotlin/Swift/C/C++/Scala files
 */

import path from 'path';
import GoMethodAnalyzer from './go-method-analyzer.js';

class MethodAnalyzer {
  constructor() {
    this.goAnalyzer = new GoMethodAnalyzer();
  }

  extractMethods(content, filePath) {
    const ext = path.extname(filePath).toLowerCase();

    // Determine which analyzer to use based on file type
    if (ext === '.rs') {
      return this.extractRustMethods(content, filePath);
    } else if (ext === '.go') {
      return this.goAnalyzer.extractMethods(content, filePath);
    } else if (ext === '.java') {
      return this.extractJavaMethods(content, filePath);
    } else if (ext === '.cs') {
      return this.extractCSharpMethods(content, filePath);
    } else if (ext === '.py') {
      return this.extractPythonMethods(content, filePath);
    } else if (ext === '.php') {
      return this.extractPHPMethods(content, filePath);
    } else if (ext === '.rb') {
      return this.extractRubyMethods(content, filePath);
    } else if (ext === '.kt' || ext === '.kts') {
      return this.extractKotlinMethods(content, filePath);
    } else if (ext === '.swift') {
      return this.extractSwiftMethods(content, filePath);
    } else if (ext === '.c' || ext === '.cpp' || ext === '.cc' || ext === '.h' || ext === '.hpp') {
      return this.extractCPlusPlusMethods(content, filePath);
    } else if (ext === '.scala') {
      return this.extractScalaMethods(content, filePath);
    } else {
      return this.extractJavaScriptMethods(content, filePath);
    }
  }

  extractJavaScriptMethods(content, filePath) {
    // Support \w, $, _ for method names
    const namePattern = '[\\w$_]+';
    // Optional TypeScript annotation (`const f: Fn = ...`, `(...): Ret =>`), kept to one line.
    // Parens are excluded so a ternary's `: call(...)` is not mistaken for a return type.
    const typeAnnotation = '(?:\\s*:[^=;()\\n]+)?';

    const patterns = [
      // Order matters: More specific patterns first to avoid overlaps
      {
        regex: new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+(${namePattern})\\s*\\(`, 'g'),
        type: 'function',
      },
      {
        regex: new RegExp(`(${namePattern})\\s*:\\s*(?:async\\s+)?function\\s*\\(`, 'g'),
        type: 'method',
      },
      {
        regex: new RegExp(
          `(?:const|let|var)\\s+(${namePattern})${typeAnnotation}\\s*=\\s*(?:async\\s+)?\\([^)]*\\)${typeAnnotation}\\s*=>`,
          'g'
        ),
        type: 'arrow',
      },
      { regex: new RegExp(`(get|set)\\s+(${namePattern})\\s*\\(`, 'g'), type: 'accessor' },
      // Shorthand pattern (class methods) - must be last to avoid conflicts. The optional
      // TypeScript return type starts right at `)`, so a ternary's `f(x) : {}` stays out, and
      // holds no `$` or quotes, so template text like `error (${a}): ${b}` stays out too.
      {
        regex: new RegExp(
          `(?:async\\s+)?(${namePattern})\\s*\\([^)]*\\)(?::[^=;()$'"\`\\n]+)?\\s*\\{`,
          'g'
        ),
        type: 'shorthand',
      },
    ];

    return this.processPatterns(content, filePath, patterns);
  }

  extractJavaMethods(content, filePath) {
    const namePattern = '[\\w]+';

    const patterns = [
      // Public/private/protected methods with return type
      {
        regex: new RegExp(
          `(?:public|private|protected|static|final|synchronized|native|abstract|\\s)+(?:<[^>]+>\\s+)?(?:[\\w<>\\[\\],\\s]+)\\s+(${namePattern})\\s*\\(`,
          'g'
        ),
        type: 'method',
      },
      // Constructor (same name as class)
      {
        regex: new RegExp(
          `(?:public|private|protected)?\\s+(${namePattern})\\s*\\([^)]*\\)\\s*(?:throws\\s+[\\w,\\s]+)?\\s*\\{`,
          'g'
        ),
        type: 'constructor',
      },
    ];

    return this.processPatterns(content, filePath, patterns, true);
  }

  extractCSharpMethods(content, filePath) {
    const namePattern = '[\\w]+';

    const patterns = [
      // C# method patterns with modifiers and return types
      // Matches: public/private/protected/internal static/async returnType MethodName(params) {
      {
        regex: new RegExp(
          `(?:public|private|protected|internal)?\\s*` +
            `(?:static|virtual|override|abstract|async)?\\s*` +
            `(?:partial)?\\s*` +
            `(?:void|bool|int|string|double|float|long|decimal|object|var|Task|${namePattern}(?:<[^>]+>)?(?:\\[\\])?)?\\s+` +
            `(${namePattern})\\s*` +
            `(?:<[^>]+>)?\\s*` + // Generic type parameters
            `\\([^)]*\\)\\s*` +
            `(?:where\\s+[^{]+)?\\s*` + // Generic constraints
            `\\{`,
          'g'
        ),
        type: 'method',
      },
      // Property getters/setters
      {
        regex: new RegExp(
          `(?:public|private|protected|internal)?\\s*` +
            `(?:static|virtual|override|abstract)?\\s*` +
            `(?:${namePattern}(?:<[^>]+>)?(?:\\[\\])?)?\\s+` +
            `(${namePattern})\\s*` +
            `\\{\\s*(?:get|set)`,
          'g'
        ),
        type: 'property',
      },
      // Expression-bodied members (C# 6.0+)
      // Matches: public Type MethodName() => expression;
      {
        regex: new RegExp(
          `(?:public|private|protected|internal)?\\s*` +
            `(?:static|virtual|override|abstract)?\\s*` +
            `(?:${namePattern}(?:<[^>]+>)?(?:\\[\\])?)?\\s+` +
            `(${namePattern})\\s*` +
            `(?:<[^>]+>)?\\s*` +
            `\\([^)]*\\)\\s*=>`,
          'g'
        ),
        type: 'expression-bodied',
      },
    ];

    return this.processPatterns(content, filePath, patterns, false, true);
  }

  processPatterns(
    content,
    filePath,
    patterns,
    isJava = false,
    isCSharp = false,
    isPython = false,
    isRuby = false,
    isKotlin = false,
    isSwift = false,
    isScala = false
  ) {
    const methodsMap = new Map();
    const processedLines = new Map(); // Track processed lines to avoid duplicates

    patterns.forEach(({ regex, type }) => {
      let match;
      while ((match = regex.exec(content)) !== null) {
        let methodName;
        let accessorType = '';

        if (type === 'accessor') {
          accessorType = match[1];
          methodName = match[2];
        } else {
          methodName = match[1];
        }

        const line = this.getLineNumber(content, match.index + match[0].indexOf(methodName));

        // Use appropriate keyword check based on language
        let keywordCheck = false;
        if (isCSharp) {
          keywordCheck = !this.isCSharpKeyword(methodName);
        } else if (isPython) {
          keywordCheck = !this.isPythonKeyword(methodName);
        } else if (isRuby) {
          keywordCheck = !this.isRubyKeyword(methodName);
        } else if (isKotlin) {
          keywordCheck = !this.isKotlinKeyword(methodName);
        } else if (isSwift) {
          keywordCheck = !this.isSwiftKeyword(methodName);
        } else if (isScala) {
          keywordCheck = !this.isScalaKeyword(methodName);
        } else {
          keywordCheck = !this.isKeyword(methodName, isJava);
        }

        if (methodName && keywordCheck) {
          const key =
            type === 'accessor' ? `${accessorType}_${methodName}:${line}` : `${methodName}:${line}`;

          // Skip if this line was already processed for this method name
          const lineKey = `${methodName}:${line}`;
          if (processedLines.has(lineKey)) {
            continue;
          }

          if (!methodsMap.has(key)) {
            methodsMap.set(key, {
              name: type === 'accessor' ? `${accessorType} ${methodName}` : methodName,
              line: line,
              file: path.relative(process.cwd(), filePath),
            });
            processedLines.set(lineKey, true);
          }
        }
      }
    });

    return Array.from(methodsMap.values());
  }

  extractPythonMethods(content, filePath) {
    const namePattern = '[a-zA-Z_][a-zA-Z0-9_]*';

    const patterns = [
      // def function_name or async def function_name
      {
        regex: new RegExp(`^\\s*(?:async\\s+)?def\\s+(${namePattern})\\s*\\(`, 'gm'),
        type: 'function',
      },
      // @staticmethod, @classmethod decorators
      {
        regex: new RegExp(`@(?:staticmethod|classmethod)\\s+def\\s+(${namePattern})\\s*\\(`, 'gm'),
        type: 'method',
      },
    ];

    return this.processPatterns(content, filePath, patterns, false, false, true);
  }

  extractPHPMethods(content, filePath) {
    const namePattern = '[a-zA-Z_][a-zA-Z0-9_]*';

    const patterns = [
      // function function_name
      { regex: new RegExp(`function\\s+(${namePattern})\\s*\\(`, 'g'), type: 'function' },
      // public/private/protected function method_name
      {
        regex: new RegExp(
          `(?:public|private|protected)?\\s*(?:static)?\\s*function\\s+(${namePattern})\\s*\\(`,
          'g'
        ),
        type: 'method',
      },
    ];

    return this.processPatterns(content, filePath, patterns);
  }

  extractRubyMethods(content, filePath) {
    const namePattern = '[a-zA-Z_][a-zA-Z0-9_]*[?!]?';

    const patterns = [
      // def method_name or def self.method_name
      {
        regex: new RegExp(`^\\s*def\\s+(?:self\\.)?(${namePattern})\\s*(?:\\(|$)`, 'gm'),
        type: 'method',
      },
    ];

    return this.processPatterns(content, filePath, patterns, false, false, false, true);
  }

  extractKotlinMethods(content, filePath) {
    const namePattern = '[a-zA-Z_][a-zA-Z0-9_]*';

    const patterns = [
      // fun functionName or fun ClassName.functionName
      {
        regex: new RegExp(
          `(?:public|private|protected|internal)?\\s*(?:suspend\\s+)?(?:inline\\s+)?fun\\s+(?:<[^>]+>\\s+)?(?:[\\w.]+\\.)?\\s*(${namePattern})\\s*(?:<[^>]+>)?\\s*\\(`,
          'g'
        ),
        type: 'function',
      },
    ];

    return this.processPatterns(content, filePath, patterns, false, false, false, false, true);
  }

  extractSwiftMethods(content, filePath) {
    const namePattern = '[a-zA-Z_][a-zA-Z0-9_]*';

    const patterns = [
      // func functionName
      {
        regex: new RegExp(
          `(?:public|private|internal|fileprivate)?\\s*(?:static|class)?\\s*func\\s+(${namePattern})\\s*(?:<[^>]+>)?\\s*\\(`,
          'g'
        ),
        type: 'function',
      },
      // init (constructors), including failable `init?(`; the lookbehind skips
      // `super.init(` / `self.init(` calls and names that merely end in "init"
      {
        regex: new RegExp(
          `(?:public|private|internal|fileprivate)?\\s*(?:convenience\\s+)?(?<![\\w.])(init)[?!]?\\s*(?:<[^>]+>)?\\s*\\(`,
          'g'
        ),
        type: 'init',
      },
    ];

    return this.processPatterns(
      content,
      filePath,
      patterns,
      false,
      false,
      false,
      false,
      false,
      true
    );
  }

  extractCPlusPlusMethods(content, filePath) {
    const namePattern = '[a-zA-Z_][a-zA-Z0-9_]*';

    const patterns = [
      // Return type function_name( or ClassName::function_name(
      {
        regex: new RegExp(
          `(?:virtual\\s+)?(?:static\\s+)?(?:inline\\s+)?(?:[\\w:]+\\s+)?(?:[\\w:]+::)?(${namePattern})\\s*\\([^)]*\\)\\s*(?:const)?\\s*(?:override)?\\s*(?:final)?\\s*\\{`,
          'g'
        ),
        type: 'function',
      },
      // Constructor: ClassName::ClassName(
      { regex: new RegExp(`(${namePattern})\\s*\\([^)]*\\)\\s*:\\s*`, 'g'), type: 'constructor' },
    ];

    return this.processPatterns(content, filePath, patterns);
  }

  extractScalaMethods(content, filePath) {
    const namePattern = '[a-zA-Z_][a-zA-Z0-9_]*';

    const patterns = [
      // def methodName
      {
        regex: new RegExp(`(?:override\\s+)?def\\s+(${namePattern})\\s*(?:\\[|\\(|:)`, 'g'),
        type: 'method',
      },
      // val/var with function assignment
      {
        regex: new RegExp(`(?:val|var)\\s+(${namePattern})\\s*=\\s*\\([^)]*\\)\\s*=>`, 'g'),
        type: 'function',
      },
    ];

    return this.processPatterns(
      content,
      filePath,
      patterns,
      false,
      false,
      false,
      false,
      false,
      false,
      true
    );
  }

  extractRustMethods(content, filePath) {
    // Rust method name pattern (snake_case and alphanumeric)
    const namePattern = '[a-zA-Z_][a-zA-Z0-9_]*';

    const patterns = [
      // pub fn function_name or fn function_name
      {
        regex: new RegExp(
          `(?:pub\\s+)?(?:async\\s+)?(?:const\\s+)?(?:unsafe\\s+)?fn\\s+(${namePattern})\\s*[<(]`,
          'g'
        ),
        type: 'function',
      },
      // impl methods: fn method_name (inside impl blocks)
      {
        regex: new RegExp(
          `^\\s*(?:pub\\s+)?(?:async\\s+)?(?:const\\s+)?(?:unsafe\\s+)?fn\\s+(${namePattern})\\s*[<(]`,
          'gm'
        ),
        type: 'method',
      },
    ];

    const methodsMap = new Map();
    const processedLines = new Map();

    patterns.forEach(({ regex, type: _type }) => {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const methodName = match[1];
        const line = this.getLineNumber(content, match.index + match[0].indexOf(methodName));

        if (methodName && !this.isRustKeyword(methodName)) {
          const key = `${methodName}:${line}`;
          const lineKey = `${methodName}:${line}`;

          if (processedLines.has(lineKey)) {
            continue;
          }

          if (!methodsMap.has(key)) {
            methodsMap.set(key, {
              name: methodName,
              line: line,
              file: path.relative(process.cwd(), filePath),
            });
            processedLines.set(lineKey, true);
          }
        }
      }
    });

    return Array.from(methodsMap.values());
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  isKeyword(name, isJava = false) {
    const jsKeywords = new Set([
      'if',
      'else',
      'for',
      'while',
      'do',
      'switch',
      'case',
      'default',
      'try',
      'catch',
      'finally',
      'throw',
      'return',
      'break',
      'continue',
      'class',
      'extends',
      'super',
      'this',
      'new',
      'typeof',
      'instanceof',
      'var',
      'let',
      'const',
      'function',
      'async',
      'await',
      'export',
      'import',
    ]);

    const javaKeywords = new Set([
      'if',
      'else',
      'for',
      'while',
      'do',
      'switch',
      'case',
      'default',
      'try',
      'catch',
      'finally',
      'throw',
      'return',
      'break',
      'continue',
      'class',
      'extends',
      'super',
      'this',
      'new',
      'instanceof',
      'abstract',
      'assert',
      'boolean',
      'byte',
      'char',
      'double',
      'enum',
      'final',
      'float',
      'implements',
      'import',
      'int',
      'interface',
      'long',
      'native',
      'package',
      'private',
      'protected',
      'public',
      'short',
      'static',
      'strictfp',
      'synchronized',
      'throws',
      'transient',
      'void',
      'volatile',
      // Common type names to skip
      'String',
      'Integer',
      'Boolean',
      'Double',
      'Float',
      'Long',
      'Short',
      'Byte',
      'Character',
      'List',
      'Map',
      'Set',
      'ArrayList',
      'HashMap',
      'HashSet',
      'Object',
      'Exception',
    ]);

    return isJava ? javaKeywords.has(name) : jsKeywords.has(name);
  }

  isCSharpKeyword(name) {
    const keywords = new Set([
      'if',
      'else',
      'for',
      'foreach',
      'while',
      'do',
      'switch',
      'case',
      'default',
      'try',
      'catch',
      'finally',
      'throw',
      'return',
      'break',
      'continue',
      'class',
      'interface',
      'struct',
      'enum',
      'this',
      'base',
      'new',
      'typeof',
      'var',
      'using',
      'namespace',
      'async',
      'await',
      'lock',
      'yield',
      'public',
      'private',
      'protected',
      'internal',
      'static',
      'virtual',
      'override',
      'abstract',
      'sealed',
      'partial',
      'readonly',
      'const',
    ]);
    return keywords.has(name);
  }

  isRustKeyword(name) {
    const keywords = new Set([
      'as',
      'break',
      'const',
      'continue',
      'crate',
      'else',
      'enum',
      'extern',
      'false',
      'fn',
      'for',
      'if',
      'impl',
      'in',
      'let',
      'loop',
      'match',
      'mod',
      'move',
      'mut',
      'pub',
      'ref',
      'return',
      'self',
      'Self',
      'static',
      'struct',
      'super',
      'trait',
      'true',
      'type',
      'unsafe',
      'use',
      'where',
      'while',
      'async',
      'await',
      'dyn',
      'abstract',
      'become',
      'box',
      'do',
      'final',
      'macro',
      'override',
      'priv',
      'typeof',
      'unsized',
      'virtual',
      'yield',
    ]);
    return keywords.has(name);
  }

  isPythonKeyword(name) {
    const keywords = new Set([
      'False',
      'None',
      'True',
      'and',
      'as',
      'assert',
      'async',
      'await',
      'break',
      'class',
      'continue',
      'def',
      'del',
      'elif',
      'else',
      'except',
      'finally',
      'for',
      'from',
      'global',
      'if',
      'import',
      'in',
      'is',
      'lambda',
      'nonlocal',
      'not',
      'or',
      'pass',
      'raise',
      'return',
      'try',
      'while',
      'with',
      'yield',
      '__init__',
      '__main__',
    ]);
    return keywords.has(name);
  }

  isRubyKeyword(name) {
    const keywords = new Set([
      'alias',
      'and',
      'begin',
      'break',
      'case',
      'class',
      'def',
      'defined?',
      'do',
      'else',
      'elsif',
      'end',
      'ensure',
      'false',
      'for',
      'if',
      'in',
      'module',
      'next',
      'nil',
      'not',
      'or',
      'redo',
      'rescue',
      'retry',
      'return',
      'self',
      'super',
      'then',
      'true',
      'undef',
      'unless',
      'until',
      'when',
      'while',
      'yield',
      'initialize',
    ]);
    return keywords.has(name);
  }

  isKotlinKeyword(name) {
    const keywords = new Set([
      'as',
      'break',
      'class',
      'continue',
      'do',
      'else',
      'false',
      'for',
      'fun',
      'if',
      'in',
      'interface',
      'is',
      'null',
      'object',
      'package',
      'return',
      'super',
      'this',
      'throw',
      'true',
      'try',
      'typealias',
      'typeof',
      'val',
      'var',
      'when',
      'while',
      'by',
      'catch',
      'constructor',
      'delegate',
      'dynamic',
      'field',
      'file',
      'finally',
      'get',
      'import',
      'init',
      'param',
      'property',
      'receiver',
      'set',
      'setparam',
      'where',
      'actual',
      'abstract',
      'annotation',
      'companion',
      'const',
      'crossinline',
      'data',
      'enum',
      'expect',
      'external',
      'final',
      'infix',
      'inline',
      'inner',
      'internal',
      'lateinit',
      'noinline',
      'open',
      'operator',
      'out',
      'override',
      'private',
      'protected',
      'public',
      'reified',
      'sealed',
      'suspend',
      'tailrec',
      'vararg',
    ]);
    return keywords.has(name);
  }

  isSwiftKeyword(name) {
    const keywords = new Set([
      'associatedtype',
      'class',
      'deinit',
      'enum',
      'extension',
      'fileprivate',
      'func',
      'import',
      // 'init' is deliberately absent: initializers are reported as methods
      'inout',
      'internal',
      'let',
      'open',
      'operator',
      'private',
      'precedencegroup',
      'protocol',
      'public',
      'rethrows',
      'static',
      'struct',
      'subscript',
      'typealias',
      'var',
      'break',
      'case',
      'catch',
      'continue',
      'default',
      'defer',
      'do',
      'else',
      'fallthrough',
      'for',
      'guard',
      'if',
      'in',
      'repeat',
      'return',
      'throw',
      'switch',
      'where',
      'while',
      'as',
      'false',
      'is',
      'nil',
      'self',
      'Self',
      'super',
      'throws',
      'true',
      'try',
      'await',
      'async',
    ]);
    return keywords.has(name);
  }

  isScalaKeyword(name) {
    const keywords = new Set([
      'abstract',
      'case',
      'catch',
      'class',
      'def',
      'do',
      'else',
      'extends',
      'false',
      'final',
      'finally',
      'for',
      'forSome',
      'if',
      'implicit',
      'import',
      'lazy',
      'macro',
      'match',
      'new',
      'null',
      'object',
      'override',
      'package',
      'private',
      'protected',
      'return',
      'sealed',
      'super',
      'this',
      'throw',
      'trait',
      'try',
      'true',
      'type',
      'val',
      'var',
      'while',
      'with',
      'yield',
      'apply',
      'unapply',
    ]);
    return keywords.has(name);
  }

  /**
   * Source text of each method, for per-method token counts: from its declaration line to
   * the brace that closes its body (indentation for Python, a matching `end` for Ruby).
   * A body must open before the next method's declaration, so an expression-bodied method
   * (`const f = (x) => x * 2`, `fun f() = 1`) keeps just its declaration.
   * @param {string} content - File content
   * @param {Array<{line: number}>} methods - Methods from extractMethods()
   * @param {string} filePath - Used to pick the block rules of the language
   * @returns {string[]} One entry per method, in the order given
   */
  extractMethodSources(content, methods, filePath) {
    const lines = content.split('\n');
    const ext = path.extname(filePath).toLowerCase();
    const starts = [...new Set(methods.map((method) => method.line))].sort((a, b) => a - b);

    return methods.map((method) => {
      const start = method.line - 1;
      const next = starts.find((line) => line > method.line);
      const limit = next ? next - 1 : lines.length;
      let end;
      if (ext === '.py') {
        end = this.findIndentedBlockEnd(lines, start);
      } else if (ext === '.rb') {
        end = this.findRubyBlockEnd(lines, start);
      } else {
        end = this.findBraceBlockEnd(lines, start, limit);
      }
      return lines.slice(start, end + 1).join('\n');
    });
  }

  /**
   * Index of the line holding the `}` that closes the first `{` opened at or after
   * `start` (and before `limit`). Strings and comments are skipped so braces inside them
   * do not count. Without a body, the declaration ends at the first `;` or line end.
   */
  findBraceBlockEnd(lines, start, limit) {
    let depth = 0;
    let opened = false;
    let quote = null;
    let blockComment = false;

    for (let i = start; i < lines.length; i++) {
      if (!opened && i >= limit) break;
      const line = lines[i];

      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (blockComment) {
          if (ch === '*' && line[j + 1] === '/') {
            blockComment = false;
            j++;
          }
        } else if (quote) {
          if (ch === '\\') j++;
          else if (ch === quote) quote = null;
        } else if (ch === '/' && line[j + 1] === '/') {
          break;
        } else if (ch === '/' && line[j + 1] === '*') {
          blockComment = true;
          j++;
        } else if (ch === '"' || ch === "'" || ch === '`') {
          quote = ch;
        } else if (ch === '{') {
          depth++;
          opened = true;
        } else if (ch === '}') {
          depth--;
          if (opened && depth === 0) return i;
        } else if (ch === ';' && !opened) {
          return i;
        }
      }

      // Only template literals span lines; other quotes end with the line
      if (quote && quote !== '`') quote = null;
      // An arrow with an expression body ends on its line
      if (!opened && /=>\s*[^\s{]/.test(line)) return i;
    }

    return opened ? lines.length - 1 : start;
  }

  /**
   * Last line of a Python block: the lines after `start` that are blank or indented
   * deeper than the `def` line, without trailing blank lines.
   */
  findIndentedBlockEnd(lines, start) {
    const indent = (line) => line.length - line.trimStart().length;
    const base = indent(lines[start]);
    let end = start;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      if (indent(lines[i]) <= base) break;
      end = i;
    }
    return end;
  }

  /**
   * Line of the `end` that closes a Ruby `def` (the first `end` at the same indentation),
   * or the `def` line itself for an endless method (`def name = value`).
   */
  findRubyBlockEnd(lines, start) {
    const base = lines[start].length - lines[start].trimStart().length;
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;
      const indent = line.length - line.trimStart().length;
      if (indent < base) break;
      if (indent === base && /^end\b/.test(line.trim())) return i;
      if (indent === base && /^(def|class|module|private|public|protected)\b/.test(line.trim())) {
        break;
      }
    }
    return start;
  }

  extractMethodContent(content, methodName) {
    const patterns = [
      new RegExp(
        `(function\\s+${methodName}\\s*\\([^)]*\\)\\s*\\{[^}]*(?:\\{[^}]*\\}[^}]*)*\\})`,
        'g'
      ),
      new RegExp(
        `(${methodName}\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{[^}]*(?:\\{[^}]*\\}[^}]*)*\\})`,
        'g'
      ),
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) return match[1];
    }
    return null;
  }
}

export default MethodAnalyzer;
