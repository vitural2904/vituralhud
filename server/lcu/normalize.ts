import type { DraftFeedPick, DraftFeedSnapshot, DraftPhase, Side } from "../../src/domain/types";
import { championByNumericId } from "../../src/domain/catalog";
import type {
  LcuAction,
  LcuChampSelectSession,
  LcuNormalizationResult,
  LcuParticipant,
  LcuTeamResolution,
} from "./types";

const sides: Side[] = ["blue", "red"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function parseParticipant(value: unknown): LcuParticipant | null {
  const record = asRecord(value);
  const cellId = asNumber(record?.cellId);
  if (!record || cellId === undefined) return null;
  return {
    cellId,
    championId: asNumber(record.championId),
    championPickIntent: asNumber(record.championPickIntent),
    displayName: asString(record.displayName),
    summonerName: asString(record.summonerName),
    gameName: asString(record.gameName),
    name: asString(record.name),
    team: record.team,
  };
}

function parseParticipants(value: unknown) {
  return Array.isArray(value) ? value.map(parseParticipant).filter((item): item is LcuParticipant => item !== null) : [];
}

function parseAction(value: unknown): LcuAction | null {
  const record = asRecord(value);
  const type = record?.type;
  const actorCellId = asNumber(record?.actorCellId);
  if (!record || (type !== "pick" && type !== "ban") || actorCellId === undefined) return null;
  return {
    id: asNumber(record.id) ?? -1,
    actorCellId,
    championId: asNumber(record.championId) ?? 0,
    completed: record.completed === true,
    isInProgress: typeof record.isInProgress === "boolean" ? record.isInProgress : undefined,
    type,
  };
}

function parseActions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((group) => Array.isArray(group)
    ? group.map(parseAction).filter((item): item is LcuAction => item !== null)
    : []);
}

export function parseChampSelectSession(value: unknown): LcuChampSelectSession | null {
  const record = asRecord(value);
  if (!record) return null;
  const timer = asRecord(record.timer);
  return {
    id: asString(record.id) ?? asNumber(record.id),
    gameId: asString(record.gameId) ?? asNumber(record.gameId),
    isSpectating: record.isSpectating === true,
    localPlayerCellId: asNumber(record.localPlayerCellId),
    actions: parseActions(record.actions),
    blueTeam: parseParticipants(record.blueTeam),
    redTeam: parseParticipants(record.redTeam),
    myTeam: parseParticipants(record.myTeam),
    theirTeam: parseParticipants(record.theirTeam),
    timer: timer ? {
      phase: asString(timer.phase),
      adjustedTimeLeftInPhase: asNumber(timer.adjustedTimeLeftInPhase),
      timeLeftInPhase: asNumber(timer.timeLeftInPhase),
    } : undefined,
  };
}

function sideFromTeamToken(token: unknown): Side | null {
  if (token === 1 || token === 100) return "blue";
  if (token === 2 || token === 200) return "red";
  if (typeof token !== "string") return null;
  const normalized = token.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["1", "100", "BLUE", "ORDER", "TEAMONE", "TEAM1"].includes(normalized)) return "blue";
  if (["2", "200", "RED", "CHAOS", "TEAMTWO", "TEAM2"].includes(normalized)) return "red";
  return null;
}

function sessionKind(session: LcuChampSelectSession, participants: LcuParticipant[]) {
  if (session.isSpectating || session.localPlayerCellId === -1) return "spectator" as const;
  if (session.localPlayerCellId !== undefined && participants.some((player) => player.cellId === session.localPlayerCellId)) {
    return "player" as const;
  }
  return "unknown" as const;
}

export function resolveLcuTeams(session: LcuChampSelectSession): LcuTeamResolution {
  const warnings: string[] = [];
  const blueTeam = session.blueTeam ?? [];
  const redTeam = session.redTeam ?? [];
  if (blueTeam.length > 0 && redTeam.length > 0) {
    const participants = [...blueTeam, ...redTeam];
    return {
      teams: { blue: blueTeam.slice(0, 5), red: redTeam.slice(0, 5) },
      sessionKind: sessionKind(session, participants),
      warnings,
    };
  }

  const myTeam = session.myTeam ?? [];
  const theirTeam = session.theirTeam ?? [];
  const participants = [...myTeam, ...theirTeam];
  const grouped: Record<Side, LcuParticipant[]> = { blue: [], red: [] };
  const unresolved: LcuParticipant[] = [];
  for (const participant of participants) {
    const side = sideFromTeamToken(participant.team);
    if (side) grouped[side].push(participant);
    else unresolved.push(participant);
  }

  if (unresolved.length > 0 && myTeam.length > 0 && theirTeam.length > 0) {
    const mySide = myTeam.map((player) => sideFromTeamToken(player.team)).find((side): side is Side => side !== null);
    const theirSide = theirTeam.map((player) => sideFromTeamToken(player.team)).find((side): side is Side => side !== null);
    if (mySide && !theirSide) {
      grouped[mySide] = myTeam;
      grouped[mySide === "blue" ? "red" : "blue"] = theirTeam;
      unresolved.length = 0;
    } else if (theirSide && !mySide) {
      grouped[theirSide] = theirTeam;
      grouped[theirSide === "blue" ? "red" : "blue"] = myTeam;
      unresolved.length = 0;
    }
  }

  if (unresolved.length > 0 || grouped.blue.length === 0 || grouped.red.length === 0) {
    warnings.push("Không có team ID đủ rõ để map Blue/Red. Không đoán side từ góc nhìn client.");
    return { teams: null, sessionKind: sessionKind(session, participants), warnings };
  }

  return {
    teams: { blue: grouped.blue.slice(0, 5), red: grouped.red.slice(0, 5) },
    sessionKind: sessionKind(session, participants),
    warnings,
  };
}

