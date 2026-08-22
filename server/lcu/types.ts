import type { DraftFeedSnapshot, LcuSessionKind, Side } from "../../src/domain/types";

export type LcuLockfile = {
  port: number;
  password: string;
  protocol: "http" | "https";
  sourcePath: string;
};

export type LcuParticipant = {
  cellId: number;
  championId?: number;
  championPickIntent?: number;
  displayName?: string;
  summonerName?: string;
  gameName?: string;
  name?: string;
  team?: unknown;
};

export type LcuAction = {
  id: number;
  actorCellId: number;
  championId: number;
  completed: boolean;
  isInProgress?: boolean;
  type: "pick" | "ban";
};

export type LcuTimer = {
  phase?: string;
  adjustedTimeLeftInPhase?: number;
  timeLeftInPhase?: number;
};

export type LcuChampSelectSession = {
  id?: string | number;
  gameId?: string | number;
  isSpectating?: boolean;
  localPlayerCellId?: number;
  actions?: LcuAction[][];
  blueTeam?: LcuParticipant[];
  redTeam?: LcuParticipant[];
  myTeam?: LcuParticipant[];
  theirTeam?: LcuParticipant[];
  timer?: LcuTimer;
};

export type LcuTeamResolution = {
  teams: Record<Side, LcuParticipant[]> | null;
  sessionKind: LcuSessionKind;
  warnings: string[];
};

export type LcuNormalizationResult = {
  snapshot: DraftFeedSnapshot | null;
  sessionKind: LcuSessionKind;
  warnings: string[];
};

export type LcuRawFrame = {
  observedAt: string;
  gameflowPhase: string | null;
  session: unknown | null;
};
