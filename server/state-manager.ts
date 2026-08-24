import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BroadcastCommand, BroadcastState, DraftFeedSnapshot, DraftPhase, EventEntry, PostMatchData, PostMatchDataSource, Side, SourceMode, ValidationConfidence } from "../src/domain/types";
import { commandLabel, createInitialState, reduceDraft } from "../src/domain/state";

type Listener = (state: BroadcastState) => void;
type LooseRecord = Record<string, any>;
const isRecord = (value: unknown): value is LooseRecord => Boolean(value) && typeof value === "object";
const numberOr = (value: unknown, fallback: number) => Number.isFinite(value) ? Number(value) : fallback;
const isConfidence = (value: unknown): value is ValidationConfidence => ["unverified", "low", "medium", "high"].includes(String(value));

function migratePostMatchData(value: unknown, defaults: PostMatchData): PostMatchData {
  const raw = isRecord(value) ? value : {};
  const teams = {} as PostMatchData["teams"];
  for (const side of ["blue", "red"] as Side[]) {
    const team = isRecord(raw.teams?.[side]) ? raw.teams[side] : {};
    teams[side] = {
      kills: numberOr(team.kills, 0),
      gold: numberOr(team.gold, 0),
      towers: numberOr(team.towers, 0),
      dragons: numberOr(team.dragons, 0),
      barons: numberOr(team.barons, 0),
      inhibitors: numberOr(team.inhibitors, 0),
      voidGrubs: numberOr(team.voidGrubs, 0),
      riftHeralds: numberOr(team.riftHeralds, 0),
      players: defaults.teams[side].players.map((fallback, index) => {
        const player = isRecord(team.players?.[index]) ? team.players[index] : {};
        return {
          player: typeof player.player === "string" ? player.player : fallback.player,
          championId: typeof player.championId === "string" || player.championId === null ? player.championId : fallback.championId,
          damageToChampions: numberOr(player.damageToChampions, 0),
          kills: numberOr(player.kills, 0),
          assists: numberOr(player.assists, 0),
          largestKillingSpree: numberOr(player.largestKillingSpree, 0),
          damageToObjectives: numberOr(player.damageToObjectives, 0),
        };
      }),
    };
  }
  const earlyObjective = raw.earlyObjective === "riftHeralds" ? "riftHeralds" : raw.earlyObjective === "voidGrubs" ? "voidGrubs" : defaults.earlyObjective;
  return {
    winner: raw.winner === "red" ? "red" : raw.winner === "blue" ? "blue" : defaults.winner,
    durationSeconds: numberOr(raw.durationSeconds, 0),
    earlyObjective,
    teams,
  };
}

