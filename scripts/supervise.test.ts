import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error executable JavaScript
import { supervise } from './supervise.mjs';

const directories: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const root of directories.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(source: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-supervisor-')); directories.push(root);
  await writeFile(path.join(root, 'child.mjs'), source);
  return root;
}
describe('START server supervision', () => {
  it('restarts a crashed child, then respects a clean stop', async () => {
    const root = await fixture(`import {existsSync,writeFileSync} from 'node:fs'; if (!existsSync('started')) { writeFileSync('started','yes'); process.exit(1); } process.exit(0);`);
    const events: { event: string }[] = [];
    expect(await supervise({ root, args: ['child.mjs'], restartDelays: [1], onEvent: (event: { event: string }) => events.push(event) })).toBe(0);
    expect(await readFile(path.join(root, 'started'), 'utf8')).toBe('yes');
    expect(events.filter(event => event.event === 'server-start')).toHaveLength(2);
    expect(events.filter(event => event.event === 'server-restart')).toHaveLength(1);
  });
  it('stops after the crash retry budget is exhausted', async () => {
    const root = await fixture('process.exit(2);');
    const events: { event: string }[] = [];
    expect(await supervise({ root, args: ['child.mjs'], restartDelays: [1, 1, 1], onEvent: (event: { event: string }) => events.push(event) })).toBe(1);
    expect(events.filter(event => event.event === 'server-start')).toHaveLength(4);
    expect(events.at(-1)?.event).toBe('restart-limit');
  });
  it('recovers the actual server after a forced exit, with saved data and output off-air', async () => {
    const data = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-restart-')); directories.push(data);
    const probe = createServer();
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>(resolve => probe.close(() => resolve()));
    vi.stubEnv('PORT', String(port)); vi.stubEnv('DRAFT_DATA_DIR', data); vi.stubEnv('LCU_DISABLED', '1'); vi.stubEnv('LOG_LEVEL', 'silent');
    const url = `http://127.0.0.1:${port}`;
    const controller = new AbortController();
    const running = supervise({ root: process.cwd(), restartDelays: [1], signal: controller.signal, onEvent: () => undefined });
    const online = async (oldInstance?: string) => {
      const deadline = Date.now() + 7000;
      while (Date.now() < deadline) {
        try { const response = await fetch(`${url}/api/state`, { signal: AbortSignal.timeout(300) }); const state = await response.json(); if (response.ok && state.serverInstanceId !== oldInstance) return state; } catch { /* Starting or restarting. */ }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Server did not recover');
    };
    try {
      const before = await online();
      const { token } = await (await fetch(`${url}/api/control-session`)).json();
      for (const command of [{ type: 'SET_MATCH', field: 'matchName', value: 'Saved final' }, { type: 'SET_OUTPUT', output: 'draft' }]) {
        expect((await fetch(`${url}/api/actions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-virtualhud-control': token }, body: JSON.stringify(command) })).ok).toBe(true);
      }
      const { pid } = JSON.parse(await readFile(path.join(data, 'server.lock'), 'utf8'));
      process.kill(pid, 'SIGKILL');
      const recovered = await online(before.serverInstanceId);
      expect(recovered.match.matchName).toBe('Saved final');
      expect(recovered.activeOutput).toBe('none');
    } finally { controller.abort(); await running; }
  });
});
