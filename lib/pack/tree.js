/**
 * Directory tree for the top of a packed document
 */

/**
 * Render project-relative paths as an indented tree, directories first
 * @param {string[]} paths - Paths with `/` separators
 * @returns {string} One entry per line, two spaces per level, directories end with `/`
 */
export function buildTree(paths) {
  const root = { dirs: new Map(), files: [] };
  for (const filePath of paths) {
    const parts = filePath.split('/');
    let node = root;
    for (const dir of parts.slice(0, -1)) {
      if (!node.dirs.has(dir)) node.dirs.set(dir, { dirs: new Map(), files: [] });
      node = node.dirs.get(dir);
    }
    node.files.push(parts[parts.length - 1]);
  }

  const lines = [];
  const walk = (node, depth) => {
    const indent = '  '.repeat(depth);
    for (const name of [...node.dirs.keys()].sort()) {
      lines.push(`${indent}${name}/`);
      walk(node.dirs.get(name), depth + 1);
    }
    for (const name of [...node.files].sort()) lines.push(`${indent}${name}`);
  };
  walk(root, 0);
  return lines.join('\n');
}

export default buildTree;
