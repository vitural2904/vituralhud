import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../server/app';
import { validateState } from '../src/domain/validation';
import type { BroadcastState } from '../src/domain/types';

const argument = process.argv.indexOf('--soak-minutes');
const minutes = argument < 0 ? 0 : Number(process.argv[argument + 1]);
if (!Number.isFinite(minutes) || minutes < 0) throw new Error('Invalid soak duration');
const root = path.resolve('.codex-local', `stress-${Date.now()}`); await mkdir(root, { recursive: true });
const resultPath = path.resolve('test-results', minutes ? 'soak-results.json' : 'stress-results.json');
await mkdir(path.dirname(resultPath), { recursive: true });
const { app, manager } = await createApp({ dataDir: root, port: 4191 });
const startedAt = new Date().toISOString(); const started = performance.now();
const metrics = { startedAt, status: 'running', rounds: 0, commands: 0, elapsedSeconds: 0, clients: 0, stateMessages: 0, heartbeats: 0, rssPeakBytes: 0, revision: 1, failures: [] as string[] };
let sockets: WebSocket[] = [];
const check = () => { const state = manager.getState(); validateState(state); metrics.revision = state.revision; metrics.rssPeakBytes = Math.max(metrics.rssPeakBytes, process.memoryUsage().rss); metrics.elapsedSeconds = (performance.now() - started) / 1000; };
const save = async () => { check(); await writeFile(resultPath, JSON.stringify(metrics, null, 2)); };
try {
  for (let round = 0; round < 30; round++) {
    const before = manager.getState().revision;
    const results = await Promise.all(Array.from({ length: 100 }, (_, index) => manager.dispatch({ type: 'SET_MATCH', field: 'matchName', value: `Stress ${round}/${index}` })));
    if (results.some((state, index) => state.revision !== before + index + 1)) throw new Error('Concurrent revision order failed');
    const disk = JSON.parse(await readFile(path.join(root, 'snapshot.json'), 'utf8')) as BroadcastState;
    if (disk.revision !== manager.getState().revision || disk.match.matchName !== `Stress ${round}/99`) throw new Error('Disk/RAM mismatch');
    metrics.rounds++; metrics.commands += 100; await save();
  }
  if (minutes > 0) {
    await app.listen({ host: '127.0.0.1', port: 4191 });
    sockets = await Promise.all(Array.from({ length: 12 }, () => new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket('ws://127.0.0.1:4191/ws');
      let revision = 0;
      socket.onopen = () => resolve(socket); socket.onerror = () => reject(new Error('WebSocket connection failed'));
      socket.onmessage = event => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === 'state') { validateState(message.state); if (message.state.revision < revision) throw new Error('WS revision went backwards'); revision = message.state.revision; metrics.stateMessages++; }
          else if (message.type === 'heartbeat') metrics.heartbeats++;
        } catch (error) { metrics.failures.push(String(error)); }
      };
    })));
    metrics.clients = sockets.length;
    const soakStart = performance.now(); let tick = 0;
    while (performance.now() - soakStart < minutes * 60000) {
      const iteration = tick++;
      await Promise.all([
        manager.dispatch({ type: 'SET_MATCH', field: 'gameLabel', value: `Soak ${iteration}` }),
        manager.setLcuStatus({ connected: false, message: 'Soak simulated LCU offline' }),
        manager.tick(1000),
      ]);
      metrics.commands += 3;
      const response = await fetch('http://127.0.0.1:4191/api/state'); const state = await response.json(); validateState(state);
      if (metrics.failures.length) throw new Error(metrics.failures[0]);
      if (iteration % 30 === 0) await save();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const backups = await readdir(path.join(root, 'backups')); if (backups.length > 10) throw new Error('Backup retention exceeded');
    if (metrics.heartbeats < minutes * 45 * metrics.clients) throw new Error('Heartbeat gap');
  }
  metrics.status = 'passed';
} catch (error) { metrics.status = 'failed'; metrics.failures.push(String(error)); process.exitCode = 1; }
finally { for (const socket of sockets) socket.close(); await app.close(); await save(); console.log(JSON.stringify({ ...metrics, dataDir: root }, null, 2)); }
