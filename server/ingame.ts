import https from 'node:https';

export type IngamePlayer = {
  side: 'blue' | 'red'; name: string; championName: string; aliases?: string[];
  level: number | null; kills: number | null; deaths: number | null; assists: number | null;
  cs: number | null; items: { id: number; count: number; slot: number | null }[];
  summonerSpells: { name: string; icon: string }[];
  isDead: boolean | null; respawnTimer: number | null;
};
export type IngameFeed = {
  connected: boolean; observedAt: string | null; gameTime: number | null;
  players: IngamePlayer[]; events: Record<string, unknown>[];
};

export function offlineIngame(): IngameFeed {
  return { connected: false, observedAt: null, gameTime: null, players: [], events: [] };
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const str = (v: unknown): string => typeof v === 'string' ? v : '';
const spellIcons: Record<string, string> = Object.fromEntries(['SummonerBarrier', 'SummonerBoost', 'SummonerDot', 'SummonerExhaust', 'SummonerFlash', 'SummonerHaste', 'SummonerHeal', 'SummonerSmite', 'SummonerSnowball', 'SummonerTeleport'].map(id => [id, id]));
spellIcons.SummonerFlashPerksHextechFlashtraptionV2 = 'Hexflash';
const normalizeSpell = (value: unknown) => {
  const spell = record(value);
  const id = /^GeneratedTip_SummonerSpell_([A-Za-z0-9]+)_DisplayName$/.exec(str(spell.rawDisplayName))?.[1];
  const icon = id && Object.hasOwn(spellIcons, id) ? `/summoner-spells/${spellIcons[id]}.png` : '';
  return { name: str(spell.displayName).slice(0, 100), icon };
};
// The display name is localized. Riot's raw key contains the internal champion name.
const championName = (raw: unknown, display: unknown): string => {
  const match = /^game_character_displayname_([a-z0-9]+)$/i.exec(str(raw));
  return match?.[1] ?? str(display);
};

export function normalizeIngame(input: unknown, observedAt = new Date().toISOString()): IngameFeed {
  const root = record(input);
  if (!Array.isArray(root.allPlayers) || !root.gameData || typeof root.gameData !== 'object') throw new Error('Invalid game data');
  const players: IngamePlayer[] = [];
  for (const raw of root.allPlayers) {
    const p = record(raw); const scores = record(p.scores);
    if (p.team !== 'ORDER' && p.team !== 'CHAOS') continue;
    const items = Array.isArray(p.items) ? p.items.flatMap(rawItem => {
      const item = record(rawItem); const id = num(item.itemID);
      const slot = num(item.slot);
      return id === null ? [] : [{ id, count: num(item.count) ?? 1, slot: slot !== null && Number.isInteger(slot) && slot <= 6 ? slot : null }];
    }) : [];
    const spells = record(p.summonerSpells);
    const summonerSpells = [spells.summonerSpellOne, spells.summonerSpellTwo].map(normalizeSpell);
    players.push({ side: p.team === 'ORDER' ? 'blue' : 'red', name: str(p.riotIdGameName) || str(p.summonerName) || str(p.riotId), aliases: [...new Set([str(p.riotId), str(p.riotIdGameName), str(p.summonerName)].filter(Boolean))], championName: championName(p.rawChampionName, p.championName), level: num(p.level), kills: num(scores.kills), deaths: num(scores.deaths), assists: num(scores.assists), cs: num(scores.creepScore), items, summonerSpells, isDead: typeof p.isDead === 'boolean' ? p.isDead : null, respawnTimer: num(p.respawnTimer) });
  }
  const rawEvents = record(root.events).Events;
  return { connected: true, observedAt, gameTime: num(record(root.gameData).gameTime), players, events: Array.isArray(rawEvents) ? rawEvents.map(record) : [] };
}

// The game API uses Riot's local self-signed certificate. Never apply this setting to other hosts.
export function readGameClient(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = https.get({ hostname: '127.0.0.1', port: 2999, path: '/liveclientdata/allgamedata', rejectUnauthorized: false, timeout: 1500 }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Game API unavailable')); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 2_000_000) request.destroy(new Error('Game response too large')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); } });
    });
    request.on('timeout', () => request.destroy(new Error('Game API timeout')));
    request.on('error', reject);
  });
}

export function startIngameFeed(read = readGameClient, pollMs = 100) {
  let current = offlineIngame(); let stopped = false; let timer: NodeJS.Timeout | undefined;
  const listeners = new Set<(feed: IngameFeed) => void>();
  const poll = async () => {
    const wasConnected = current.connected;
    try { const next = normalizeIngame(await read()); if (!stopped) current = next; }
    catch { if (!stopped) current = offlineIngame(); }
    if (!stopped) { if (current.connected || wasConnected) for (const listener of listeners) listener(current); timer = setTimeout(poll, pollMs); timer.unref(); }
  };
  void poll();
  return { get: () => current, subscribe: (listener: (feed: IngameFeed) => void) => { listeners.add(listener); return () => listeners.delete(listener); }, stop: () => { stopped = true; if (timer) clearTimeout(timer); listeners.clear(); } };
}
