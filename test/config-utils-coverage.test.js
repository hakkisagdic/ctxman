import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import ConfigUtils from '../lib/utils/config-utils.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('ConfigUtils Coverage', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('findConfigFile locates config in project root', () => {
    const configPath = path.join(tempDir, '.contextignore');
    fs.writeFileSync(configPath, 'node_modules/');

    const found = ConfigUtils.findConfigFile(tempDir, '.contextignore');
    expect(found).toBeDefined();
  });

  test('findConfigFile returns undefined when not found', () => {
    const found = ConfigUtils.findConfigFile(tempDir, '.nonexistent');
    expect(found).toBeUndefined();
  });

  test('initMethodFilter returns null when no filter files exist', () => {
    const parser = ConfigUtils.initMethodFilter(tempDir);
    expect(parser).toBeNull();
  });

  test('initMethodFilter creates parser when files exist', () => {
    const includePath = path.join(tempDir, '.methodinclude');
    fs.writeFileSync(includePath, 'handle*');

    const parser = ConfigUtils.initMethodFilter(tempDir);
    expect(parser).toBeDefined();
    expect(parser).not.toBeNull();
  });

  test('detectMethodFilters returns true when filter files detected', () => {
    const includePath = path.join(tempDir, '.methodinclude');
    fs.writeFileSync(includePath, 'test*');

    const result = ConfigUtils.detectMethodFilters(tempDir);
    expect(result).toBe(true);
  });

  test('detectMethodFilters returns false when no filter files', () => {
    const result = ConfigUtils.detectMethodFilters(tempDir);
    expect(result).toBe(false);
  });

  test('getConfigPaths returns all config paths', () => {
    const paths = ConfigUtils.getConfigPaths(tempDir);

    expect(paths).toHaveProperty('gitignore');
    expect(paths).toHaveProperty('contextIgnore');
    expect(paths).toHaveProperty('contextInclude');
    expect(paths).toHaveProperty('methodInclude');
    expect(paths).toHaveProperty('methodIgnore');
  });
});
