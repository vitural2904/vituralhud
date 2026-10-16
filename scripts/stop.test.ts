import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { acquireProcessLock } from '../server/process-lock';
// @ts-expect-error executable JavaScript
import { stopApp, watchStopRequest } from './stop.mjs';
// @ts-expect-error executable JavaScript
import { supervise } from './supervise.mjs';

describe('STOP companion launcher', () => {
  it('stops the real managed app, persists off-air and does not restart it', async () => {
    const data = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-stop-'));
    const probe = createServer();
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>(resolve => probe.close(() => resolve()));
    const parent = spawn(process.execPath, ['--import', 'tsx', 'scripts/supervise.mjs'], { cwd: process.cwd(), env: { ...process.env, DRAFT_DATA_DIR: data, PORT: String(port), LCU_DISABLED: '1', LOG_LEVEL: 'silent' }, stdio: 'ignore', windowsHide: true });
    const exited = new Promise<number | null>(resolve => parent.once('exit', resolve));
    const url = `http://127.0.0.1:${port}`;
    try {
      let ready = false;
      for (let i = 0; i < 80; i++) {
        try { if ((await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(200) })).ok) { ready = true; break; } } catch { /* Starting. */ }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(ready).toBe(true);
      const { token } = await (await fetch(`${url}/api/control-session`)).json();
      for (const command of [{ type: 'SET_MATCH', field: 'matchName', value: 'Keep after STOP' }, { type: 'SET_OUTPUT', output: 'draft' }]) {
        expect((await fetch(`${url}/api/actions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-virtualhud-control': token }, body: JSON.stringify(command) })).ok).toBe(true);
      }
      // An old stop request cannot target the new supervisor's random identity.
      await writeFile(path.join(data, 'stop-00000000-0000-0000-0000-000000000000.request'), 'stop');
      await new Promise(resolve => setTimeout(resolve, 300));
      expect((await fetch(`${url}/api/health`)).ok).toBe(true);
      expect(await stopApp(data)).toBe(true);
      expect(await exited).toBe(0);
      const saved = JSON.parse(await readFile(path.join(data, 'snapshot.json'), 'utf8'));
      expect(saved.activeOutput).toBe('none'); expect(saved.match.matchName).toBe('Keep after STOP');
      await expect(readFile(path.join(data, 'server.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
      await new Promise(resolve => setTimeout(resolve, 300));
      await expect(fetch(`${url}/api/health`)).rejects.toThrow();
      expect(await stopApp(data)).toBe(false);
    } finally {
      if (parent.exitCode === null && parent.signalCode === null) {
        try { await stopApp(data, 7000); } catch { parent.kill(); }
        await exited;
      }
      await rm(data, { recursive: true, force: true });
    }
  });

  it('cancels a pending restart even when no child server is available', async () => {
    const data = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-stop-backoff-'));
    const release = await acquireProcessLock(data, 'supervisor.lock');
    const controller = new AbortController();
    const stopWatching = await watchStopRequest(data, () => controller.abort());
    let restarting!: () => void;
    const backoff = new Promise<void>(resolve => { restarting = resolve; });
    const events: string[] = [];
    const running = supervise({ root: process.cwd(), args: ['-e', 'process.exit(2)'], restartDelays: [5000], signal: controller.signal, onEvent: (event: { event: string }) => { events.push(event.event); if (event.event === 'server-restart') restarting(); } }).finally(async () => { await stopWatching(); await release(); });
    try {
      await backoff;
      expect(await stopApp(data)).toBe(true);
      expect(await running).toBe(0);
      expect(events.filter(event => event === 'server-start')).toHaveLength(1);
    } finally { controller.abort(); await running; await rm(data, { recursive: true, force: true }); }
  });
});
