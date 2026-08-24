import type { PostMatchData, PostMatchPlayer, PostMatchPlayerMetric, Side } from "./types";

export type MatchLeader = {
  side: Side;
  index: number;
  player: PostMatchPlayer;
};

export type MatchLeaders = {
  kills: MatchLeader;
  assists: MatchLeader;
  damageToObjectives: MatchLeader;
};

const sides: Side[] = ["blue", "red"];

export function getMatchLeaders(data: PostMatchData): MatchLeaders {
  const players = sides.flatMap((side) => data.teams[side].players.map((player, index) => ({ side, index, player })));
  const leaderFor = (metric: PostMatchPlayerMetric) => [...players].sort((a, b) =>
    b.player[metric] - a.player[metric]
    || b.player.kills - a.player.kills
    || b.player.assists - a.player.assists
    || a.index - b.index
    || (a.side === "blue" ? -1 : 1)
  )[0];

  return {
    kills: leaderFor("kills"),
    assists: leaderFor("assists"),
    damageToObjectives: leaderFor("damageToObjectives"),
  };
}
