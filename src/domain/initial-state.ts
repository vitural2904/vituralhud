import type {
  BroadcastCommand,
  BroadcastState,
  DraftPhase,
  MatchTeamState,
  PostMatchData,
  PostMatchMetric,
  PostMatchPlayerMetric,
  Side,
} from "./types";
import { postFields } from './fields';

export const players = ["Kiên", "RonOP", "Hữu Trung", "Phước", "Tốc"];
export const bluePicks = ["Ziggs", "Ryze", "LeeSin", "Camille", "JarvanIV"];
export const redPicks = ["Syndra", "Lulu", "Olaf", "Ashe", "Thresh"];

const makeMatchTeam = (side: Side, code: string, name: string, color: string, logoUrl: string): MatchTeamState => ({
  side,
  code,
  name,
  score: 0,
  color,
  logoUrl,
  players: [...players],
});

export function createPostMatchData(state?: Pick<BroadcastState, "match" | "draft">): PostMatchData {
  const picks = state
    ? { blue: state.draft.teams.blue.picks, red: state.draft.teams.red.picks }
    : {
        blue: bluePicks.map((championId) => ({ championId, locked: true })),
        red: redPicks.map((championId) => ({ championId, locked: true })),
      };
  const names = state
    ? { blue: state.match.teams.blue.players, red: state.match.teams.red.players }
    : { blue: players, red: players };
  const blueDamage = [28_100, 12_100, 21_000, 23_500, 31_100];
  const redDamage = [8_100, 5_700, 16_100, 22_600, 3_100];
  const bluePlayerStats = [
    { kills: 12, assists: 5, largestKillingSpree: 8, damageToObjectives: 6_200 },
    { kills: 1, assists: 18, largestKillingSpree: 1, damageToObjectives: 2_500 },
    { kills: 3, assists: 11, largestKillingSpree: 3, damageToObjectives: 24_600 },
    { kills: 2, assists: 8, largestKillingSpree: 2, damageToObjectives: 15_000 },
    { kills: 0, assists: 15, largestKillingSpree: 0, damageToObjectives: 12_000 },
  ];
  const redPlayerStats = [
    { kills: 2, assists: 4, largestKillingSpree: 2, damageToObjectives: 5_100 },
    { kills: 1, assists: 5, largestKillingSpree: 1, damageToObjectives: 31_400 },
    { kills: 1, assists: 3, largestKillingSpree: 1, damageToObjectives: 14_000 },
    { kills: 2, assists: 2, largestKillingSpree: 2, damageToObjectives: 10_800 },
    { kills: 0, assists: 6, largestKillingSpree: 0, damageToObjectives: 3_600 },
  ];

  return {
    winner: "blue",
    durationSeconds: 33 * 60 + 6,
    earlyObjective: "voidGrubs",
    teams: {
      blue: {
        kills: 18,
        gold: 70_500,
        towers: 9,
        dragons: 4,
        barons: 2,
        inhibitors: 2,
        voidGrubs: 5,
        riftHeralds: 0,
        players: picks.blue.map((pick, index) => ({
          player: names.blue[index] || players[index],
          championId: pick.championId ?? bluePicks[index],
          damageToChampions: blueDamage[index],
          ...bluePlayerStats[index],
        })),
      },
      red: {
        kills: 6,
        gold: 59_600,
        towers: 2,
        dragons: 0,
        barons: 0,
        inhibitors: 0,
        voidGrubs: 1,
        riftHeralds: 0,
        players: picks.red.map((pick, index) => ({
          player: names.red[index] || players[index],
          championId: pick.championId ?? redPicks[index],
          damageToChampions: redDamage[index],
          ...redPlayerStats[index],
        })),
      },
    },
  };
}

export function createEmptyPostMatchData(state?: Pick<BroadcastState, "match" | "draft">): PostMatchData {
  const empty = createPostMatchData(state);
  empty.durationSeconds = 0;
  for (const side of ["blue", "red"] as Side[]) {
    for (const metric of ["kills", "gold", "towers", "dragons", "barons", "inhibitors", "voidGrubs", "riftHeralds"] as PostMatchMetric[]) {
      empty.teams[side][metric] = 0;
    }
    for (const player of empty.teams[side].players) {
      player.player = '';
      player.championId = null;
      player.damageToChampions = 0;
      player.kills = 0;
      player.assists = 0;
      player.largestKillingSpree = 0;
      player.damageToObjectives = 0;
    }
  }
  return empty;
}

export function createInitialState(): BroadcastState {
  const draft = {
    phase: "waiting" as DraftPhase,
    timerMs: 27_000,
    timerRunning: false,
    activeSide: "blue" as Side,
    autoSync: true,
    manualOverride: false,
    teams: {
      blue: {
        picks: Array.from({ length: 5 }, () => ({ championId: null as string | null, locked: false })),
        bans: Array<string | null>(5).fill(null),
      },
      red: {
        picks: Array.from({ length: 5 }, () => ({ championId: null as string | null, locked: false })),
        bans: Array<string | null>(5).fill(null),
      },
    },
  };
  const match = {
    matchName: "",
    gameLabel: "GAME 1",
    patch: "16.16.1",
    bestOf: 3 as const,
    teams: {
      blue: { ...makeMatchTeam("blue", "BLUE", "BLUE", "#4f91d8", ""), players: Array<string>(5).fill('') },
      red: { ...makeMatchTeam("red", "RED", "RED", "#c84b42", ""), players: Array<string>(5).fill('') },
    },
  };
  const seed = { match, draft } as Pick<BroadcastState, "match" | "draft">;
  const postMatch = createEmptyPostMatchData(seed);

  return {
    schemaVersion: 2,
    serverInstanceId: '',
    outputOwner: 'operator',
    storageWarning: null,
    revision: 1,
    source: "mock",
    lifecycle: "idle",
    activeOutput: "none",
    match,
    draft,
    postMatch: {
      status: "waiting",
      matchId: "",
      source: "manual",
      baselineSource: "manual",
      lastSyncedAt: null,
      confidence: "unverified",
      baselineConfidence: "unverified",
      baseline: structuredClone(postMatch),
      data: structuredClone(postMatch),
      overrideFields: [],
      warnings: [],
      missingFields: [...postFields],
      baselineMissingFields: [...postFields],
    },
    lcu: {
      connected: false,
      message: "League Client not found",
      lastSeenAt: null,
      feed: "offline",
      gameflowPhase: null,
      sessionKind: "unknown",
      sessionId: null,
      lastPayloadAt: null,
      warnings: [],
    },
    events: [],
  };
}
