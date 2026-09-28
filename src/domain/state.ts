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
import { approvalErrors, DomainError, postFields, validateCommand } from './validation';

import { createInitialState, createPostMatchData, createEmptyPostMatchData, players, bluePicks, redPicks } from './initial-state';
export { createInitialState, createPostMatchData, createEmptyPostMatchData } from './initial-state';
const phases: DraftPhase[] = ["waiting", "ban-1", "pick-1", "ban-2", "pick-2", "complete"];

export function commandLabel(command: BroadcastCommand): string {
  const labels: Record<BroadcastCommand["type"], string> = {
    SET_MATCH: "Match updated",
    SET_TEAM: "Team updated",
    SET_SCORE: "Score updated",
    SET_BEST_OF: "Series format updated",
    SET_PLAYER: "Player updated",
    SET_PICK: "Pick updated",
    SET_BAN: "Ban updated",
    SET_PHASE: "Draft phase changed",
    SET_TIMER: "Timer set",
    TOGGLE_TIMER: "Timer toggled",
    SET_AUTO_SYNC: "Auto sync changed",
    SET_OVERRIDE: "Manual control changed",
    SET_OVERLAY_VISIBLE: "Draft output changed",
    SET_OUTPUT: "Program output changed",
    RESUME_AUTO_OUTPUT: 'LCU output enabled',
    POST_MATCH_CREATE_MANUAL: 'Blank post-match created',
    POST_MATCH_SET_PLAYER_IDENTITY: 'Post-match player updated',
    POST_MATCH_CONFIRM_ZERO: 'Missing numbers confirmed as zero',
    POST_MATCH_BEGIN_FETCH: "Post-match fetch started",
    POST_MATCH_LOAD_FIXTURE: "Post-match fixture loaded",
    POST_MATCH_SET_WINNER: "Winner changed",
    POST_MATCH_SET_DURATION: "Match duration changed",
    POST_MATCH_SET_EARLY_OBJECTIVE: "Early objective changed",
    POST_MATCH_SET_METRIC: "Team metric changed",
    POST_MATCH_SET_PLAYER_METRIC: "Player metric changed",
    POST_MATCH_RESET_FIELD: "Field reset to source",
    POST_MATCH_RESET_OVERRIDES: "Post-match data reset",
    POST_MATCH_SET_READY: "Review status changed",
    POST_MATCH_RESET: "Post-match reset",
    RUN_DEMO_STEP: "Demo advanced",
    UNDO: "Change undone",
    REDO: "Change redone",
    RESET: "Broadcast reset",
  };
  return labels[command.type];
}

const addOverride = (state: BroadcastState, field: string) => {
  state.postMatch.missingFields = state.postMatch.missingFields.filter(item => item !== field);
  if (!state.postMatch.overrideFields.includes(field)) state.postMatch.overrideFields.push(field);
  state.postMatch.source = "manual";
  state.postMatch.confidence = "unverified";
  if (state.postMatch.status !== "fetching" && state.postMatch.status !== "waiting") state.postMatch.status = "review";
  if (state.activeOutput === "post-match") state.activeOutput = "none";
  state.outputOwner = 'operator';
};

export function reconcileOutput(state: BroadcastState) {
  if (state.outputOwner === 'lcu') {
    state.activeOutput = state.draft.autoSync && !state.draft.manualOverride && state.lcu.connected
      && state.lcu.feed === 'champ-select' && Boolean(state.lcu.sessionId && state.lcu.lastPayloadAt)
      && !['waiting', 'complete'].includes(state.draft.phase) ? 'draft' : 'none';
  }
  if (state.activeOutput !== 'post-match' && state.postMatch.status === 'live') state.postMatch.status = 'ready';
  if (state.activeOutput === 'post-match') state.lifecycle = 'post-match';
  else if (state.activeOutput === 'draft') state.lifecycle = 'draft';
  else if (state.postMatch.status !== 'waiting') state.lifecycle = 'post-match';
  else state.lifecycle = state.draft.phase === 'complete' ? 'in-game' : 'idle';
}

