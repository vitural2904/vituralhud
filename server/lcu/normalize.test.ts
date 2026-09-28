import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeChampSelectSession } from "./normalize";

async function fixture(name: string) {
  return JSON.parse(await readFile(path.resolve("fixtures/lcu", name), "utf8")) as unknown;
}

describe("LCU champ-select normalization", () => {
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
