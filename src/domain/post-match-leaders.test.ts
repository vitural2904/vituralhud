import { describe, expect, it } from "vitest";
import { createPostMatchData } from "./state";
import { getMatchLeaders } from "./post-match-leaders";

describe("match leaders", () => {
  it("selects kills, assists and objective damage leaders across both teams", () => {
    const leaders = getMatchLeaders(createPostMatchData());

    expect(leaders.kills).toMatchObject({ side: "blue", index: 0, player: { kills: 12, largestKillingSpree: 8 } });
    expect(leaders.assists).toMatchObject({ side: "blue", index: 1, player: { assists: 18 } });
    expect(leaders.damageToObjectives).toMatchObject({ side: "red", index: 1, player: { damageToObjectives: 31_400 } });
  });

  it("uses kills and assists as deterministic tie breakers", () => {
    const data = createPostMatchData();
    data.teams.blue.players[0].assists = 20;
    data.teams.red.players[0].assists = 20;
    data.teams.red.players[0].kills = 13;

    expect(getMatchLeaders(data).assists).toMatchObject({ side: "red", index: 0 });
  });
});