const fieldValue = (data: PostMatchData, field: string): unknown => field.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], data);
const assignField = (data: PostMatchData, field: string, value: unknown) => {
  const keys = field.split('.');
  const leaf = keys.pop()!;
  const parent = keys.reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], data) as Record<string, unknown>;
  parent[leaf] = value;
};

export function reduceDraft(state: BroadcastState, command: BroadcastCommand): BroadcastState {
  validateCommand(command);
  const next = structuredClone(state);
  const edit = (() => {
    switch (command.type) {
      case 'POST_MATCH_SET_WINNER': return ['winner', command.side] as const;
      case 'POST_MATCH_SET_DURATION': return ['durationSeconds', command.seconds] as const;
      case 'POST_MATCH_SET_EARLY_OBJECTIVE': return ['earlyObjective', command.objective] as const;
      case 'POST_MATCH_SET_METRIC': return [`teams.${command.side}.${command.field}`, command.value] as const;
      case 'POST_MATCH_SET_PLAYER_METRIC': return [`teams.${command.side}.players.${command.index}.${command.field}`, command.value] as const;
      case 'POST_MATCH_SET_PLAYER_IDENTITY': return [`teams.${command.side}.players.${command.index}.${command.field}`, command.value] as const;
      default: return null;
    }
  })();
  if (edit && fieldValue(state.postMatch.data, edit[0]) === edit[1] && !state.postMatch.missingFields.includes(edit[0])) return state;
  if (edit && ['waiting', 'fetching'].includes(state.postMatch.status)) throw new DomainError('NOT_EDITABLE', 'Tạo báo cáo hoặc hủy request trước khi sửa.');
  if (command.type === "SET_MATCH") next.match[command.field] = command.value.slice(0, 40) as never;
  if (command.type === "SET_TEAM") {
    const limit = command.field === "logoUrl" ? 240 : 28;
    next.match.teams[command.side][command.field] = command.value.slice(0, limit);
  }
  if (command.type === "SET_SCORE") {
    const winsNeeded = Math.ceil(next.match.bestOf / 2);
    if (command.value > winsNeeded) throw new DomainError('INVALID_SCORE', 'Tỉ số vượt best-of.', ['value'], 400);
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
  }
  if (command.type === "SET_OVERLAY_VISIBLE" && next.draft.manualOverride) { next.outputOwner = 'operator'; next.activeOutput = command.value ? "draft" : "none"; }
  if (command.type === 'RESUME_AUTO_OUTPUT') { next.outputOwner = 'lcu'; next.draft.manualOverride = false; next.draft.autoSync = true; }
  if (command.type === "SET_OUTPUT") {
    if (command.output === "post-match" && !["ready", "live"].includes(next.postMatch.status)) throw new DomainError('NOT_READY', 'Duyệt dữ liệu trước khi phát.');
    if (command.output === 'post-match' && approvalErrors(next).length) throw new DomainError('REVIEW_REQUIRED', 'Dữ liệu cần kiểm tra.', approvalErrors(next));
    next.outputOwner = 'operator';
    next.activeOutput = command.output;
    if (command.output === "post-match") next.postMatch.status = "live";
    if (command.output !== "post-match" && next.postMatch.status === "live") next.postMatch.status = "ready";
  }
  if (command.type === "POST_MATCH_BEGIN_FETCH") {
    next.outputOwner = 'operator';
    next.lifecycle = "post-match";
    next.activeOutput = "none";
    next.postMatch.status = "fetching";
    next.postMatch.warnings = [];
  }
  if (command.type === "POST_MATCH_LOAD_FIXTURE") {
    const data = createPostMatchData(next);
    next.lifecycle = "post-match";
    next.activeOutput = "none";
    next.outputOwner = 'operator';
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
      warnings: ["Fixture data. Match-V5 is not connected."],
      missingFields: [],
      baselineMissingFields: [],
    };
  }
  if (command.type === 'POST_MATCH_CREATE_MANUAL') {
    const data = createEmptyPostMatchData();
    next.outputOwner = 'operator'; next.activeOutput = 'none';
    next.postMatch = { status: 'review', matchId: '', source: 'manual', baselineSource: 'manual', lastSyncedAt: null, confidence: 'unverified', baselineConfidence: 'unverified', baseline: structuredClone(data), data, overrideFields: [], warnings: [], missingFields: [...postFields], baselineMissingFields: [...postFields] };
  }
  if (command.type === 'POST_MATCH_SET_PLAYER_IDENTITY') {
    assignField(next.postMatch.data, `teams.${command.side}.players.${command.index}.${command.field}`, command.value);
    addOverride(next, `teams.${command.side}.players.${command.index}.${command.field}`);
  }
  if (command.type === 'POST_MATCH_CONFIRM_ZERO') {
    if (state.postMatch.status !== 'review') throw new DomainError('NOT_EDITABLE', 'Chỉ xác nhận số thiếu trong review.');
    for (const field of command.fields) {
      if (!next.postMatch.missingFields.includes(field)) continue;
      assignField(next.postMatch.data, field, 0); addOverride(next, field);
    }
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
    assignField(next.postMatch.data, command.field, fieldValue(next.postMatch.baseline, command.field));
    next.postMatch.missingFields = next.postMatch.missingFields.filter(field => field !== command.field);
    if (next.postMatch.baselineMissingFields.includes(command.field)) next.postMatch.missingFields.push(command.field);
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
    if (!next.postMatch.overrideFields.length) return state;
    next.postMatch.missingFields = [...next.postMatch.baselineMissingFields];
    next.postMatch.data = structuredClone(next.postMatch.baseline);
    next.postMatch.overrideFields = [];
    next.postMatch.source = next.postMatch.baselineSource;
    next.postMatch.confidence = next.postMatch.baselineConfidence;
    next.postMatch.status = "review";
    next.activeOutput = "none";
  }
  if (command.type === "POST_MATCH_SET_READY") {
    if (command.value) {
      if (!['review', 'ready'].includes(next.postMatch.status)) throw new DomainError('NOT_REVIEWABLE', 'Báo cáo chưa sẵn sàng để duyệt.');
      const errors = approvalErrors(next);
      if (errors.length) throw new DomainError('REVIEW_REQUIRED', 'Điền trường thiếu. Kiểm tra kills và spree.', errors);
      next.postMatch.status = 'ready';
    }
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
      source: "manual",
      baselineSource: "manual",
      lastSyncedAt: null,
      confidence: "unverified",
      baselineConfidence: "unverified",
      baseline: structuredClone(data),
      data: structuredClone(data),
      overrideFields: [],
      warnings: [],
      missingFields: [...postFields],
      baselineMissingFields: [...postFields],
    };
    if (next.activeOutput === "post-match") next.activeOutput = "none";
    next.lifecycle = "idle";
    next.outputOwner = 'operator'; next.activeOutput = 'none';
  }
  if (command.type === "RUN_DEMO_STEP") {
    for (const side of ['blue', 'red'] as const) {
      next.draft.teams[side].picks = (side === 'blue' ? bluePicks : redPicks).map(championId => ({ championId, locked: true }));
      next.match.teams[side].players = [...players];
    }
    const phaseIndex = phases.indexOf(next.draft.phase);
    next.draft.phase = phases[(phaseIndex + 1) % phases.length];
    next.draft.activeSide = next.draft.activeSide === "blue" ? "red" : "blue";
    next.draft.timerMs = next.draft.phase === "complete" ? 0 : 27_000;
    next.draft.timerRunning = next.draft.phase !== "complete";
    next.lifecycle = next.draft.phase === "complete" ? "in-game" : "draft";
  }
  if (JSON.stringify(next.match) !== JSON.stringify(state.match) && ['ready', 'live'].includes(state.postMatch.status)) {
    next.postMatch.status = 'review'; next.postMatch.confidence = 'unverified'; next.outputOwner = 'operator';
    if (next.activeOutput === 'post-match') next.activeOutput = 'none';
  }
  reconcileOutput(next);
  return JSON.stringify(next) === JSON.stringify(state) ? state : next;
}


export { postMatchMetricLabels } from './labels';
