import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import MethodFilterParser from '../lib/parsers/method-filter-parser.js';

describe('method filter files', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-method-filter-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const parser = ({ include, ignore }) => {
    const write = (name, content) => {
      if (content === undefined) return null;
      fs.writeFileSync(path.join(dir, name), content);
      return path.join(dir, name);
    };
    return new MethodFilterParser(write('.methodinclude', include), write('.methodignore', ignore));
  };
  const kept = (filter, names) => names.filter((name) => filter.shouldIncludeMethod(name, 'app'));

  it('lets a later !pattern re-include methods a broader .methodignore pattern drops', () => {
    const filter = parser({ ignore: '*log*\n!auditLog*\n' });

    expect(kept(filter, ['logInfo', 'auditLogWrite', 'save'])).toEqual(['auditLogWrite', 'save']);
  });

  it('lets !pattern exclude methods from a broader .methodinclude pattern', () => {
    const filter = parser({ include: '*Handler\n!*TestHandler\n' });

    expect(kept(filter, ['clickHandler', 'mockTestHandler', 'save'])).toEqual(['clickHandler']);
  });

  it('ignores trailing comments, as in the documented examples', () => {
    const filter = parser({ include: "*Handler          # All methods ending with 'Handler'\n" });

    expect(kept(filter, ['clickHandler', 'save'])).toEqual(['clickHandler']);
  });
});
