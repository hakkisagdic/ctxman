/**
 * Read a file through a single descriptor, so the type, size and location checks hold for
 * the bytes that are read even when the path is replaced between the checks and the read
 */

import fs from 'fs';
import path from 'path';

const sameFile = (a, b) => a.ino === b.ino && a.dev === b.dev;

const isInside = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/**
 * @param {string} filePath
 * @param {Object} [options]
 * @param {number} [options.maxBytes=Infinity] - Larger files are not read
 * @param {boolean} [options.followLinks=true] - false: a symbolic link is not a file
 * @param {string} [options.within] - Real path of a directory the file must resolve inside
 * @returns {{status: 'ok', buffer: Buffer, stat: fs.Stats}
 *   | {status: 'not-file' | 'too-large', stat: fs.Stats}
 *   | {status: 'outside' | 'missing'}}
 */
export function readFileChecked(
  filePath,
  { maxBytes = Infinity, followLinks = true, within } = {}
) {
  let fd;
  try {
    // Checked before opening: opening a FIFO would block
    const before = followLinks ? fs.statSync(filePath) : fs.lstatSync(filePath);
    if (!before.isFile()) return { status: 'not-file', stat: before };

    fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    if (!sameFile(stat, before)) return { status: 'missing' };
    if (within) {
      const real = fs.realpathSync(filePath);
      if (!isInside(within, real) || !sameFile(fs.statSync(real), stat)) {
        return { status: 'outside' };
      }
    }
    if (stat.size > maxBytes) return { status: 'too-large', stat };

    // At most the size checked above, even if the file grows while it is read
    const buffer = Buffer.alloc(stat.size);
    let length = 0;
    while (length < buffer.length) {
      const read = fs.readSync(fd, buffer, length, buffer.length - length, length);
      if (read === 0) break;
      length += read;
    }
    return { status: 'ok', buffer: buffer.subarray(0, length), stat };
  } catch (_error) {
    return { status: 'missing' };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