export function migrateSavedState(saved: unknown): BroadcastState {
  const defaults = createInitialState();
  if (!isRecord(saved)) return defaults;
  if (isRecord(saved.match) && isRecord(saved.draft)) {
    const baseline = migratePostMatchData(saved.postMatch?.baseline, defaults.postMatch.baseline);
    const data = migratePostMatchData(saved.postMatch?.data, baseline);
    const baselineSource = ["fixture", "match-v5", "tournament", "lcu-provisional"].includes(saved.postMatch?.baselineSource)
      ? saved.postMatch.baselineSource
      : ["fixture", "match-v5", "tournament", "lcu-provisional"].includes(saved.postMatch?.source)
        ? saved.postMatch.source
        : "fixture";
    const confidence = isConfidence(saved.postMatch?.confidence) ? saved.postMatch.confidence : defaults.postMatch.confidence;
    const baselineConfidence = isConfidence(saved.postMatch?.baselineConfidence) ? saved.postMatch.baselineConfidence : confidence;
    const migrated = {
      ...defaults,
      ...saved,
      match: {
        ...defaults.match,
        ...saved.match,
        bestOf: saved.match.bestOf === 1 || saved.match.bestOf === 5 ? saved.match.bestOf : 3,
        teams: {
          blue: { ...defaults.match.teams.blue, ...saved.match.teams?.blue },
          red: { ...defaults.match.teams.red, ...saved.match.teams?.red },
        },
      },
      draft: {
        ...defaults.draft,
        ...saved.draft,
        teams: {
          blue: { ...defaults.draft.teams.blue, ...saved.draft.teams?.blue },
          red: { ...defaults.draft.teams.red, ...saved.draft.teams?.red },
        },
      },
      postMatch: {
        ...defaults.postMatch,
        ...saved.postMatch,
        baselineSource,
        confidence,
        baselineConfidence,
        baseline,
        data,
        overrideFields: Array.isArray(saved.postMatch?.overrideFields) ? saved.postMatch.overrideFields : [],
        warnings: Array.isArray(saved.postMatch?.warnings) ? saved.postMatch.warnings : [],
      },
      lcu: { ...defaults.lcu, ...saved.lcu },
      events: Array.isArray(saved.events) ? saved.events : [],
    } as BroadcastState;
    if (migrated.postMatch.overrideFields.length) {
      migrated.postMatch.source = "manual";
      migrated.postMatch.confidence = "unverified";
    }
    if (migrated.postMatch.status === "live") migrated.activeOutput = "post-match";
    return migrated;
  }

  // v1 used one flat draft object. Preserve operator data during upgrade.
  const legacyTeam = (side: Side) => isRecord(saved.teams?.[side]) ? saved.teams[side] : {};
  for (const side of ["blue", "red"] as Side[]) {
    const team = legacyTeam(side);
    defaults.match.teams[side] = {
      ...defaults.match.teams[side],
      code: typeof team.code === "string" ? team.code : defaults.match.teams[side].code,
      name: typeof team.name === "string" ? team.name : defaults.match.teams[side].name,
      score: Number.isFinite(team.score) ? team.score : defaults.match.teams[side].score,
      color: typeof team.color === "string" ? team.color : defaults.match.teams[side].color,
      logoUrl: typeof team.logoUrl === "string" ? team.logoUrl : defaults.match.teams[side].logoUrl,
      players: Array.from({ length: 5 }, (_, index) => typeof team.picks?.[index]?.player === "string" ? team.picks[index].player : defaults.match.teams[side].players[index]),
    };
    defaults.draft.teams[side] = {
      picks: Array.from({ length: 5 }, (_, index) => ({
        championId: typeof team.picks?.[index]?.championId === "string" ? team.picks[index].championId : null,
        locked: Boolean(team.picks?.[index]?.locked),
      })),
      bans: Array.from({ length: 5 }, (_, index) => typeof team.bans?.[index] === "string" ? team.bans[index] : null),
    };
  }
  defaults.revision = Number.isFinite(saved.revision) ? saved.revision : defaults.revision;
  defaults.source = ["mock", "manual", "lcu"].includes(saved.source) ? saved.source : defaults.source;
  defaults.match.matchName = typeof saved.matchName === "string" ? saved.matchName : defaults.match.matchName;
  defaults.match.gameLabel = typeof saved.gameLabel === "string" ? saved.gameLabel : defaults.match.gameLabel;
  defaults.match.patch = typeof saved.patch === "string" ? saved.patch : defaults.match.patch;
  defaults.match.bestOf = saved.bestOf === 1 || saved.bestOf === 5 ? saved.bestOf : 3;
  defaults.draft.phase = typeof saved.phase === "string" ? saved.phase as DraftPhase : defaults.draft.phase;
  defaults.draft.timerMs = Number.isFinite(saved.timerMs) ? saved.timerMs : defaults.draft.timerMs;
  defaults.draft.timerRunning = Boolean(saved.timerRunning);
  defaults.draft.activeSide = saved.activeSide === "red" ? "red" : "blue";
  defaults.draft.autoSync = saved.autoSync !== false;
  defaults.draft.manualOverride = Boolean(saved.manualOverride);
  defaults.activeOutput = saved.overlayVisible ? "draft" : "none";
  defaults.lifecycle = defaults.draft.phase === "complete" ? "in-game" : defaults.activeOutput === "draft" ? "draft" : "idle";
  defaults.lcu = { ...defaults.lcu, ...(isRecord(saved.lcu) ? saved.lcu : {}) };
  defaults.events = Array.isArray(saved.events) ? saved.events : [];
  return defaults;
}

