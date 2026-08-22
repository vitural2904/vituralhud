import type { DraftCommand, DraftPhase, DraftState, Side, TeamState } from "./types";

const players = ["Kiên", "RonOP", "Hữu Trung", "Phước", "Tốc"];

const makeTeam = (side: Side, code: string, name: string, color: string, logoUrl: string, picks: string[]): TeamState => ({
  side,
  code,
  name,
  score: 0,
  color,
  logoUrl,
  picks: picks.map((championId, index) => ({ championId, player: players[index], locked: index < 3 })),
  bans: side === "blue"
    ? ["Aatrox", "Khazix", "Xayah", "Fiora", "Leblanc"]
    : ["Renekton", "Sejuani", "Varus", "Nautilus", "Rumble"],
});

export function createInitialState(): DraftState {
  return {
    revision: 1,
    source: "mock",
    phase: "pick-2",
    timerMs: 27_000,
    timerRunning: false,
    matchName: "VCS SHOWMATCH",
    gameLabel: "GAME 1",
    patch: "16.16.1",
    bestOf: 3,
    activeSide: "blue",
    autoSync: true,
    manualOverride: false,
    overlayVisible: false,
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
    teams: {
      blue: makeTeam("blue", "RDT", "RED DOT", "#4f91d8", "/teams/red-dot.png", ["Ziggs", "Ryze", "LeeSin", "Camille", "JarvanIV"]),
      red: makeTeam("red", "WSG", "WHITE SUGAR", "#c84b42", "/teams/white-sugar.png", ["Syndra", "Lulu", "Olaf", "Ashe", "Thresh"]),
    },
    events: [],
  };
}

const phases: DraftPhase[] = ["waiting", "ban-1", "pick-1", "ban-2", "pick-2", "complete"];

export function commandLabel(command: DraftCommand): string {
  const labels: Record<DraftCommand["type"], string> = {
    SET_MATCH: "Cập nhật trận đấu",
    SET_TEAM: "Cập nhật đội",
    SET_SCORE: "Cập nhật tỉ số",
    SET_BEST_OF: "Cập nhật thể thức",
    SET_PLAYER: "Cập nhật tuyển thủ",
    SET_PICK: "Cập nhật lượt chọn",
    SET_BAN: "Cập nhật lượt cấm",
    SET_PHASE: "Đổi giai đoạn",
    SET_TIMER: "Đặt đồng hồ",
    TOGGLE_TIMER: "Bật/tạm dừng đồng hồ",
    SET_AUTO_SYNC: "Đổi tự đồng bộ",
    SET_OVERRIDE: "Đổi manual override",
    SET_OVERLAY_VISIBLE: "Chuyển trạng thái overlay",
    RUN_DEMO_STEP: "Chạy bước demo",
    UNDO: "Hoàn tác",
    REDO: "Làm lại",
    RESET: "Đặt lại draft",
  };
  return labels[command.type];
}

export function reduceDraft(state: DraftState, command: DraftCommand): DraftState {
  const next = structuredClone(state);
  if (command.type === "SET_MATCH") next[command.field] = command.value.slice(0, 40);
  if (command.type === "SET_TEAM") {
    const limit = command.field === "logoUrl" ? 240 : 28;
    next.teams[command.side][command.field] = command.value.slice(0, limit);
  }
  if (command.type === "SET_SCORE") {
    const winsNeeded = Math.ceil(next.bestOf / 2);
    next.teams[command.side].score = Math.max(0, Math.min(winsNeeded, command.value));
  }
  if (command.type === "SET_BEST_OF") {
    next.bestOf = command.value;
    const winsNeeded = Math.ceil(command.value / 2);
    next.teams.blue.score = Math.min(next.teams.blue.score, winsNeeded);
    next.teams.red.score = Math.min(next.teams.red.score, winsNeeded);
  }
  if (command.type === "SET_PLAYER" && next.teams[command.side].picks[command.index]) {
    next.teams[command.side].picks[command.index].player = command.value.slice(0, 24);
  }
  if (command.type === "SET_PICK" && next.teams[command.side].picks[command.index]) {
    next.teams[command.side].picks[command.index].championId = command.championId;
    next.teams[command.side].picks[command.index].locked = command.locked ?? true;
  }
  if (command.type === "SET_BAN" && command.index >= 0 && command.index < 5) {
    next.teams[command.side].bans[command.index] = command.championId;
  }
  if (command.type === "SET_PHASE") {
    next.phase = command.phase;
    if (command.activeSide) next.activeSide = command.activeSide;
  }
  if (command.type === "SET_TIMER") next.timerMs = Math.max(0, Math.min(300_000, command.timerMs));
  if (command.type === "TOGGLE_TIMER") next.timerRunning = !next.timerRunning && next.timerMs > 0;
  if (command.type === "SET_AUTO_SYNC") next.autoSync = command.value;
  if (command.type === "SET_OVERRIDE") {
    next.manualOverride = command.value;
    next.source = command.value ? "manual" : next.lcu.connected ? "lcu" : "mock";
    if (!command.value) {
      next.overlayVisible = next.lcu.feed === "champ-select" || next.lcu.feed === "unresolved" || next.lcu.gameflowPhase === "ChampSelect";
    }
  }
  if (command.type === "SET_OVERLAY_VISIBLE" && next.manualOverride) next.overlayVisible = command.value;
  if (command.type === "RUN_DEMO_STEP") {
    const phaseIndex = phases.indexOf(next.phase);
    next.phase = phases[(phaseIndex + 1) % phases.length];
    next.activeSide = next.activeSide === "blue" ? "red" : "blue";
    next.timerMs = next.phase === "complete" ? 0 : 27_000;
    next.timerRunning = next.phase !== "complete";
  }
  return next;
}
