import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { APIServer } from '../lib/api/rest/server.js';

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: urlPath, headers: { Host: `127.0.0.1:${port}` } },
      (res) => {
        let text = '';
        res.on('data', (d) => (text += d));
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text) }));
      }
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe('REST API client errors', () => {
  let server;
  let port;
  let projectDir;

  beforeAll(async () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-rest-errors-'));
    fs.mkdirSync(path.join(projectDir, 'src'));
    server = new APIServer({ port: 0, host: '127.0.0.1' });
    server.start();
    await new Promise((resolve) => server.server.once('listening', resolve));
    port = server.server.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.server.close(resolve));
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('answers GET /api/v1/methods for a nonexistent file with 404', async () => {
    const missing = path.join(projectDir, 'does-not-exist.js');
    const r = await request(port, 'GET', `/api/v1/methods?file=${encodeURIComponent(missing)}`);

    expect(r.status).toBe(404);
    expect(r.json.error).toBe(`File not found: ${missing}`);
  });

  it('answers GET /api/v1/methods for a directory with 404', async () => {
    const dir = path.join(projectDir, 'src');
    const r = await request(port, 'GET', `/api/v1/methods?file=${encodeURIComponent(dir)}`);

    expect(r.status).toBe(404);
  });

  it('answers GET /api/v1/methods for a binary file with 400', async () => {
    const image = path.join(projectDir, 'logo.png');
    fs.writeFileSync(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const r = await request(port, 'GET', `/api/v1/methods?file=${encodeURIComponent(image)}`);

    expect(r.status).toBe(400);
    expect(r.json.error).toBe(`Not a text source file: ${image}`);
  });

  it('answers a malformed JSON body to POST /api/v1/context with 400', async () => {
    const r = await request(port, 'POST', '/api/v1/context', '{not json');

    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: 'Invalid JSON', statusCode: 400 });
  });

  it('answers invalid repos directory with 400', async () => {
    const missingRepo = path.join(projectDir, 'no-such-repo');
    const r = await request(
      port,
      'GET',
      `/api/v1/analyze?path=${encodeURIComponent(projectDir)}&repo=${encodeURIComponent(missingRepo)}`
    );

    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/Not a directory/i);
  });
});

