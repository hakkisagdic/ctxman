/**
 * Plans conflict-free execution waves and exclusive file locks for parallel coding agents (F8-5).
 *
 * Tasks that touch overlapping files (or directly coupled import dependencies when `edges`
 * are supplied and `isolateCoupledDependencies` is true) are scheduled into sequential waves
 * while disjoint tasks run in parallel within the same wave.
 *
 * @param {object} options
 * @param {Array<{id: string, title?: string, files: string[]}>} [options.tasks=[]]
 * @param {Array<{from: string, to: string}>} [options.edges=[]]
 * @param {boolean} [options.isolateCoupledDependencies=false]
 * @returns {{
 *   waves: Array<{
 *     wave: number,
 *     tasks: Array<{id: string, title: string, exclusiveFiles: string[]}>,
 *     lockedFiles: string[]
 *   }>,
 *   conflicts: Array<{taskA: string, taskB: string, overlappingFiles: string[]}>,
 *   sharedReadOnlyFiles: string[],
 *   summary: {
 *     totalTasks: number,
 *     totalWaves: number,
 *     maxParallelism: number,
 *     conflictCount: number
 *   }
 * }}
 */
export function planParallelAgentWorkspaces(options = {}) {
  const { tasks = [], edges = [], isolateCoupledDependencies = false } = options;

  const normalizedTasks = tasks.map((t, index) => ({
    id: String(t.id || `task-${index + 1}`),
    title: String(t.title || t.id || `Task ${index + 1}`),
    files: [...new Set((t.files || []).map((f) => String(f).replace(/\\/g, '/')))].sort(),
  }));

  // Track which files are imported by multiple tasks (candidates for shared read-only context)
  const importedByCount = new Map();
  for (const edge of edges) {
    const to = String(edge.to || '').replace(/\\/g, '/');
    if (to) importedByCount.set(to, (importedByCount.get(to) || 0) + 1);
  }

  // Pairwise conflict detection
  const conflicts = [];
  const adjacency = new Map();
  for (const t of normalizedTasks) adjacency.set(t.id, new Set());

  for (let i = 0; i < normalizedTasks.length; i++) {
    for (let j = i + 1; j < normalizedTasks.length; j++) {
      const a = normalizedTasks[i];
      const b = normalizedTasks[j];
      const setB = new Set(b.files);
      const overlapping = a.files.filter((f) => setB.has(f));

      if (isolateCoupledDependencies && overlapping.length === 0) {
        const setA = new Set(a.files);
        for (const edge of edges) {
          const from = String(edge.from || '').replace(/\\/g, '/');
          const to = String(edge.to || '').replace(/\\/g, '/');
          if ((setA.has(from) && setB.has(to)) || (setB.has(from) && setA.has(to))) {
            overlapping.push(`${from}->${to}`);
          }
        }
      }

      if (overlapping.length > 0) {
        conflicts.push({
          taskA: a.id,
          taskB: b.id,
          overlappingFiles: overlapping,
        });
        adjacency.get(a.id).add(b.id);
        adjacency.get(b.id).add(a.id);
      }
    }
  }

  // Greedy graph-coloring / wave scheduling
  const waves = [];
  const scheduled = new Set();

  while (scheduled.size < normalizedTasks.length) {
    const currentWaveTasks = [];
    const lockedInWave = new Set();

    for (const task of normalizedTasks) {
      if (scheduled.has(task.id)) continue;

      const hasConflictWithWave = currentWaveTasks.some((other) =>
        adjacency.get(task.id).has(other.id)
      );
      if (hasConflictWithWave) continue;

      currentWaveTasks.push({
        id: task.id,
        title: task.title,
        exclusiveFiles: task.files,
      });
      for (const f of task.files) lockedInWave.add(f);
      scheduled.add(task.id);
    }

    waves.push({
      wave: waves.length + 1,
      tasks: currentWaveTasks,
      lockedFiles: [...lockedInWave].sort(),
    });
  }

  const allEditedFiles = new Set(normalizedTasks.flatMap((t) => t.files));
  const sharedReadOnlyFiles = [...importedByCount.entries()]
    .filter(([file, count]) => count >= 1 && !allEditedFiles.has(file))
    .map(([file]) => file)
    .sort();

  const maxParallelism = waves.reduce((max, w) => Math.max(max, w.tasks.length), 0);

  return {
    waves,
    conflicts,
    sharedReadOnlyFiles,
    summary: {
      totalTasks: normalizedTasks.length,
      totalWaves: waves.length,
      maxParallelism,
      conflictCount: conflicts.length,
    },
  };
}
