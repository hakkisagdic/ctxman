/**
 * Parsers for the git output `ctxman pr` reads: `--name-status -z`, `--numstat -z` and
 * unified diffs (split per file, then hunks mapped to new-side line numbers)
 */

/**
 * @typedef {object} NameStatusEntry
 * @property {string} status - A, M, D, R, C, T (U for unmerged)
 * @property {string} path - Path at head (the old path for a deleted file)
 * @property {string|null} oldPath - Path at base (null for an added file)
 * @property {number|null} similarity - Rename/copy similarity in percent
 */

/**
 * Parse `git diff --name-status -z`
 * @param {string} output
 * @returns {NameStatusEntry[]}
 */
export function parseNameStatus(output) {
  const parts = output.split('\0');
  const entries = [];
  let i = 0;
  while (i < parts.length) {
    const code = parts[i++];
    if (!code) continue;
    const status = code[0];
    if (status === 'R' || status === 'C') {
      const oldPath = parts[i++];
      const newPath = parts[i++];
      entries.push({ status, path: newPath, oldPath, similarity: Number(code.slice(1)) || 0 });
    } else {
      const filePath = parts[i++];
      entries.push({
        status,
        path: filePath,
        oldPath: status === 'A' ? null : filePath,
        similarity: null,
      });
    }
  }
  return entries;
}

/**
 * Parse `git diff --numstat -z` into per-path line counts (binary files count 0/0)
 * @param {string} output
 * @returns {Map<string, {additions: number, deletions: number, binary: boolean}>}
 *   Keyed by the head-side path
 */
export function parseNumstat(output) {
  const parts = output.split('\0');
  const stats = new Map();
  let i = 0;
  while (i < parts.length) {
    const record = parts[i++];
    if (!record) continue;
    const firstTab = record.indexOf('\t');
    const secondTab = record.indexOf('\t', firstTab + 1);
    if (firstTab === -1 || secondTab === -1) continue;
    const added = record.slice(0, firstTab);
    const deleted = record.slice(firstTab + 1, secondTab);
    let filePath = record.slice(secondTab + 1);
    if (filePath === '') {
      // Rename or copy: old and new paths follow as separate fields
      i++;
      filePath = parts[i++];
    }
    const binary = added === '-' || deleted === '-';
    stats.set(filePath, {
      additions: binary ? 0 : Number(added) || 0,
      deletions: binary ? 0 : Number(deleted) || 0,
      binary,
    });
  }
  return stats;
}

/**
 * Undo git's C-style quoting of a path ("a/t\303\244b\tc" → a/täb<TAB>c)
 * @param {string} text
 * @returns {string}
 */
