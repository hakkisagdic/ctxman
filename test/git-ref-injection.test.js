import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { GitClient } from '../lib/integrations/git/GitClient.js';
import { DiffAnalyzer } from '../lib/integrations/git/DiffAnalyzer.js';
import { APIServer } from '../lib/api/rest/server.js';

// Git refs reach GitClient from the REST API (?since=), the MCP git_diff tool and
// --changed-since. They must never be interpreted by a shell or parsed as git options.
describe('git ref handling', () => {
  let repoDir;
  let marker;

  const git = (...args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf-8' });

  beforeAll(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-git-refs-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(repoDir, 'a.txt'), 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'initial');
    marker = path.join(repoDir, 'marker');
  });

  afterAll(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    fs.rmSync(marker, { force: true });
    git('checkout', '-q', '--', 'a.txt');
  });

  const hostileRefs = () => [
    `HEAD $(touch ${marker})`,
    `HEAD \`touch ${marker}\``,
    `HEAD | touch ${marker}`,
    `HEAD\ntouch ${marker}`,
    `--output=${marker}`,
  ];

  it('rejects hostile refs in GitClient.getChangedFiles without running anything', () => {
    const client = new GitClient(repoDir);

    for (const ref of hostileRefs()) {
      expect(() => client.getChangedFiles(ref)).toThrow('Invalid git reference');
    }
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('rejects hostile refs in every DiffAnalyzer entry point', () => {
    const analyzer = new DiffAnalyzer(repoDir);

    for (const ref of hostileRefs()) {
      expect(() => analyzer.analyzeChanges(ref)).toThrow('Invalid git reference');
      expect(() => analyzer.compareBranches(ref, 'HEAD')).toThrow('Invalid git reference');
      expect(() => analyzer.compareBranches('HEAD', ref)).toThrow('Invalid git reference');
      expect(analyzer.getRangeStats(ref)).toBeNull();
      expect(analyzer.getFileDiff('a.txt', ref).diff).toBe('');
    }
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('passes arguments to git without a shell', () => {
    const client = new GitClient(repoDir);

    const output = client.exec(['diff', '--name-only', 'HEAD', '--', `$(touch ${marker})`]);

    expect(output).toBe('');
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('still accepts ordinary refs and file paths', () => {
    const client = new GitClient(repoDir);
    const analyzer = new DiffAnalyzer(repoDir);
    fs.writeFileSync(path.join(repoDir, 'a.txt'), 'one\ntwo\n');

    expect(client.getChangedFiles('HEAD')).toEqual(['a.txt']);
    expect(analyzer.analyzeChanges('HEAD').changedFiles).toEqual(['a.txt']);
    expect(analyzer.getFileDiff('a.txt', 'HEAD')).toMatchObject({ added: 1, deleted: 0 });
    expect(analyzer.compareBranches('HEAD', 'HEAD')).toEqual({
      added: [],
      modified: [],
      deleted: [],
      renamed: [],
    });
    expect(client.getFileHistory('a.txt')).toHaveLength(1);
    expect(client.getLastCommit('a.txt')).toMatchObject({ author: 'Test', subject: 'initial' });
  });

  it('answers GET /api/v1/diff with 400 for a hostile since= value', async () => {
    const server = new APIServer();
    const app = (req, res) => server.handleRequest(req, res);

    for (const ref of hostileRefs()) {
      const response = await request(app).get('/api/v1/diff').query({ path: repoDir, since: ref });
      expect(response.status).toBe(400);
    }
    expect(fs.existsSync(marker)).toBe(false);

    const ok = await request(app).get('/api/v1/diff').query({ path: repoDir, since: 'HEAD' });
    expect(ok.status).toBe(200);
    expect(ok.body.changedFiles).toEqual([]);
  });
});
