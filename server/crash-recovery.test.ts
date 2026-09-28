import { fork } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StateManager } from './state-manager';
import { acquireProcessLock } from './process-lock';
const directories: string[] = [];
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });
const directory = async () => { const dir = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-crash-')); directories.push(dir); return dir; };
describe('F26 process crash recovery', () => {
  it.each(['write', 'flush', 'rename'])('survives a killed process at %s', async stage => {
    const dir = await directory(); const original = new StateManager(dir); await original.init();
    await original.dispatch({ type: 'SET_MATCH', field: 'matchName', value: 'Before crash' });
    const snapshot = await readFile(path.join(dir, 'snapshot.json'), 'utf8');
    const child = fork(path.resolve('scripts/crash-writer.ts'), [dir, stage], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Crash checkpoint timeout')), 10000);
        child.once('message', () => { clearTimeout(timeout); resolve(); });
        child.once('error', reject); child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Child exited ${code}`)); });
      });
      await new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill('SIGKILL'); });
      expect(await readFile(path.join(dir, 'snapshot.json'), 'utf8')).toBe(snapshot);
      const restarted = new StateManager(dir); await restarted.init();
      expect(restarted.getState().match.matchName).toBe('Before crash'); expect(restarted.getState().activeOutput).toBe('none');
    } finally { if (child.exitCode === null) child.kill('SIGKILL'); }
  });
  it('blocks a second writer; permits release and recovers a dead-process lock', async () => {
    const dir = await directory(); const release = await acquireProcessLock(dir);
    await expect(acquireProcessLock(dir)).rejects.toThrow('đang chạy'); await release();
    await writeFile(path.join(dir, 'server.lock'), JSON.stringify({ pid: 2147483647, id: 'dead' }));
    const second = await acquireProcessLock(dir); await second();
  });
});
