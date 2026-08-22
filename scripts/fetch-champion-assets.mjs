import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const iconDir = path.join(root, "public", "champions", "icons");
const loadingDir = path.join(root, "public", "champions", "loading");
const catalogPath = path.join(root, "src", "domain", "champion-data.json");
const locale = "vi_VN";

await Promise.all([mkdir(iconDir, { recursive: true }), mkdir(loadingDir, { recursive: true })]);

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "VirtualHUD-AssetFetcher/1.0" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const versions = await fetchJson("https://ddragon.leagueoflegends.com/api/versions.json");
const version = process.env.DDRAGON_VERSION || versions[0];
const data = await fetchJson(
  `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion.json`,
);

const champions = Object.values(data.data)
  .map((item) => ({ id: item.id, numericId: Number(item.key), name: item.name }))
  .sort((a, b) => a.name.localeCompare(b.name, "vi"));

await writeFile(
  catalogPath,
  `${JSON.stringify({ version, locale, champions }, null, 2)}\n`,
  "utf8",
);

async function isReady(file) {
  try {
    return (await stat(file)).size > 1_000;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  if (await isReady(destination)) return "cached";
  const response = await fetch(url, { headers: { "user-agent": "VirtualHUD-AssetFetcher/1.0" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1_000) throw new Error(`Asset too small: ${url}`);
  const temp = `${destination}.part`;
  await writeFile(temp, bytes);
  await rename(temp, destination);
  return "downloaded";
}

const tasks = champions.flatMap((champion) => [
  {
    url: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.id}.png`,
    destination: path.join(iconDir, `${champion.id}.png`),
  },
  {
    url: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`,
    destination: path.join(loadingDir, `${champion.id}.jpg`),
  },
]);

let cursor = 0;
let downloaded = 0;
let cached = 0;

async function worker() {
  while (cursor < tasks.length) {
    const task = tasks[cursor++];
    const result = await download(task.url, task.destination);
    if (result === "downloaded") downloaded += 1;
    else cached += 1;
  }
}

await Promise.all(Array.from({ length: 12 }, worker));

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
console.log(
  JSON.stringify({ version: catalog.version, champions: champions.length, downloaded, cached }, null, 2),
);
