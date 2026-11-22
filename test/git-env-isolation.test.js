import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanGitEnv, GIT_REPO_ENV_VARS } from './helpers/git-env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];

function tmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(d);
  return d;
}

function snapshot(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else
        out.push(
          `${path.relative(dir, full)}:${st.size}:${fs.readFileSync(full).toString('base64')}`
        );
    }
  };
  walk(dir);
  return out.join('\n');
}

function makeDecoy() {
  const decoy = tmp('ctxman-decoy-');
  execFileSync('git', ['init', '-q', '--bare', decoy], { env: cleanGitEnv() });
  return decoy;
}

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});

describe('git environment isolation (pre-push GIT_DIR hazard)', () => {
  it('cleanGitEnv removes every repository-selecting variable', () => {
    const saved = {};
    for (const name of GIT_REPO_ENV_VARS) {
      saved[name] = process.env[name];
      process.env[name] = '/nonexistent';
    }
    try {
      const env = cleanGitEnv({ KEEP_ME: '1' });
      for (const name of GIT_REPO_ENV_VARS) expect(env[name]).toBeUndefined();
      expect(env.KEEP_ME).toBe('1');
    } finally {
      for (const name of GIT_REPO_ENV_VARS) {
        if (saved[name] === undefined) delete process.env[name];
        else process.env[name] = saved[name];
      }
    }
  });

  it('a temporary repository built with the helper leaves a decoy GIT_DIR untouched', () => {
    const decoy = makeDecoy();
    const before = snapshot(decoy);
    const prev = process.env.GIT_DIR;
    process.env.GIT_DIR = decoy;
    try {
      const work = tmp('ctxman-work-');
      const git = (...args) =>
        execFileSync('git', args, { cwd: work, env: cleanGitEnv(), stdio: 'pipe' });
      git('init', '-q', '-b', 'main');
      git('config', 'user.name', 'Isolated');
      git('config', 'user.email', 'isolated@example.com');
      fs.writeFileSync(path.join(work, 'a.txt'), 'a\n');
      git('add', 'a.txt');
      git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'init');
      expect(fs.existsSync(path.join(work, '.git'))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = prev;
    }
    expect(snapshot(decoy)).toBe(before);
    expect(
      execFileSync('git', ['config', '--get', 'core.bare'], { cwd: decoy, env: cleanGitEnv() })
        .toString()
        .trim()
    ).toBe('true');
  });

  it('a real temp-repo test run under GIT_DIR=<decoy> does not touch the decoy', () => {
    const decoy = makeDecoy();
    const before = snapshot(decoy);
    const env = cleanGitEnv({ GIT_DIR: decoy, GIT_WORK_TREE: ROOT });
    const res = spawnSync(
      process.execPath,
      [path.join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', 'test/git-ref-injection.test.js'],
      { cwd: ROOT, env, encoding: 'utf8' }
    );
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(snapshot(decoy)).toBe(before);
  }, 120000);

  it('.husky/pre-push unsets the variables before npm test', () => {
    const hook = fs.readFileSync(path.join(ROOT, '.husky/pre-push'), 'utf8');
    const unsetIdx = hook.indexOf(
      'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY'
    );
    expect(unsetIdx).toBeGreaterThan(-1);
    expect(hook.indexOf('npm test')).toBeGreaterThan(unsetIdx);
  });
});
