import { describe, expect, it } from "vitest";
import { collectMatchV5MissingFields, collectMatchV5Warnings, fetchMatchV5, normalizeMatchV5, regionalRouteForMatch } from "./match-v5";

describe("Match-V5 normalizer", () => {
  it('F17 maps numeric Wukong and case-insensitive champion names; flags unknown duration', () => {
    const match = { info: { gameDuration: 900000, participants: [{ teamId: 100, championId: 62, championName: 'Wukong' }, { teamId: 200, championName: 'annie' }], teams: [{ teamId: 100, win: true }, { teamId: 200, win: false }] } };
    const data = normalizeMatchV5(match); expect(data.teams.blue.players[0].championId).toBe('MonkeyKing'); expect(data.teams.red.players[0].championId).toBe('Annie');
    expect(data.durationSeconds).toBe(0); expect(collectMatchV5MissingFields(match)).toContain('durationSeconds');
  });
  it("builds the broadcast model and derives team gold", () => {
    const participants = Array.from({ length: 10 }, (_, index) => ({
      participantId: index + 1,
      teamId: index < 5 ? 100 : 200,
      kills: index < 5 ? 2 : 1,
      assists: 10 + index,
      largestKillingSpree: 3 + index,
      goldEarned: index < 5 ? 10_000 : 9_000,
      totalDamageDealtToChampions: 12_000 + index,
      damageDealtToObjectives: 5_000 + index,
      championName: index === 0 ? "Ashe" : "Annie",
      riotIdGameName: `Player ${index + 1}`,
      teamPosition: ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][index % 5],
    }));
    const objective = (kills: number, first = false) => ({ kills, first });
    const data = normalizeMatchV5({
      info: {
        gameDuration: 1_986,
        participants,
        teams: [
          { teamId: 100, win: true, objectives: { tower: objective(9, true), dragon: objective(4), baron: objective(2), inhibitor: objective(2), horde: objective(5), riftHerald: objective(0) } },
          { teamId: 200, win: false, objectives: { tower: objective(2), dragon: objective(0), baron: objective(0), inhibitor: objective(0), horde: objective(1), riftHerald: objective(0) } },
        ],
      },
    });

    expect(data.winner).toBe("blue");
    expect(data.earlyObjective).toBe("voidGrubs");
    expect(data.teams.blue).toMatchObject({ kills: 10, gold: 50_000, towers: 9, dragons: 4, barons: 2, inhibitors: 2, voidGrubs: 5 });
    expect(data.teams.blue.players[0]).toMatchObject({
      player: "Player 1",
      championId: "Ashe",
      damageToChampions: 12_000,
      kills: 2,
      assists: 10,
      largestKillingSpree: 3,
      damageToObjectives: 5_000,
    });
  });

  it("falls back to Rift Herald for older objective contracts", () => {
    const data = normalizeMatchV5({ info: {
      gameDuration: 900_000,
      gameVersion: '11.19.1',
      participants: [{ participantId: 1, teamId: 100 }, { participantId: 6, teamId: 200 }],
      teams: [
        { teamId: 100, win: false, objectives: { tower: { kills: 0 }, riftHerald: { kills: 1 } } },
        { teamId: 200, win: true, objectives: { tower: { kills: 1, first: true }, riftHerald: { kills: 0 } } },
      ],
    } });
    expect(data.durationSeconds).toBe(900);
    expect(data.earlyObjective).toBe("riftHeralds");
  });

  it("shows Rift Herald when a modern match has no Void Grub kills", () => {
    const data = normalizeMatchV5({ info: {
      gameDuration: 1_200,
      participants: [{ participantId: 1, teamId: 100 }, { participantId: 6, teamId: 200 }],
      teams: [
        { teamId: 100, win: true, objectives: { horde: { kills: 0 }, riftHerald: { kills: 1 } } },
        { teamId: 200, win: false, objectives: { horde: { kills: 0 }, riftHerald: { kills: 0 } } },
      ],
    } });
    expect(data.earlyObjective).toBe("riftHeralds");
  });

  it("routes Vietnam matches through SEA", () => {
    expect(regionalRouteForMatch("VN2_123")).toBe("sea");
    expect(regionalRouteForMatch("KR_123")).toBe("asia");
    expect(regionalRouteForMatch("EUW1_123")).toBe("europe");
  });

  it("fetches only the Match-V5 summary", async () => {
    const calls: string[] = [];
    const payload = {
      metadata: { matchId: "VN2_123" },
      info: {
        gameDuration: 1_200,
        participants: [
          { participantId: 1, teamId: 100, kills: 1, championName: "Ashe" },
          { participantId: 6, teamId: 200, kills: 0, championName: "Annie" },
        ],
        teams: [
          { teamId: 100, win: true, objectives: {} },
          { teamId: 200, win: false, objectives: {} },
        ],
      },
    };
    const result = await fetchMatchV5("VN2_123", {
      apiKey: "test-key",
      fetchImpl: async (url) => {
        calls.push(String(url));
        return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    expect(calls).toEqual(["https://sea.api.riotgames.com/lol/match/v5/matches/VN2_123"]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns about missing values while the normalizer keeps zero fallbacks", () => {
    const match = { info: {
      participants: [
        { participantId: 1, teamId: 100, championName: "Ashe" },
        { participantId: 6, teamId: 200, championName: "Annie" },
      ],
      teams: [
        { teamId: 100, win: true, objectives: {} },
        { teamId: 200, win: false, objectives: {} },
      ],
    } };
    const warnings = collectMatchV5Warnings(match);
    const data = normalizeMatchV5(match);

    expect(warnings.some((warning) => warning.includes("xác nhận số 0"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("damage mục tiêu"))).toBe(true);
    expect(data.teams.blue.dragons).toBe(0);
    expect(data.teams.red.barons).toBe(0);
    expect(data.teams.blue.players[0].damageToObjectives).toBe(0);
  });
});
