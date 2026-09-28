import path from 'node:path';
import { readFile } from 'node:fs/promises';
export default async function teardown() {
  // Windows process-tree enumeration can be denied in a restricted workspace.
  // Stop only the test server recorded in this run's isolated data directory.
  const directory = process.env.VIRTUALHUD_BROWSER_DATA_DIR;
  if (!directory || !directory.startsWith(path.resolve('.codex-local/browser-state-'))) throw new Error('Invalid test data directory');
  const lock = await readFile(path.join(directory, 'server.lock'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (lock && Number.isSafeInteger(lock.pid) && lock.pid !== process.pid) {
    try { process.kill(lock.pid, 'SIGTERM'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  }
}
