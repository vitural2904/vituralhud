import { readFile, writeFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function readOwner(directory) {
  const raw = await readFile(path.join(directory, 'supervisor.lock'), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (raw === null) return null;
  const owner = JSON.parse(raw);
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner.id)) throw new Error('Lock supervisor không hợp lệ. Không dừng tiến trình khác.');
  return owner;
}
const stopFile = (directory, owner) => path.join(directory, `stop-${owner.id}.request`);

export async function watchStopRequest(directory, onStop) {
  const owner = await readOwner(directory);
  if (!owner) throw new Error('Thiếu lock supervisor.');
  const request = stopFile(directory, owner);
  let stopping = false;
  const timer = setInterval(() => {
    void stat(request).then(() => { if (!stopping) { stopping = true; onStop(); } }).catch(error => { if (error.code !== 'ENOENT') console.error('Không đọc được yêu cầu dừng app.'); });
  }, 250);
  timer.unref();
  return async () => { clearInterval(timer); await unlink(request).catch(error => { if (error.code !== 'ENOENT') throw error; }); };
}

export async function stopApp(directory, timeoutMs = 10000) {
  const owner = await readOwner(directory);
  if (!owner) return false;
  try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  // The nonce addresses this supervisor only. Never kill a PID read from disk.
  await writeFile(stopFile(directory, owner), 'stop\n', { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await readOwner(directory);
    if (!current || current.id !== owner.id) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('App chưa dừng sau 10 giây. Xem .codex-local/server.log.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(import.meta.dirname, '..');
  stopApp(path.resolve(root, process.env.DRAFT_DATA_DIR ?? 'data')).then(stopped => console.log(stopped ? 'VirtualHUD đã dừng. Không tự khởi động lại. Dữ liệu được giữ.' : 'Không thấy app đang chạy qua START.cmd.')).catch(error => { console.error(error.message); process.exitCode = 1; });
}
