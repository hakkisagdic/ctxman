import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';
import { extractCodeUnits } from '../search/code-units.js';
import { buildRepoGraph } from '../map/graph.js';
import { normalizeSymbolName } from '../map/call-graph.js';
import { explainHistory } from '../why/index.js';
import { redactSecrets } from '../utils/secret-redactor.js';
import TokenUtils from '../utils/token-utils.js';
import { parseBudget } from '../task/index.js';

export const DEFAULT_DIAGNOSE_BUDGET = 24000;

const toPosix = (p) => p.split(path.sep).join('/');

/**
 * Computes intra-file helper closure starting from `symbolNames` inside `node`.
 */
function intraFileSymbolSet(node, symbolNames) {
  const closure = new Set();
  for (const sym of symbolNames || []) {
    if (!sym) continue;
    closure.add(sym);
    const short = normalizeSymbolName(sym);
    if (short) closure.add(short);
    const afterDot = String(sym).split(/[.:]+/).pop();
    if (afterDot) closure.add(normalizeSymbolName(afterDot));
  }
  if (!node || !Array.isArray(node.methods) || closure.size === 0) return closure;

  const byName = new Map();
  for (const m of node.methods) {
    const mShort = normalizeSymbolName(m.name);
    if (!byName.has(mShort)) byName.set(mShort, []);
    byName.get(mShort).push(m);
  }

  const queue = Array.from(closure);
  while (queue.length > 0) {
    const current = queue.shift();
    for (const m of byName.get(current) || []) {
      for (const called of m.calls || []) {
        const cShort = normalizeSymbolName(called);
        if (byName.has(cShort) && !closure.has(cShort)) {
          closure.add(cShort);
          queue.push(cShort);
        }
      }
    }
  }
  return closure;
}

/**
 * Parses stack trace lines across JavaScript, TypeScript, Python, Go, Rust, Java, C#, Vitest.
 * @param {string} text
 * @returns {Array<{raw: string, file: string, line: number, col: number|null, func: string|null}>}
 */
export function parseStackFrames(text) {
  if (typeof text !== 'string') return [];
  const lines = text.split('\n');
  const frames = [];

  for (const line of lines) {
    let match;

    // 1. Python: File "...", line 42, in func
    if ((match = /File\s+["']([^"']+)["'],\s+line\s+(\d+)(?:,\s+in\s+([^\n\r]+))?/.exec(line))) {
      frames.push({
        raw: line.trim(),
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        col: null,
        func: match[3]?.trim() || null,
      });
      continue;
    }

    // 2. JS / TS: at fn (/path/to/file.js:42:15) or at (/path/to/file.js:42:15) or at /path/to/file.js:42:15
    if (
      (match =
        /at\s+(?:async\s+)?(?:([^\s(]+)\s+)?\(?(?:file:\/\/)?([^:()\s]+):(\d+)(?::(\d+))?\)?/.exec(
          line
        ))
    ) {
      const cleanFile = match[2].replace(/^[\s(]+/, '').replace(/[\s)]+$/, '');
      frames.push({
        raw: line.trim(),
        file: cleanFile,
        line: parseInt(match[3], 10),
        col: match[4] ? parseInt(match[4], 10) : null,
        func: match[1] || null,
      });
      continue;
    }

    // 3. Rust / compiler: --> src/main.rs:42:13 or at src/main.rs:42
    if ((match = /(?:-->|at)\s+([^\s:]+\.[a-zA-Z0-9]+):(\d+)(?::(\d+))?/.exec(line))) {
      frames.push({
        raw: line.trim(),
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        col: match[3] ? parseInt(match[3], 10) : null,
        func: null,
      });
      continue;
    }

    // 4. C# / Java stack lines: in /path/to/file.cs:line 42
    if ((match = /in\s+([^:]+\.[a-zA-Z0-9]+):line\s+(\d+)/.exec(line))) {
      frames.push({
        raw: line.trim(),
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        col: null,
        func: null,
      });
      continue;
    }

    // 5. Vitest / generic runner: ❯ path/to/file.ext:42:15 or path/to/file.ext:42:15
    if ((match = /(?:❯\s+)?([^\s:]+\.[a-zA-Z0-9]+):(\d+)(?::(\d+))?/.exec(line))) {
      frames.push({
        raw: line.trim(),
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        col: match[3] ? parseInt(match[3], 10) : null,
        func: null,
      });
      continue;
    }
  }

  return frames;
}

/**
 * Resolves an implicated file safely inside the project root.
 * Returns posix relative path if inside root and exists; null otherwise.
 */
function resolveInRepo(projectRoot, filePath) {
  const cleaned = String(filePath ?? '')
    .trim()
    .replace(/^[\s(]+/, '')
    .replace(/[\s)]+$/, '')
    .replace(/^file:\/\//, '');

  if (path.isAbsolute(cleaned)) {
    let rel = path.relative(projectRoot, cleaned);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      const full = path.join(projectRoot, rel);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return toPosix(rel);
      }
    }
    try {
      const realP = fs.realpathSync(projectRoot);
      const realC = fs.realpathSync(cleaned);
      rel = path.relative(realP, realC);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        return toPosix(rel);
      }
    } catch {
      // ignore
    }
  } else {
    const full = path.resolve(projectRoot, cleaned);
    const rel = path.relative(projectRoot, full);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return toPosix(rel);
      }
    }
  }
  return null;
}

