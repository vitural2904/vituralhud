import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function updateChampionAssets({ root = path.resolve(import.meta.dirname, '..'), version, force = false, fetchImpl = fetch } = {}) {
  const request = async url => {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'VirtualHUD-AssetFetcher/1.2' } });
    if (!response.ok) throw new Error(`Asset HTTP ${response.status}: ${url}`);
    return response;
  };
  version ??= (await (await request('https://ddragon.leagueoflegends.com/api/versions.json')).json())[0];
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid Data Dragon version');
  const locale = 'vi_VN';
  const payload = await (await request(`https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion.json`)).json();
  const champions = Object.values(payload.data ?? {}).map(item => ({ id: item.id, numericId: Number(item.key), name: item.name })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  if (!champions.length || champions.some(item => !/^[A-Za-z0-9]+$/.test(item.id) || !Number.isSafeInteger(item.numericId) || item.numericId <= 0 || typeof item.name !== 'string') || new Set(champions.map(item => item.id)).size !== champions.length) throw new Error('Invalid champion catalog');
  const versionRoot = path.join(root, 'public', 'champions', 'versions', version);
  const manifestPath = path.join(versionRoot, 'manifest.json');
  const manifest = await readFile(manifestPath, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT' || error instanceof SyntaxError) return {}; throw error; });
  const staging = path.join(root, '.codex-local', `asset-stage-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  const generation = randomUUID();
  let downloaded = 0; let cached = 0;
  const hashes = {};
  const validImage = async bytes => { await sharp(bytes, { limitInputPixels: 16000000, failOn: 'warning' }).raw().toBuffer(); };
  const tasks = champions.flatMap(champion => [
    { file: `icons/${champion.id}.png`, url: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.id}.png` },
    { file: `loading/${champion.id}.jpg`, url: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg` },
  ]);
  // Write a fresh generation. The currently published catalog remains usable on failure.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(8, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++]; let bytes;
      if (!force && manifest.generation && manifest.hashes?.[task.file]) {
        const previous = path.join(versionRoot, manifest.generation, task.file);
        bytes = await readFile(previous).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
        if (bytes && digest(bytes) === manifest.hashes[task.file]) {
          try { await validImage(bytes); cached++; } catch { bytes = undefined; }
        } else bytes = undefined;
      }
      if (!bytes) { bytes = Buffer.from(await (await request(task.url)).arrayBuffer()); await validImage(bytes); downloaded++; }
      hashes[task.file] = digest(bytes);
      const destination = path.join(staging, task.file); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes);
    }
  }));
  await mkdir(versionRoot, { recursive: true });
  await rename(staging, path.join(versionRoot, generation));
  const nextManifest = `${JSON.stringify({ version, generation, hashes }, null, 2)}\n`;
  const manifestTemp = `${manifestPath}.${generation}.tmp`; await writeFile(manifestTemp, nextManifest); await rename(manifestTemp, manifestPath);
  const catalogPath = path.join(root, 'src', 'domain', 'champion-data.json'); await mkdir(path.dirname(catalogPath), { recursive: true });
  const catalogTemp = `${catalogPath}.${generation}.tmp`;
  await writeFile(catalogTemp, `${JSON.stringify({ version, locale, assetRoot: `/champions/versions/${version}/${generation}`, champions }, null, 2)}\n`);
  await rename(catalogTemp, catalogPath);
  return { version, champions: champions.length, downloaded, cached };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) updateChampionAssets({ version: process.env.DDRAGON_VERSION, force: process.argv.includes('--force') }).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
