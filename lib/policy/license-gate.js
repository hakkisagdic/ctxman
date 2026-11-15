import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_ALLOWED_LICENSES = [
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Unlicense',
  'CC0-1.0',
  'BlueOak-1.0.0',
];

export const DEFAULT_DENIED_LICENSES = [
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'SSPL-1.0',
  'BUSL-1.1',
  'UNLICENSED',
];

/**
 * Normalize a package.json license field to a string.
 *
 * @param {any} rawLicense
 * @returns {string}
 */
function normalizeLicense(rawLicense) {
  if (!rawLicense) return 'UNKNOWN';
  if (typeof rawLicense === 'string') return rawLicense.trim() || 'UNKNOWN';
  if (typeof rawLicense === 'object' && typeof rawLicense.type === 'string') {
    return rawLicense.type.trim() || 'UNKNOWN';
  }
  return 'UNKNOWN';
}

/**
 * Scan a repository's dependencies and generate an SBOM + license policy compliance report (`F4-5`).
 *
 * @param {string} root - Repository root directory
 * @param {object} [options]
 * @param {string[]} [options.allowedLicenses] - Allowed SPDX license identifiers
 * @param {string[]} [options.deniedLicenses] - Denied copyleft/proprietary SPDX identifiers
 * @param {boolean} [options.includeDev=false] - Include devDependencies
 * @param {Array<{name: string, version?: string, license?: string}>} [options.packages] - Optional explicit package list
 * @returns {object}
 */
export function checkLicenseCompliance(root, options = {}) {
  const absRoot = path.resolve(root || process.cwd());
  const allowedSet = new Set(options.allowedLicenses || DEFAULT_ALLOWED_LICENSES);
  const deniedSet = new Set(options.deniedLicenses || DEFAULT_DENIED_LICENSES);

  const pkgJsonPath = path.join(absRoot, 'package.json');
  let rootPkg = { name: path.basename(absRoot), version: '0.0.0', license: 'UNKNOWN' };
  if (fs.existsSync(pkgJsonPath)) {
    try {
      rootPkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    } catch {
      // ignore invalid root package.json
    }
  }

  const components = [];
  if (Array.isArray(options.packages)) {
    for (const item of options.packages) {
      if (!item || !item.name) continue;
      components.push({
        name: item.name,
        version: item.version || '0.0.0',
        license: normalizeLicense(item.license),
        scope: item.scope || 'runtime',
        purl: `pkg:npm/${encodeURIComponent(item.name)}@${item.version || '0.0.0'}`,
      });
    }
  } else {
    const depMap = { ...(rootPkg.dependencies || {}) };
    const devDepMap = options.includeDev ? { ...(rootPkg.devDependencies || {}) } : {};
    const allNames = new Set([...Object.keys(depMap), ...Object.keys(devDepMap)]);

    for (const depName of [...allNames].sort()) {
      const scope = Object.prototype.hasOwnProperty.call(depMap, depName) ? 'runtime' : 'dev';
      const depPkgPath = path.join(absRoot, 'node_modules', depName, 'package.json');
      let version = String(depMap[depName] || devDepMap[depName] || '0.0.0').replace(
        /^[\^~>=<]+/,
        ''
      );
      let license = 'UNKNOWN';

      if (fs.existsSync(depPkgPath)) {
        try {
          const depPkg = JSON.parse(fs.readFileSync(depPkgPath, 'utf8'));
          if (depPkg.version) version = depPkg.version;
          license = normalizeLicense(depPkg.license || depPkg.licenses);
        } catch {
          // ignore read error
        }
      }

      components.push({
        name: depName,
        version,
        license,
        scope,
        purl: `pkg:npm/${encodeURIComponent(depName)}@${version}`,
      });
    }
  }

  const violations = [];
  const warnings = [];

  for (const comp of components) {
    const lic = comp.license;
    const isDenied = deniedSet.has(lic) || [...deniedSet].some((d) => lic.includes(d));
    const isAllowed =
      allowedSet.has(lic) ||
      [...allowedSet].some((a) => lic === a || lic.includes(`(${a}`) || lic.includes(`${a} OR`));

    if (isDenied) {
      violations.push({
        ruleId: 'ctxman/license/denied-copyleft',
        severity: 'error',
        package: comp.name,
        version: comp.version,
        license: lic,
        message: `Package '${comp.name}@${comp.version}' uses denied license '${lic}'`,
      });
    } else if (lic === 'UNKNOWN' || !isAllowed) {
      warnings.push({
        ruleId: 'ctxman/license/unverified',
        severity: 'warning',
        package: comp.name,
        version: comp.version,
        license: lic,
        message: `Package '${comp.name}@${comp.version}' has unverified license '${lic}' not in allowed list`,
      });
    }
  }

  return {
    compliant: violations.length === 0,
    rootPackage: {
      name: rootPkg.name || path.basename(absRoot),
      version: rootPkg.version || '0.0.0',
      license: normalizeLicense(rootPkg.license),
    },
    sbomFormat: 'CycloneDX-1.5-summary',
    totalComponents: components.length,
    components,
    violations,
    warnings,
  };
}
