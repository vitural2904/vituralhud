export type Side = "blue" | "red";
export type SourceMode = "mock" | "manual" | "lcu";
export type Lifecycle = "idle" | "draft" | "in-game" | "post-match";
export type OutputScreen = "none" | "draft" | "post-match";

export type DraftPhase =
  | "waiting"
  | "ban-1"
  | "pick-1"
  | "ban-2"
  | "pick-2"
  | "complete";

export type Champion = {
  id: string;
  numericId: number;
  name: string;
  iconUrl: string;
  loadingUrl: string;
};

export type DraftSlot = {
  championId: string | null;
  locked: boolean;
};

export type MatchTeamState = {
  side: Side;
  code: string;
  name: string;
  score: number;
  color: string;
  logoUrl: string;
  players: string[];
};

export type MatchContext = {
  matchName: string;
  gameLabel: string;
  patch: string;
  bestOf: 1 | 3 | 5;
  teams: Record<Side, MatchTeamState>;
};

export type DraftTeamState = {
  picks: DraftSlot[];
  bans: (string | null)[];
};

export type DraftRuntimeState = {
  phase: DraftPhase;
  timerMs: number;
  timerRunning: boolean;
  activeSide: Side;
  autoSync: boolean;
  manualOverride: boolean;
  teams: Record<Side, DraftTeamState>;
};

export type PostMatchMetric =
  | "kills"
  | "gold"
  | "towers"
  | "dragons"
  | "barons"
  | "inhibitors"
  | "voidGrubs"
  | "riftHeralds";
export type PostMatchOverviewMetric = "gold" | "towers" | "dragons" | "barons" | "inhibitors" | "voidGrubs" | "riftHeralds";
export type PostMatchEarlyObjective = "voidGrubs" | "riftHeralds";
export type PostMatchStatus = "waiting" | "fetching" | "review" | "ready" | "live" | "error";
export type PostMatchDataSource = "fixture" | "match-v5" | "tournament" | "lcu-provisional" | "manual";
export type ValidationConfidence = "unverified" | "low" | "medium" | "high";

export type PostMatchPlayer = {
  player: string;
  championId: string | null;
  damageToChampions: number;
  kills: number;
  assists: number;
  largestKillingSpree: number;
  damageToObjectives: number;
};

export type PostMatchPlayerMetric = keyof Pick<PostMatchPlayer,
  "damageToChampions" | "kills" | "assists" | "largestKillingSpree" | "damageToObjectives"
>;

export type PostMatchTeamData = Record<PostMatchMetric, number> & {
  players: PostMatchPlayer[];
};

export type PostMatchData = {
  winner: Side;
  durationSeconds: number;
  earlyObjective: PostMatchEarlyObjective;
  teams: Record<Side, PostMatchTeamData>;
};

export type PostMatchState = {
  status: PostMatchStatus;
  matchId: string;
  source: PostMatchDataSource;
  baselineSource: Exclude<PostMatchDataSource, "manual">;
  lastSyncedAt: string | null;
  confidence: ValidationConfidence;
  baselineConfidence: ValidationConfidence;
  baseline: PostMatchData;
  data: PostMatchData;
  overrideFields: string[];
  warnings: string[];
};

export type EventEntry = {
  id: string;
  at: string;
  source: SourceMode;
  label: string;
  revision: number;
};

export type DraftFeedPick = {
  championId: string | null;
  locked: boolean;
  player?: string;
};

export type DraftFeedTeam = {
  picks: DraftFeedPick[];
  bans: (string | null)[];
};

export type DraftFeedSnapshot = {
  feedId: string;
  observedAt: string;
  phase: DraftPhase;
  timerMs: number;
  timerRunning: boolean;
  activeSide?: Side;
  teams: Record<Side, DraftFeedTeam>;
};

export type LcuFeedState = "offline" | "idle" | "champ-select" | "unresolved";
export type LcuSessionKind = "player" | "spectator" | "unknown";

export type LcuStatus = {
  connected: boolean;
  message: string;
  lastSeenAt: string | null;
  feed: LcuFeedState;
  gameflowPhase: string | null;
  sessionKind: LcuSessionKind;
  sessionId: string | null;
  lastPayloadAt: string | null;
  warnings: string[];
};

export type BroadcastState = {
  revision: number;
  source: SourceMode;
  lifecycle: Lifecycle;
  activeOutput: OutputScreen;
  match: MatchContext;
  draft: DraftRuntimeState;
  postMatch: PostMatchState;
  lcu: LcuStatus;
  events: EventEntry[];
};

// Migration alias for the existing LCU bridge and external imports.
export type DraftState = BroadcastState;

export type BroadcastCommand =
  | { type: "SET_MATCH"; field: "matchName" | "gameLabel" | "patch"; value: string }
  | { type: "SET_TEAM"; side: Side; field: "code" | "name" | "color" | "logoUrl"; value: string }
  | { type: "SET_SCORE"; side: Side; value: number }
  | { type: "SET_BEST_OF"; value: 1 | 3 | 5 }
  | { type: "SET_PLAYER"; side: Side; index: number; value: string }
  | { type: "SET_PICK"; side: Side; index: number; championId: string | null; locked?: boolean }
  | { type: "SET_BAN"; side: Side; index: number; championId: string | null }
  | { type: "SET_PHASE"; phase: DraftPhase; activeSide?: Side }
  | { type: "SET_TIMER"; timerMs: number }
  | { type: "TOGGLE_TIMER" }
  | { type: "SET_AUTO_SYNC"; value: boolean }
  | { type: "SET_OVERRIDE"; value: boolean }
  | { type: "SET_OVERLAY_VISIBLE"; value: boolean }
  | { type: "SET_OUTPUT"; output: OutputScreen }
  | { type: "POST_MATCH_BEGIN_FETCH" }
  | { type: "POST_MATCH_LOAD_FIXTURE" }
  | { type: "POST_MATCH_SET_WINNER"; side: Side }
  | { type: "POST_MATCH_SET_DURATION"; seconds: number }
  | { type: "POST_MATCH_SET_EARLY_OBJECTIVE"; objective: PostMatchEarlyObjective }
  | { type: "POST_MATCH_SET_METRIC"; side: Side; field: PostMatchMetric; value: number }
  | { type: "POST_MATCH_SET_PLAYER_METRIC"; side: Side; index: number; field: PostMatchPlayerMetric; value: number }
  | { type: "POST_MATCH_RESET_FIELD"; field: string }
  | { type: "POST_MATCH_RESET_OVERRIDES" }
  | { type: "POST_MATCH_SET_READY"; value: boolean }
  | { type: "POST_MATCH_RESET" }
  | { type: "RUN_DEMO_STEP" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET" };

export type DraftCommand = BroadcastCommand;
