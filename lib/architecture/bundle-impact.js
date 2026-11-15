const KNOWN_PACKAGE_WEIGHTS_KB = {
  moment: { rawKb: 290, gzipKb: 72, alternative: 'dayjs (2 KB) or Intl.DateTimeFormat' },
  lodash: {
    rawKb: 530,
    gzipKb: 71,
    alternative: 'native Array/Object methods or lodash-es named imports',
  },
  axios: { rawKb: 95, gzipKb: 32, alternative: 'native globalThis.fetch' },
  jquery: { rawKb: 280, gzipKb: 87, alternative: 'native DOM querySelector / fetch' },
  'aws-sdk': { rawKb: 3200, gzipKb: 650, alternative: '@aws-sdk/client-* modular v3 packages' },
  rxjs: {
    rawKb: 410,
    gzipKb: 95,
    alternative: 'AsyncIterator / EventTarget or targeted operators',
  },
  three: { rawKb: 1450, gzipKb: 380, alternative: 'dynamic import() for 3D views' },
  'chart.js': {
    rawKb: 210,
    gzipKb: 65,
    alternative: 'lightweight SVG sparklines or lazy-loaded chart chunk',
  },
};

/**
 * Estimates bundle size impact and tree-shaking friendliness of imports across files (F9-3).
 *
 * @param {object} options
 * @param {Array<{path: string, content: string}>} [options.files=[]]
 * @param {number} [options.gzipBudgetKb=150]
 * @returns {{
 *   withinBudget: boolean,
 *   totalEstimatedGzipKb: number,
 *   gzipBudgetKb: number,
 *   heavyImports: Array<{
 *     file: string,
 *     line: number,
 *     package: string,
 *     importStyle: 'namespace-or-default' | 'named' | 'commonjs-require',
 *     treeShakeable: boolean,
 *     estimatedGzipKb: number,
 *     recommendation: string
 *   }>,
 *   summary: {
 *     scannedFiles: number,
 *     heavyImportCount: number,
 *     nonTreeShakeableCount: number
 *   }
 * }}
 */
export function estimateBundleImpact(options = {}) {
  const { files = [], gzipBudgetKb = 150 } = options;
  const heavyImports = [];

  for (const fileObj of files) {
    const file = String(fileObj.path || '').replace(/\\/g, '/');
    const content = String(fileObj.content || '');
    if (!file || !content) continue;

    const lines = content.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx].trim();
      if (!lineText || lineText.startsWith('//')) continue;
      const lineNumber = idx + 1;

      // Match ESM import: import foo from 'pkg' | import * as foo from 'pkg' | import { a } from 'pkg'
      const esmMatch = lineText.match(/^import\s+(.+?)\s+from\s+['"`]([^'"`./][^'"`]*)['"`]/);
      if (esmMatch) {
        const clause = esmMatch[1].trim();
        const rawSpec = esmMatch[2].trim();
        const pkgName = rawSpec.startsWith('@')
          ? rawSpec.split('/').slice(0, 2).join('/')
          : rawSpec.split('/')[0];

        const isNamed = clause.startsWith('{') && !clause.includes('* as');
        const isNamespaceOrDefault = !isNamed;
        const known = KNOWN_PACKAGE_WEIGHTS_KB[pkgName];

        if (known || clause.includes('* as')) {
          const baseGzip = known ? known.gzipKb : 25;
          const estimatedGzipKb = isNamed ? Math.max(5, Math.round(baseGzip * 0.35)) : baseGzip;
          const treeShakeable = isNamed && pkgName !== 'moment' && pkgName !== 'lodash';

          heavyImports.push({
            file,
            line: lineNumber,
            package: pkgName,
            importStyle: isNamespaceOrDefault ? 'namespace-or-default' : 'named',
            treeShakeable,
            estimatedGzipKb,
            recommendation: known
              ? `Consider ${known.alternative}`
              : 'Replace wildcard `import * as` with explicit named imports to enable tree-shaking.',
          });
        }
        continue;
      }

      // Match CommonJS require('pkg')
      const cjsMatch = lineText.match(/\brequire\s*\(\s*['"`]([^'"`./][^'"`]*)['"`]\s*\)/);
      if (cjsMatch) {
        const rawSpec = cjsMatch[1].trim();
        const pkgName = rawSpec.startsWith('@')
          ? rawSpec.split('/').slice(0, 2).join('/')
          : rawSpec.split('/')[0];
        const known = KNOWN_PACKAGE_WEIGHTS_KB[pkgName];
        if (known) {
          heavyImports.push({
            file,
            line: lineNumber,
            package: pkgName,
            importStyle: 'commonjs-require',
            treeShakeable: false,
            estimatedGzipKb: known.gzipKb,
            recommendation: `Migrate CommonJS require('${pkgName}') to ESM named import or ${known.alternative}.`,
          });
        }
      }
    }
  }

  // Sum unique package costs (plus partial cost for duplicate non-tree-shakeable requires)
  const byPackage = new Map();
  for (const item of heavyImports) {
    const prev = byPackage.get(item.package) || 0;
    if (item.estimatedGzipKb > prev) {
      byPackage.set(item.package, item.estimatedGzipKb);
    }
  }
  const totalEstimatedGzipKb = [...byPackage.values()].reduce((a, b) => a + b, 0);
  const nonTreeShakeableCount = heavyImports.filter((h) => !h.treeShakeable).length;

  return {
    withinBudget: totalEstimatedGzipKb <= gzipBudgetKb,
    totalEstimatedGzipKb,
    gzipBudgetKb,
    heavyImports,
    summary: {
      scannedFiles: files.length,
      heavyImportCount: heavyImports.length,
      nonTreeShakeableCount,
    },
  };
}