export class StateManager {
  private state: BroadcastState = createInitialState();
  private undoStack: BroadcastState[] = [];
  private redoStack: BroadcastState[] = [];
  private listeners = new Set<Listener>();
  private readonly dataDir: string;
  private revisionCounter = 1;

  constructor(dataDir = path.resolve("data")) { this.dataDir = dataDir; }
  async init() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(path.join(this.dataDir, "snapshot.json"), "utf8");
      this.state = migrateSavedState(JSON.parse(raw));
      this.revisionCounter = this.state.revision;
      await this.persist();
    } catch { await this.persist(); }
  }
  getState() { return structuredClone(this.state); }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  async dispatch(command: BroadcastCommand, source: SourceMode = "manual") {
    if (command.type === "UNDO") return this.undo(source);
    if (command.type === "REDO") return this.redo(source);
    if (command.type === "SET_OVERLAY_VISIBLE" && !this.state.draft.manualOverride) return this.getState();
    if (command.type === "RESET") {
      this.undoStack.push(this.getState());
      this.redoStack = [];
      this.state = createInitialState();
      return this.commit(commandLabel(command), source);
    }
    this.undoStack.push(this.getState());
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.state = reduceDraft(this.state, command);
    return this.commit(commandLabel(command), source);
  }

  async tick(deltaMs: number) {
    if (!this.state.draft.timerRunning) return;
    this.state.draft.timerMs = Math.max(0, this.state.draft.timerMs - deltaMs);
    if (this.state.draft.timerMs === 0) this.state.draft.timerRunning = false;
    this.revisionCounter += 1;
    this.state.revision = this.revisionCounter;
    await this.persist();
    this.emit();
  }

  async ingestDraftFeed(snapshot: DraftFeedSnapshot) {
    if (!this.state.draft.autoSync || this.state.draft.manualOverride) return this.getState();
    const next = this.getState();
    next.draft.phase = snapshot.phase;
    next.lifecycle = snapshot.phase === "complete" ? "in-game" : "draft";
    next.activeOutput = snapshot.phase === "complete" ? "none" : "draft";
    const timerMs = Math.max(0, Math.min(300_000, snapshot.timerMs));
    if (snapshot.phase !== this.state.draft.phase || Math.abs(this.state.draft.timerMs - timerMs) >= 750) next.draft.timerMs = timerMs;
    next.draft.timerRunning = snapshot.timerRunning && next.draft.timerMs > 0;
    if (snapshot.activeSide) next.draft.activeSide = snapshot.activeSide;
    for (const side of ["blue", "red"] as Side[]) {
      for (let index = 0; index < 5; index += 1) {
        const pick = snapshot.teams[side].picks[index];
        next.draft.teams[side].picks[index].championId = pick?.championId ?? null;
        next.draft.teams[side].picks[index].locked = pick?.locked ?? false;
        if (pick?.player !== undefined) next.match.teams[side].players[index] = pick.player.slice(0, 24);
        next.draft.teams[side].bans[index] = snapshot.teams[side].bans[index] ?? null;
      }
    }
    const before = JSON.stringify({ draft: this.state.draft, players: this.state.match.teams });
    const after = JSON.stringify({ draft: next.draft, players: next.match.teams });
    if (before === after) return this.getState();
    next.lcu.feed = "champ-select";
    next.lcu.sessionId = snapshot.feedId;
    next.lcu.lastPayloadAt = snapshot.observedAt;
    this.state = next;
    return this.commit("Đồng bộ draft từ LCU", "lcu");
  }

  async ingestPostMatch(data: PostMatchData, options: {
    matchId: string;
    source: Exclude<PostMatchDataSource, "manual">;
    confidence: ValidationConfidence;
    warnings?: string[];
  }) {
    const next = this.getState();
    next.lifecycle = "post-match";
    next.activeOutput = "none";
    next.postMatch = {
      status: "review",
      matchId: options.matchId,
      source: options.source,
      baselineSource: options.source,
      lastSyncedAt: new Date().toISOString(),
      confidence: options.confidence,
      baselineConfidence: options.confidence,
      baseline: structuredClone(data),
      data: structuredClone(data),
      overrideFields: [],
      warnings: options.warnings ?? [],
    };
    this.state = next;
    return this.commit("Nạp dữ liệu post-match", options.source === "lcu-provisional" ? "lcu" : "mock");
  }

  async failPostMatch(message: string) {
    this.state.activeOutput = "none";
    this.state.lifecycle = "post-match";
    this.state.postMatch.status = "error";
    this.state.postMatch.confidence = "unverified";
    this.state.postMatch.warnings = [message];
    return this.commit("Lỗi lấy dữ liệu post-match", "manual");
  }

  async setLcuStatus(update: Partial<BroadcastState["lcu"]> & Pick<BroadcastState["lcu"], "connected" | "message">) {
    const next = {
      ...this.state.lcu,
      ...update,
      lastSeenAt: update.connected && (!this.state.lcu.connected || !this.state.lcu.lastSeenAt) ? new Date().toISOString() : update.lastSeenAt ?? this.state.lcu.lastSeenAt,
    };
    if (!update.connected) {
      next.feed = "offline" as const;
      next.gameflowPhase = null;
      next.sessionKind = "unknown" as const;
      next.sessionId = null;
      next.warnings = [];
    }
    const phase = next.gameflowPhase;
    const draftVisible = next.feed === "champ-select" || next.feed === "unresolved" || phase === "ChampSelect";
    const postMatch = ["WaitingForStats", "PreEndOfGame", "EndOfGame"].includes(phase ?? "");
    const inGame = ["GameStart", "InProgress", "Reconnect"].includes(phase ?? "");
    const postMatchOwnsOutput = this.state.activeOutput === "post-match" || this.state.postMatch.status === "live";
    const lifecycle = postMatchOwnsOutput ? "post-match" : draftVisible ? "draft" : postMatch ? "post-match" : inGame ? "in-game" : this.state.lifecycle;
    const output = postMatchOwnsOutput ? "post-match" : draftVisible ? "draft" : "none";
    if (JSON.stringify(this.state.lcu) === JSON.stringify(next) && (this.state.draft.manualOverride || (this.state.activeOutput === output && this.state.lifecycle === lifecycle))) return this.getState();
    this.state.lcu = next;
    if (!this.state.draft.manualOverride) {
      this.state.activeOutput = output;
      this.state.lifecycle = lifecycle;
      this.state.source = update.connected ? "lcu" : "mock";
    }
    return this.commit(update.connected ? "LCU đã kết nối" : "LCU mất kết nối", "lcu");
  }

  private async undo(source: SourceMode) {
    const previous = this.undoStack.pop();
    if (!previous) return this.getState();
    this.redoStack.push(this.getState());
    this.state = previous;
    return this.commit("Hoàn tác", source);
  }
  private async redo(source: SourceMode) {
    const next = this.redoStack.pop();
    if (!next) return this.getState();
    this.undoStack.push(this.getState());
    this.state = next;
    return this.commit("Làm lại", source);
  }
  private async commit(label: string, source: SourceMode) {
    this.revisionCounter += 1;
    this.state.revision = this.revisionCounter;
    this.state.source = this.state.draft.manualOverride ? "manual" : source;
    const entry: EventEntry = { id: crypto.randomUUID(), at: new Date().toISOString(), source, label, revision: this.state.revision };
    this.state.events = [entry, ...this.state.events].slice(0, 80);
    await appendFile(path.join(this.dataDir, "events.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
    await this.persist();
    this.emit();
    return this.getState();
  }
  private async persist() { await writeFile(path.join(this.dataDir, "snapshot.json"), JSON.stringify(this.state, null, 2), "utf8"); }
  private emit() { const state = this.getState(); this.listeners.forEach((listener) => listener(state)); }
}
