import fs from 'node:fs';
import path from 'node:path';
import { buildRepoGraph, normalizeSymbolName } from '../map/index.js';

/**
 * Scan REST endpoints and exported symbols in a provider repository and verify that
 * consumer repositories do not import removed symbols or call non-existent REST routes
 * (`F4-3`: Cross-Repo API & Symbol Contract Checker).
 *
 * @param {string} providerRoot - Provider repository root path
 * @param {string | string[]} consumerRoots - Consumer repository root path(s)
 * @param {object} [options]
 * @param {string[]} [options.providerExports] - Optional explicit list of exported symbols
 * @param {string[]} [options.providerRoutes] - Optional explicit list of REST routes (e.g. `GET /api/v1/map`)
 * @returns {object}
 */
export function checkCrossRepoContracts(providerRoot, consumerRoots, options = {}) {
  const absProvider = path.resolve(providerRoot || process.cwd());
  const consumers = (Array.isArray(consumerRoots) ? consumerRoots : [consumerRoots])
    .filter(Boolean)
    .map((r) => path.resolve(r));

  const providerGraph =
    options.providerGraph || buildRepoGraph(absProvider, { history: 0, redact: true });

  const providerSymbols = new Set(options.providerExports || []);
  const providerRoutes = new Set(options.providerRoutes || []);

  for (const node of providerGraph.nodes || []) {
    if (!node || !node.path) continue;
    for (const m of node.methods || []) {
      const name = typeof m === 'string' ? m : m?.name;
      if (name) {
        providerSymbols.add(name);
        providerSymbols.add(normalizeSymbolName(name));
      }
    }
    try {
      const fullPath = path.join(absProvider, node.path);
      if (fs.existsSync(fullPath)) {
        const src = fs.readFileSync(fullPath, 'utf8');
        // Extract exported identifiers
        const expRe =
          /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)|export\s*\{([^}]+)\}/g;
        let m;
        while ((m = expRe.exec(src)) !== null) {
          if (m[1]) providerSymbols.add(m[1]);
          if (m[2]) {
            for (const part of m[2].split(',')) {
              const pieces = part.trim().split(/\s+as\s+/i);
              const exported = (pieces[1] || pieces[0] || '').trim();
              if (exported) providerSymbols.add(exported);
            }
          }
        }
        // Extract REST route patterns such as `/api/v1/...`
        const routeRe = /['"](\/api\/v\d+\/[A-Za-z0-9/_-]+)['"]/g;
        while ((m = routeRe.exec(src)) !== null) {
          providerRoutes.add(m[1]);
        }
      }
    } catch {
      // ignore unreadable files
    }
  }

  let pkgName = path.basename(absProvider);
  try {
    const pkgPath = path.join(absProvider, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) pkgName = pkg.name;
    }
  } catch {
    // ignore
  }

  const brokenContracts = [];
  const checkedConsumers = [];

  for (const consumerRoot of consumers) {
    const consumerGraph = buildRepoGraph(consumerRoot, { history: 0, redact: true });
    let consumerCheckedImports = 0;
    let consumerCheckedRoutes = 0;

    for (const node of consumerGraph.nodes || []) {
      if (!node || !node.path) continue;
      const fullPath = path.join(consumerRoot, node.path);
      if (!fs.existsSync(fullPath)) continue;

      let src = '';
      try {
        src = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }

      // 1. Check named imports from provider package name
      const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
      let im;
      while ((im = importRe.exec(src)) !== null) {
        const namedClause = im[1];
        const specifier = im[2];
        if (specifier !== pkgName && !specifier.startsWith(`${pkgName}/`)) continue;

        for (const piece of namedClause.split(',')) {
          const rawSym = piece
            .trim()
            .split(/\s+as\s+/i)[0]
            ?.trim();
          if (!rawSym) continue;
          consumerCheckedImports += 1;
          if (!providerSymbols.has(rawSym)) {
            brokenContracts.push({
              kind: 'missing_export',
              consumerRepo: path.basename(consumerRoot),
              consumerFile: node.path,
              symbol: rawSym,
              providerPackage: pkgName,
              message: `Consumer '${node.path}' imports '${rawSym}' from '${pkgName}', but provider does not export '${rawSym}'`,
            });
          }
        }
      }

      // 2. Check REST `/api/v1/*` endpoint calls in consumer code
      const routeCallRe = /['"](\/api\/v\d+\/[A-Za-z0-9/_-]+)(?:\?[^'"]*)?['"]/g;
      while ((im = routeCallRe.exec(src)) !== null) {
        const routePath = im[1];
        consumerCheckedRoutes += 1;
        if (providerRoutes.size > 0 && !providerRoutes.has(routePath)) {
          brokenContracts.push({
            kind: 'missing_endpoint',
            consumerRepo: path.basename(consumerRoot),
            consumerFile: node.path,
            endpoint: routePath,
            providerPackage: pkgName,
            message: `Consumer '${node.path}' calls endpoint '${routePath}', which is not registered in provider '${pkgName}'`,
          });
        }
      }
    }

    checkedConsumers.push({
      consumerRoot,
      checkedImports: consumerCheckedImports,
      checkedRoutes: consumerCheckedRoutes,
    });
  }

  return {
    compatible: brokenContracts.length === 0,
    provider: {
      root: absProvider,
      packageName: pkgName,
      exportedSymbolCount: providerSymbols.size,
      routeCount: providerRoutes.size,
    },
    consumers: checkedConsumers,
    brokenContractCount: brokenContracts.length,
    brokenContracts,
  };
}
