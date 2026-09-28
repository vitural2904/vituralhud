import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function acquireProcessLock(directory: string, name = 'server.lock') {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, name); const owner = { pid: process.pid, id: randomUUID() };
  for (let attempt = 0; ; attempt++) {
    try {
      const handle = await open(file, 'wx');
      try { await handle.writeFile(JSON.stringify(owner)); await handle.sync(); } finally { await handle.close(); }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 0) throw error;
      const existing = JSON.parse(await readFile(file, 'utf8')) as typeof owner;
      if (!Number.isSafeInteger(existing.pid) || existing.pid < 1) throw new Error('Lock lỗi. Kiểm tra tiến trình trước khi xóa lock.');
      try { process.kill(existing.pid, 0); throw new Error('VirtualHUD đang chạy với thư mục dữ liệu này.'); }
      catch (probe) { if ((probe as NodeJS.ErrnoException).code !== 'ESRCH') throw probe; }
      await unlink(file);
    }
  }
  return async () => {
    const current = await readFile(file, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
    if (current?.id === owner.id) await unlink(file);
  };
}
