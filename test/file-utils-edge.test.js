import { describe, test, expect } from 'vitest';
import FileUtils from '../lib/utils/file-utils.js';

describe('FileUtils Edge Cases', () => {
  test('getExtension returns extension without dot', () => {
    expect(FileUtils.getExtension('file.js')).toBe('js');
    expect(FileUtils.getExtension('config.json')).toBe('json');
  });

  test('getExtension returns no-extension for files without extension', () => {
    expect(FileUtils.getExtension('Dockerfile')).toBe('no-extension');
    expect(FileUtils.getExtension('README')).toBe('no-extension');
  });

  test('getType returns other for unknown extensions', () => {
    expect(FileUtils.getType('file.xyz')).toBe('other');
    expect(FileUtils.getType('file.unknown')).toBe('other');
    expect(FileUtils.getType('binary.exe')).toBe('other');
  });

  test('isText recognizes special filenames', () => {
    expect(FileUtils.isText('Dockerfile')).toBe(true);
    expect(FileUtils.isText('Makefile')).toBe(true);
    expect(FileUtils.isText('LICENSE')).toBe(true);
    expect(FileUtils.isText('README')).toBe(true);
    expect(FileUtils.isText('CHANGELOG')).toBe(true);
  });
});
