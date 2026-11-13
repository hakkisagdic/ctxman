import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  discoverProjectRules,
  formatProjectRulesSection,
  packContext,
  buildTaskContext,
  packWorkspace,
} from '../index.js';
import APIServer from '../lib/api/rest/server.js';

describe('Project Rules & Agent Instructions Auto-Discovery (P0-3)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-rules-'));
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src/index.js'),
      'export function runTask() { return "ok"; }\n',
      'utf8'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers AGENTS.md, CLAUDE.md, .cursorrules, .cursor/rules/*.mdc, and .github/copilot-instructions.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agent Rules\nUse ESM only.\n', 'utf8');
    fs.writeFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      '# Claude Instructions\nRun vitest.\n',
      'utf8'
    );
    fs.writeFileSync(path.join(tmpDir, '.cursorrules'), 'Prefer pure functions.\n', 'utf8');
    fs.mkdirSync(path.join(tmpDir, '.cursor/rules'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.cursor/rules/01-security.mdc'),
      '---\ndescription: security\n---\nNever log tokens.\n',
      'utf8'
    );
    fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.github/copilot-instructions.md'),
      'Follow conventional commits.\n',
      'utf8'
    );

    const rules = discoverProjectRules(tmpDir);
    const paths = rules.map((r) => r.path);

    assert.ok(paths.includes('AGENTS.md'));
    assert.ok(paths.includes('CLAUDE.md'));
    assert.ok(paths.includes('.cursorrules'));
    assert.ok(paths.includes('.cursor/rules/01-security.mdc'));
    assert.ok(paths.includes('.github/copilot-instructions.md'));

    const formatted = formatProjectRulesSection(rules);
    assert.ok(formatted.includes('# Project Rules & Agent Instructions'));
    assert.ok(formatted.includes('## AGENTS.md (agents)'));
    assert.ok(formatted.includes('Use ESM only.'));
    assert.ok(formatted.includes('Never log tokens.'));
  });

  it('injects discovered rules into packContext and buildTaskContext when includeRules is true', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      'ALWAYS validate inputs with strict schemas.\n',
      'utf8'
    );

    const packedWithout = await packContext(tmpDir, {
      include: ['src/**'],
      includeRules: false,
    });
    assert.equal(packedWithout.rules.length, 0);
    assert.ok(!packedWithout.text.includes('ALWAYS validate inputs with strict schemas.'));

    const packedWith = await packContext(tmpDir, {
      include: ['src/**'],
      includeRules: true,
      instructions: 'Custom extra instruction.',
    });
    assert.equal(packedWith.rules.length, 1);
    assert.equal(packedWith.rules[0].path, 'AGENTS.md');
    assert.ok(packedWith.text.includes('ALWAYS validate inputs with strict schemas.'));
    assert.ok(packedWith.text.includes('Custom extra instruction.'));

    const taskBundle = await buildTaskContext(tmpDir, 'runTask implementation', {
      includeRules: true,
      format: 'xml',
    });
    assert.equal(taskBundle.rules.length, 1);
    assert.ok(taskBundle.packed.includes('ALWAYS validate inputs with strict schemas.'));
  });

  it('supports multi-repo workspace rules discovery and REST GET /api/v1/rules', async () => {
    const repoB = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-rules-b-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), 'Repo A rule.\n', 'utf8');
      fs.writeFileSync(path.join(repoB, 'CLAUDE.md'), 'Repo B rule.\n', 'utf8');
      fs.writeFileSync(path.join(repoB, 'index.js'), 'export const b = 2;\n', 'utf8');

      const wsPack = await packWorkspace([tmpDir, repoB], {
        include: ['**/*.js'],
        includeRules: true,
      });
      assert.equal(wsPack.rules.length, 2);
      assert.ok(wsPack.text.includes('Repo A rule.'));
      assert.ok(wsPack.text.includes('Repo B rule.'));

      const server = new APIServer({ port: 0, host: '127.0.0.1' });
      await new Promise((resolve) => {
        server.server = server.server || null;
        server.start();
        server.server.on('listening', resolve);
      });
      const port = server.server.address().port;

      try {
        const res = await fetch(
          `http://127.0.0.1:${port}/api/v1/rules?path=${encodeURIComponent(tmpDir)}`
        );
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.total, 1);
        assert.equal(data.rules[0].path, 'AGENTS.md');
        assert.ok(data.formatted.includes('Repo A rule.'));
      } finally {
        server.stop();
      }
    } finally {
      fs.rmSync(repoB, { recursive: true, force: true });
    }
  });
});
