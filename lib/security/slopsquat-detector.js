import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

const BUILTIN_SET = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => (m.startsWith('node:') ? m.slice(5) : `node:${m}`)),
]);

function normalizePackageName(specifier) {
  if (!specifier || typeof specifier !== 'string') return null;
  const trimmed = specifier.trim();
  if (
    !trimmed ||
    trimmed.startsWith('.') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:')
  ) {
    return null;
  }
  if (BUILTIN_SET.has(trimmed)) return null;

  if (trimmed.startsWith('@')) {
    const parts = trimmed.split('/');
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }
  const base = trimmed.split('/')[0];
  if (BUILTIN_SET.has(base)) return null;
  return base;
}

function extractImportedSpecifiers(code) {
  const results = [];
  const patterns = [
    /\bimport\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(code)) !== null) {
      results.push(match[1]);
    }
  }
  return results;
}

function loadDeclaredDependencies(projectRoot, packageJson) {
  const pkg =
    packageJson ||
    (() => {
      const pkgPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      }
      return {};
    })();

  const declared = new Set();
  for (const section of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    if (pkg[section] && typeof pkg[section] === 'object') {
      for (const name of Object.keys(pkg[section])) {
        declared.add(name);
      }
    }
  }
  if (typeof pkg.name === 'string') {
    declared.add(pkg.name);
  }
  return declared;
}

/**
 * Faz 17 (F17-2): Agent Hallucinated Package & Phantom Import (Slopsquatting) Shield.
 * Detects external packages imported in code that are not declared in package.json.
 */
export function detectHallucinatedPackages(options = {}) {
  const { projectRoot = process.cwd(), files = [], packageJson, allowedPackages = [] } = options;
  const declared = loadDeclaredDependencies(projectRoot, packageJson);
  for (const pkg of allowedPackages) declared.add(pkg);

  const findings = [];
  const undeclaredPackages = new Set();

  for (const file of files) {
    const filePath = file.path || 'unknown.js';
    const content = String(file.content || '');
    const specifiers = extractImportedSpecifiers(content);

    for (const rawSpecifier of specifiers) {
      const pkgName = normalizePackageName(rawSpecifier);
      if (!pkgName) continue;
      if (!declared.has(pkgName)) {
        undeclaredPackages.add(pkgName);
        const looksAiGenerated = /(?:ai|gpt|llm|agent|helper|auto|smart|utils-pro)/i.test(pkgName);
        findings.push({
          path: filePath,
          specifier: rawSpecifier,
          packageName: pkgName,
          severity: looksAiGenerated ? 'critical' : 'high',
          reason: looksAiGenerated
            ? `Undeclared package "${pkgName}" matches common LLM slopsquatting naming patterns`
            : `Package "${pkgName}" is imported in "${filePath}" but missing from package.json`,
          remediation: `Verify "${pkgName}" exists on the official registry and comes from a trusted publisher before installing, or replace with an existing declared dependency.`,
        });
      }
    }
  }

  const status = findings.length === 0 ? 'clean' : 'hallucination-risk';

  return {
    status,
    scannedFilesCount: files.length,
    undeclaredPackagesCount: undeclaredPackages.size,
    undeclaredPackages: Array.from(undeclaredPackages),
    findings,
    summary:
      status === 'clean'
        ? `All external imports across ${files.length} file(s) match declared dependencies.`
        : `Detected ${undeclaredPackages.size} undeclared/potentially hallucinated package(s) across ${findings.length} import site(s).`,
  };
}