function playerName(player: LcuParticipant) {
  return player.displayName ?? player.summonerName ?? player.gameName ?? player.name;
}

function mapChampion(numericId: number | undefined, warnings: string[]) {
  if (!numericId) return null;
  const champion = championByNumericId[numericId];
  if (!champion) {
    warnings.push(`Champion ID chưa biết: ${numericId}`);
    return null;
  }
  return champion.id;
}

function emptyPicks(): DraftFeedPick[] {
  return Array.from({ length: 5 }, () => ({ championId: null, locked: false }));
}

function derivePhase(actions: LcuAction[], timerPhase: string | undefined): DraftPhase {
  const normalizedTimer = timerPhase?.toUpperCase().replace(/[^A-Z]/g, "") ?? "";
  const completedPicks = actions.filter((action) => action.type === "pick" && action.completed).length;
  const completedBans = actions.filter((action) => action.type === "ban" && action.completed).length;
  if (["FINALIZATION", "GAMESTARTING", "COMPLETE"].includes(normalizedTimer) || completedPicks >= 10) return "complete";
  const active = actions.find((action) => !action.completed && action.isInProgress)
    ?? actions.find((action) => !action.completed && action.championId > 0);
  if (active?.type === "ban") return completedBans < 6 ? "ban-1" : "ban-2";
  if (active?.type === "pick") return completedPicks < 6 ? "pick-1" : "pick-2";
  if (completedPicks >= 6) return "pick-2";
  if (completedBans >= 6) return "ban-2";
  if (completedPicks > 0) return "pick-1";
  if (completedBans > 0) return "ban-1";
  return "waiting";
}

export function normalizeChampSelectSession(
  raw: unknown,
  observedAt = new Date().toISOString(),
): LcuNormalizationResult {
  const session = parseChampSelectSession(raw);
  if (!session) return { snapshot: null, sessionKind: "unknown", warnings: ["Champ-select payload không phải object."] };
  const resolution = resolveLcuTeams(session);
  const warnings = [...resolution.warnings];
  if (!resolution.teams) return { snapshot: null, sessionKind: resolution.sessionKind, warnings };

  const picks: Record<Side, DraftFeedPick[]> = { blue: emptyPicks(), red: emptyPicks() };
  const bans: Record<Side, (string | null)[]> = {
    blue: Array.from({ length: 5 }, () => null),
    red: Array.from({ length: 5 }, () => null),
  };
  const cellMap = new Map<number, { side: Side; index: number }>();
  for (const side of sides) {
    resolution.teams[side].forEach((participant, index) => {
      cellMap.set(participant.cellId, { side, index });
      picks[side][index] = {
        championId: mapChampion(participant.championId || participant.championPickIntent, warnings),
        locked: false,
        player: playerName(participant),
      };
    });
  }

  const actions = session.actions?.flat() ?? [];
  const banIndex: Record<Side, number> = { blue: 0, red: 0 };
  for (const action of actions) {
    const actor = cellMap.get(action.actorCellId);
    if (!actor) {
      if (action.championId > 0) warnings.push(`Không map được actorCellId ${action.actorCellId}.`);
      continue;
    }
    const championId = mapChampion(action.championId, warnings);
    if (action.type === "pick" && championId) {
      picks[actor.side][actor.index].championId = championId;
      picks[actor.side][actor.index].locked = action.completed;
    }
    if (action.type === "ban" && banIndex[actor.side] < 5) {
      bans[actor.side][banIndex[actor.side]] = championId;
      banIndex[actor.side] += 1;
    }
  }

  const activeAction = actions.find((action) => !action.completed && action.isInProgress)
    ?? actions.find((action) => !action.completed && action.championId > 0);
  const activeSide = activeAction ? cellMap.get(activeAction.actorCellId)?.side : undefined;
  const timerMs = Math.max(0, Math.min(
    300_000,
    session.timer?.adjustedTimeLeftInPhase ?? session.timer?.timeLeftInPhase ?? 0,
  ));
  const phase = derivePhase(actions, session.timer?.phase);
  const feedId = String(session.gameId ?? session.id ?? "champ-select");
  const snapshot: DraftFeedSnapshot = {
    feedId,
    observedAt,
    phase,
    timerMs,
    timerRunning: phase !== "waiting" && phase !== "complete" && timerMs > 0,
    activeSide,
    teams: {
      blue: { picks: picks.blue, bans: bans.blue },
      red: { picks: picks.red, bans: bans.red },
    },
  };
  return { snapshot, sessionKind: resolution.sessionKind, warnings: [...new Set(warnings)] };
}
