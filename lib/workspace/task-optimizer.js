/**
 * F12-5: Monorepo Task Pipeline & Affected-Package Optimizer
 * Computes minimal affected packages and topological execution waves from changed files.
 */

/**
 * Optimize monorepo/workspace task execution based on changed files and package dependency graph.
 *
 * @param {object} options
 * @param {Array<{name: string, path: string, dependsOn?: string[], avgDurationSec?: number}>} [options.packages]
 * @param {string[]} [options.changedFiles]
 * @returns {object}
 */
export function optimizeWorkspaceTaskGraph(options = {}) {
  const packages = Array.isArray(options.packages) ? options.packages : [];
  const changedFiles = Array.isArray(options.changedFiles) ? options.changedFiles : [];

  const pkgByName = new Map(packages.map((p) => [p.name, p]));
  const reverseDeps = new Map();
  for (const pkg of packages) {
    reverseDeps.set(pkg.name, new Set());
  }
  for (const pkg of packages) {
    for (const dep of pkg.dependsOn || []) {
      if (!reverseDeps.has(dep)) reverseDeps.set(dep, new Set());
      reverseDeps.get(dep).add(pkg.name);
    }
  }

  const directlyAffected = new Set();
  for (const file of changedFiles) {
    const norm = String(file).replace(/\\/g, '/');
    for (const pkg of packages) {
      const prefix = String(pkg.path || '')
        .replace(/\\/g, '/')
        .replace(/\/+$/, '');
      if (prefix && (norm === prefix || norm.startsWith(`${prefix}/`))) {
        directlyAffected.add(pkg.name);
      }
    }
  }

  const allAffected = new Set(directlyAffected);
  const queue = [...directlyAffected];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const dependent of reverseDeps.get(current) || []) {
      if (!allAffected.has(dependent)) {
        allAffected.add(dependent);
        queue.push(dependent);
      }
    }
  }

  const skippedPackages = packages.map((p) => p.name).filter((n) => !allAffected.has(n));

  // Topological waves for affected packages
  const remaining = new Set(allAffected);
  const waves = [];
  while (remaining.size > 0) {
    const currentWave = [];
    for (const name of remaining) {
      const pkg = pkgByName.get(name);
      const deps = (pkg?.dependsOn || []).filter((d) => remaining.has(d));
      if (deps.length === 0) {
        currentWave.push(name);
      }
    }
    if (currentWave.length === 0) {
      currentWave.push(...remaining);
      remaining.clear();
    } else {
      for (const n of currentWave) remaining.delete(n);
    }
    waves.push({
      wave: waves.length + 1,
      packages: currentWave.sort(),
    });
  }

  const totalDurationSec = packages.reduce((acc, p) => acc + Number(p.avgDurationSec ?? 30), 0);
  const affectedDurationSec = [...allAffected].reduce(
    (acc, name) => acc + Number(pkgByName.get(name)?.avgDurationSec ?? 30),
    0
  );
  const savedSeconds = Math.max(0, totalDurationSec - affectedDurationSec);

  return {
    directlyAffected: [...directlyAffected].sort(),
    affectedPackages: [...allAffected].sort(),
    skippedPackages: skippedPackages.sort(),
    waves,
    summary: {
      totalPackages: packages.length,
      affectedCount: allAffected.size,
      skippedCount: skippedPackages.length,
      savedSeconds,
      savingsPct: totalDurationSec > 0 ? Math.round((savedSeconds / totalDurationSec) * 100) : 0,
    },
  };
}
