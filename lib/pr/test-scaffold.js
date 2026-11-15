import fs from 'node:fs';
import path from 'node:path';
import { buildRepoGraph } from '../map/index.js';

/**
 * Extract parameter names from a function signature string.
 *
 * @param {string} signature
 * @returns {string[]}
 */
function parseSignatureParams(signature) {
  const m = String(signature || '').match(/\(([^)]*)\)/);
  if (!m || !m[1]) return [];
  return m[1]
    .split(',')
    .map((p) =>
      p
        .trim()
        .replace(/=.*$/, '')
        .replace(/^\.\.\./, '')
        .trim()
    )
    .filter(Boolean);
}

/**
 * Generate a ready-to-run Vitest/Jest unit test scaffold for exported functions and
 * methods of a target module (`F6-2`: AST Test Scaffold Generator).
 *
 * @param {string} root - Repository root directory
 * @param {string} targetFile - Relative path to the source file
 * @param {object} [options]
 * @param {'vitest' | 'jest'} [options.framework='vitest']
 * @param {object} [options.graph] - Optional prebuilt `buildRepoGraph` result
 * @returns {object}
 */
export function generateTestScaffold(root, targetFile, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const relFile = String(targetFile || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
  const framework = options.framework === 'jest' ? 'jest' : 'vitest';
  const graph = options.graph || buildRepoGraph(absRoot, { history: 0, redact: true });

  const node = (graph.nodes || []).find((n) => n.path === relFile);
  const fullPath = path.join(absRoot, relFile);
  const src = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';

  const methods = [];
  if (node && Array.isArray(node.methods) && node.methods.length > 0) {
    for (const m of node.methods) {
      if (!m || !m.name) continue;
      const sig = m.signature || `${m.name}()`;
      const isAsync = /\basync\b/.test(sig);
      const params = parseSignatureParams(sig);
      methods.push({ name: m.name, line: m.line || 1, signature: sig, isAsync, params });
    }
  } else if (src) {
    const fnRe = /export\s+(async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)/g;
    let m;
    while ((m = fnRe.exec(src)) !== null) {
      const isAsync = Boolean(m[1]);
      const name = m[2];
      const params = parseSignatureParams(`(${m[3] || ''})`);
      methods.push({
        name,
        line: 1,
        signature: `export ${isAsync ? 'async ' : ''}function ${name}(${m[3] || ''})`,
        isAsync,
        params,
      });
    }
  }

  const baseName = path.basename(relFile, path.extname(relFile));
  const suggestedTestPath = `test/${baseName}.test.js`;
  const relativeImport = `../${relFile}`;
  const importedNames = methods.map((m) => m.name);

  const headerLines = [];
  if (framework === 'vitest') {
    headerLines.push(`import { describe, it, expect } from 'vitest';`);
  }
  if (importedNames.length > 0) {
    headerLines.push(`import { ${importedNames.join(', ')} } from '${relativeImport}';`);
  } else {
    headerLines.push(`import * as targetModule from '${relativeImport}';`);
  }

  const testBlocks = methods.map((m) => {
    const sampleArgs = m.params.map(() => 'undefined').join(', ');
    const callExpr = `${m.isAsync ? 'await ' : ''}${m.name}(${sampleArgs})`;
    return [
      `  describe('${m.name}', () => {`,
      `    it('executes ${m.name} with valid inputs', ${m.isAsync ? 'async ' : ''}() => {`,
      `      const result = ${callExpr};`,
      `      expect(result).toBeDefined();`,
      `    });`,
      `  });`,
    ].join('\n');
  });

  const scaffoldCode = [
    ...headerLines,
    '',
    `describe('${relFile}', () => {`,
    ...(testBlocks.length > 0
      ? testBlocks
      : [`  it('loads module', () => {\n    expect(targetModule).toBeDefined();\n  });`]),
    `});`,
    '',
  ].join('\n');

  return {
    targetFile: relFile,
    suggestedTestPath,
    framework,
    methodCount: methods.length,
    methods,
    scaffoldCode,
  };
}
