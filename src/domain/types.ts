export type Side = "blue" | "red";
export type SourceMode = "mock" | "manual" | "lcu";
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
  player: string;
  locked: boolean;
};

export type TeamState = {
  side: Side;
  code: string;
  name: string;
  score: number;
  color: string;
  logoUrl: string;
  picks: DraftSlot[];
  bans: (string | null)[];
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

export type DraftState = {
  revision: number;
  source: SourceMode;
  phase: DraftPhase;
  timerMs: number;
  timerRunning: boolean;
  matchName: string;
  gameLabel: string;
  patch: string;
  bestOf: 1 | 3 | 5;
  activeSide: Side;
  autoSync: boolean;
  manualOverride: boolean;
  overlayVisible: boolean;
  lcu: {
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
  teams: Record<Side, TeamState>;
  events: EventEntry[];
};

export type DraftCommand =
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
  | { type: "RUN_DEMO_STEP" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET" };
