import { appendFile, mkdir, readFile, copyFile, readdir, rename, unlink, open, stat } from "node:fs/promises";
import path from "node:path";
import type { BroadcastCommand, BroadcastState, DraftFeedSnapshot, DraftPhase, EventEntry, PostMatchData, PostMatchDataSource, Side, SourceMode, ValidationConfidence } from "../src/domain/types";
import { commandLabel, createInitialState, reduceDraft, reconcileOutput } from "../src/domain/state";
import { DomainError, validateCommand, validateState, postFields } from '../src/domain/validation';
import { numericPostFields } from '../src/domain/fields';

type Listener = (state: BroadcastState) => void;
type LooseRecord = Record<string, any>;
const isRecord = (value: unknown): value is LooseRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const numberOr = (value: unknown, fallback: number) => Number.isFinite(value) ? Number(value) : fallback;
const isConfidence = (value: unknown): value is ValidationConfidence => typeof value === 'string' && ["unverified", "low", "medium", "high"].includes(value);

function migratePostMatchData(value: unknown, defaults: PostMatchData): PostMatchData {
  if (value !== undefined && !isRecord(value)) throw new DomainError('INVALID_SNAPSHOT', 'Post-match không phải object.');
  const raw = isRecord(value) ? value : {};
  if (raw.winner !== undefined && !['blue', 'red'].includes(raw.winner) || raw.earlyObjective !== undefined && !['voidGrubs', 'riftHeralds'].includes(raw.earlyObjective)) throw new DomainError('INVALID_SNAPSHOT', 'Kết quả lưu không hợp lệ.');
  for (const field of numericPostFields) {
    const supplied = field.split('.').reduce<any>((parent, key) => parent?.[key], raw);
    if (supplied !== undefined && (!Number.isSafeInteger(supplied) || supplied < 0)) throw new DomainError('INVALID_SNAPSHOT', 'Chỉ số lưu không hợp lệ.', [field]);
  }
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
  if (isRecord(saved) && saved.schemaVersion !== undefined && saved.schemaVersion !== 2) throw new DomainError('SNAPSHOT_VERSION', 'Phiên bản snapshot chưa được hỗ trợ.');
  if (isRecord(saved) && saved.schemaVersion === 2) {
    validateState(saved);
    const migrated = structuredClone(saved);
    migrated.serverInstanceId = ''; migrated.storageWarning = null;
    migrated.outputOwner = 'operator'; migrated.activeOutput = 'none';
    if (['live', 'ready', 'fetching'].includes(migrated.postMatch.status)) migrated.postMatch.status = 'review';
    return migrated;
  }
  const defaults = createInitialState();
  if (!isRecord(saved)) throw new DomainError('INVALID_SNAPSHOT', 'Snapshot không phải object.');
  const series = isRecord(saved.match) ? saved.match.bestOf : saved.bestOf;
  if (series !== undefined && ![1, 3, 5].includes(series)) throw new DomainError('INVALID_SNAPSHOT', 'Best-of lưu không hợp lệ.');
  if (isRecord(saved.match) && isRecord(saved.draft)) {
    const absentFields = (data: unknown) => postFields.filter(field => field.split('.').reduce<any>((parent, key) => parent?.[key], data) === undefined);
    // Reject invalid supplied numbers instead of silently replacing them with zero.
    const inspect = (value: unknown, key = '') => {
      if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new DomainError('INVALID_SNAPSHOT', 'Số không hợp lệ.', [key]);
      if (isRecord(value)) for (const [field, child] of Object.entries(value)) inspect(child, `${key}.${field}`);
    };
    inspect(saved);
    const baseline = migratePostMatchData(saved.postMatch?.baseline, defaults.postMatch.baseline);
    const data = migratePostMatchData(saved.postMatch?.data, baseline);
    const baselineSource = ["fixture", "match-v5", "tournament", "lcu-provisional", "manual"].includes(saved.postMatch?.baselineSource)
      ? saved.postMatch.baselineSource
      : ["fixture", "match-v5", "tournament", "lcu-provisional", "manual"].includes(saved.postMatch?.source)
        ? saved.postMatch.source
        : "fixture";
    const confidence = isConfidence(saved.postMatch?.confidence) ? saved.postMatch.confidence : defaults.postMatch.confidence;
    const baselineConfidence = isConfidence(saved.postMatch?.baselineConfidence) ? saved.postMatch.baselineConfidence : confidence;
    const migrated = {
      ...defaults,
      ...saved,
      schemaVersion: 2,
      serverInstanceId: '',
      outputOwner: 'operator',
      activeOutput: 'none',
      storageWarning: null,
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
        missingFields: saved.postMatch?.missingFields ?? absentFields(saved.postMatch?.data),
        baselineMissingFields: saved.postMatch?.baselineMissingFields ?? absentFields(saved.postMatch?.baseline),
      },
      lcu: { ...defaults.lcu, ...saved.lcu },
      events: Array.isArray(saved.events) ? saved.events : [],
    } as BroadcastState;
    if (migrated.postMatch.overrideFields.length) {
      migrated.postMatch.source = "manual";
      migrated.postMatch.confidence = "unverified";
    }
    if (['live', 'ready', 'fetching'].includes(migrated.postMatch.status)) migrated.postMatch.status = 'review';
    validateState(migrated);
    return migrated;
  }

  // v1 used one flat draft object. Preserve operator data during upgrade.
  if (!isRecord(saved.teams) || !isRecord(saved.teams.blue) || !isRecord(saved.teams.red)) throw new DomainError('INVALID_SNAPSHOT', 'Snapshot không có dữ liệu đội.');
  for (const field of ['revision', 'timerMs'] as const) if (saved[field] !== undefined && (!Number.isSafeInteger(saved[field]) || saved[field] < 0)) throw new DomainError('INVALID_SNAPSHOT', 'Số lưu không hợp lệ.', [field]);
  const legacyTeam = (side: Side) => isRecord(saved.teams?.[side]) ? saved.teams[side] : {};
  for (const side of ["blue", "red"] as Side[]) {
    const team = legacyTeam(side);
    if (team.score !== undefined && (!Number.isSafeInteger(team.score) || team.score < 0)) throw new DomainError('INVALID_SNAPSHOT', 'Tỉ số lưu không hợp lệ.');
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
  defaults.activeOutput = 'none';
  defaults.lifecycle = defaults.draft.phase === "complete" ? "in-game" : "idle";
  defaults.lcu = { ...defaults.lcu, ...(isRecord(saved.lcu) ? saved.lcu : {}) };
  defaults.events = Array.isArray(saved.events) ? saved.events : [];
  validateState(defaults);
  return defaults;
}

