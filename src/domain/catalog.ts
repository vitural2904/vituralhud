import championData from "./champion-data.json";
import type { Champion } from "./types";

export const championAssetVersion = championData.version;
const assetRoot = (championData as { assetRoot?: string }).assetRoot ?? '/champions';

export const champions: Champion[] = championData.champions.map((item) => ({
  ...item,
  iconUrl: `${assetRoot}/icons/${item.id}.png`,
  loadingUrl: `${assetRoot}/loading/${item.id}.jpg`,
}));

export const championById: Record<string, Champion> = Object.fromEntries(
  champions.map((item) => [item.id, item]),
);

export const championByNumericId: Record<number, Champion> = Object.fromEntries(
  champions.map((item) => [item.numericId, item]),
);

const normalizeSearch = (value: string) => value
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .replace(/đ/gi, "d")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");

export function searchChampions(query: string, limit = 8): Champion[] {
  const needle = normalizeSearch(query);
  if (!needle) return champions.slice(0, limit);

  return champions
    .filter((champion) => normalizeSearch(`${champion.name} ${champion.id}`).includes(needle))
    .slice(0, limit);
}
