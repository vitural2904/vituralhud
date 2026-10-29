import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import sharp from 'sharp';
import { DomainError } from '../src/domain/validation';
import { MAX_TEAM_LOGO_BYTES, buildTeamLogoFilename, detectTeamLogoFormat } from './team-logo-assets';

export type SponsorSettings = { logos: string[]; intervalSeconds: number };
const empty: SponsorSettings = { logos: [], intervalSeconds: 10 };

export function validSponsorSettings(value: unknown): value is SponsorSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).every(key => key === 'logos' || key === 'intervalSeconds') && Array.isArray(v.logos) && v.logos.length <= 20 && v.logos.every(url => typeof url === 'string' && /^\/(?:team|sponsor)-uploads\/[a-z0-9-]+\.png$/.test(url)) && new Set(v.logos).size === v.logos.length && typeof v.intervalSeconds === 'number' && Number.isInteger(v.intervalSeconds) && v.intervalSeconds >= 2 && v.intervalSeconds <= 300;
}

export async function registerSponsorRoutes(app: FastifyInstance, dataDir: string) {
  const logoRoot = path.resolve(dataDir, 'sponsor-logos');
  await mkdir(logoRoot, { recursive: true });
  await app.register(fastifyStatic, { root: logoRoot, prefix: '/sponsor-uploads/', decorateReply: false });
  const file = path.join(dataDir, 'sponsors.json');
  let settings = empty;
  try { const saved: unknown = JSON.parse(await readFile(file, 'utf8')); if (validSponsorSettings(saved)) settings = saved; } catch { /* No valid saved settings yet. */ }
  let writes = Promise.resolve();
  app.get('/api/sponsors', async (_request, reply) => reply.header('cache-control', 'no-store').send(settings));
  app.post('/api/sponsor-logos', { bodyLimit: MAX_TEAM_LOGO_BYTES }, async request => {
    if (!Buffer.isBuffer(request.body) || !detectTeamLogoFormat(request.body)) throw new DomainError('INVALID_IMAGE', 'Chỉ nhận PNG, JPG hoặc WebP hợp lệ.', [], 415);
    let png: Buffer;
    try {
      const image = sharp(request.body, { limitInputPixels: 16000000, failOn: 'warning' });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) throw new Error('invalid image');
      png = await image.png().toBuffer();
      if (png.length > MAX_TEAM_LOGO_BYTES) throw new Error('image too large');
    } catch { throw new DomainError('INVALID_IMAGE', 'Ảnh lỗi, ảnh động hoặc vượt giới hạn.', [], 415); }
    let name = 'sponsor-logo';
    try { name = decodeURIComponent(String(request.headers['x-file-name'] ?? name)); } catch { /* safe default */ }
    const fileName = buildTeamLogoFilename(name, 'png', randomUUID().slice(0, 8));
    await writeFile(path.join(logoRoot, fileName), png, { flag: 'wx' });
    return { asset: { name: fileName, url: `/sponsor-uploads/${fileName}`, source: 'uploaded' } };
  });
  app.post('/api/sponsors', async request => {
    if (!validSponsorSettings(request.body)) throw new DomainError('INVALID_SPONSORS', 'Danh sách logo hoặc thời gian không hợp lệ.', [], 400);
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
