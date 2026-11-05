import path from 'path';

/**
 * Language keywords and control-flow tokens that can precede `(` without being
 * function or method call expressions.
 */
const CALL_STOPWORDS = new Set([
  // JS / TS / C-family control & operators
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
  'new',
  'delete',
  'typeof',
  'instanceof',
  'void',
  'in',
  'of',
  'await',
  'async',
  'yield',
  'function',
  'class',
  'extends',
  'super',
  'this',
  'self',
  'import',
  'export',
  'from',
  'require',
  'define',
  // Python / Ruby / Rust / Go / Kotlin / Swift / Java / C#
  'def',
  'fn',
  'func',
  'fun',
  'pub',
  'mod',
  'use',
  'impl',
  'where',
  'match',
  'when',
  'guard',
  'defer',
  'go',
  'select',
  'chan',
  'map',
  'struct',
  'interface',
  'enum',
  'trait',
  'type',
  'var',
  'let',
  'const',
  'val',
  'mut',
  'ref',
  'move',
  'unsafe',
  'extern',
  'crate',
  'synchronized',
  'lock',
  'using',
  'fixed',
  'checked',
  'unchecked',
  'sizeof',
  'nameof',
  'typeof',
  'alignof',
  'decltype',
  'static_assert',
  'elif',
  'except',
  'with',
  'as',
  'pass',
  'raise',
  'del',
  'lambda',
  'unless',
  'until',
  'rescue',
  'ensure',
  'defined',
  // Common built-in constructors / globals that should not match unrelated repo methods
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'BigInt',
  'Promise',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Date',
  'RegExp',
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'URL',
  'Buffer',
  'Math',
  'JSON',
  'console',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
]);

/**
 * Maximum number of repository-wide files defining a symbol before an un-imported
 * call is considered too ambiguous to link globally.
 */
const MAX_GLOBAL_DEFINERS = 5;

/**
 * Strip comments and string literal contents while preserving line breaks and
 * template literal `${...}` expressions so call sites inside `${foo()}` are kept
 * and string/comment text does not produce false call matches.
 *
 * @param {string} source
 * @param {string} [ext]
 * @returns {string}
 */
export function stripCommentsAndStrings(source, ext = '') {
  const hashComment =
    ext === '.py' || ext === '.rb' || ext === '.php' || ext === '.sh' || ext === '.pl';
  let out = '';
  let i = 0;
  const len = source.length;
  let state = 'code'; // 'code' | 'line_comment' | 'block_comment' | 'single' | 'double' | 'template'
  const templateBraceDepth = [];

  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line_comment';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block_comment';
        out += '  ';
        i += 2;
        continue;
      }
      if (hashComment && ch === '#') {
        state = 'line_comment';
        out += ' ';
        i += 1;
        continue;
      }
      if (ch === "'") {
        state = 'single';
        out += ' ';
        i += 1;
        continue;
      }
      if (ch === '"') {
        state = 'double';
        out += ' ';
        i += 1;
        continue;
      }
      if (ch === '`') {
        state = 'template';
        out += ' ';
        i += 1;
        continue;
      }
      if (ch === '{' && templateBraceDepth.length > 0) {
        templateBraceDepth[templateBraceDepth.length - 1] += 1;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '}' && templateBraceDepth.length > 0) {
        templateBraceDepth[templateBraceDepth.length - 1] -= 1;
        if (templateBraceDepth[templateBraceDepth.length - 1] === 0) {
          templateBraceDepth.pop();
          state = 'template';
          out += ' ';
          i += 1;
          continue;
        }
      }
      out += ch;
      i += 1;
      continue;
    }

    if (state === 'line_comment') {
      if (ch === '\n') {
        state = 'code';
        out += '\n';
      } else {
        out += ' ';
      }
      i += 1;
      continue;
    }

    if (state === 'block_comment') {
      if (ch === '*' && next === '/') {
        state = 'code';
        out += '  ';
        i += 2;
        continue;
      }
      out += ch === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }

    if (state === 'single') {
      if (ch === '\\') {
        out += next === '\n' ? ' \n' : '  ';
        i += 2;
        continue;
      }
      if (ch === "'" || ch === '\n') {
        state = 'code';
        out += ch === '\n' ? '\n' : ' ';
        i += 1;
        continue;
      }
      out += ' ';
      i += 1;
      continue;
    }

    if (state === 'double') {
      if (ch === '\\') {
        out += next === '\n' ? ' \n' : '  ';
        i += 2;
        continue;
      }
      if (ch === '"' || ch === '\n') {
        state = 'code';
        out += ch === '\n' ? '\n' : ' ';
        i += 1;
        continue;
      }
      out += ' ';
      i += 1;
      continue;
    }

    if (state === 'template') {
      if (ch === '\\') {
        out += next === '\n' ? ' \n' : '  ';
        i += 2;
        continue;
      }
      if (ch === '$' && next === '{') {
        templateBraceDepth.push(1);
        state = 'code';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '`') {
        state = 'code';
        out += ' ';
        i += 1;
        continue;
      }
      out += ch === '\n' ? '\n' : ' ';
      i += 1;
    }
  }

  return out;
}

