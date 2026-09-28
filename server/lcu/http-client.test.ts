import { createServer, type Server, type RequestListener } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { LcuHttpClient, isLcuNotFound } from './http-client';
const servers: Server[] = [];
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
async function client(handler: RequestListener, timeout = 100) {
  const server = createServer(handler); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address()!;
  if (typeof address === 'string') throw new Error('Bad address');
  return new LcuHttpClient({ sourcePath: 'test-lockfile', port: address.port, password: 'fake-password', protocol: 'http' }, timeout);
}
describe('LCU local HTTP boundary', () => {
  it('uses GET and auth; parses genuine JSON', async () => {
    const api = await client((request, response) => { expect(request.method).toBe('GET'); expect(request.url).toBe('/test'); expect(request.headers.authorization).toBe(`Basic ${Buffer.from('riot:fake-password').toString('base64')}`); response.end(JSON.stringify({ ok: true })); });
    expect(await api.getJson('/test')).toEqual({ ok: true });
  });
  it('rejects invalid JSON and distinguishes missing endpoints', async () => {
    const api = await client((request, response) => { if (request.url === '/missing') response.statusCode = 404; response.end('bad json'); });
    await expect(api.getJson('/invalid')).rejects.toThrow('JSON');
    try { await api.getJson('/missing'); throw new Error('Expected rejection'); } catch (error) { expect(isLcuNotFound(error)).toBe(true); }
  });
  it('times out a silent local client', async () => { const api = await client(() => undefined, 40); await expect(api.getJson('/silent')).rejects.toThrow('timeout'); });
});
