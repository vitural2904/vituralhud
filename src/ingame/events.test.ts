import { describe, expect, it } from 'vitest';
import { advanceEvents, parseNotice } from './events';

const event = (id: number, kind = 'ChampionKill') => ({ EventID: id, EventTime: id * 10, EventName: kind, KillerName: 'Alice', VictimName: 'Bob' });

describe('live event notices', () => {
  it('parses known events and never invents an unknown dragon type', () => {
    expect(parseNotice({ ...event(2, 'DragonKill'), DragonType: 'Earth' })).toMatchObject({ kind: 'dragon', dragon: 'Rồng Đất' });
    expect(parseNotice({ ...event(2, 'DragonKill'), DragonType: 'Elder' })).toMatchObject({ dragon: 'Rồng Ngàn Tuổi' });
    expect(parseNotice({ ...event(2, 'BaronKill'), Stolen: 'True' })).toMatchObject({ stolen: true });
    expect(parseNotice({ ...event(2, 'BaronKill'), Stolen: 'False' })).toMatchObject({ stolen: false });
    expect(parseNotice({ ...event(2, 'DragonKill'), DragonType: 'NewDragon' })).toMatchObject({ dragon: 'Rồng' });
    expect(parseNotice(event(3, 'TurretKilled'))).toMatchObject({ kind: 'turret' });
    expect(parseNotice(event(3, 'BaronKill'))).toMatchObject({ kind: 'baron' });
    expect(parseNotice({ ...event(3), VictimName: '' })).toBeNull();
    expect(parseNotice(event(3, 'FirstBlood'))).toBeNull();
  });
  it('baselines historical events, delivers new ids once, and clears on reconnect or new game', () => {
    const first = advanceEvents(null, true, 40, [event(1), event(2)]);
    expect(first.notices).toEqual([]);
    const next = advanceEvents(first.cursor, true, 50, [event(1), event(2), event(3), event(3)]);
    expect(next.notices.map(n => n.id)).toEqual([3]);
    expect(advanceEvents(next.cursor, true, 51, [event(1), event(2), event(3)]).notices).toEqual([]);
    const disconnected = advanceEvents(next.cursor, false, null, []);
    expect(disconnected.cursor).toBeNull();
    expect(advanceEvents(disconnected.cursor, true, 55, [event(1), event(2), event(3), event(4)]).notices).toEqual([]);
    const newGame = advanceEvents(next.cursor, true, 1, [event(0, 'GameStart')]);
    expect(newGame.reset).toBe(true);
    expect(advanceEvents(newGame.cursor, true, 12, [event(0, 'GameStart'), event(1)]).notices.map(n => n.id)).toEqual([1]);
  });
});
