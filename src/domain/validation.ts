import { teamMetrics, playerMetrics, postFields, numericPostFields } from './fields';
export { teamMetrics, playerMetrics, postFields, numericPostFields } from './fields';
import { Type, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { BroadcastCommand, BroadcastState, PostMatchData } from './types';
import { champions } from './catalog';


const choices = (values: readonly (string | number)[]) => Type.Union(values.map(value => Type.Literal(value)));
const object = (properties: Record<string, TSchema>) => Type.Object(properties, { additionalProperties: false });
const integer = (maximum = Number.MAX_SAFE_INTEGER, minimum = 0) => Type.Integer({ minimum, maximum });
const text = (maxLength: number) => Type.String({ maxLength });
const side = choices(['blue', 'red']);
const source = choices(['mock', 'manual', 'lcu']);
const dataSource = choices(['fixture', 'match-v5', 'tournament', 'lcu-provisional', 'manual']);
const confidence = choices(['unverified', 'low', 'medium', 'high']);
const champion = Type.Union([Type.Null(), choices(champions.map(item => item.id))]);
const phase = choices(['waiting', 'ban-1', 'pick-1', 'ban-2', 'pick-2', 'complete']);
const output = choices(['none', 'draft', 'post-match']);
const five = (item: TSchema) => Type.Array(item, { minItems: 5, maxItems: 5 });
const nullableText = Type.Union([Type.Null(), Type.String()]);
const logo = Type.String({ maxLength: 240, pattern: '^(/teams/|/team-uploads/)[A-Za-z0-9_.% -]+\\.(png|jpe?g|webp)$|^$' });
const color = Type.String({ pattern: '^#[a-fA-F0-9]{6}$' });

const fieldList = Type.Array(choices(postFields), { uniqueItems: true });
const player = object({ player: text(24), championId: champion, ...Object.fromEntries(playerMetrics.map(metric => [metric, integer()])) });
const postTeam = object({ ...Object.fromEntries(teamMetrics.map(metric => [metric, integer()])), players: five(player) });
export const postDataSchema = object({ winner: side, durationSeconds: integer(14400), earlyObjective: choices(['voidGrubs', 'riftHeralds']), teams: object({ blue: postTeam, red: postTeam }) });
const matchTeam = object({ side, code: text(28), name: text(28), color, logoUrl: logo, score: integer(3), players: five(text(24)) });
const draftTeam = object({ picks: five(object({ championId: champion, locked: Type.Boolean() })), bans: five(champion) });
export const stateSchema = object({
  schemaVersion: Type.Literal(2), serverInstanceId: Type.String(), outputOwner: choices(['operator', 'lcu']), storageWarning: nullableText,
  revision: integer(Number.MAX_SAFE_INTEGER, 1), source, lifecycle: choices(['idle', 'draft', 'in-game', 'post-match']), activeOutput: output,
  match: object({ matchName: text(40), gameLabel: text(40), patch: text(40), bestOf: choices([1, 3, 5]), teams: object({ blue: matchTeam, red: matchTeam }) }),
  draft: object({ phase, timerMs: integer(300000), timerRunning: Type.Boolean(), activeSide: side, autoSync: Type.Boolean(), manualOverride: Type.Boolean(), teams: object({ blue: draftTeam, red: draftTeam }) }),
  postMatch: object({ status: choices(['waiting', 'fetching', 'review', 'ready', 'live', 'error']), matchId: text(100), source: dataSource, baselineSource: dataSource, lastSyncedAt: nullableText, confidence, baselineConfidence: confidence, baseline: postDataSchema, data: postDataSchema, overrideFields: fieldList, warnings: Type.Array(Type.String()), missingFields: fieldList, baselineMissingFields: fieldList }),
  lcu: object({ connected: Type.Boolean(), message: Type.String(), lastSeenAt: nullableText, feed: choices(['offline', 'idle', 'champ-select', 'unresolved']), gameflowPhase: nullableText, sessionKind: choices(['player', 'spectator', 'unknown']), sessionId: nullableText, lastPayloadAt: nullableText, warnings: Type.Array(Type.String()) }),
  events: Type.Array(object({ id: Type.String(), at: Type.String(), source, label: Type.String(), revision: integer(Number.MAX_SAFE_INTEGER, 1) }), { maxItems: 80 }),
});

const command = (type: string, fields: Record<string, TSchema> = {}) => object({ type: Type.Literal(type), ...fields });
export const commandSchema = Type.Union([
  command('SET_MATCH', { field: choices(['matchName', 'gameLabel', 'patch']), value: text(40) }),
  ...(['code', 'name', 'color', 'logoUrl'] as const).map(field => command('SET_TEAM', { side, field: Type.Literal(field), value: field === 'color' ? color : field === 'logoUrl' ? logo : text(28) })),
  command('SET_SCORE', { side, value: integer(3) }), command('SET_BEST_OF', { value: choices([1, 3, 5]) }),
  command('SET_PLAYER', { side, index: integer(4), value: text(24) }),
  command('SET_PICK', { side, index: integer(4), championId: champion, locked: Type.Optional(Type.Boolean()) }),
  command('SET_BAN', { side, index: integer(4), championId: champion }),
  command('SET_PHASE', { phase, activeSide: Type.Optional(side) }), command('SET_TIMER', { timerMs: integer(300000) }),
  ...['SET_AUTO_SYNC', 'SET_OVERRIDE', 'SET_OVERLAY_VISIBLE', 'POST_MATCH_SET_READY'].map(type => command(type, { value: Type.Boolean() })),
  command('SET_OUTPUT', { output }), command('POST_MATCH_SET_WINNER', { side }), command('POST_MATCH_SET_DURATION', { seconds: integer(14400) }),
  command('POST_MATCH_SET_EARLY_OBJECTIVE', { objective: choices(['voidGrubs', 'riftHeralds']) }),
  command('POST_MATCH_SET_METRIC', { side, field: choices(teamMetrics), value: integer() }),
  command('POST_MATCH_SET_PLAYER_METRIC', { side, index: integer(4), field: choices(playerMetrics), value: integer() }),
  command('POST_MATCH_SET_PLAYER_IDENTITY', { side, index: integer(4), field: Type.Literal('player'), value: text(24) }),
  command('POST_MATCH_SET_PLAYER_IDENTITY', { side, index: integer(4), field: Type.Literal('championId'), value: champion }),
  command('POST_MATCH_CONFIRM_ZERO', { fields: Type.Array(choices(numericPostFields), { uniqueItems: true }) }),
  command('POST_MATCH_RESET_FIELD', { field: choices(postFields) }),
  ...['RESUME_AUTO_OUTPUT', 'POST_MATCH_CREATE_MANUAL', 'POST_MATCH_BEGIN_FETCH', 'POST_MATCH_LOAD_FIXTURE', 'POST_MATCH_RESET_OVERRIDES', 'POST_MATCH_RESET', 'RUN_DEMO_STEP', 'UNDO', 'REDO', 'RESET', 'TOGGLE_TIMER'].map(type => command(type)),
]);

export class DomainError extends Error {
  constructor(readonly code: string, message: string, readonly fields: string[] = [], readonly statusCode = 409) { super(message); }
}
export function validateCommand(value: unknown, publicCommand = false): asserts value is BroadcastCommand {
  if (!Value.Check(commandSchema, value) || (publicCommand && (value as BroadcastCommand).type === 'POST_MATCH_BEGIN_FETCH')) throw new DomainError('INVALID_COMMAND', 'Lệnh không hợp lệ.', [], 400);
}
export function validateState(value: unknown): asserts value is BroadcastState {
  if (!Value.Check(stateSchema, value)) {
    const fields = Array.from(Value.Errors(stateSchema, value)).slice(0, 12).map(error => error.path);
    throw new DomainError('INVALID_STATE', 'Dữ liệu lưu không hợp lệ.', fields, 400);
  }
  const state = value as BroadcastState;
  for (const s of ['blue', 'red'] as const) if (state.match.teams[s].score > Math.ceil(state.match.bestOf / 2)) throw new DomainError('INVALID_SCORE', 'Tỉ số vượt best-of.');
}
export function approvalErrors(state: BroadcastState): string[] {
  const errors = [...state.postMatch.missingFields];
  const data: PostMatchData = state.postMatch.data;
  if (data.durationSeconds <= 0) errors.push('durationSeconds');
  for (const s of ['blue', 'red'] as const) {
    if (!state.match.teams[s].name.trim() || !state.match.teams[s].code.trim()) errors.push(`match.teams.${s}.name`);
    const team = data.teams[s];
    if (team.kills !== team.players.reduce((sum, p) => sum + p.kills, 0)) errors.push(`teams.${s}.kills`);
    team.players.forEach((p, index) => {
      if (!p.player.trim()) errors.push(`teams.${s}.players.${index}.player`);
      if (!p.championId) errors.push(`teams.${s}.players.${index}.championId`);
      if (p.largestKillingSpree > p.kills) errors.push(`teams.${s}.players.${index}.largestKillingSpree`);
    });
  }
  return [...new Set(errors)];
}
