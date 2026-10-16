import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquireProcessLock } from '../server/process-lock.ts';
import { watchStopRequest } from './stop.mjs';

/** Observe real child exits. A clean stop stays stopped; crashes have a bounded retry budget. */
export async function supervise({ root, args = ['--import', 'tsx', 'server/index.ts'], restartDelays = [1000, 3000, 7000], signal, onEvent = event => console.error(JSON.stringify({ at: new Date().toISOString(), ...event })) }) {
  let failures = [];
  while (!signal?.aborted) {
    const started = Date.now();
    onEvent({ event: 'server-start' });
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true });
      let forceStop;
      const stop = () => {
        if (child.connected) child.send({ type: 'virtualhud:stop' }, error => { if (error) child.kill('SIGTERM'); });
        else child.kill('SIGTERM');
        forceStop = setTimeout(() => child.kill('SIGTERM'), 5000); forceStop.unref();
      };
      signal?.addEventListener('abort', stop, { once: true });
      if (signal?.aborted) stop();
      child.once('error', () => onEvent({ event: 'server-spawn-error' }));
      child.once('close', (code, exitSignal) => {
        clearTimeout(forceStop);
        signal?.removeEventListener('abort', stop);
        resolve({ code, signal: exitSignal });
      });
    });
    onEvent({ event: 'server-exit', code: result.code, signal: result.signal, uptimeMs: Date.now() - started });
    if (signal?.aborted || result.code === 0) return 0;
    failures = failures.filter(at => Date.now() - at < 60000);
    if (failures.length >= restartDelays.length) { onEvent({ event: 'restart-limit', message: 'Server dừng sau nhiều lỗi. Xem .codex-local/server.log.' }); return 1; }
    const delay = restartDelays[failures.length];
    failures.push(Date.now());
    onEvent({ event: 'server-restart', delayMs: delay, message: 'Khởi động lại. Sóng sẽ tắt.' });
    await new Promise(resolve => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, delay);
      signal?.addEventListener('abort', finish, { once: true });
      if (signal?.aborted) finish();
    });
  }
  return 0;
}

async function main() {
  const root = path.resolve(import.meta.dirname, '..');
  const dataDir = process.env.DRAFT_DATA_DIR ?? path.join(root, 'data');
  const release = await acquireProcessLock(dataDir, 'supervisor.lock');
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  let stopWatching;
  try { stopWatching = await watchStopRequest(dataDir, stop); process.exitCode = await supervise({ root, signal: controller.signal }); }
  finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); try { await stopWatching?.(); } finally { await release(); } }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
