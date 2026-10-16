import { mkdir, readFile } from 'node:fs/promises';
import { existsSync, openSync, closeSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function verifyDependencies(root) {
  const stateDir = path.join(root, '.codex-local'); await mkdir(stateDir, { recursive: true });
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const requiredPackages = new Map(Object.entries(lock.packages ?? {}).filter(([location, item]) => location.startsWith('node_modules/') && !item.optional));
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) requiredPackages.set(`node_modules/${name}`, lock.packages?.[`node_modules/${name}`]);
  const installed = async () => (await Promise.all([...requiredPackages].map(async ([location, expected]) => {
    const directory = path.join(root, location);
    const metadata = await readFile(path.join(directory, 'package.json'), 'utf8').then(JSON.parse).catch(() => undefined);
    if (!metadata || metadata.version !== expected?.version) return false;
    const bins = typeof metadata.bin === 'string' ? [metadata.bin] : Object.values(metadata.bin ?? {});
    return bins.every(file => typeof file === 'string' && existsSync(path.join(directory, file)));
  }))).every(Boolean);
  if (!await installed()) throw new Error('Dependency còn thiếu hoặc sai phiên bản. Chạy npm ci trong thư mục dự án rồi mở lại START.cmd.');
  return true;
}

export function validateHealth(body, expectedVersion) {
  if (body?.app !== 'virtualhud-lol' || body.version !== expectedVersion || body.ok !== true) throw new Error('Cổng 4174 đang dùng bởi app khác hoặc bản cũ. Đóng bản đó trước.');
  return body;
}

async function launch() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 22 || minor < 19) throw new Error('Cần Node.js 22.19 trở lên trong nhánh 22.');
  const root = path.resolve(import.meta.dirname, '..');
  const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
  await verifyDependencies(root);
  execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build'] : ['run', 'build'], { cwd: root, stdio: 'inherit', windowsHide: true });
  const url = 'http://127.0.0.1:4174/api/health';
  const health = async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Cổng 4174 không trả health hợp lệ.');
    return validateHealth(body, version);
  };
  let running = false;
  try { await health(); running = true; } catch (error) { if (error.message.startsWith('Cổng')) throw error; }
  if (!running) {
    const log = openSync(path.join(root, '.codex-local', 'server.log'), 'a');
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/supervise.mjs'], { cwd: root, detached: true, stdio: ['ignore', log, log], windowsHide: true });
    child.once('error', error => console.error(error.message)); child.unref(); closeSync(log);
    const deadline = Date.now() + 20000;
    while (true) {
      try { await health(); break; } catch (error) { if (error.message.startsWith('Cổng') || Date.now() >= deadline) throw error; }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  console.log('VirtualHUD đã mở. Sóng đang tắt khi khởi động mới.');
  if (process.env.VIRTUALHUD_NO_BROWSER !== '1' && process.platform === 'win32') spawn('cmd.exe', ['/d', '/s', '/c', 'start "" "http://127.0.0.1:4174/control"'], { windowsHide: true, stdio: 'ignore' }).unref();
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) launch().catch(error => { console.error(error.message); process.exitCode = 1; });
