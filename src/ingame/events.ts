/** Live Client Data events. Unknown event kinds and malformed records are ignored. */
export type Notice = { id: number; time: number; kind: 'kill' | 'turret' | 'dragon' | 'baron' | 'herald' | 'horde' | 'inhibitor'; killer: string; victim?: string; dragon?: string; dragonType?: string; stolen?: boolean };
export type EventCursor = { lastId: number; gameTime: number | null } | null;

const labels: Record<string, string> = { fire: 'Rồng Lửa', earth: 'Rồng Đất', water: 'Rồng Nước', air: 'Rồng Gió', hextech: 'Rồng Công Nghệ', chemtech: 'Rồng Hóa Kỹ', elder: 'Rồng Ngàn Tuổi' };
const name = (v: unknown) => typeof v === 'string' ? v.trim().slice(0, 100) : '';
export function parseNotice(raw: Record<string, unknown>): Notice | null {
  const id = raw.EventID; const time = raw.EventTime;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0 || typeof time !== 'number' || !Number.isFinite(time) || time < 0) return null;
  const killer = name(raw.KillerName);
  const stolen = raw.Stolen === true || (typeof raw.Stolen === 'string' && raw.Stolen.toLowerCase() === 'true');
  switch (raw.EventName) {
    case 'ChampionKill': {
      const victim = name(raw.VictimName);
      return victim ? { id, time, kind: 'kill', killer, victim } : null;
    }
    case 'TurretKilled': return { id, time, kind: 'turret', killer };
    case 'InhibKilled': return { id, time, kind: 'inhibitor', killer };
    case 'DragonKill': {
      const type = name(raw.DragonType).toLowerCase();
      return { id, time, kind: 'dragon', killer, dragon: labels[type] ?? 'Rồng', dragonType: labels[type] ? type : undefined, stolen };
    }
    case 'BaronKill': return { id, time, kind: 'baron', killer, stolen };
    case 'HeraldKill': return { id, time, kind: 'herald', killer, stolen };
    case 'HordeKill': return { id, time, kind: 'horde', killer, stolen };
    default: return null;
  }
}

/** First frame, reconnect, and game-clock rollback establish a baseline, not a replay. */
export function advanceEvents(cursor: EventCursor, connected: boolean, gameTime: number | null, events: Record<string, unknown>[]): { cursor: EventCursor; notices: Notice[]; reset: boolean } {
  if (!connected) return { cursor: null, notices: [], reset: true };
  const ids = events.map(event => event.EventID).filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id >= 0);
  const lastId = ids.reduce((highest, id) => Math.max(highest, id), -1);
  const rollback = cursor !== null && gameTime !== null && cursor.gameTime !== null && gameTime + 2 < cursor.gameTime;
  if (!cursor || rollback) return { cursor: { lastId, gameTime }, notices: [], reset: true };
  const notices = events.flatMap(event => {
    const parsed = parseNotice(event);
    return parsed && parsed.id > cursor.lastId ? [parsed] : [];
  }).sort((a, b) => a.id - b.id).filter((item, index, all) => index === 0 || all[index - 1].id !== item.id);
  return { cursor: { lastId: Math.max(lastId, cursor.lastId), gameTime }, notices, reset: false };
}
