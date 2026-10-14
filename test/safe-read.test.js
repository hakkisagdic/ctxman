import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readFileChecked } from '../lib/utils/safe-read.js';

describe('readFileChecked', () => {
  let root;
  let outside;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-safe-read-')));
    outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-safe-outside-')));
    fs.writeFileSync(path.join(root, 'a.txt'), 'hello');
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
    fs.mkdirSync(path.join(root, 'dir'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('reads a regular file', () => {
    const read = readFileChecked(path.join(root, 'a.txt'));

    expect(read.status).toBe('ok');
    expect(read.buffer.toString()).toBe('hello');
    expect(read.stat.size).toBe(5);
  });

  it('reports a directory, a missing file and a file over the limit', () => {
    expect(readFileChecked(path.join(root, 'dir')).status).toBe('not-file');
    expect(readFileChecked(path.join(root, 'nope.txt'))).toEqual({ status: 'missing' });

    const big = readFileChecked(path.join(root, 'a.txt'), { maxBytes: 4 });
    expect(big.status).toBe('too-large');
    expect(big.stat.size).toBe(5);
  });

  describe.skipIf(process.platform === 'win32')('symbolic links', () => {
    beforeEach(() => {
      fs.symlinkSync(path.join(root, 'a.txt'), path.join(root, 'inside-link'));
      fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'outside-link'));
      fs.symlinkSync(outside, path.join(root, 'outside-dir'));
    });

    it('follows links unless told not to', () => {
      expect(readFileChecked(path.join(root, 'inside-link')).status).toBe('ok');
      expect(readFileChecked(path.join(root, 'inside-link'), { followLinks: false }).status).toBe(
        'not-file'
      );
    });

    it('refuses a file that resolves outside the given directory', () => {
      const options = { within: root };

      expect(readFileChecked(path.join(root, 'inside-link'), options).status).toBe('ok');
      expect(readFileChecked(path.join(root, 'outside-link'), options).status).toBe('outside');
      // The last part is a plain file, but a directory on the way is a link out
      const throughDir = path.join(root, 'outside-dir', 'secret.txt');
      expect(readFileChecked(throughDir, { ...options, followLinks: false }).status).toBe(
        'outside'
      );
    });
  });
});
