import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { resolveRemoteGitUrl, cloneRemoteRepo, withRemoteRepo } from '../lib/utils/remote-repo.js';
import { APIServer } from '../lib/api/rest/server.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

function gitIn(dir, ...args) {
  return execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function httpJson(port, method, reqPath, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path: reqPath,
        headers: body ? { 'Content-Type': 'application/json' } : {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, text: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('P1-3: Remote Git repository direct analysis & packing (--remote / --branch)', () => {
  let fixtureOriginDir;
  let server;
  let port;

  beforeAll(async () => {
    fixtureOriginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-remote-origin-'));
    gitIn(fixtureOriginDir, 'init', '-b', 'main');
    gitIn(fixtureOriginDir, 'config', 'user.email', 'test@example.com');
    gitIn(fixtureOriginDir, 'config', 'user.name', 'Test User');

    fs.mkdirSync(path.join(fixtureOriginDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureOriginDir, 'src', 'index.js'),
      'export function mainEntry() { return "from-main"; }\n'
    );
    gitIn(fixtureOriginDir, 'add', '.');
    gitIn(fixtureOriginDir, 'commit', '-m', 'feat: initial main commit');

    gitIn(fixtureOriginDir, 'checkout', '-b', 'release-v2');
    fs.writeFileSync(
      path.join(fixtureOriginDir, 'src', 'feature.js'),
      'export function releaseV2Feature() { return "from-release-v2"; }\n'
    );
    gitIn(fixtureOriginDir, 'add', '.');
    gitIn(fixtureOriginDir, 'commit', '-m', 'feat: release v2 feature');
    gitIn(fixtureOriginDir, 'checkout', 'main');

    server = new APIServer({ port: 0, host: '127.0.0.1' });
    server.start();
    await new Promise((resolve) => server.server.once('listening', resolve));
    port = server.server.address().port;
  });

  afterAll(async () => {
    if (server?.server) await new Promise((resolve) => server.server.close(resolve));
    if (fixtureOriginDir) {
      fs.rmSync(fixtureOriginDir, { recursive: true, force: true });
    }
  });

  it('resolves shorthand specs and URLs while rejecting unsafe inputs', () => {
    expect(resolveRemoteGitUrl('owner/repo')).toBe('https://github.com/owner/repo.git');
    expect(resolveRemoteGitUrl('github:acme/ctxman')).toBe('https://github.com/acme/ctxman.git');
    expect(resolveRemoteGitUrl('gitlab:acme/ctxman')).toBe('https://gitlab.com/acme/ctxman.git');
    expect(resolveRemoteGitUrl('https://github.com/acme/ctxman.git')).toBe(
      'https://github.com/acme/ctxman.git'
    );
    expect(resolveRemoteGitUrl(`file://${fixtureOriginDir}`)).toBe(`file://${fixtureOriginDir}`);

    expect(() => resolveRemoteGitUrl('--upload-pack=evil')).toThrow(/cannot start with "-"/);
    expect(() => resolveRemoteGitUrl('owner/repo; rm -rf /')).toThrow(/Unsafe characters/);
    expect(() => resolveRemoteGitUrl('ftp://example.com/repo.git')).toThrow(
      /Unsupported remote repository protocol/
    );
  });

  it('clones shallowly with withRemoteRepo, supports --branch, and cleans up temp directory', async () => {
    let capturedDir = null;
    const filesOnBranch = await withRemoteRepo(
      `file://${fixtureOriginDir}`,
      { branch: 'release-v2' },
      async (repoDir) => {
        capturedDir = repoDir;
        expect(fs.existsSync(path.join(repoDir, 'src', 'feature.js'))).toBe(true);
        return fs.readdirSync(path.join(repoDir, 'src')).sort();
      }
    );

    expect(filesOnBranch).toEqual(['feature.js', 'index.js']);
    expect(capturedDir).toBeTruthy();
    expect(fs.existsSync(capturedDir)).toBe(false);

    await expect(
      withRemoteRepo(`file://${fixtureOriginDir}`, { branch: '--bad-ref' }, async () => {})
    ).rejects.toThrow(/Invalid git reference/);
  });

  it('supports ctxman pack --remote --branch and ctxman map --remote --branch via CLI and REST API', async () => {
    const packCli = spawnSync(
      process.execPath,
      [
        CLI,
        'pack',
        '--remote',
        `file://${fixtureOriginDir}`,
        '--branch',
        'release-v2',
        '--style',
        'markdown',
        '-q',
      ],
      { encoding: 'utf8' }
    );
    expect(packCli.status).toBe(0);
    expect(packCli.stdout).toContain('releaseV2Feature');

    const mapCli = spawnSync(
      process.execPath,
      [CLI, 'map', '--remote', `file://${fixtureOriginDir}`, '--branch', 'release-v2', '-q'],
      { encoding: 'utf8' }
    );
    expect(mapCli.status).toBe(0);
    expect(mapCli.stdout).toContain('src/feature.js');

    const restMap = await httpJson(
      port,
      'GET',
      `/api/v1/map?remote=${encodeURIComponent(`file://${fixtureOriginDir}`)}&branch=release-v2`
    );
    expect(restMap.status).toBe(200);
    expect(restMap.json.remote).toBe(`file://${fixtureOriginDir}`);
    expect(restMap.json.branch).toBe('release-v2');
    expect(restMap.json.output).toContain('src/feature.js');

    const restPack = await httpJson(port, 'POST', '/api/v1/pack', {
      remote: `file://${fixtureOriginDir}`,
      branch: 'release-v2',
      style: 'markdown',
    });
    expect(restPack.status).toBe(200);
    expect(restPack.json.text).toContain('releaseV2Feature');
  });
});
