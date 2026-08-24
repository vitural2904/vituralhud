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

const players = ["Kiên", "RonOP", "Hữu Trung", "Phước", "Tốc"];
const bluePicks = ["Ziggs", "Ryze", "LeeSin", "Camille", "JarvanIV"];
const redPicks = ["Syndra", "Lulu", "Olaf", "Ashe", "Thresh"];

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
    phase: "pick-2" as DraftPhase,
    timerMs: 27_000,
    timerRunning: false,
    activeSide: "blue" as Side,
    autoSync: true,
    manualOverride: false,
    teams: {
      blue: {
        picks: bluePicks.map((championId, index) => ({ championId, locked: index < 3 })),
        bans: ["Aatrox", "Khazix", "Xayah", "Fiora", "Leblanc"],
      },
      red: {
        picks: redPicks.map((championId, index) => ({ championId, locked: index < 3 })),
        bans: ["Renekton", "Sejuani", "Varus", "Nautilus", "Rumble"],
      },
    },
  };
  const match = {
    matchName: "VCS SHOWMATCH",
    gameLabel: "GAME 1",
    patch: "16.16.1",
    bestOf: 3 as const,
    teams: {
      blue: makeMatchTeam("blue", "RDT", "RED DOT", "#4f91d8", "/teams/red-dot.png"),
      red: makeMatchTeam("red", "WSG", "WHITE SUGAR", "#c84b42", "/teams/white-sugar.png"),
    },
  };
  const seed = { match, draft } as Pick<BroadcastState, "match" | "draft">;
  const postMatch = createEmptyPostMatchData(seed);

  return {
    revision: 1,
    source: "mock",
    lifecycle: "idle",
    activeOutput: "none",
    match,
    draft,
    postMatch: {
      status: "waiting",
      matchId: "",
      source: "fixture",
      baselineSource: "fixture",
      lastSyncedAt: null,
      confidence: "unverified",
      baselineConfidence: "unverified",
      baseline: structuredClone(postMatch),
      data: structuredClone(postMatch),
      overrideFields: [],
      warnings: [],
    },
    lcu: {
      connected: false,
      message: "Chưa thấy League Client",
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

const phases: DraftPhase[] = ["waiting", "ban-1", "pick-1", "ban-2", "pick-2", "complete"];

export function commandLabel(command: BroadcastCommand): string {
  const labels: Record<BroadcastCommand["type"], string> = {
    SET_MATCH: "Cập nhật trận đấu",
    SET_TEAM: "Cập nhật đội",
    SET_SCORE: "Cập nhật tỉ số",
    SET_BEST_OF: "Cập nhật thể thức",
    SET_PLAYER: "Cập nhật tuyển thủ",
    SET_PICK: "Cập nhật lượt chọn",
    SET_BAN: "Cập nhật lượt cấm",
    SET_PHASE: "Đổi giai đoạn draft",
    SET_TIMER: "Đặt đồng hồ",
    TOGGLE_TIMER: "Bật/tạm dừng đồng hồ",
    SET_AUTO_SYNC: "Đổi tự đồng bộ",
    SET_OVERRIDE: "Đổi manual override",
    SET_OVERLAY_VISIBLE: "Chuyển trạng thái draft overlay",
    SET_OUTPUT: "Chuyển màn hình phát sóng",
    POST_MATCH_BEGIN_FETCH: "Bắt đầu lấy dữ liệu post-match",
    POST_MATCH_LOAD_FIXTURE: "Nạp dữ liệu post-match mẫu",
    POST_MATCH_SET_WINNER: "Sửa đội thắng",
    POST_MATCH_SET_DURATION: "Sửa thời lượng trận",
    POST_MATCH_SET_EARLY_OBJECTIVE: "Đổi mục tiêu đầu trận",
    POST_MATCH_SET_METRIC: "Sửa chỉ số đội",
    POST_MATCH_SET_PLAYER_METRIC: "Sửa chỉ số tuyển thủ",
    POST_MATCH_RESET_FIELD: "Khôi phục một trường post-match",
    POST_MATCH_RESET_OVERRIDES: "Khôi phục dữ liệu post-match",
    POST_MATCH_SET_READY: "Đổi trạng thái duyệt post-match",
    POST_MATCH_RESET: "Đặt lại post-match",
    RUN_DEMO_STEP: "Chạy bước demo",
    UNDO: "Hoàn tác",
    REDO: "Làm lại",
    RESET: "Đặt lại broadcast",
  };
  return labels[command.type];
}

const addOverride = (state: BroadcastState, field: string) => {
  if (!state.postMatch.overrideFields.includes(field)) state.postMatch.overrideFields.push(field);
  state.postMatch.source = "manual";
  state.postMatch.confidence = "unverified";
  if (state.postMatch.status !== "fetching" && state.postMatch.status !== "waiting") state.postMatch.status = "review";
  if (state.activeOutput === "post-match") state.activeOutput = "none";
};

export function reduceDraft(state: BroadcastState, command: BroadcastCommand): BroadcastState {
  const next = structuredClone(state);
  if (command.type === "SET_MATCH") next.match[command.field] = command.value.slice(0, 40) as never;
  if (command.type === "SET_TEAM") {
    const limit = command.field === "logoUrl" ? 240 : 28;
    next.match.teams[command.side][command.field] = command.value.slice(0, limit);
  }
  if (command.type === "SET_SCORE") {
    const winsNeeded = Math.ceil(next.match.bestOf / 2);
    next.match.teams[command.side].score = Math.max(0, Math.min(winsNeeded, command.value));
  }
  if (command.type === "SET_BEST_OF") {
    next.match.bestOf = command.value;
    const winsNeeded = Math.ceil(command.value / 2);
    next.match.teams.blue.score = Math.min(next.match.teams.blue.score, winsNeeded);
    next.match.teams.red.score = Math.min(next.match.teams.red.score, winsNeeded);
  }
  if (command.type === "SET_PLAYER" && next.match.teams[command.side].players[command.index] !== undefined) {
    next.match.teams[command.side].players[command.index] = command.value.slice(0, 24);
  }
  if (command.type === "SET_PICK" && next.draft.teams[command.side].picks[command.index]) {
    next.draft.teams[command.side].picks[command.index].championId = command.championId;
    next.draft.teams[command.side].picks[command.index].locked = command.locked ?? true;
  }
  if (command.type === "SET_BAN" && command.index >= 0 && command.index < 5) next.draft.teams[command.side].bans[command.index] = command.championId;
  if (command.type === "SET_PHASE") {
    next.draft.phase = command.phase;
    next.lifecycle = command.phase === "complete" ? "in-game" : "draft";
    if (command.activeSide) next.draft.activeSide = command.activeSide;
  }
  if (command.type === "SET_TIMER") next.draft.timerMs = Math.max(0, Math.min(300_000, command.timerMs));
  if (command.type === "TOGGLE_TIMER") next.draft.timerRunning = !next.draft.timerRunning && next.draft.timerMs > 0;
  if (command.type === "SET_AUTO_SYNC") next.draft.autoSync = command.value;
  if (command.type === "SET_OVERRIDE") {
    next.draft.manualOverride = command.value;
    next.source = command.value ? "manual" : next.lcu.connected ? "lcu" : "mock";
    if (!command.value) next.activeOutput = next.lcu.feed === "champ-select" || next.lcu.feed === "unresolved" ? "draft" : "none";
  }
  if (command.type === "SET_OVERLAY_VISIBLE" && next.draft.manualOverride) next.activeOutput = command.value ? "draft" : "none";
  if (command.type === "SET_OUTPUT") {
    if (command.output === "post-match" && !["ready", "live"].includes(next.postMatch.status)) return state;
    next.activeOutput = command.output;
    if (command.output === "post-match") next.postMatch.status = "live";
    if (command.output !== "post-match" && next.postMatch.status === "live") next.postMatch.status = "ready";
  }
  if (command.type === "POST_MATCH_BEGIN_FETCH") {
    next.lifecycle = "post-match";
    next.activeOutput = "none";
    next.postMatch.status = "fetching";
    next.postMatch.warnings = [];
  }
  if (command.type === "POST_MATCH_LOAD_FIXTURE") {
    const data = createPostMatchData(next);
    next.lifecycle = "post-match";
    next.activeOutput = "none";
    next.postMatch = {
      status: "review",
      matchId: `VN2-DEMO-${Date.now().toString().slice(-6)}`,
      source: "fixture",
      baselineSource: "fixture",
      lastSyncedAt: new Date().toISOString(),
      confidence: "high",
      baselineConfidence: "high",
      baseline: structuredClone(data),
      data: structuredClone(data),
      overrideFields: [],
      warnings: ["Dữ liệu fixture. Chưa kết nối Match-V5."],
    };
  }
  if (command.type === "POST_MATCH_SET_WINNER") {
    next.postMatch.data.winner = command.side;
    addOverride(next, "winner");
  }
  if (command.type === "POST_MATCH_SET_DURATION") {
    next.postMatch.data.durationSeconds = Math.max(0, Math.min(4 * 60 * 60, Math.round(command.seconds)));
    addOverride(next, "durationSeconds");
  }
  if (command.type === "POST_MATCH_SET_EARLY_OBJECTIVE") {
    next.postMatch.data.earlyObjective = command.objective;
    addOverride(next, "earlyObjective");
  }
  if (command.type === "POST_MATCH_SET_METRIC") {
    next.postMatch.data.teams[command.side][command.field] = Math.max(0, Math.round(command.value));
    addOverride(next, `teams.${command.side}.${command.field}`);
  }
  if (command.type === "POST_MATCH_SET_PLAYER_METRIC" && next.postMatch.data.teams[command.side].players[command.index]) {
    next.postMatch.data.teams[command.side].players[command.index][command.field] = Math.max(0, Math.round(command.value));
    addOverride(next, `teams.${command.side}.players.${command.index}.${command.field}`);
  }
  if (command.type === "POST_MATCH_RESET_FIELD" && next.postMatch.overrideFields.includes(command.field)) {
    if (command.field === "winner") next.postMatch.data.winner = next.postMatch.baseline.winner;
    if (command.field === "durationSeconds") next.postMatch.data.durationSeconds = next.postMatch.baseline.durationSeconds;
    if (command.field === "earlyObjective") next.postMatch.data.earlyObjective = next.postMatch.baseline.earlyObjective;
    const metricMatch = command.field.match(/^teams\.(blue|red)\.(kills|gold|towers|dragons|barons|inhibitors|voidGrubs|riftHeralds)$/);
    if (metricMatch) {
      const [, side, metric] = metricMatch as [string, Side, PostMatchMetric];
      next.postMatch.data.teams[side][metric] = next.postMatch.baseline.teams[side][metric];
    }
    const playerMetricMatch = command.field.match(/^teams\.(blue|red)\.players\.(\d+)\.(damageToChampions|kills|assists|largestKillingSpree|damageToObjectives)$/);
    if (playerMetricMatch) {
      const side = playerMetricMatch[1] as Side;
      const index = Number(playerMetricMatch[2]);
      const metric = playerMetricMatch[3] as PostMatchPlayerMetric;
      if (next.postMatch.data.teams[side].players[index] && next.postMatch.baseline.teams[side].players[index]) {
        next.postMatch.data.teams[side].players[index][metric] = next.postMatch.baseline.teams[side].players[index][metric];
      }
    }
    next.postMatch.overrideFields = next.postMatch.overrideFields.filter((field) => field !== command.field);
    next.postMatch.source = next.postMatch.overrideFields.length ? "manual" : next.postMatch.baselineSource;
    next.postMatch.confidence = next.postMatch.overrideFields.length ? "unverified" : next.postMatch.baselineConfidence;
    next.postMatch.status = "review";
    next.activeOutput = "none";
  }
  if (command.type === "POST_MATCH_RESET_OVERRIDES") {
    next.postMatch.data = structuredClone(next.postMatch.baseline);
    next.postMatch.overrideFields = [];
    next.postMatch.source = next.postMatch.baselineSource;
    next.postMatch.confidence = next.postMatch.baselineConfidence;
    next.postMatch.status = "review";
    next.activeOutput = "none";
  }
  if (command.type === "POST_MATCH_SET_READY") {
    if (command.value && next.postMatch.status === "review") next.postMatch.status = "ready";
    if (!command.value && ["ready", "live"].includes(next.postMatch.status)) {
      next.postMatch.status = "review";
      if (next.activeOutput === "post-match") next.activeOutput = "none";
    }
  }
  if (command.type === "POST_MATCH_RESET") {
    const data = createEmptyPostMatchData(next);
    next.postMatch = {
      status: "waiting",
      matchId: "",
      source: "fixture",
      baselineSource: "fixture",
      lastSyncedAt: null,
      confidence: "unverified",
      baselineConfidence: "unverified",
      baseline: structuredClone(data),
      data: structuredClone(data),
      overrideFields: [],
      warnings: [],
    };
    if (next.activeOutput === "post-match") next.activeOutput = "none";
    next.lifecycle = "idle";
  }
  if (command.type === "RUN_DEMO_STEP") {
    const phaseIndex = phases.indexOf(next.draft.phase);
    next.draft.phase = phases[(phaseIndex + 1) % phases.length];
    next.draft.activeSide = next.draft.activeSide === "blue" ? "red" : "blue";
    next.draft.timerMs = next.draft.phase === "complete" ? 0 : 27_000;
    next.draft.timerRunning = next.draft.phase !== "complete";
    next.lifecycle = next.draft.phase === "complete" ? "in-game" : "draft";
  }
  return next;
}

export const postMatchMetricLabels: Record<PostMatchMetric, string> = {
  kills: "Mạng hạ gục",
  gold: "Tổng vàng",
  towers: "Trụ",
  dragons: "Rồng",
  barons: "Baron",
  inhibitors: "Nhà lính",
  voidGrubs: "Sâu hư không",
  riftHeralds: "Sứ giả khe nứt",
};
