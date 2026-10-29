import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error executable JavaScript
import { updateItemAssets } from './fetch-item-assets.mjs';

const directories: string[] = [];
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });

describe('item assets', () => {
  it('publishes a complete version, reuses verified files and keeps the old catalog on failure', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vituralhud-items-')); directories.push(root);
    const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'blue' } }).png().toBuffer();
    let broken = false;
    const fetchImpl = async (url: string) => url.endsWith('/item.json')
      ? new Response(JSON.stringify({ data: { '1001': { name: 'Boots', image: { full: '1001.png' } }, '2003': { name: 'Potion', image: { full: '2003.png' } } } }))
      : new Response(broken ? Buffer.from('bad') : image);
    const options = { root, version: '16.16.1', fetchImpl };
    expect(await updateItemAssets(options)).toMatchObject({ items: 2, downloaded: 2 });
    expect(await updateItemAssets(options)).toMatchObject({ cached: 2, downloaded: 0 });
    const catalogPath = path.join(root, 'src/domain/item-data.json');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    expect(catalog.items['1001']).toEqual({ name: 'Boots', image: '1001.png' });
    await writeFile(path.join(root, 'public', catalog.assetRoot, '1001.png'), 'corrupt');
    expect(await updateItemAssets(options)).toMatchObject({ downloaded: 1, cached: 1 });
    const before = await readFile(catalogPath, 'utf8'); broken = true;
    await expect(updateItemAssets({ ...options, version: '16.17.1' })).rejects.toThrow();
    expect(await readFile(catalogPath, 'utf8')).toEqual(before);
  });
});
