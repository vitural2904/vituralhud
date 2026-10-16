import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeChampSelectSession } from "./normalize";

async function fixture(name: string) {
  return JSON.parse(await readFile(path.resolve("fixtures/lcu", name), "utf8")) as unknown;
}

describe("LCU champ-select normalization", () => {
  it.each(['pick', 'ban'])('keeps both teams visible in tournament spectator %s actions', type => {
    const result = normalizeChampSelectSession({
      isSpectating: true, localPlayerCellId: -1,
      blueTeam: [{ cellId: 0 }], redTeam: [{ cellId: 5 }],
      actions: [[
        { type, actorCellId: 0, championId: 266, completed: false, isInProgress: true },
        { type, actorCellId: 5, championId: 22, completed: false },
      ]],
    });
    expect(result.sessionKind).toBe('spectator');
    const blue = result.snapshot!.teams.blue, red = result.snapshot!.teams.red;
    if (type === 'pick') {
      expect(blue.picks[0]).toMatchObject({ championId: 'Aatrox', locked: false });
      expect(red.picks[0]).toMatchObject({ championId: 'Ashe', locked: false });
    } else {
      expect(blue.bans[0]).toBe('Aatrox'); expect(blue.banLocked?.[0]).toBe(false);
      expect(red.bans[0]).toBe('Ashe'); expect(red.banLocked?.[0]).toBe(false);
    }
  });
  it('distinguishes hovered and completed bans without moving skipped or future slots', () => {
    const raw = {
      blueTeam: [{ cellId: 0 }], redTeam: [{ cellId: 5 }],
      actions: [
        [{ type: 'ban', actorCellId: 0, championId: 0, completed: true, isInProgress: false }],
        [{ type: 'ban', actorCellId: 0, championId: 266, completed: false, isInProgress: true }],
        [{ type: 'ban', actorCellId: 0, championId: 0, completed: false, isInProgress: false }],
      ],
    };
    const hover = normalizeChampSelectSession(raw).snapshot!;
    expect(hover.teams.blue.bans).toEqual([null, 'Aatrox', null, null, null]);
    expect(hover.teams.blue.banLocked).toEqual([true, false, false, false, false]);
    raw.actions[1][0].completed = true;
    raw.actions[1][0].isInProgress = false;
    const locked = normalizeChampSelectSession(raw).snapshot!;
    expect(locked.teams.blue.bans).toEqual(hover.teams.blue.bans);
    expect(locked.teams.blue.banLocked).toEqual([true, true, false, false, false]);
  });
  it('F16 preserves a skipped ban slot before the next champion', () => {
    const result = normalizeChampSelectSession({ blueTeam: [{ cellId: 0 }], redTeam: [{ cellId: 5 }], actions: [[{ type: 'ban', actorCellId: 0, championId: 0, completed: true }], [{ type: 'ban', actorCellId: 0, championId: 266, completed: true }]] });
    expect(result.snapshot?.teams.blue.bans.slice(0, 2)).toEqual([null, 'Aatrox']);
  });
  it("maps a spectator feed by explicit Blue and Red teams", async () => {
    const result = normalizeChampSelectSession(
      await fixture("spectator-champ-select-session.json"),
      "2026-08-23T00:00:00.000Z",
    );
    expect(result.sessionKind).toBe("spectator");
    expect(result.warnings).toEqual([]);
    expect(result.snapshot?.feedId).toBe("99887766");
    expect(result.snapshot?.phase).toBe("pick-1");
    expect(result.snapshot?.activeSide).toBe("blue");
    expect(result.snapshot?.timerMs).toBe(27_450);
    expect(result.snapshot?.teams.blue.bans[0]).toBe("Khazix");
    expect(result.snapshot?.teams.red.bans[0]).toBe("Renekton");
    expect(result.snapshot?.teams.blue.picks[0]).toMatchObject({ championId: "Aatrox", locked: true, player: "Kiên" });
    expect(result.snapshot?.teams.blue.picks[1]).toMatchObject({ championId: "Ryze", locked: false, player: "Rừng" });
    expect(result.snapshot?.teams.red.picks[0]).toMatchObject({ championId: "Syndra", locked: true });
  });

  it("maps player perspective only when team IDs are explicit", async () => {
    const result = normalizeChampSelectSession(await fixture("player-perspective-session.json"));
    expect(result.sessionKind).toBe("player");
    expect(result.snapshot?.activeSide).toBe("blue");
    expect(result.snapshot?.teams.blue.picks[0].championId).toBe("Aatrox");
  });

  it("refuses to guess Blue and Red from myTeam and theirTeam", () => {
    const result = normalizeChampSelectSession({
      localPlayerCellId: -1,
      myTeam: [{ cellId: 0 }],
      theirTeam: [{ cellId: 5 }],
      actions: [],
    });
    expect(result.snapshot).toBeNull();
    expect(result.warnings[0]).toContain("Không đoán side");
  });
});
