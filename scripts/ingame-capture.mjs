import { createWriteStream, readFileSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { performance } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import { normalizeIngame, offlineIngame } from '../server/ingame.ts';

const request = (url) => new Promise((resolve, reject) => {
  const start = performance.now();
  const target = new URL(url);
  const transport = target.protocol === 'https:' ? https : http;
  const req = transport.get(target, { rejectUnauthorized: target.hostname === '127.0.0.1' && target.port === '2999' ? false : true, timeout: 1500 }, res => {
    let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; if (body.length > 2000000) req.destroy(new Error('response too large')); });
    res.on('end', () => { try { if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`); resolve({ durationMs: performance.now() - start, data: JSON.parse(body) }); } catch (error) { reject(error); } });
  });
  req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
});
async function record() {
  mkdirSync('.codex-local/captures', { recursive: true });
  const file = `.codex-local/captures/ingame-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
  const stream = createWriteStream(file, { flags: 'wx' });
  const start = performance.now(); let count = 0;
  console.log(`Recording 120 seconds to ${file}`);
  while (performance.now() - start < 120000) {
    const t = performance.now() - start;
    const results = await Promise.allSettled([request('https://127.0.0.1:2999/liveclientdata/allgamedata'), request('http://127.0.0.1:4174/api/ingame')]);
    const pack = r => r.status === 'fulfilled' ? r.value : { error: String(r.reason?.message ?? r.reason) };
    stream.write(JSON.stringify({ elapsedMs: t, wallTime: new Date().toISOString(), game: pack(results[0]), app: pack(results[1]) }) + '\n'); count++;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 200 - (performance.now() - start - t))));
  }
  await new Promise((resolve, reject) => { stream.on('error', reject); stream.end(resolve); });
  console.log(`Done: ${count} samples. ${file}`);
}
function replay(file) {
  const frames = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)).filter(f => f.game?.data);
  if (!frames.length) throw new Error('No game frames in capture');
  const start = performance.now(); let index = 0;
  const currentFrame = () => {
    while (index + 1 < frames.length && frames[index + 1].elapsedMs - frames[0].elapsedMs <= performance.now() - start) index++;
    try { return normalizeIngame(frames[index].game.data); } catch { return offlineIngame(); }
  };
  const sockets = new WebSocketServer({ noServer: true });
  sockets.on('connection', socket => {
    const send = () => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(currentFrame())); };
    send(); const timer = setInterval(send, 100); timer.unref();
    socket.on('close', () => clearInterval(timer));
    socket.on('error', () => clearInterval(timer));
  });
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    if (req.url?.split('?')[0] === '/api/ingame') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(currentFrame())); return;
    }
    const proxy = http.request({ hostname: '127.0.0.1', port: 4174, path: req.url, method: req.method, headers: { ...req.headers, host: '127.0.0.1:4174' } }, upstream => { res.writeHead(upstream.statusCode ?? 502, upstream.headers); upstream.pipe(res); });
    proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.pipe(proxy);
  });
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] === '/ws/ingame') { sockets.handleUpgrade(req, socket, head, ws => sockets.emit('connection', ws, req)); return; }
    const upstream = net.connect(4174, '127.0.0.1', () => { upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n`); for (const [key,value] of Object.entries(req.headers)) if (value !== undefined) upstream.write(`${key}: ${key === 'host' ? '127.0.0.1:4174' : key === 'origin' ? 'http://127.0.0.1:4174' : value}\r\n`); upstream.write('\r\n'); if (head.length) upstream.write(head); socket.pipe(upstream).pipe(socket); }); upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
  });
  server.listen(4185, '127.0.0.1', () => console.log('Replay: http://127.0.0.1:4185/overlay/ingame (app must be running on 4174)'));
}
if (process.argv[2] === 'record') await record();
else if (process.argv[2] === 'replay' && process.argv[3]) replay(process.argv[3]);
else console.log('Usage: node --import tsx scripts/ingame-capture.mjs record | replay <capture.jsonl>');
