import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DraftCommand, DraftFeedSnapshot, DraftState, EventEntry, Side, SourceMode } from "../src/domain/types";
import { commandLabel, createInitialState, reduceDraft } from "../src/domain/state";

type Listener = (state: DraftState) => void;

export class StateManager {
  private state: DraftState = createInitialState();
  private undoStack: DraftState[] = [];
  private redoStack: DraftState[] = [];
  private listeners = new Set<Listener>();
  private readonly dataDir: string;
  private revisionCounter = 1;

  constructor(dataDir = path.resolve("data")) {
    this.dataDir = dataDir;
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(path.join(this.dataDir, "snapshot.json"), "utf8");
      const saved = JSON.parse(raw) as Partial<DraftState>;
      const defaults = createInitialState();
      this.state = {
        ...defaults,
        ...saved,
        overlayVisible: typeof saved.overlayVisible === "boolean" ? saved.overlayVisible : defaults.overlayVisible,
        bestOf: saved.bestOf === 1 || saved.bestOf === 5 ? saved.bestOf : 3,
        lcu: { ...defaults.lcu, ...saved.lcu },
        teams: {
          blue: { ...defaults.teams.blue, ...saved.teams?.blue },
          red: { ...defaults.teams.red, ...saved.teams?.red },
        },
      };
      this.revisionCounter = this.state.revision;
    } catch {
      await this.persist();
    }
  }

  getState() {
    return structuredClone(this.state);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispatch(command: DraftCommand, source: SourceMode = "manual") {
    if (command.type === "UNDO") return this.undo(source);
    if (command.type === "REDO") return this.redo(source);
    if (command.type === "SET_OVERLAY_VISIBLE" && !this.state.manualOverride) return this.getState();
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
    if (!this.state.timerRunning) return;
    this.state.timerMs = Math.max(0, this.state.timerMs - deltaMs);
    if (this.state.timerMs === 0) this.state.timerRunning = false;
    this.revisionCounter += 1;
    this.state.revision = this.revisionCounter;
    await this.persist();
    this.emit();
  }

  async ingestDraftFeed(snapshot: DraftFeedSnapshot) {
    if (!this.state.autoSync || this.state.manualOverride) return this.getState();
    const next = this.getState();
    next.phase = snapshot.phase;
    const incomingTimerMs = Math.max(0, Math.min(300_000, snapshot.timerMs));
    if (snapshot.phase !== this.state.phase || Math.abs(this.state.timerMs - incomingTimerMs) >= 750) {
      next.timerMs = incomingTimerMs;
    }
    next.timerRunning = snapshot.timerRunning && next.timerMs > 0;
    if (snapshot.activeSide) next.activeSide = snapshot.activeSide;

    for (const side of ["blue", "red"] as Side[]) {
      for (let index = 0; index < 5; index += 1) {
        const incomingPick = snapshot.teams[side].picks[index];
        const targetPick = next.teams[side].picks[index];
        targetPick.championId = incomingPick?.championId ?? null;
        targetPick.locked = incomingPick?.locked ?? false;
        if (incomingPick?.player !== undefined) targetPick.player = incomingPick.player.slice(0, 24);
        next.teams[side].bans[index] = snapshot.teams[side].bans[index] ?? null;
      }
    }

    const before = JSON.stringify({
      phase: this.state.phase,
      timerMs: this.state.timerMs,
      timerRunning: this.state.timerRunning,
      activeSide: this.state.activeSide,
      teams: this.state.teams,
    });
    const after = JSON.stringify({
      phase: next.phase,
      timerMs: next.timerMs,
      timerRunning: next.timerRunning,
      activeSide: next.activeSide,
      teams: next.teams,
    });
    if (before === after) return this.getState();

    next.lcu.feed = "champ-select";
    next.lcu.sessionId = snapshot.feedId;
    next.lcu.lastPayloadAt = snapshot.observedAt;
    this.state = next;
    return this.commit("Đồng bộ draft từ LCU", "lcu");
  }

  async setLcuStatus(update: Partial<DraftState["lcu"]> & Pick<DraftState["lcu"], "connected" | "message">) {
    const next = {
      ...this.state.lcu,
      ...update,
      lastSeenAt: update.connected && (!this.state.lcu.connected || !this.state.lcu.lastSeenAt)
        ? new Date().toISOString()
        : update.lastSeenAt ?? this.state.lcu.lastSeenAt,
    };
    if (!update.connected) {
      next.feed = "offline";
      next.gameflowPhase = null;
      next.sessionKind = "unknown";
      next.sessionId = null;
      next.warnings = [];
    }
    const overlayVisible = next.feed === "champ-select" || next.feed === "unresolved" || next.gameflowPhase === "ChampSelect";
    if (JSON.stringify(this.state.lcu) === JSON.stringify(next) && (this.state.manualOverride || this.state.overlayVisible === overlayVisible)) {
      return this.getState();
    }
    this.state.lcu = next;
    if (!this.state.manualOverride) this.state.overlayVisible = overlayVisible;
    if (!this.state.manualOverride) this.state.source = update.connected ? "lcu" : "mock";
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
    this.state.source = this.state.manualOverride ? "manual" : source;
    const entry: EventEntry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      source,
      label,
      revision: this.state.revision,
    };
    this.state.events = [entry, ...this.state.events].slice(0, 80);
    await appendFile(path.join(this.dataDir, "events.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
    await this.persist();
    this.emit();
    return this.getState();
  }

  private async persist() {
    await writeFile(path.join(this.dataDir, "snapshot.json"), JSON.stringify(this.state, null, 2), "utf8");
  }

  private emit() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}
