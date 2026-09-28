import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
// Script exports allow tests to use a sandbox and fake network/install calls.
// @ts-expect-error executable JavaScript
import { updateChampionAssets } from './fetch-champion-assets.mjs';
// @ts-expect-error executable JavaScript
import { verifyDependencies, validateHealth } from './launch.mjs';
const directories: string[] = [];
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });
const temporary = async () => { const root = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-assets-')); directories.push(root); return root; };
describe('F22 asset publication', () => {
  it('uses versioned hashes, repairs corruption, honors force and preserves catalog after failure', async () => {
    const root = await temporary(); const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'blue' } }).png().toBuffer();
    let downloads = 0; let broken = false;
    const fetchImpl = async (url: string) => {
      if (url.endsWith('/champion.json')) return new Response(JSON.stringify({ data: { Ashe: { id: 'Ashe', key: '22', name: 'Ashe' } } }));
      downloads++; return new Response(broken ? Buffer.from('broken image') : image);
    };
    const options = { root, version: '16.16.1', fetchImpl };
    expect((await updateChampionAssets(options)).downloaded).toBe(2);
    expect((await updateChampionAssets(options)).cached).toBe(2); expect(downloads).toBe(2);
    const catalogPath = path.join(root, 'src/domain/champion-data.json');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    await writeFile(path.join(root, 'public', catalog.assetRoot, 'icons/Ashe.png'), 'bad cached bytes');
    expect((await updateChampionAssets(options)).downloaded).toBe(1);
    expect((await updateChampionAssets({ ...options, force: true })).downloaded).toBe(2);
    const before = await readFile(catalogPath, 'utf8'); broken = true;
    await expect(updateChampionAssets({ ...options, version: '16.17.1' })).rejects.toThrow();
    expect(await readFile(catalogPath, 'utf8')).toBe(before);
  });
});
describe('F23 launcher dependencies', () => {
  it('requires the user to install missing or outdated dependencies', async () => {
    const root = await temporary(); const pkg = { dependencies: { example: '1.0.0' } };
    const lock = { packages: { 'node_modules/example': { version: '1.0.0' } }, marker: 'a' };
    await writeFile(path.join(root, 'package.json'), JSON.stringify(pkg)); await writeFile(path.join(root, 'package-lock.json'), JSON.stringify(lock));
    await expect(verifyDependencies(root)).rejects.toThrow('npm ci');
    await mkdir(path.join(root, 'node_modules/example'), { recursive: true });
    await writeFile(path.join(root, 'node_modules/example/package.json'), JSON.stringify({ version: '1.0.0' }));
    expect(await verifyDependencies(root)).toBe(true);
    await writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/example': { version: '2.0.0' } } }));
    await expect(verifyDependencies(root)).rejects.toThrow('npm ci');
    expect(JSON.parse(await readFile(path.join(root, 'node_modules/example/package.json'), 'utf8')).version).toBe('1.0.0');
  });
  it('rejects a foreign app or old version occupying the launcher port', () => {
    expect(() => validateHealth({ app: 'other', version: '1.2.0', ok: true }, '1.2.0')).toThrow();
    expect(() => validateHealth({ app: 'virtualhud-lol', version: '1.1.0', ok: true }, '1.2.0')).toThrow();
    expect(validateHealth({ app: 'virtualhud-lol', version: '1.2.0', ok: true }, '1.2.0').ok).toBe(true);
  });
});
