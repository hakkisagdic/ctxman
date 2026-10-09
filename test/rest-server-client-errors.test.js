import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
});
