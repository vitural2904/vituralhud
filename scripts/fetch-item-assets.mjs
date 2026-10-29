import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Publish only complete, validated generations. An interrupted update leaves the old catalog intact.
export async function updateItemAssets({ root = path.resolve(import.meta.dirname, '..'), version, force = false, fetchImpl = fetch } = {}) {
  const request = async url => {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'VituralHUD-ItemAssets/1.0' } });
    if (!response.ok) throw new Error(`Asset HTTP ${response.status}: ${url}`);
    return response;
  };
  version ??= (await (await request('https://ddragon.leagueoflegends.com/api/versions.json')).json())[0];
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid Data Dragon version');
  const payload = await (await request(`https://ddragon.leagueoflegends.com/cdn/${version}/data/vi_VN/item.json`)).json();
  const items = Object.entries(payload.data ?? {}).map(([id, value]) => ({ id, name: value.name, image: value.image?.full }));
  if (!items.length || items.some(item => !/^\d+$/.test(item.id) || typeof item.name !== 'string' || !/^[A-Za-z0-9_-]+\.png$/.test(item.image ?? ''))) throw new Error('Invalid item catalog');
  const files = [...new Set(items.map(item => item.image))];
  const versionRoot = path.join(root, 'public', 'items', 'versions', version);
  const manifestPath = path.join(versionRoot, 'manifest.json');
  const manifest = await readFile(manifestPath, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT' || error instanceof SyntaxError) return {}; throw error; });
  const generation = randomUUID();
  const staging = path.join(root, '.codex-local', `items-stage-${generation}`);
  await mkdir(staging, { recursive: true });
  let cursor = 0; let downloaded = 0; let cached = 0;
  const hashes = {};
  const validImage = async bytes => { await sharp(bytes, { limitInputPixels: 16000000, failOn: 'warning' }).raw().toBuffer(); };
  await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++]; let bytes;
      if (!force && manifest.generation && manifest.hashes?.[file]) {
        bytes = await readFile(path.join(versionRoot, manifest.generation, file)).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
        if (bytes && digest(bytes) === manifest.hashes[file]) {
          try { await validImage(bytes); cached++; } catch { bytes = undefined; }
        } else bytes = undefined;
      }
      if (!bytes) { bytes = Buffer.from(await (await request(`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${file}`)).arrayBuffer()); await validImage(bytes); downloaded++; }
      hashes[file] = digest(bytes); await writeFile(path.join(staging, file), bytes);
    }
  }));
  await mkdir(versionRoot, { recursive: true });
  await rename(staging, path.join(versionRoot, generation));
  const manifestTemp = `${manifestPath}.${generation}.tmp`;
  await writeFile(manifestTemp, `${JSON.stringify({ version, generation, hashes }, null, 2)}\n`); await rename(manifestTemp, manifestPath);
  const catalogPath = path.join(root, 'src', 'domain', 'item-data.json'); await mkdir(path.dirname(catalogPath), { recursive: true });
  const catalogTemp = `${catalogPath}.${generation}.tmp`;
  await writeFile(catalogTemp, `${JSON.stringify({ version, assetRoot: `/items/versions/${version}/${generation}`, items: Object.fromEntries(items.map(item => [item.id, { name: item.name, image: item.image }])) }, null, 2)}\n`);
  await rename(catalogTemp, catalogPath);
  return { version, items: items.length, downloaded, cached };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) updateItemAssets({ version: process.env.DDRAGON_VERSION, force: process.argv.includes('--force') }).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
