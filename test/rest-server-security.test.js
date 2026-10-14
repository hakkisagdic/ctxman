import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { APIServer } from '../lib/api/rest/server.js';

const app = (server) => (req, res) => server.handleRequest(req, res);

describe('APIServer request guards', () => {
  it('sends no CORS headers by default', async () => {
    const response = await request(app(new APIServer())).get('/api/v1/docs');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sends CORS headers when cors is enabled', async () => {
    const response = await request(app(new APIServer({ cors: true }))).get('/api/v1/docs');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('rejects requests whose Host is not a loopback name while bound to loopback', async () => {
    const server = new APIServer();

    const rebound = await request(app(server)).get('/api/v1/docs').set('Host', 'evil.example:3000');
    expect(rebound.status).toBe(403);

    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) {
      const ok = await request(app(server)).get('/api/v1/docs').set('Host', host);
      expect(ok.status).toBe(200);
    }
  });

  it('skips the Host check when bound to a non-loopback address', async () => {
    const server = new APIServer({ host: '0.0.0.0' });

    const response = await request(app(server))
      .get('/api/v1/docs')
      .set('Host', 'build-box.lan:3000');
    expect(response.status).toBe(200);
  });
});
