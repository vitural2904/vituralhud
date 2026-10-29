import { describe, expect, it, vi } from 'vitest';
import { normalizeIngame, offlineIngame, startIngameFeed } from './ingame';

const frame = { gameData: { gameTime: 93 }, allPlayers: [
  { team: 'ORDER', riotIdGameName: 'Caster', championName: 'Jinx', level: 4, scores: { kills: 2, deaths: 1, assists: 3, creepScore: 20 }, items: [{ itemID: 1001, count: 1, slot: 4 }, { itemID: 3364, slot: 6 }, { itemID: 2003, slot: 9 }], isDead: false, respawnTimer: 0 },
  { team: 'CHAOS', championName: 'Ahri', scores: {} },
], events: { Events: [{ EventName: 'ChampionKill', EventID: 1 }] } };

describe('spectator game feed', () => {
  it('maps teams and preserves unavailable fields rather than inventing zeros', () => {
    const data = normalizeIngame(frame, 'now');
    expect(data).toMatchObject({ connected: true, observedAt: 'now', gameTime: 93, players: [
      { side: 'blue', name: 'Caster', championName: 'Jinx', level: 4, kills: 2, deaths: 1, assists: 3, cs: 20, items: [{ id: 1001, count: 1, slot: 4 }, { id: 3364, count: 1, slot: 6 }, { id: 2003, count: 1, slot: null }] },
      { side: 'red', championName: 'Ahri', level: null, kills: null, cs: null },
    ], events: [{ EventName: 'ChampionKill', EventID: 1 }] });
    expect(() => normalizeIngame({})).toThrow();
  });
  it('uses the language-independent raw champion key when present', () => {
    const data = normalizeIngame({ gameData: {}, allPlayers: [
      { team: 'ORDER', championName: 'Ngộ Không', rawChampionName: 'game_character_displayname_MonkeyKing' },
      { team: 'CHAOS', championName: 'Ahri', rawChampionName: 'unexpected' },
    ] });
    expect(data.players.map(player => player.championName)).toEqual(['MonkeyKing', 'Ahri']);
  });
  it('maps spell names and safe local icons without inventing cooldowns', () => {
    const data = normalizeIngame({ gameData: {}, allPlayers: [{ team: 'ORDER', summonerSpells: {
      summonerSpellOne: { displayName: 'Tốc Biến', rawDisplayName: 'GeneratedTip_SummonerSpell_SummonerFlash_DisplayName' },
      summonerSpellTwo: { displayName: 'Hexflash', rawDisplayName: 'GeneratedTip_SummonerSpell_SummonerFlashPerksHextechFlashtraptionV2_DisplayName' },
    } }, { team: 'CHAOS', summonerSpells: { summonerSpellOne: { displayName: 'Unknown', rawDisplayName: '../unsafe' } } }] });
    expect(data.players[0].summonerSpells).toEqual([{ name: 'Tốc Biến', icon: '/summoner-spells/SummonerFlash.png' }, { name: 'Hexflash', icon: '/summoner-spells/Hexflash.png' }]);
    expect(data.players[1].summonerSpells).toEqual([{ name: 'Unknown', icon: '' }, { name: '', icon: '' }]);
  });
  it('clears the previous game on disconnect and stops polling', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValueOnce(frame).mockRejectedValue(new Error('offline'));
    const feed = startIngameFeed(read, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(feed.get().connected).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(feed.get()).toEqual(offlineIngame());
    feed.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(read).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
  it('pushes fresh frames and disconnects to subscribers', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValueOnce(frame).mockRejectedValue(new Error('offline'));
    const feed = startIngameFeed(read, 100);
    const listener = vi.fn(); const unsubscribe = feed.subscribe(listener);
    await vi.advanceTimersByTimeAsync(0);
    expect(listener.mock.calls[0][0].connected).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(listener.mock.calls[1][0].connected).toBe(false);
    unsubscribe(); await vi.advanceTimersByTimeAsync(100);
    expect(listener).toHaveBeenCalledTimes(2);
    feed.stop(); vi.useRealTimers();
  });
});
