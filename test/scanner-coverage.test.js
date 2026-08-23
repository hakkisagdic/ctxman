import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Scanner from '../lib/core/Scanner.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('Scanner Coverage', () => {
  let tempDir;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
  });

  afterEach(() => {
    // Clean up
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('respects maxDepth option', () => {
    // Create nested directory structure
    const level1 = path.join(tempDir, 'level1');
    const level2 = path.join(level1, 'level2');
    const level3 = path.join(level2, 'level3');

    fs.mkdirSync(level1);
    fs.mkdirSync(level2);
    fs.mkdirSync(level3);

    fs.writeFileSync(path.join(tempDir, 'root.txt'), 'root');
    fs.writeFileSync(path.join(level1, 'l1.txt'), 'level1');
    fs.writeFileSync(path.join(level2, 'l2.txt'), 'level2');
    fs.writeFileSync(path.join(level3, 'l3.txt'), 'level3');

    const scanner = new Scanner(tempDir, { maxDepth: 1 });
    const files = scanner.scan();

    // Should only scan root and level1, not level2 or level3
    const fileNames = files.map((f) => path.basename(f.path));
    expect(fileNames).toContain('root.txt');
    expect(fileNames).toContain('l1.txt');
    expect(fileNames).not.toContain('l2.txt');
    expect(fileNames).not.toContain('l3.txt');
  });

  test('reset clears statistics', () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'test');

    const scanner = new Scanner(tempDir);
    scanner.scan();

    const statsBefore = scanner.getStats();
    expect(statsBefore.filesScanned).toBeGreaterThan(0);

    scanner.reset();

    const statsAfter = scanner.getStats();
    expect(statsAfter.filesScanned).toBe(0);
    expect(statsAfter.directoriesTraversed).toBe(0);
    expect(statsAfter.filesIgnored).toBe(0);
    expect(statsAfter.errors).toBe(0);
  });

  test('tracks scanning statistics', () => {
    fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'test1');
    fs.writeFileSync(path.join(tempDir, 'file2.txt'), 'test2');

    const subDir = path.join(tempDir, 'subdir');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'file3.txt'), 'test3');

    const scanner = new Scanner(tempDir);
    scanner.scan();

    const stats = scanner.getStats();
    expect(stats.filesScanned).toBeGreaterThanOrEqual(3);
    expect(stats.directoriesTraversed).toBeGreaterThan(0);
  });

  test('handles non-text files', () => {
    // Create a text file
    fs.writeFileSync(path.join(tempDir, 'text.txt'), 'hello');

    // Create a binary file (fake binary by making it unreadable as text)
    const binaryPath = path.join(tempDir, 'binary.bin');
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    fs.writeFileSync(binaryPath, buffer);

    const scanner = new Scanner(tempDir);
    const files = scanner.scan();

    // Text file should be found
    const fileNames = files.map((f) => path.basename(f.path));
    expect(fileNames).toContain('text.txt');
  });

  test('handles directory scan errors gracefully', () => {
    fs.writeFileSync(path.join(tempDir, 'good.txt'), 'test');

    const scanner = new Scanner(tempDir);

    // Mock fs.readdirSync to throw error for specific directory
    const originalReaddirSync = fs.readdirSync;
    const errorDir = path.join(tempDir, 'errordir');
    fs.mkdirSync(errorDir);

    vi.spyOn(fs, 'readdirSync').mockImplementation((dirPath, options) => {
      if (dirPath === errorDir) {
        throw new Error('Permission denied');
      }
      return originalReaddirSync(dirPath, options);
    });

    const _files = scanner.scan();
    const stats = scanner.getStats();

    // Should have encountered an error
    expect(stats.errors).toBeGreaterThan(0);

    fs.readdirSync.mockRestore();
  });
});
