import catalog from './item-data.json';
import { championAssetVersion } from './catalog';

type ItemCatalog = { version: string | null; assetRoot: string | null; items: Record<string, { name: string; image: string }> };
const data: ItemCatalog = catalog;

// Uncatalogued items can appear after a patch. Keep the ID visible if both images fail.
export function itemAsset(id: number) {
  const item = data.items[String(id)];
  const remote = `https://ddragon.leagueoflegends.com/cdn/${data.version ?? championAssetVersion}/img/item/${item?.image ?? `${id}.png`}`;
  return { name: item?.name, local: item && data.assetRoot ? `${data.assetRoot}/${item.image}` : null, remote };
}
