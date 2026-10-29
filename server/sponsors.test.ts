import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { registerSponsorRoutes } from './sponsors';
import { createApp } from './app';

describe('sponsor settings', () => {
  const dirs: string[] = [];
  afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
  it('persists valid settings and rejects unsafe URLs and invalid intervals', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sponsor-test-')); dirs.push(dir);
    const app = Fastify(); await registerSponsorRoutes(app, dir);
    const settings = { logos: ['/team-uploads/logo-123.png'], intervalSeconds: 7 };
    expect((await app.inject({ method: 'POST', url: '/api/sponsors', payload: settings })).statusCode).toBe(200);
    for (const bad of [{ ...settings, logos: ['https://evil.example/logo.png'] }, { ...settings, logos: ['/team-uploads/../secret.png'] }, { ...settings, logos: ['/team-uploads/%2e%2e%2fsecret.png'] }, { ...settings, intervalSeconds: 0 }]) {
      expect((await app.inject({ method: 'POST', url: '/api/sponsors', payload: bad })).statusCode).toBe(400);
    }
    await app.close();
    const restarted = Fastify(); await registerSponsorRoutes(restarted, dir);
    expect((await restarted.inject({ method: 'GET', url: '/api/sponsors' })).json()).toEqual(settings);
    await restarted.close();
  });
  it('requires a control session to change settings', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sponsor-test-')); dirs.push(dir);
    const { app } = await createApp({ dataDir: dir, port: 4187 });
    try {
      const headers = { host: '127.0.0.1:4187' };
      const payload = { logos: [], intervalSeconds: 15 };
      expect((await app.inject({ method: 'POST', url: '/api/sponsors', headers, payload })).statusCode).toBe(403);
      const token = (await app.inject({ url: '/api/control-session', headers })).json().token;
      expect((await app.inject({ method: 'POST', url: '/api/sponsors', headers: { ...headers, 'x-virtualhud-control': token }, payload })).statusCode).toBe(200);
      const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ff0000' } }).png().toBuffer();
      const upload = await app.inject({ method: 'POST', url: '/api/sponsor-logos', headers: { ...headers, 'x-virtualhud-control': token, 'content-type': 'image/png', 'x-file-name': 'brand.png' }, payload: png });
      expect(upload.statusCode).toBe(200);
      const logo = upload.json().asset.url as string;
      expect(logo).toMatch(/^\/sponsor-uploads\//);
      expect((await app.inject({ url: logo, headers })).statusCode).toBe(200);
      expect((await app.inject({ url: '/api/team-logos', headers })).json().assets).not.toContainEqual(expect.objectContaining({ url: logo }));
      expect((await app.inject({ method: 'POST', url: '/api/sponsors', headers: { ...headers, 'x-virtualhud-control': token }, payload: { logos: [logo], intervalSeconds: 5 } })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
});