/**
 * Diagnoses a stack trace or failure log:
 * - Parses frames across multi-language stack traces
 * - Resolves implicated files safely inside project root
 * - Enforces policy deny rules and secret redaction
 * - Extracts code window + enclosing method/class for each frame via extractCodeUnits
 * - Collects 1-hop graph neighbors (prioritizing cross-file AST symbol call graph edges)
 * - Integrates recent git history (explainHistory) for root cause context
 * - Strictly bounded within budget (default 24000)
 */
export async function diagnoseFailure(root, traceOrLog, options = {}) {
  const input = typeof traceOrLog === 'string' ? traceOrLog.trim() : '';
  if (!input) {
    throw new Error('A failure log or stack trace is required');
  }

  const projectRoot = path.resolve(root);
  const budget = parseBudget(options.budget, DEFAULT_DIAGNOSE_BUDGET);
  const format = options.format ? String(options.format).toLowerCase() : 'markdown';
  const redact = options.redact !== false;
  const useCallGraph = options.callGraph !== false;
  const windowLines = Number.isInteger(options.windowLines) ? options.windowLines : 12;

  const scanner = new Scanner(projectRoot);
  scanner.getPolicy();
  let totalRedactions = 0;

  let processedInput = input;
  if (redact) {
    const red = redactSecrets(processedInput);
    processedInput = red.text;
    totalRedactions += red.findings.length;
  }

  // 1. Parse stack frames
  const allParsedFrames = parseStackFrames(processedInput);
  const resolvedFrames = [];
  const implicatedFilesSet = new Set();
  const implicatedSymbolsByFile = new Map();
  const deniedFiles = [];

  const recordImplicatedSymbol = (file, sym) => {
    if (!file || !sym) return;
    if (!implicatedSymbolsByFile.has(file)) implicatedSymbolsByFile.set(file, new Set());
    implicatedSymbolsByFile.get(file).add(sym);
  };

  for (const f of allParsedFrames) {
    const inRepo = resolveInRepo(projectRoot, f.file);
    if (!inRepo) continue;

    if (scanner.isDenied(inRepo)) {
      deniedFiles.push(inRepo);
      continue;
    }

    implicatedFilesSet.add(inRepo);
    if (f.func) recordImplicatedSymbol(inRepo, f.func);
    resolvedFrames.push({
      ...f,
      inRepoFile: inRepo,
    });
  }

  const implicatedFiles = Array.from(implicatedFilesSet);

  // 2. Extract code windows and exact enclosing methods/classes for implicated files
  const snippetBudget = Math.max(200, Math.floor(budget * 0.55));
  let usedSnippetTokens = 0;
  const fileSnippets = [];

  for (const file of implicatedFiles) {
    const fullPath = path.join(projectRoot, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;
      const units = extractCodeUnits(content, file);

      const fileFrames = resolvedFrames.filter((rf) => rf.inRepoFile === file);
      const seenLines = new Set();

      for (const ff of fileFrames) {
        const lineNum = ff.line;
        if (seenLines.has(lineNum)) continue;
        seenLines.add(lineNum);

        // Pick innermost enclosing code unit (prefer non-container method/function over class)
        const matchingUnits = units.filter((u) => u.startLine <= lineNum && u.endLine >= lineNum);
        matchingUnits.sort((a, b) => a.endLine - a.startLine - (b.endLine - b.startLine));
        const enclosing = matchingUnits[0] ?? null;
        const enclosingMethod = enclosing ? enclosing.name : ff.func || null;
        if (enclosingMethod) {
          recordImplicatedSymbol(file, enclosingMethod);
        }

        const start = Math.max(1, lineNum - windowLines);
        const end = Math.min(totalLines, lineNum + windowLines);

        const snippetLines = [];
        for (let l = start; l <= end; l++) {
          const prefix = l === lineNum ? '> ' : '  ';
          const lineStr = String(l).padStart(4, ' ');
          snippetLines.push(`${prefix}${lineStr} | ${lines[l - 1] ?? ''}`);
        }

        let snippetText = snippetLines.join('\n');
        if (redact) {
          const r = redactSecrets(snippetText);
          snippetText = r.text;
          totalRedactions += r.findings.length;
        }

        const tokens = TokenUtils.calculate(snippetText, file);
        if (fileSnippets.length > 0 && usedSnippetTokens + tokens > snippetBudget) {
          break;
        }
        usedSnippetTokens += tokens;
        fileSnippets.push({
          file,
          line: lineNum,
          enclosingMethod,
          startLine: start,
          endLine: end,
          snippet: snippetText,
          tokens,
        });
      }
    } catch {
      // Skip unreadable files
    }
  }

  // 3. Extract 1-hop graph neighbors (prioritizing cross-file AST symbol call graph edges)
  const graph = buildRepoGraph(projectRoot, { redact });
  const nodeByPath = new Map(graph.nodes.map((n) => [n.path, n]));
  const callEdges = useCallGraph && Array.isArray(graph.callEdges) ? graph.callEdges : [];
  const neighborSet = new Set();

  if (useCallGraph && callEdges.length > 0) {
    const expandedSymbolsByFile = new Map();
    for (const file of implicatedFiles) {
      const node = nodeByPath.get(file);
      const rawSyms = implicatedSymbolsByFile.get(file) || new Set();
      expandedSymbolsByFile.set(file, intraFileSymbolSet(node, rawSyms));
    }

    // 3a. Symbol-level call graph neighbors for implicated methods/functions (outgoing callees first, then incoming callers)
    for (const ce of callEdges) {
      if (implicatedFilesSet.has(ce.from) && !implicatedFilesSet.has(ce.to)) {
        const syms = expandedSymbolsByFile.get(ce.from);
        if (
          syms &&
          (syms.has(ce.caller) || syms.has(normalizeSymbolName(ce.caller))) &&
          !scanner.isDenied(ce.to)
        ) {
          neighborSet.add(ce.to);
        }
      }
    }
    for (const ce of callEdges) {
      if (implicatedFilesSet.has(ce.to) && !implicatedFilesSet.has(ce.from)) {
        const syms = expandedSymbolsByFile.get(ce.to);
        if (
          syms &&
          (syms.has(ce.callee) || syms.has(normalizeSymbolName(ce.callee))) &&
          !scanner.isDenied(ce.from)
        ) {
          neighborSet.add(ce.from);
        }
      }
    }

    // 3b. File-level call graph neighbors for implicated files
    for (const ce of callEdges) {
      if (implicatedFilesSet.has(ce.from) && !implicatedFilesSet.has(ce.to)) {
        if (!scanner.isDenied(ce.to)) neighborSet.add(ce.to);
      }
      if (implicatedFilesSet.has(ce.to) && !implicatedFilesSet.has(ce.from)) {
        if (!scanner.isDenied(ce.from)) neighborSet.add(ce.from);
      }
    }
  }

  // 3c. Module import graph neighbors
  for (const edge of graph.edges) {
    if (implicatedFilesSet.has(edge.from) && !implicatedFilesSet.has(edge.to)) {
      if (!scanner.isDenied(edge.to)) neighborSet.add(edge.to);
    }
    if (implicatedFilesSet.has(edge.to) && !implicatedFilesSet.has(edge.from)) {
      if (!scanner.isDenied(edge.from)) neighborSet.add(edge.from);
    }
  }
  const neighbors = Array.from(neighborSet).slice(0, 10);
  const selectedNeighborSet = new Set(neighbors);
  const relevantCallEdges = useCallGraph
    ? callEdges.filter(
        (ce) =>
          !scanner.isDenied(ce.from) &&
          !scanner.isDenied(ce.to) &&
          ((implicatedFilesSet.has(ce.from) &&
            (implicatedFilesSet.has(ce.to) || selectedNeighborSet.has(ce.to))) ||
            (implicatedFilesSet.has(ce.to) && selectedNeighborSet.has(ce.from)))
      )
    : [];

  // 4. Git history for implicated files bounded to remaining budget
  const historyFiles = implicatedFiles.slice(0, 3);
  const envelopeReserve = format === 'json' ? Math.min(450, Math.floor(budget * 0.22)) : 220;
  const remainingForHistory = Math.max(0, budget - usedSnippetTokens - envelopeReserve);
  const perFileHistoryBudget =
    historyFiles.length > 0 ? Math.floor(remainingForHistory / historyFiles.length) : 0;

  const historySummaries = [];
  if (perFileHistoryBudget >= 180) {
    for (const file of historyFiles) {
      try {
        const histResult = await explainHistory(projectRoot, file, {
          limit: 3,
          budget: Math.min(3000, perFileHistoryBudget),
          redact,
        });
        historySummaries.push({
          file,
          text: histResult.text,
          tokens: histResult.tokens,
        });
      } catch {
        // Git history might not be available
      }
    }
  }

  // 5. Render output and trim trailing history entries if JSON serialization pushed past budget
  const targetExt = format === 'json' ? 'json' : 'md';
  const renderOutput = (histList) => {
    if (format === 'json') {
      const doc = {
        budget,
        errorLog: processedInput,
        implicatedFiles,
        frames: resolvedFrames,
        snippets: fileSnippets,
        neighbors,
        callEdges: relevantCallEdges,
        history: histList,
        redactions: { total: totalRedactions },
        deniedFiles,
      };
      return JSON.stringify(doc, null, 2);
    }

    const sections = [];
    sections.push('# Failure Diagnosis Report\n');

    sections.push('## Implicated Frames');
    if (resolvedFrames.length > 0) {
      for (const rf of resolvedFrames) {
        sections.push(`- \`${rf.inRepoFile}:${rf.line}\`${rf.func ? ` in \`${rf.func}\`` : ''}`);
      }
    } else {
      sections.push('*(No in-repo files matched directly in the stack trace)*');
    }

    if (fileSnippets.length > 0) {
      sections.push('\n## Enclosing Method & Code Context');
      for (const snip of fileSnippets) {
        const methodInfo = snip.enclosingMethod ? ` · method \`${snip.enclosingMethod}\`` : '';
        sections.push(
          `\n### \`${snip.file}:${snip.line}\`${methodInfo} (lines ${snip.startLine}-${snip.endLine})`
        );
        const ext = path.extname(snip.file).slice(1) || '';
        sections.push(`\`\`\`${ext}\n${snip.snippet}\n\`\`\``);
      }
    }

    if (histList.length > 0) {
      sections.push('\n## Recent Git History (Root-Cause Context)');
      for (const h of histList) {
        sections.push(`\n### History for \`${h.file}\`\n\n${h.text.trim()}`);
      }
    }

    if (neighbors.length > 0) {
      sections.push('\n## Related 1-Hop Neighborhood');
      for (const n of neighbors) {
        const nCalls = relevantCallEdges.filter((ce) => ce.from === n || ce.to === n);
        if (nCalls.length > 0) {
          const summary = nCalls
            .slice(0, 3)
            .map((ce) => `${ce.from}:${ce.caller} -> ${ce.to}:${ce.callee}`)
            .join(', ');
          sections.push(`- \`${n}\` (${summary})`);
        } else {
          sections.push(`- \`${n}\``);
        }
      }
    }

    return sections.join('\n');
  };

  let renderedText = renderOutput(historySummaries);
  let finalTokens = TokenUtils.calculate(renderedText, `diagnose.${targetExt}`);
  while (finalTokens > budget && historySummaries.length > 0) {
    historySummaries.pop();
    renderedText = renderOutput(historySummaries);
    finalTokens = TokenUtils.calculate(renderedText, `diagnose.${targetExt}`);
  }

  if (options.output) {
    const outPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, renderedText, 'utf-8');
  }

  return {
    frames: resolvedFrames,
    implicatedFiles,
    totalTokens: finalTokens,
    budget,
    text: renderedText,
    history: historySummaries,
    neighbors,
    callEdges: relevantCallEdges,
    redactions: { total: totalRedactions },
  };
}

export default diagnoseFailure;
