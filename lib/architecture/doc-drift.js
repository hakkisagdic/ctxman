import fs from 'node:fs';
import path from 'node:path';
import { selectFiles } from '../pack/select.js';
import { buildRepoGraph } from '../map/index.js';

function normalizeRel(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');
}

/**
 * Institutional Documentation & ADR Drift Checker (`F3-5`).
 *
 * Scans markdown/ADR documentation (`docs/**`, `README.md`, `CLAUDE.md`, `AGENTS.md`)
 * for references to modified source files or their exported AST symbols. If a code file
 * is in `changedFiles` while the referencing documentation file is not, flags a doc drift warning.
 *
 * @param {string} root - Repository root directory
 * @param {string[]} changedFiles - Project-relative paths modified in the working tree or PR
 */
export function checkDocDrift(root, changedFiles = []) {
  const absRoot = path.resolve(root || process.cwd());
  const normalizedChanged = new Set((changedFiles || []).map(normalizeRel).filter(Boolean));
  const changedCodeFiles = [...normalizedChanged].filter((f) => !/\.md$/i.test(f));

  if (changedCodeFiles.length === 0) {
    return {
      passed: true,
      scannedDocs: 0,
      staleDocs: [],
    };
  }

  const graph = buildRepoGraph(absRoot, { history: 0, redact: true });
  const symbolsByChangedFile = new Map();
  for (const node of graph.nodes || []) {
    if (normalizedChanged.has(node.path)) {
      symbolsByChangedFile.set(
        node.path,
        (node.methods || []).map((m) => m.name).filter((n) => n && n.length >= 4)
      );
    }
  }

  const selection = selectFiles(absRoot, {});
  const docFiles = (selection.files || []).filter((f) => /\.md$/i.test(f.path));
  const staleDocs = [];

  for (const doc of docFiles) {
    if (normalizedChanged.has(doc.path)) continue;
    let content = '';
    try {
      content = fs.readFileSync(doc.absolutePath, 'utf8');
    } catch {
      continue;
    }

    const referencedCode = [];
    const referencedSymbols = [];

    for (const codePath of changedCodeFiles) {
      const baseName = path.posix.basename(codePath);
      if (content.includes(codePath) || (baseName.length > 5 && content.includes(baseName))) {
        referencedCode.push(codePath);
      }
      for (const sym of symbolsByChangedFile.get(codePath) || []) {
        if (content.includes(sym)) {
          referencedSymbols.push(`${codePath}:${sym}`);
        }
      }
    }

    if (referencedCode.length > 0 || referencedSymbols.length > 0) {
      staleDocs.push({
        docFile: doc.path,
        referencedCode: [...new Set(referencedCode)],
        referencedSymbols: [...new Set(referencedSymbols)].slice(0, 10),
        reason: `Documentation references modified code (${[...new Set([...referencedCode, ...referencedSymbols])].slice(0, 3).join(', ')}) but was not updated`,
      });
    }
  }

  return {
    passed: staleDocs.length === 0,
    scannedDocs: docFiles.length,
    staleDocs,
  };
}
