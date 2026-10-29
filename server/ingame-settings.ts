import path from 'node:path';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { DomainError } from '../src/domain/validation';

export type IngameSettings = { visible: boolean; roster: boolean; events: boolean; sponsor: boolean };
export const defaultIngameSettings: IngameSettings = { visible: true, roster: true, events: true, sponsor: true };
const keys = ['visible', 'roster', 'events', 'sponsor'] as const;
export function validIngameSettings(value: unknown): value is IngameSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === keys.length && keys.every(key => typeof record[key] === 'boolean');
}

export async function registerIngameSettings(app: FastifyInstance, dataDir: string) {
  const file = path.join(dataDir, 'ingame-settings.json');
  let settings = { ...defaultIngameSettings };
  try { const saved: unknown = JSON.parse(await readFile(file, 'utf8')); if (validIngameSettings(saved)) settings = saved; } catch { /* Use defaults. */ }
  let writes = Promise.resolve();
  app.get('/api/ingame-settings', async (_request, reply) => reply.header('cache-control', 'no-store').send(settings));
  app.post('/api/ingame-settings', async request => {
    if (!validIngameSettings(request.body)) throw new DomainError('INVALID_INGAME_SETTINGS', 'Cài đặt ingame không hợp lệ.', [], 400);
    const next = request.body;
    const save = writes.then(async () => {
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(next), 'utf8');
      await rename(temp, file);
      settings = next;
    });
    writes = save.catch(() => undefined);
    await save;
    return settings;
  });
}
