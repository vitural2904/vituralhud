import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('ingame display settings', () => {
  it('requires authorization, validates and persists settings independently', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ingame-settings-'));
    const headers = { host: '127.0.0.1:4187' };
    let app = (await createApp({ dataDir: dir, port: 4187 })).app;
    try {
      const payload = { visible: false, roster: true, events: false, sponsor: true };
      expect((await app.inject({ method: 'POST', url: '/api/ingame-settings', headers, payload })).statusCode).toBe(403);
      const token = (await app.inject({ url: '/api/control-session', headers })).json().token;
      const auth = { ...headers, 'x-virtualhud-control': token };
      expect((await app.inject({ method: 'POST', url: '/api/ingame-settings', headers: auth, payload: { ...payload, events: 'false' } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/api/ingame-settings', headers: auth, payload })).statusCode).toBe(200);
      await app.close();
      app = (await createApp({ dataDir: dir, port: 4187 })).app;
      expect((await app.inject({ url: '/api/ingame-settings', headers })).json()).toEqual(payload);
    } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
  });
});
