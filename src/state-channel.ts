import type { BroadcastState } from './domain/types';
import { championById } from './domain/catalog';
import { postFields, playerMetrics, teamMetrics } from './domain/fields';
const record = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown, maximum = Number.MAX_SAFE_INTEGER, minimum = 0) => Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
const text = (value: unknown, maximum = Infinity) => typeof value === 'string' && value.length <= maximum;
const nullableText = (value: unknown) => value === null || text(value);
const strings = (value: unknown) => Array.isArray(value) && value.every(item => text(item));
const oneOf = (value: unknown, choices: readonly unknown[]) => choices.includes(value);
const champion = (value: unknown) => value === null || typeof value === 'string' && Object.hasOwn(championById, value);
const five = (value: unknown, check: (item: any) => boolean) => Array.isArray(value) && value.length === 5 && value.every(check);
const fields = (value: unknown) => strings(value) && new Set(value as string[]).size === (value as string[]).length && (value as string[]).every(item => postFields.includes(item));
const postData = (data: any) => record(data) && oneOf(data.winner, ['blue', 'red']) && number(data.durationSeconds, 14400) && oneOf(data.earlyObjective, ['voidGrubs', 'riftHeralds']) && record(data.teams) && ['blue', 'red'].every(side => {
  const team = data.teams[side]; return record(team) && teamMetrics.every(metric => number(team[metric])) && five(team.players, p => record(p) && text(p.player, 24) && champion(p.championId) && playerMetrics.every(metric => number(p[metric])));
});
export function isRuntimeState(value: unknown): value is BroadcastState {
  if (!record(value) || value.schemaVersion !== 2 || typeof value.serverInstanceId !== 'string' || !value.serverInstanceId || !Number.isSafeInteger(value.revision) || value.revision < 1 || !['none', 'draft', 'post-match'].includes(value.activeOutput)) return false;
  if (!record(value.match) || !record(value.draft) || !record(value.postMatch) || !record(value.lcu) || !Array.isArray(value.events) || !Array.isArray(value.postMatch.missingFields)) return false;
  if (!oneOf(value.outputOwner, ['operator', 'lcu']) || !nullableText(value.storageWarning) || !oneOf(value.source, ['mock', 'manual', 'lcu']) || !oneOf(value.lifecycle, ['idle', 'draft', 'in-game', 'post-match'])) return false;
  const match = value.match; const draft = value.draft; const post = value.postMatch; const lcu = value.lcu;
  if (![match.matchName, match.gameLabel, match.patch].every(item => text(item, 40)) || !oneOf(match.bestOf, [1, 3, 5])) return false;
  if (!oneOf(draft.phase, ['waiting', 'ban-1', 'pick-1', 'ban-2', 'pick-2', 'complete']) || !number(draft.timerMs, 300000) || ![draft.timerRunning, draft.autoSync, draft.manualOverride].every(item => typeof item === 'boolean') || !oneOf(draft.activeSide, ['blue', 'red'])) return false;
  if (draft.timerDurationMs !== undefined && !number(draft.timerDurationMs, 300000)
    || draft.timerWindow !== undefined && !text(draft.timerWindow)
    || draft.finalizationMs !== undefined && !number(draft.finalizationMs, 15000)) return false;
  if (!oneOf(post.status, ['waiting', 'fetching', 'review', 'ready', 'live', 'error']) || !text(post.matchId, 100) || ![post.source, post.baselineSource].every(item => oneOf(item, ['fixture', 'match-v5', 'tournament', 'lcu-provisional', 'manual'])) || ![post.confidence, post.baselineConfidence].every(item => oneOf(item, ['unverified', 'low', 'medium', 'high'])) || !nullableText(post.lastSyncedAt) || !postData(post.data) || !postData(post.baseline) || ![post.overrideFields, post.missingFields, post.baselineMissingFields].every(fields) || !strings(post.warnings)) return false;
  if (typeof lcu.connected !== 'boolean' || !text(lcu.message) || ![lcu.lastSeenAt, lcu.lastPayloadAt, lcu.sessionId, lcu.gameflowPhase].every(nullableText) || !oneOf(lcu.feed, ['offline', 'idle', 'champ-select', 'unresolved']) || !oneOf(lcu.sessionKind, ['player', 'spectator', 'unknown']) || !strings(lcu.warnings)) return false;
  if (value.events.length > 80 || !value.events.every(item => record(item) && [item.id, item.at, item.label].every(s => text(s)) && oneOf(item.source, ['mock', 'manual', 'lcu']) && number(item.revision, Number.MAX_SAFE_INTEGER, 1))) return false;
  for (const side of ['blue', 'red']) {
    if (!record(value.match.teams?.[side]) || !record(value.draft.teams?.[side]) || !record(value.postMatch.data?.teams?.[side])) return false;
    if (![value.match.teams[side].players, value.draft.teams[side].picks, value.draft.teams[side].bans, value.postMatch.data.teams[side].players].every(items => Array.isArray(items) && items.length === 5)) return false;
    const team = match.teams[side]; const draftTeam = draft.teams[side];
    if (draftTeam.banLocked !== undefined && !five(draftTeam.banLocked, item => typeof item === 'boolean')) return false;
    if (team.side !== side || !text(team.name, 28) || !text(team.code, 28) || typeof team.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(team.color) || !text(team.logoUrl, 240) || !/^$|^(\/teams\/|\/team-uploads\/)[A-Za-z0-9_.% -]+\.(png|jpe?g|webp)$/.test(team.logoUrl) || !number(team.score, Math.ceil(match.bestOf / 2)) || !five(team.players, item => text(item, 24)) || !five(draftTeam.picks, p => record(p) && champion(p.championId) && typeof p.locked === 'boolean') || !five(draftTeam.bans, champion)) return false;
  }
  return true;
}
export class StateChannel {
  current: BroadcastState | undefined;
  private retired = new Set<string>();
  receive(value: unknown, newConnection = false): BroadcastState | undefined {
    if (!isRuntimeState(value) || this.retired.has(value.serverInstanceId)) return undefined;
    if (this.current && value.serverInstanceId !== this.current.serverInstanceId) {
      if (!newConnection) return undefined;
      this.retired.add(this.current.serverInstanceId);
    } else if (this.current && value.revision < this.current.revision) return undefined;
    this.current = value;
    return value;
  }
}
