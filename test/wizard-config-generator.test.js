import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ConfigGenerator from '../lib/wizards/config-generator.js';
import ProjectDetector from '../lib/wizards/project-detector.js';

describe('ConfigGenerator.generate', () => {
  let root;
  const config = { contextignore: ['dist/'], contextinclude: ['src/**'], methodinclude: [] };
  const names = (list) => list.map((entry) => entry.filename).sort();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-config-gen-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('creates the files and keeps existing ones without force', () => {
    fs.writeFileSync(path.join(root, '.contextignore'), 'mine\n');

    const result = new ConfigGenerator(root).generate(config);

    expect(names(result.created)).toEqual(['.contextinclude']);
    expect(names(result.skipped)).toEqual(['.contextignore']);
    expect(fs.readFileSync(path.join(root, '.contextignore'), 'utf8')).toBe('mine\n');
  });

  it('overwrites existing files with force', () => {
    fs.writeFileSync(path.join(root, '.contextignore'), 'mine\n');

    const result = new ConfigGenerator(root).generate(config, { force: true });

    expect(names(result.overwritten)).toEqual(['.contextignore']);
    expect(names(result.created)).toEqual(['.contextinclude']);
    expect(fs.readFileSync(path.join(root, '.contextignore'), 'utf8')).toContain('dist/');
  });

  it('writes nothing in a dry run', () => {
    fs.writeFileSync(path.join(root, '.contextignore'), 'mine\n');

    const result = new ConfigGenerator(root).generate(config, { dryRun: true, force: true });

    expect(names(result.overwritten)).toEqual(['.contextignore']);
    expect(result.created[0].content).toContain('src/**');
    expect(fs.existsSync(path.join(root, '.contextinclude'))).toBe(false);
  });
});

describe('ProjectDetector.matchesGlob', () => {
  const detector = new ProjectDetector(os.tmpdir());

  it('treats only * as a wildcard', () => {
    expect(detector.matchesGlob('next.config.js', 'next.config.*')).toBe(true);
    expect(detector.matchesGlob('nextXconfig.js', 'next.config.*')).toBe(false);
    expect(detector.matchesGlob('app.c++', '*.c++')).toBe(true);
    expect(detector.matchesGlob('appc', 'app(c)?')).toBe(false);
  });
});