export type StorageStage = 'write' | 'flush' | 'rename' | 'log';
export class StateManager {
  private state = createInitialState();
  private undoStack: BroadcastState[] = [];
  private redoStack: BroadcastState[] = [];
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private warning: string | null = null;
  readonly instanceId = crypto.randomUUID();
  constructor(private readonly dataDir = path.resolve('data'), private readonly fault?: (stage: StorageStage) => void | Promise<void>) {}
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(task);
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  async init() {
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(path.join(this.dataDir, 'backups'), { recursive: true });
    let raw: string | undefined;
    try { raw = await readFile(path.join(this.dataDir, 'snapshot.json'), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (raw !== undefined) {
      try { this.state = migrateSavedState(JSON.parse(raw)); }
      catch (error) {
        if (!(error instanceof SyntaxError || error instanceof DomainError)) throw error;
        await copyFile(path.join(this.dataDir, 'snapshot.json'), path.join(this.dataDir, `corrupt-${Date.now()}-${crypto.randomUUID()}.json`));
        this.warning = 'Snapshot lỗi đã được giữ riêng. Đang dùng dữ liệu phục hồi. Sóng đang tắt.';
        const backups = (await readdir(path.join(this.dataDir, 'backups'))).filter(name => /^snapshot-\d+-[\w-]+\.json$/.test(name)).sort().reverse();
        for (const name of backups) {
          try { this.state = migrateSavedState(JSON.parse(await readFile(path.join(this.dataDir, 'backups', name), 'utf8'))); break; }
          catch (backupError) { if (!(backupError instanceof SyntaxError || backupError instanceof DomainError)) throw backupError; }
        }
      }
    }
    this.state.activeOutput = 'none'; this.state.outputOwner = 'operator';
    this.state.draft.timerRunning = false;
    this.state.lcu = { ...createInitialState().lcu };
    reconcileOutput(this.state);
    validateState(this.state);
    await this.persist(this.state);
  }
  getState(): BroadcastState { return { ...structuredClone(this.state), serverInstanceId: this.instanceId, storageWarning: this.warning }; }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async dispatch(command: BroadcastCommand, source: SourceMode = 'manual') {
    validateCommand(command);
    return this.serial(async () => {
      if (command.type === 'UNDO' || command.type === 'REDO') {
        const from = command.type === 'UNDO' ? this.undoStack : this.redoStack;
        const to = command.type === 'UNDO' ? this.redoStack : this.undoStack;
        const previous = from.at(-1);
        if (!previous) return this.getState();
        const next = structuredClone(previous);
        next.lcu = structuredClone(this.state.lcu);
        next.activeOutput = 'none'; next.outputOwner = 'operator';
        if (['live', 'ready', 'fetching'].includes(next.postMatch.status)) next.postMatch.status = 'review';
        reconcileOutput(next);
        const before = structuredClone(this.state);
        const result = await this.commit(next, commandLabel(command), source);
        from.pop(); to.push(before); if (to.length > 50) to.shift();
        this.generation++;
        return result;
      }
      const next = command.type === 'RESET' ? createInitialState() : reduceDraft(this.state, command);
      if (JSON.stringify(next) === JSON.stringify(this.state)) return this.getState();
      const before = structuredClone(this.state);
      const result = await this.commit(next, commandLabel(command), source);
      this.undoStack.push(before); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack = [];
      if (['RESET', 'POST_MATCH_RESET', 'POST_MATCH_CREATE_MANUAL', 'POST_MATCH_LOAD_FIXTURE', 'POST_MATCH_BEGIN_FETCH'].includes(command.type)) this.generation++;
      return result;
    });
  }
  async beginPostMatchFetch() {
    return this.serial(async () => {
      const next = reduceDraft(this.state, { type: 'POST_MATCH_BEGIN_FETCH' });
      await this.commit(next, 'Post-match fetch started', 'manual');
      return ++this.generation;
    });
  }
  async cancelPostMatchFetch() {
    return this.serial(async () => {
      const next = structuredClone(this.state);
      if (next.postMatch.status === 'fetching') next.postMatch.status = next.postMatch.lastSyncedAt ? 'review' : 'waiting';
      next.activeOutput = 'none'; next.outputOwner = 'operator';
      const result = await this.commit(next, 'Post-match fetch cancelled', 'manual');
      this.generation++;
      return result;
    });
  }
  isCurrentFetch(generation: number) { return generation === this.generation && this.state.postMatch.status === 'fetching'; }
  async tick(deltaMs: number) {
    return this.serial(async () => {
      if (!this.state.draft.timerRunning) return this.getState();
      const next = structuredClone(this.state);
      next.draft.timerMs = Math.max(0, next.draft.timerMs - Math.max(0, Math.round(deltaMs)));
      if (!next.draft.timerMs) next.draft.timerRunning = false;
      return this.commit(next, 'Timer tick', next.source, false);
    });
  }
  async ingestLcuFrame(update: Parameters<StateManager['setLcuStatus']>[0], snapshot?: DraftFeedSnapshot) {
    return this.serial(async () => {
      const next = structuredClone(this.state);
      next.lcu = { ...next.lcu, ...update };
      if (!update.connected) next.lcu = { ...createInitialState().lcu, message: update.message };
      else next.lcu.lastSeenAt = new Date().toISOString();
      if (snapshot && next.draft.autoSync && !next.draft.manualOverride) {
        if (next.draft.phase !== snapshot.phase || Math.abs(next.draft.timerMs - snapshot.timerMs) >= 750) next.draft.timerMs = Math.max(0, Math.min(300000, Math.round(snapshot.timerMs)));
        next.draft.phase = snapshot.phase;
        next.draft.timerRunning = snapshot.timerRunning && next.draft.timerMs > 0;
        if (snapshot.activeSide) next.draft.activeSide = snapshot.activeSide;
        for (const side of ['blue', 'red'] as const) {
          next.draft.teams[side] = { picks: snapshot.teams[side].picks.map(pick => ({ championId: pick.championId, locked: pick.locked })), bans: [...snapshot.teams[side].bans] };
          snapshot.teams[side].picks.forEach((pick, index) => { if (pick.player !== undefined) next.match.teams[side].players[index] = pick.player.slice(0, 24); });
        }
        next.lcu.feed = 'champ-select'; next.lcu.sessionId = snapshot.feedId; next.lcu.lastPayloadAt = snapshot.observedAt;
      } else if (update.feed !== 'champ-select' || update.sessionId !== this.state.lcu.sessionId) next.lcu.lastPayloadAt = null;
      reconcileOutput(next);
      // A repeated poll refreshes liveness, but does not rewrite the disk just for timestamps.
      const comparable = (state: BroadcastState) => JSON.stringify({ ...state, lcu: { ...state.lcu, lastSeenAt: null, lastPayloadAt: null } });
      if (comparable(next) === comparable(this.state)) { this.state.lcu = next.lcu; return this.getState(); }
      return this.commit(next, 'LCU feed updated', 'lcu');
    });
  }
  async ingestDraftFeed(snapshot: DraftFeedSnapshot) {
    return this.ingestLcuFrame({ connected: true, message: 'LCU draft', feed: 'champ-select', sessionId: snapshot.feedId }, snapshot);
  }
  async setLcuStatus(update: Partial<BroadcastState['lcu']> & Pick<BroadcastState['lcu'], 'connected' | 'message'>) { return this.ingestLcuFrame(update); }
  async ingestPostMatch(data: PostMatchData, options: { matchId: string; source: Exclude<PostMatchDataSource, 'manual'>; confidence: ValidationConfidence; warnings?: string[]; missingFields?: string[]; generation?: number }) {
    return this.serial(async () => {
      if (options.generation !== undefined && !this.isCurrentFetch(options.generation)) return this.getState();
      const next = structuredClone(this.state);
      next.activeOutput = 'none'; next.outputOwner = 'operator';
      next.postMatch = { status: 'review', matchId: options.matchId, source: options.source, baselineSource: options.source, lastSyncedAt: new Date().toISOString(), confidence: options.confidence, baselineConfidence: options.confidence, baseline: structuredClone(data), data: structuredClone(data), overrideFields: [], warnings: options.warnings ?? [], missingFields: options.missingFields ?? [], baselineMissingFields: options.missingFields ?? [] };
      reconcileOutput(next);
      return this.commit(next, 'Post-match data loaded', options.source === 'lcu-provisional' ? 'lcu' : 'mock');
    });
  }
  async failPostMatch(message: string, generation?: number) {
    return this.serial(async () => {
      if (generation !== undefined && !this.isCurrentFetch(generation)) return this.getState();
      const next = structuredClone(this.state);
      next.activeOutput = 'none'; next.outputOwner = 'operator'; next.postMatch.status = 'error'; next.postMatch.confidence = 'unverified'; next.postMatch.warnings = [message];
      reconcileOutput(next);
      return this.commit(next, 'Post-match fetch failed', 'manual');
    });
  }
  private async commit(candidate: BroadcastState, label: string, source: SourceMode, log = true) {
    const next = structuredClone(candidate);
    next.revision = this.state.revision + 1; next.serverInstanceId = ''; next.storageWarning = null;
    next.source = next.draft.manualOverride ? 'manual' : source;
    const entry: EventEntry = { id: crypto.randomUUID(), at: new Date().toISOString(), source, label, revision: next.revision };
    if (log) next.events = [entry, ...this.state.events].slice(0, 80);
    validateState(next);
    try { await this.persist(next); }
    catch { this.warning = 'Không lưu được dữ liệu. Thay đổi chưa áp dụng.'; throw new DomainError('SAVE_FAILED', this.warning, [], 503); }
    this.state = next;
    if (this.warning === 'Không lưu được dữ liệu. Thay đổi chưa áp dụng.') this.warning = null;
    if (log) {
      try {
        await this.fault?.('log');
        const logPath = path.join(this.dataDir, 'events.jsonl');
        const size = await stat(logPath).then(info => info.size, error => { if (error.code === 'ENOENT') return 0; throw error; });
        if (size >= 10 * 1024 * 1024) {
          await unlink(`${logPath}.4`).catch(error => { if (error.code !== 'ENOENT') throw error; });
          for (let index = 3; index >= 0; index--) await rename(index ? `${logPath}.${index}` : logPath, `${logPath}.${index + 1}`).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
        await appendFile(logPath, `${JSON.stringify(entry)}\n`);
      } catch { this.warning = 'Dữ liệu đã lưu. Event log đang lỗi.'; }
    }
    const result = this.getState();
    for (const listener of this.listeners) { try { listener(result); } catch { this.warning = 'Một kết nối chưa nhận được state mới.'; } }
    return result;
  }
  private async persist(state: BroadcastState) {
    const destination = path.join(this.dataDir, 'snapshot.json');
    const temp = path.join(this.dataDir, `snapshot-${crypto.randomUUID()}.tmp`);
    try {
      try {
        const raw = await readFile(destination, 'utf8');
        migrateSavedState(JSON.parse(raw));
        const backup = `snapshot-${String(this.state.revision).padStart(16, '0')}-${Date.now()}-${crypto.randomUUID()}.json`;
        await copyFile(destination, path.join(this.dataDir, 'backups', backup));
      } catch (error) { if (!(error instanceof SyntaxError || error instanceof DomainError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const handle = await open(temp, 'wx');
      try { await this.fault?.('write'); await handle.writeFile(JSON.stringify(state, null, 2)); await this.fault?.('flush'); await handle.sync(); }
      finally { await handle.close(); }
      for (let attempt = 0; ; attempt++) {
        try { await this.fault?.('rename'); await rename(temp, destination); break; }
        catch (error) { if (attempt === 3 || !['EBUSY', 'EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; await new Promise(resolve => setTimeout(resolve, [50, 100, 200][attempt])); }
      }
      const backups = (await readdir(path.join(this.dataDir, 'backups')).catch(() => [])).filter(name => /^snapshot-\d+-[\w-]+\.json$/.test(name)).sort().reverse();
      for (const name of backups.slice(10)) await unlink(path.join(this.dataDir, 'backups', name)).catch(() => undefined);
    } finally { await unlink(temp).catch(() => undefined); }
  }
}