/**
 * Normalize an extracted method name (e.g. `get user` -> `user`).
 * @param {string} name
 * @returns {string}
 */
export function normalizeSymbolName(name) {
  if (!name) return '';
  return String(name)
    .replace(/^(?:get|set)\s+/, '')
    .trim();
}

/**
 * Mask the method's own declaration header at the start of its source so that
 * `function foo(a = bar())` does not count `foo(` as a call, while keeping default
 * parameter call expressions like `bar()`.
 *
 * @param {string} strippedSource
 * @param {string} declarationName
 * @returns {string}
 */
function maskDeclarationHeader(strippedSource, declarationName) {
  if (!declarationName) return strippedSource;
  const escaped = declarationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declRe = new RegExp(`(?<![\\w$])${escaped}(\\s*(?:<[^>;{}()]*>\\s*)?\\()`);
  return strippedSource.replace(
    declRe,
    (_match, suffix) => ' '.repeat(declarationName.length) + suffix
  );
}

/**
 * Extract unique called symbol names from a code snippet (method body or module top-level).
 *
 * @param {string} source
 * @param {string} [declarationName]
 * @param {string} [ext]
 * @returns {string[]}
 */
export function extractCallsFromSource(source, declarationName = '', ext = '') {
  const stripped = stripCommentsAndStrings(source, ext);
  const body = maskDeclarationHeader(stripped, normalizeSymbolName(declarationName));
  const calls = new Set();

  // Match function or method calls: `foo(`, `obj.foo(`, `pkg::foo(`, `foo<T>(`
  // Skip declarations preceded by `function `, `def `, `fn `, `func `, `fun `
  const callRe =
    /(?<!\b(?:function|def|fn|func|fun)\s+)(?<![\w$])([A-Za-z_$][\w$]*)\s*(?:<[^>;{}()=\n]*>\s*)?\(/g;

  let match;
  while ((match = callRe.exec(body)) !== null) {
    const callee = match[1];
    if (!callee || CALL_STOPWORDS.has(callee)) continue;
    calls.add(callee);
  }

  return [...calls].sort();
}

/**
 * Extract method-level and top-level module call sites for a single file.
 *
 * @param {string} content - Full file source
 * @param {Array<{name: string, line: number, signature?: string}>} methods - Extracted methods
 * @param {string} filePath - Relative file path
 * @param {import('../analyzers/method-analyzer.js').default} analyzer
 * @returns {{
 *   methodCalls: Map<string, string[]>,
 *   callers: Array<{ name: string, line: number, calls: string[] }>
 * }}
 */
export function extractFileCallSites(content, methods, filePath, analyzer) {
  const ext = path.extname(filePath).toLowerCase();
  const sources = analyzer.extractMethodSources(content, methods, filePath);
  const lines = content.split('\n');
  const coveredLines = new Set();
  const methodCalls = new Map();
  const callers = [];

  for (let i = 0; i < methods.length; i++) {
    const method = methods[i];
    const source = sources[i] || '';
    const lineCount = source ? source.split('\n').length : 1;
    for (let l = method.line; l < method.line + lineCount; l++) {
      coveredLines.add(l);
    }

    const calls = extractCallsFromSource(source, method.name, ext);
    methodCalls.set(`${method.name}:${method.line}`, calls);
    if (calls.length > 0) {
      callers.push({
        name: method.name,
        line: method.line,
        calls,
      });
    }
  }

  // Also inspect top-level lines outside any method body so module-entry scripts
  // (e.g. `cli.js` calling `handle()`) produce cross-file call edges.
  const topLevelLines = lines.map((line, idx) => (coveredLines.has(idx + 1) ? '' : line));
  const topLevelSource = topLevelLines.join('\n');
  const topCalls = extractCallsFromSource(topLevelSource, '', ext);
  if (topCalls.length > 0) {
    const strippedTop = stripCommentsAndStrings(topLevelSource, ext);
    const strippedLines = strippedTop.split('\n');
    for (const callee of topCalls) {
      const escaped = callee.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const lineRe = new RegExp(`(?<![\\w$])${escaped}\\s*(?:<[^>;{}()=\\n]*>\\s*)?\\(`);
      let firstLine = 1;
      for (let idx = 0; idx < strippedLines.length; idx++) {
        if (lineRe.test(strippedLines[idx])) {
          firstLine = idx + 1;
          break;
        }
      }
      callers.push({
        name: '<module>',
        line: firstLine,
        calls: [callee],
      });
    }
  }

  return { methodCalls, callers };
}

/**
 * Build cross-file AST symbol call edges from per-file call sites, method tables,
 * and resolved module import edges.
 *
 * Resolution order for a call to `callee` in file `from`:
 * 1. Direct import targets (`from -> to`) defining `callee`.
 * 2. Two-hop barrel/re-export import targets (`from -> index -> to`) defining `callee`.
 * 3. Repository-wide symbol table fallback when `callee` is defined in <= MAX_GLOBAL_DEFINERS
 *    other files (enabling dynamic dispatch, same-package calls, or un-imported helpers).
 *
 * @param {Array<{ path: string, methods: Array<{ name: string, line: number, signature?: string, calls?: string[] }> }>} nodes
 * @param {Array<{ from: string, to: string, weight: number }>} importEdges
 * @param {Map<string, Array<{ name: string, line: number, calls: string[] }>>} callersByFile
 * @returns {Array<{ from: string, caller: string, callerLine: number, to: string, callee: string, calleeLine: number, weight: number }>}
 */
export function buildCallGraph(nodes, importEdges, callersByFile) {
  // 1. Index all method definitions by symbol name
  const symbolDefs = new Map();
  const addDef = (symbol, def) => {
    if (!symbol) return;
    let list = symbolDefs.get(symbol);
    if (!list) {
      list = [];
      symbolDefs.set(symbol, list);
    }
    if (!list.some((d) => d.path === def.path && d.line === def.line && d.name === def.name)) {
      list.push(def);
    }
  };

  for (const node of nodes) {
    for (const method of node.methods || []) {
      const def = { path: node.path, name: method.name, line: method.line };
      addDef(method.name, def);
      const normalized = normalizeSymbolName(method.name);
      if (normalized && normalized !== method.name) {
        addDef(normalized, def);
      }
    }
  }

  // 2. Build 1-hop and 2-hop (barrel re-export) import reachability maps
  const directImports = new Map();
  for (const edge of importEdges || []) {
    if (edge.from === edge.to) continue;
    let targets = directImports.get(edge.from);
    if (!targets) {
      targets = new Map();
      directImports.set(edge.from, targets);
    }
    targets.set(edge.to, (targets.get(edge.to) || 0) + (edge.weight || 1));
  }

  const barrelImports = new Map();
  for (const [from, firstHop] of directImports) {
    const secondHop = new Map();
    for (const [mid, w1] of firstHop) {
      const nextTargets = directImports.get(mid);
      if (!nextTargets) continue;
      for (const [to, w2] of nextTargets) {
        if (to === from || firstHop.has(to)) continue;
        secondHop.set(to, Math.max(secondHop.get(to) || 0, Math.min(w1, w2)));
      }
    }
    if (secondHop.size > 0) {
      barrelImports.set(from, secondHop);
    }
  }

  // 3. Resolve cross-file call edges
  const edgeMap = new Map();

  for (const node of nodes) {
    const from = node.path;
    const callers = callersByFile.get(from) || [];
    const direct = directImports.get(from);
    const barrel = barrelImports.get(from);

    for (const caller of callers) {
      for (const calledName of caller.calls || []) {
        const defs = symbolDefs.get(calledName);
        if (!defs || defs.length === 0) continue;

        const externalDefs = defs.filter((d) => d.path !== from);
        if (externalDefs.length === 0) continue;

        let matched = [];
        if (direct && direct.size > 0) {
          matched = externalDefs.filter((d) => direct.has(d.path));
        }
        if (matched.length === 0 && barrel && barrel.size > 0) {
          matched = externalDefs.filter((d) => barrel.has(d.path));
        }
        if (matched.length === 0 && externalDefs.length <= MAX_GLOBAL_DEFINERS) {
          // If the file already defines this symbol locally and did not import another file
          // defining it, prefer the local definition rather than linking globally.
          const definedLocally = defs.some((d) => d.path === from);
          if (!definedLocally) {
            matched = externalDefs;
          }
        }

        if (matched.length === 0) continue;

        const weight = 1 / matched.length;
        for (const target of matched) {
          const key = `${from}\0${caller.name}\0${caller.line}\0${target.path}\0${target.name}\0${target.line}`;
          const existing = edgeMap.get(key);
          if (existing) {
            existing.weight += weight;
          } else {
            edgeMap.set(key, {
              from,
              caller: caller.name,
              callerLine: caller.line,
              to: target.path,
              callee: target.name,
              calleeLine: target.line,
              weight,
            });
          }
        }
      }
    }
  }

  return [...edgeMap.values()].sort(
    (a, b) =>
      a.from.localeCompare(b.from) ||
      a.caller.localeCompare(b.caller) ||
      a.to.localeCompare(b.to) ||
      a.callee.localeCompare(b.callee) ||
      a.callerLine - b.callerLine ||
      a.calleeLine - b.calleeLine
  );
}
