import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import FileUtils from '../lib/utils/file-utils.js';

describe('File Utils', () => {
  let testDir;

  beforeEach(() => {
    testDir = path.join(process.cwd(), 'test-temp-fileutils');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Text File Detection', () => {
    test('Detects text files', () => {
      expect(FileUtils.isText('test.js')).toBe(true);
      expect(FileUtils.isText('test.ts')).toBe(true);
      expect(FileUtils.isText('test.md')).toBe(true);
      expect(FileUtils.isText('test.json')).toBe(true);
      expect(FileUtils.isText('test.py')).toBe(true);
    });

    test('Rejects binary files', () => {
      expect(FileUtils.isText('test.exe')).toBe(false);
      expect(FileUtils.isText('test.bin')).toBe(false);
      expect(FileUtils.isText('test.dll')).toBe(false);
      expect(FileUtils.isText('test.png')).toBe(false);
    });

    test('Detects special files by name', () => {
      expect(FileUtils.isText('Dockerfile')).toBe(true);
      expect(FileUtils.isText('Makefile')).toBe(true);
      expect(FileUtils.isText('README')).toBe(true);
    });
  });

  describe('Code File Detection', () => {
    test('Detects code files', () => {
      expect(FileUtils.isCode('test.js')).toBe(true);
      expect(FileUtils.isCode('test.ts')).toBe(true);
      expect(FileUtils.isCode('test.py')).toBe(true);
      expect(FileUtils.isCode('test.go')).toBe(true);
      expect(FileUtils.isCode('test.rs')).toBe(true);
    });

    test('Rejects non-code files', () => {
      expect(FileUtils.isCode('test.md')).toBe(false);
      expect(FileUtils.isCode('test.txt')).toBe(false);
      expect(FileUtils.isCode('test.json')).toBe(false);
    });
  });

  describe('File Type Detection', () => {
    test('Categorizes code files', () => {
      expect(FileUtils.getType('test.js')).toBe('code');
      expect(FileUtils.getType('test.py')).toBe('code');
    });

    test('Categorizes config files', () => {
      expect(FileUtils.getType('package.json')).toBe('config');
      expect(FileUtils.getType('config.yml')).toBe('config');
    });

    test('Categorizes documentation', () => {
      expect(FileUtils.getType('README.md')).toBe('doc');
      expect(FileUtils.getType('notes.txt')).toBe('doc');
    });

    test('Categorizes style files', () => {
      expect(FileUtils.getType('styles.css')).toBe('style');
      expect(FileUtils.getType('main.scss')).toBe('style');
    });
  });

  describe('Extension Extraction', () => {
    test('Extracts extension without dot', () => {
      expect(FileUtils.getExtension('test.js')).toBe('js');
      expect(FileUtils.getExtension('test.tsx')).toBe('tsx');
    });

    test('Handles files without extension', () => {
      expect(FileUtils.getExtension('README')).toBe('no-extension');
    });
  });
});