export function unquoteGitPath(text) {
  if (!(text.length >= 2 && text.startsWith('"') && text.endsWith('"'))) return text;
  const body = text.slice(1, -1);
  const bytes = [];
  const escapes = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '"': 34, '\\': 92 };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'));
      continue;
    }
    const next = body[i + 1];
    if (/[0-7]/.test(next)) {
      const octal = body.slice(i + 1, i + 4);
      bytes.push(parseInt(octal, 8));
      i += 3;
    } else {
      bytes.push(escapes[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/** Strip the a/ or b/ prefix (and the tab git appends to names with spaces) */
function headerPath(raw, prefix) {
  let value = raw.replace(/\t$/, '');
  if (value === '/dev/null') return null;
  value = unquoteGitPath(value);
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

/**
 * Paths from a `diff --git a/x b/y` line when nothing else names them (binary files,
 * mode-only changes); exact only when both sides are equal, which is the common case
 * @param {string} rest - Text after "diff --git "
 */
function pathsFromGitLine(rest) {
  if (rest.startsWith('"')) {
    const match = /^("(?:[^"\\]|\\.)*") ("(?:[^"\\]|\\.)*"|\S.*)$/.exec(rest);
    if (match) return [headerPath(match[1], 'a/'), headerPath(match[2], 'b/')];
  }
  const length = (rest.length - 5) / 2;
  if (Number.isInteger(length) && length > 0) {
    const oldPath = rest.slice(2, 2 + length);
    if (rest.slice(2 + length) === ` b/${oldPath}`) return [oldPath, oldPath];
  }
  const split = rest.indexOf(' b/');
  return split === -1 ? [null, null] : [rest.slice(2, split), rest.slice(split + 3)];
}

/**
 * @typedef {object} FileDiff
 * @property {string|null} oldPath
 * @property {string|null} newPath
 * @property {string} text - The block from its `diff --git` line on
 */

/**
 * Split a multi-file unified diff (made with --src-prefix=a/ --dst-prefix=b/) per file
 * @param {string} diffText
 * @returns {FileDiff[]}
 */
export function splitDiff(diffText) {
  if (!diffText) return [];
  const lines = diffText.split('\n');
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      current = { lines: [line], header: true };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  return blocks.map(({ lines: blockLines }) => {
    let oldPath;
    let newPath;
    let renameFrom = null;
    let renameTo = null;
    for (const line of blockLines.slice(1)) {
      if (line.startsWith('@@')) break;
      if (line.startsWith('rename from ') || line.startsWith('copy from ')) {
        renameFrom = unquoteGitPath(line.slice(line.indexOf(' from ') + 6));
      } else if (line.startsWith('rename to ') || line.startsWith('copy to ')) {
        renameTo = unquoteGitPath(line.slice(line.indexOf(' to ') + 4));
      } else if (line.startsWith('--- ')) {
        oldPath = headerPath(line.slice(4), 'a/');
      } else if (line.startsWith('+++ ')) {
        newPath = headerPath(line.slice(4), 'b/');
      }
    }
    if (oldPath === undefined || newPath === undefined) {
      const [gitOld, gitNew] = pathsFromGitLine(blockLines[0].slice('diff --git '.length));
      const isNew = blockLines.some((line) => line.startsWith('new file mode'));
      const isDeleted = blockLines.some((line) => line.startsWith('deleted file mode'));
      if (oldPath === undefined) oldPath = isNew ? null : (renameFrom ?? gitOld);
      if (newPath === undefined) newPath = isDeleted ? null : (renameTo ?? gitNew);
    }
    // Drop the empty string left by the diff's final newline
    while (blockLines.length > 1 && blockLines[blockLines.length - 1] === '') blockLines.pop();
    return { oldPath, newPath, text: blockLines.join('\n') };
  });
}

/**
 * New-side lines a file diff touches: the line numbers of added lines, and for each run
 * of deleted lines the new-side number of the line that follows it
 * @param {string} fileDiffText
 * @returns {{addedLines: number[], deletionAnchors: number[]}}
 */
export function parseHunks(fileDiffText) {
  const addedLines = [];
  const deletionAnchors = [];
  let newLine = 0;
  let inHunk = false;
  let previousWasDeletion = false;

  for (const line of fileDiffText.split('\n')) {
    if (line.startsWith('@@')) {
      const match = /^@@+ (?:-\d+(?:,\d+)? )+\+(\d+)(?:,(\d+))? @@/.exec(line);
      inHunk = Boolean(match);
      if (match) {
        const start = Number(match[1]);
        // An empty new side (-U0 pure deletion) names the line before the gap
        newLine = match[2] === '0' ? start + 1 : start;
      }
      previousWasDeletion = false;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('+')) {
      addedLines.push(newLine);
      newLine++;
      previousWasDeletion = false;
    } else if (line.startsWith('-')) {
      if (!previousWasDeletion) deletionAnchors.push(newLine);
      previousWasDeletion = true;
    } else if (line.startsWith(' ')) {
      newLine++;
      previousWasDeletion = false;
    } else if (!line.startsWith('\\')) {
      // Anything else ends the hunk (the next file's header)
      inHunk = false;
    }
  }

  return { addedLines, deletionAnchors };
}

/**
 * A unified diff that adds a whole file, for untracked files in --working mode
 * @param {string} filePath
 * @param {string|null} content - null for binary content
 * @returns {string}
 */
export function syntheticAddedDiff(filePath, content) {
  const header = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644`;
  if (content === null) {
    return `${header}\nBinary files /dev/null and b/${filePath} differ`;
  }
  if (content === '') return header;
  const lines = content.split('\n');
  const missingNewline = lines[lines.length - 1] !== '';
  if (!missingNewline) lines.pop();
  const body = lines.map((line) => `+${line}`).join('\n');
  return (
    `${header}\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1${lines.length === 1 ? '' : `,${lines.length}`} @@\n` +
    body +
    (missingNewline ? '\n\\ No newline at end of file' : '')
  );
}

/**
 * Number of lines in file content, as git counts them for --numstat
 * @param {string} content
 */
export function countLines(content) {
  if (!content) return 0;
  const newlines = content.split('\n').length - 1;
  return content.endsWith('\n') ? newlines : newlines + 1;
}