describe('REST API multi-repository workspace support (repos)', () => {
  let server;
  let port;
  let primaryDir;
  let siblingDir;

  const git = (cwd, args) =>
    execFileSync('git', args, {
      cwd,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    });

  beforeAll(async () => {
    primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-rest-primary-'));
    siblingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-rest-sibling-'));

    fs.mkdirSync(path.join(primaryDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(primaryDir, 'src', 'app.js'),
      'export function runApp(x) {\n  return x + 1;\n}\n'
    );

    fs.mkdirSync(path.join(siblingDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(siblingDir, 'src', 'billing.js'),
      'export function chargeCard(amount) {\n  return amount * 100;\n}\n'
    );
    fs.writeFileSync(path.join(siblingDir, 'src', 'secret.js'), 'export const SECRET = 123;\n');
    fs.mkdirSync(path.join(siblingDir, '.ctxman'), { recursive: true });
    fs.writeFileSync(
      path.join(siblingDir, '.ctxman', 'policy.json'),
      JSON.stringify({
        version: 1,
        deny: ['src/secret.js', '.ctxman/**'],
      })
    );

    for (const dir of [primaryDir, siblingDir]) {
      git(dir, ['init', '-b', 'main']);
      git(dir, ['add', '.']);
      git(dir, ['commit', '-m', 'initial']);
    }

    // Create an uncommitted change in both repos for /api/v1/diff
    fs.appendFileSync(path.join(primaryDir, 'src', 'app.js'), '// updated primary\n');
    fs.appendFileSync(path.join(siblingDir, 'src', 'billing.js'), '// updated sibling\n');

    server = new APIServer({ port: 0, host: '127.0.0.1' });
    server.start();
    await new Promise((resolve) => server.server.once('listening', resolve));
    port = server.server.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.server.close(resolve));
    fs.rmSync(primaryDir, { recursive: true, force: true });
    fs.rmSync(siblingDir, { recursive: true, force: true });
  });

  it('GET /api/v1/analyze aggregates files across repos with <alias>/<path> and enforces per-repo policy', async () => {
    const r = await request(
      port,
      'GET',
      `/api/v1/analyze?path=${encodeURIComponent(primaryDir)}&repo=${encodeURIComponent(siblingDir)}&methods=true`
    );

    expect(r.status).toBe(200);
    expect(r.json.repos).toHaveLength(2);
    const primaryAlias = path.basename(primaryDir);
    const siblingAlias = path.basename(siblingDir);
    const relPaths = r.json.files.map((f) => f.relativePath);
    expect(relPaths).toContain(`${primaryAlias}/src/app.js`);
    expect(relPaths).toContain(`${siblingAlias}/src/billing.js`);
    expect(relPaths.some((p) => p.endsWith('secret.js'))).toBe(false);
    expect(r.json.stats.totalFiles).toBe(2);
    expect(r.json.stats.totalMethods).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/v1/stats aggregates token statistics across workspace repos', async () => {
    const r = await request(
      port,
      'GET',
      `/api/v1/stats?path=${encodeURIComponent(primaryDir)}&repos=${encodeURIComponent(siblingDir)}`
    );

    expect(r.status).toBe(200);
    expect(r.json.repos).toHaveLength(2);
    expect(r.json.totalFiles).toBe(2);
    expect(r.json.totalTokens).toBeGreaterThan(0);
  });

  it('GET /api/v1/methods resolves <alias>/<path> across workspace repos and blocks policy-denied files', async () => {
    const siblingAlias = path.basename(siblingDir);
    const ok = await request(
      port,
      'GET',
      `/api/v1/methods?path=${encodeURIComponent(primaryDir)}&repo=${encodeURIComponent(siblingDir)}&file=${encodeURIComponent(`${siblingAlias}/src/billing.js`)}`
    );

    expect(ok.status).toBe(200);
    expect(ok.json.repo).toBe(siblingAlias);
    expect(ok.json.file).toBe(`${siblingAlias}/src/billing.js`);
    expect(ok.json.methods.map((m) => m.name)).toContain('chargeCard');

    const denied = await request(
      port,
      'GET',
      `/api/v1/methods?path=${encodeURIComponent(primaryDir)}&repo=${encodeURIComponent(siblingDir)}&file=${encodeURIComponent(`${siblingAlias}/src/secret.js`)}`
    );
    expect(denied.status).toBe(403);
    expect(denied.json.error).toMatch(/denied by export policy/i);
  });

  it('GET /api/v1/diff aggregates changed files across workspace git repositories', async () => {
    const r = await request(
      port,
      'GET',
      `/api/v1/diff?path=${encodeURIComponent(primaryDir)}&repo=${encodeURIComponent(siblingDir)}`
    );

    expect(r.status).toBe(200);
    expect(r.json.repos).toHaveLength(2);
    const primaryAlias = path.basename(primaryDir);
    const siblingAlias = path.basename(siblingDir);
    expect(r.json.changedFiles).toContain(`${primaryAlias}/src/app.js`);
    expect(r.json.changedFiles).toContain(`${siblingAlias}/src/billing.js`);
    expect(r.json.totalChangedFiles).toBe(2);
  });

  it('POST /api/v1/context builds multi-repo context and enforces per-repo export policies', async () => {
    const ok = await request(
      port,
      'POST',
      '/api/v1/context',
      JSON.stringify({
        path: primaryDir,
        repos: [siblingDir],
        methodLevel: true,
        useCase: 'feature',
      })
    );

    expect(ok.status).toBe(200);
    expect(ok.json.repos).toHaveLength(2);
    expect(ok.json.metadata.totalFiles).toBe(2);
    expect(ok.json.metadata.removedByPolicy).toBeGreaterThanOrEqual(1);

    // Tighten sibling policy maxExportTokens to trigger 403 PolicyViolationError
    fs.writeFileSync(
      path.join(siblingDir, '.ctxman', 'policy.json'),
      JSON.stringify({
        version: 1,
        deny: ['src/secret.js', '.ctxman/**'],
        maxExportTokens: 1,
      })
    );

    const refused = await request(
      port,
      'POST',
      '/api/v1/context',
      JSON.stringify({
        path: primaryDir,
        repos: [siblingDir],
      })
    );
    expect(refused.status).toBe(403);
    expect(refused.json.violations).toBeDefined();

    // Restore sibling policy without maxExportTokens cap for subsequent tests
    fs.writeFileSync(
      path.join(siblingDir, '.ctxman', 'policy.json'),
      JSON.stringify({
        version: 1,
        deny: ['src/secret.js', '.ctxman/**'],
      })
    );
  });

  it('serves code intelligence endpoints across single and multi-repo workspaces', async () => {
    const primaryAlias = path.basename(primaryDir);
    const siblingAlias = path.basename(siblingDir);
    const wsQuery = `path=${encodeURIComponent(primaryDir)}&repo=${encodeURIComponent(siblingDir)}`;

    // 1. GET /api/v1/docs lists all 19 endpoints
    const docs = await request(port, 'GET', '/api/v1/docs');
    expect(docs.status).toBe(200);
    expect(docs.json.endpoints.length).toBeGreaterThanOrEqual(19);

    // 2. GET /api/v1/map
    const mapRes = await request(port, 'GET', `/api/v1/map?${wsQuery}&tokens=2048&callGraph=true`);
    expect(mapRes.status).toBe(200);
    expect(mapRes.json.output).toContain(`${siblingAlias}/src/billing.js`);

    // 3. GET /api/v1/search
    const searchRes = await request(port, 'GET', `/api/v1/search?${wsQuery}&q=chargeCard&limit=5`);
    expect(searchRes.status).toBe(200);
    expect(searchRes.json.results.some((r) => r.file.includes('billing.js'))).toBe(true);

    // 4. GET /api/v1/symbol
    const symRes = await request(port, 'GET', `/api/v1/symbol?${wsQuery}&name=chargeCard`);
    expect(symRes.status).toBe(200);
    expect(symRes.json.symbols.length).toBeGreaterThanOrEqual(1);
    expect(symRes.json.symbols[0].file).toBe(`${siblingAlias}/src/billing.js`);

    // 5. GET /api/v1/count
    const countRes = await request(
      port,
      'GET',
      `/api/v1/count?${wsQuery}&model=claude-sonnet-5-5&top=5`
    );
    expect(countRes.status).toBe(200);
    expect(countRes.json.tokens).toBeGreaterThan(0);

    // 6. GET /api/v1/pr
    const prRes = await request(port, 'GET', `/api/v1/pr?${wsQuery}&base=HEAD`);
    expect(prRes.status).toBe(200);
    expect(prRes.json.repos).toHaveLength(2);

    // 7. GET /api/v1/why
    const whyRes = await request(
      port,
      'GET',
      `/api/v1/why?${wsQuery}&target=${encodeURIComponent(`${siblingAlias}/src/billing.js:chargeCard`)}`
    );
    expect(whyRes.status).toBe(200);
    expect(whyRes.json.data.history.commits.length).toBeGreaterThanOrEqual(1);

    // 8. GET /api/v1/who
    const whoRes = await request(
      port,
      'GET',
      `/api/v1/who?${wsQuery}&target=${encodeURIComponent(`${siblingAlias}/src/billing.js`)}`
    );
    expect(whoRes.status).toBe(200);
    expect(whoRes.json.experts.length).toBeGreaterThanOrEqual(1);

    // 9. GET /api/v1/policy & GET /api/v1/audit
    const policyRes = await request(port, 'GET', `/api/v1/policy?${wsQuery}`);
    expect(policyRes.status).toBe(200);
    expect(policyRes.json.repos).toHaveLength(2);

    const auditRes = await request(port, 'GET', `/api/v1/audit?${wsQuery}&limit=10`);
    expect(auditRes.status).toBe(200);
    expect(Array.isArray(auditRes.json.events)).toBe(true);

    // 10. POST /api/v1/pack
    const packRes = await request(
      port,
      'POST',
      '/api/v1/pack',
      JSON.stringify({
        path: primaryDir,
        repos: [siblingDir],
        style: 'markdown',
        budget: 8000,
      })
    );
    expect(packRes.status).toBe(200);
    expect(packRes.json.text).toContain(`${primaryAlias}/src/app.js`);

    // 11. POST /api/v1/focus
    const focusRes = await request(
      port,
      'POST',
      '/api/v1/focus',
      JSON.stringify({
        path: primaryDir,
        repos: [siblingDir],
        file: `${siblingAlias}/src/billing.js:chargeCard`,
        depth: 1,
      })
    );
    expect(focusRes.status).toBe(200);
    expect(focusRes.json.focus.target).toBe(`${siblingAlias}/src/billing.js`);

    // 12. POST /api/v1/task
    const taskRes = await request(
      port,
      'POST',
      '/api/v1/task',
      JSON.stringify({
        path: primaryDir,
        repos: [siblingDir],
        task: 'update chargeCard amount calculation',
        budget: 8000,
      })
    );
    expect(taskRes.status).toBe(200);
    expect(taskRes.json.repos).toHaveLength(2);

    // 13. POST /api/v1/diagnose
    const diagRes = await request(
      port,
      'POST',
      '/api/v1/diagnose',
      JSON.stringify({
        path: primaryDir,
        repos: [siblingDir],
        trace: `Error: card declined\n    at chargeCard (${siblingAlias}/src/billing.js:2:10)`,
      })
    );
    expect(diagRes.status).toBe(200);
    expect(diagRes.json.implicatedFiles.some((f) => f.includes('billing.js'))).toBe(true);

    // 14. POST /api/v1/ask
    const askRes = await request(
      port,
      'POST',
      '/api/v1/ask',
      JSON.stringify({
        path: primaryDir,
        repos: [siblingDir],
        query: 'chargeCard',
        limit: 3,
      })
    );
    expect(askRes.status).toBe(200);
    expect(askRes.json.results.length).toBeGreaterThanOrEqual(1);
  });
});
