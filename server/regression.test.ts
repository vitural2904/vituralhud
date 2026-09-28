import { mkdtemp, readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { StateManager, migrateSavedState, type StorageStage } from './state-manager';
import { createInitialState, reduceDraft } from '../src/domain/state';
import { numericPostFields } from '../src/domain/fields';
import type { BroadcastCommand } from '../src/domain/types';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function directory() { const dir = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-regression-')); cleanups.push(() => rm(dir, { recursive: true, force: true })); return dir; }
async function manager(fault?: (stage: StorageStage) => void | Promise<void>) { const dir = await directory(); const state = new StateManager(dir, fault); await state.init(); return { state, dir }; }
async function api(options: Partial<Parameters<typeof createApp>[0]> = {}) {
  const service = await createApp({ dataDir: await directory(), port: 4187, ...options });
  cleanups.push(() => service.app.close());
  const headers = { host: '127.0.0.1:4187' };
  const token = (await service.app.inject({ url: '/api/control-session', headers })).json().token;
  const post = (url: string, payload?: any, extra = {}) => service.app.inject({ method: 'POST', url, headers: { ...headers, 'x-virtualhud-control': token, ...extra }, payload });
  return { ...service, headers, token, post };
}
const validRiot = { metadata: { matchId: 'VN2_123' }, info: { gameVersion: '16.16.1', gameDuration: 1000, participants: [{ teamId: 100, championId: 62 }, { teamId: 200, championName: 'annie' }], teams: [{ teamId: 100, win: true }, { teamId: 200, win: false }] } };

describe('F01/F11 API validation and access', () => {
  it('closes open WebSockets promptly during shutdown', async () => {
    const { app } = await createApp({ dataDir: await directory(), port: 4192 });
    cleanups.push(() => app.close()); await app.listen({ host: '127.0.0.1', port: 4192 });
    const socket = new WebSocket('ws://127.0.0.1:4192/ws');
    await new Promise<void>((resolve, reject) => { socket.onopen = () => resolve(); socket.onerror = () => reject(new Error('WS failed')); });
    await Promise.race([app.close(), new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Close stalled')), 1500))]);
  });
  it('rejects foreign Host, Origin and missing control token; allows same-origin controls', async () => {
    const { app, post, headers } = await api();
    expect((await app.inject({ url: '/api/state', headers: { host: 'evil.example:4187' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/control-session', headers: { ...headers, origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/control-session', headers: { ...headers, 'sec-fetch-site': 'cross-site' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/actions', headers, payload: { type: 'RESET' } })).statusCode).toBe(403);
    expect((await post('/api/actions', { type: 'SET_MATCH', field: 'matchName', value: 'Đội Việt' }, { origin: 'http://127.0.0.1:4187' })).statusCode).toBe(200);
    await expect(app.injectWS('/ws', { headers: { host: '127.0.0.1:4187', origin: 'https://evil.example' } })).rejects.toThrow('403');
  });
  it('rejects malformed commands on every alias without changing RAM or disk', async () => {
    const { post, manager } = await api(); const before = manager.getState();
    const invalid = [null, {}, { type: 'FAKE' }, { type: 'SET_SCORE', side: 'blue', value: '1' }, { type: 'SET_SCORE', side: 'blue', value: 1.5 }, { type: 'SET_SCORE', side: 'blue', value: 3 }, { type: 'SET_PICK', side: 'red', index: 5, championId: 'Ashe' }, { type: 'SET_BAN', side: 'blue', index: 0, championId: 'Unknown' }, { type: 'RESET', extra: true }, { type: 'POST_MATCH_BEGIN_FETCH' }, { type: 'SET_TEAM', side: 'blue', field: 'logoUrl', value: 'https://evil.example/logo.png' }];
    for (const url of ['/api/actions', '/api/draft/actions', '/api/post-match/actions']) for (const value of invalid) expect((await post(url, value)).statusCode).toBe(400);
    expect(manager.getState()).toEqual(before);
  });
  it('returns 409 for review conflicts and 404 for missing assets', async () => {
    const { app, post, headers } = await api();
    expect((await post('/api/actions', { type: 'SET_OUTPUT', output: 'post-match' })).statusCode).toBe(409);
    expect((await app.inject({ url: '/missing-font.woff2', headers })).statusCode).toBe(404);
  });
});

describe('F02/F03/F15/F26 durable state', () => {
  it('serializes 100 concurrent writes; disk and RAM agree; only 10 backups', async () => {
    const { state, dir } = await manager();
    const updates = await Promise.all(Array.from({ length: 100 }, (_, i) => state.dispatch({ type: 'SET_MATCH', field: 'matchName', value: `Round ${i}` })));
    expect(updates.map(s => s.revision)).toEqual(Array.from({ length: 100 }, (_, i) => i + 2));
    const disk = JSON.parse(await readFile(path.join(dir, 'snapshot.json'), 'utf8'));
    expect(disk.revision).toBe(state.getState().revision);
    expect(disk.match.matchName).toBe('Round 99');
    expect((await readdir(path.join(dir, 'backups'))).length).toBe(10);
    expect((await readdir(dir)).some(name => name.endsWith('.tmp'))).toBe(false);
  });
  it.each(['write', 'flush', 'rename'] as const)('preserves committed data when %s fails; next write can recover', async stage => {
    let enabled = false;
    const { state, dir } = await manager(point => { if (enabled && point === stage) throw new Error('injected storage failure'); });
    const previous = await readFile(path.join(dir, 'snapshot.json'), 'utf8');
    enabled = true;
    await expect(state.dispatch({ type: 'SET_MATCH', field: 'matchName', value: 'Lost' })).rejects.toMatchObject({ statusCode: 503 });
    expect(state.getState().revision).toBe(1); expect(state.getState().storageWarning).toBeTruthy();
    expect(await readFile(path.join(dir, 'snapshot.json'), 'utf8')).toBe(previous);
    enabled = false; await state.dispatch({ type: 'SET_MATCH', field: 'matchName', value: 'Saved' });
    expect(state.getState().storageWarning).toBeNull();
  });
  it('retries Windows locks; event-log failure does not roll back a saved snapshot', async () => {
    let locks = 0; let enabled = false;
    const { state } = await manager(stage => { if (!enabled) return; if (stage === 'rename' && locks++ < 3) throw Object.assign(new Error('locked'), { code: 'EBUSY' }); if (stage === 'log') throw new Error('log failed'); });
    enabled = true;
    await state.dispatch({ type: 'SET_MATCH', field: 'matchName', value: 'Locked write' });
    expect(locks).toBe(4); expect(state.getState().match.matchName).toBe('Locked write'); expect(state.getState().storageWarning).toContain('Event log');
  });
  it('preserves corrupt bytes and restores last good backup off-air', async () => {
    const { state, dir } = await manager();
    await state.dispatch({ type: 'SET_MATCH', field: 'matchName', value: 'Recover me' });
    await state.dispatch({ type: 'SET_OUTPUT', output: 'draft' });
    await writeFile(path.join(dir, 'snapshot.json'), '{broken');
    const recovered = new StateManager(dir); await recovered.init();
    expect(recovered.getState().match.matchName).toBe('Recover me'); expect(recovered.getState().activeOutput).toBe('none');
    const preserved = (await readdir(dir)).find(name => name.startsWith('corrupt-'))!;
    expect(await readFile(path.join(dir, preserved), 'utf8')).toBe('{broken');
  });
  it('keeps corrupt snapshots without backups; rejects bad v2 fields', async () => {
    const dir = await directory(); await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, 'snapshot.json'), '[]');
    const state = new StateManager(dir); await state.init(); expect(state.getState().storageWarning).toBeTruthy();
    for (const corrupt of [null, [], { ...createInitialState(), schemaVersion: 99 }, { ...createInitialState(), activeOutput: 'BAD' }]) expect(() => migrateSavedState(corrupt)).toThrow();
    const invalid = createInitialState() as any; invalid.postMatch.data.teams.blue.players[0].kills = '1'; expect(() => migrateSavedState(invalid)).toThrow();
  });
  it('rotates logs at 10 MiB and restarts with data, new epoch, off-air', async () => {
    const { state, dir } = await manager();
    await writeFile(path.join(dir, 'events.jsonl'), Buffer.alloc(10 * 1024 * 1024, 32));
    await state.dispatch({ type: 'SET_MATCH', field: 'matchName', value: 'Restarted' });
    await state.dispatch({ type: 'SET_OUTPUT', output: 'draft' });
    expect((await readdir(dir)).includes('events.jsonl.1')).toBe(true);
    const restart = new StateManager(dir); await restart.init();
    expect(restart.getState().match.matchName).toBe('Restarted'); expect(restart.getState().activeOutput).toBe('none'); expect(restart.instanceId).not.toBe(state.instanceId);
  });
});

describe('F04/F05/F06/F07/F10/F18 review and output', () => {
  const live = () => reduceDraft(reduceDraft(reduceDraft(createInitialState(), { type: 'POST_MATCH_LOAD_FIXTURE' }), { type: 'POST_MATCH_SET_READY', value: true }), { type: 'SET_OUTPUT', output: 'post-match' });
  it('unchanged field edits keep approval and live output', () => {
    const before = live();
    expect(reduceDraft(before, { type: 'POST_MATCH_SET_DURATION', seconds: before.postMatch.data.durationSeconds })).toBe(before);
    expect(reduceDraft(before, { type: 'SET_TEAM', side: 'blue', field: 'name', value: before.match.teams.blue.name })).toBe(before);
  });
  it.each<BroadcastCommand>([
    { type: 'SET_MATCH', field: 'patch', value: 'New patch' }, { type: 'SET_TEAM', side: 'blue', field: 'name', value: 'New team' }, { type: 'SET_SCORE', side: 'red', value: 1 }, { type: 'POST_MATCH_SET_PLAYER_IDENTITY', side: 'red', index: 0, field: 'player', value: 'New player' }, { type: 'POST_MATCH_SET_DURATION', seconds: 99 },
  ])('takes every changed rendered field off-air: $type', command => {
    const changed = reduceDraft(live(), command); expect(changed.activeOutput).toBe('none'); expect(changed.postMatch.status).toBe('review');
  });
  it('manual report needs explicit zeros, identities, winner and duration before approval', () => {
    let state = reduceDraft(createInitialState(), { type: 'POST_MATCH_CREATE_MANUAL' });
    expect(state.postMatch.missingFields.length).toBeGreaterThan(80);
    expect(() => reduceDraft(state, { type: 'POST_MATCH_SET_READY', value: true })).toThrow();
    state = reduceDraft(state, { type: 'POST_MATCH_CONFIRM_ZERO', fields: [...numericPostFields] });
    state = reduceDraft(state, { type: 'POST_MATCH_SET_DURATION', seconds: 1500 });
    state = reduceDraft(state, { type: 'POST_MATCH_SET_WINNER', side: 'blue' });
    state = reduceDraft(state, { type: 'POST_MATCH_SET_EARLY_OBJECTIVE', objective: 'voidGrubs' });
    for (const side of ['blue', 'red'] as const) for (let index = 0; index < 5; index++) {
      state = reduceDraft(state, { type: 'POST_MATCH_SET_PLAYER_IDENTITY', side, index, field: 'player', value: `Player ${index}` });
      state = reduceDraft(state, { type: 'POST_MATCH_SET_PLAYER_IDENTITY', side, index, field: 'championId', value: 'Ashe' });
    }
    expect(state.postMatch.missingFields).toEqual([]);
    expect(reduceDraft(state, { type: 'POST_MATCH_SET_READY', value: true }).postMatch.status).toBe('ready');
    state = reduceDraft(state, { type: 'POST_MATCH_SET_PLAYER_METRIC', side: 'blue', index: 0, field: 'kills', value: 1 });
    expect(() => reduceDraft(state, { type: 'POST_MATCH_SET_READY', value: true })).toThrow();
    state = reduceDraft(state, { type: 'POST_MATCH_SET_METRIC', side: 'blue', field: 'kills', value: 1 });
    state = reduceDraft(state, { type: 'POST_MATCH_SET_PLAYER_METRIC', side: 'blue', index: 0, field: 'largestKillingSpree', value: 2 });
    expect(() => reduceDraft(state, { type: 'POST_MATCH_SET_READY', value: true })).toThrow();
  });
  it('LCU finalization remains off-air with no explicit owner and cannot steal post-match', async () => {
    const { state } = await manager();
    await state.dispatch({ type: 'POST_MATCH_LOAD_FIXTURE' }); await state.dispatch({ type: 'POST_MATCH_SET_READY', value: true }); await state.dispatch({ type: 'SET_OUTPUT', output: 'post-match' });
    const picks = Array.from({ length: 5 }, () => ({ championId: null, locked: false }));
    await state.ingestDraftFeed({ feedId: 'next', observedAt: new Date().toISOString(), phase: 'complete', timerMs: 0, timerRunning: false, teams: { blue: { picks, bans: Array(5).fill(null) }, red: { picks, bans: Array(5).fill(null) } } });
    expect(state.getState().activeOutput).toBe('post-match');
    await state.dispatch({ type: 'RESUME_AUTO_OUTPUT' }); expect(state.getState().activeOutput).toBe('none');
    for (let index = 0; index < 2; index++) {
      await state.ingestDraftFeed({ feedId: 'finalization', observedAt: new Date().toISOString(), phase: 'complete', timerMs: 0, timerRunning: false, teams: { blue: { picks, bans: Array(5).fill(null) }, red: { picks, bans: Array(5).fill(null) } } });
      expect(state.getState().activeOutput).toBe('none');
    }
    await state.ingestDraftFeed({ feedId: 'next', observedAt: new Date().toISOString(), phase: 'waiting', timerMs: 0, timerRunning: false, teams: { blue: { picks, bans: Array(5).fill(null) }, red: { picks, bans: Array(5).fill(null) } } });
    expect(state.getState().activeOutput).toBe('none');
  });
});

describe('F12/F13 bounded fetch and cancellation', () => {
  it('validates ID and missing key before touching review', async () => {
    const { post, manager } = await api(); const before = manager.getState();
    expect((await post('/api/post-match/resolve', { matchId: 'BAD' })).statusCode).toBe(400);
    expect((await post('/api/post-match/resolve', { matchId: 'VN2_123' })).statusCode).toBe(400);
    expect(manager.getState()).toEqual(before);
  });
  it('returns 504 and unlocks review on deadline', async () => {
    const fetchImpl: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true }));
    const { post, manager } = await api({ apiKey: 'test', fetchImpl, timeoutMs: 40 });
    expect((await post('/api/post-match/resolve', { matchId: 'VN2_123' })).statusCode).toBe(504);
    expect(manager.getState().postMatch.status).toBe('error');
  });
  it.each(['RESET', 'POST_MATCH_RESET', 'POST_MATCH_CREATE_MANUAL'] as const)('ignores a late result after $type', async type => {
    let resolve!: (response: Response) => void; let started!: () => void; const fetching = new Promise<void>(r => { started = r; });
    const fetchImpl: typeof fetch = async () => { started(); return new Promise(r => { resolve = r; }); };
    const { post, manager } = await api({ apiKey: 'test', fetchImpl });
    const pending = post('/api/post-match/resolve', { matchId: 'VN2_123' }); await fetching;
    await post('/api/actions', { type }); const revision = manager.getState().revision;
    resolve(new Response(JSON.stringify(validRiot))); await pending;
    expect(manager.getState().revision).toBe(revision); expect(manager.getState().postMatch.matchId).toBe(''); expect(manager.getState().activeOutput).toBe('none');
  });
  it('cancels and discards a late response', async () => {
    let resolve!: (response: Response) => void; let started!: () => void; const fetching = new Promise<void>(r => { started = r; });
    const { post, manager } = await api({ apiKey: 'test', fetchImpl: async () => { started(); return new Promise(r => { resolve = r; }); } });
    const pending = post('/api/post-match/resolve', { matchId: 'VN2_123' }); await fetching; await post('/api/post-match/cancel'); resolve(new Response(JSON.stringify(validRiot))); await pending;
    expect(manager.getState().postMatch.status).toBe('waiting');
  });
});

describe('F19 decoded image uploads', () => {
  it('rejects an 8-byte PNG signature; normalizes genuine images', async () => {
    const { post } = await api();
    expect((await post('/api/team-logos', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { 'content-type': 'image/png' })).statusCode).toBe(415);
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } }).jpeg().toBuffer();
    const accepted = await post('/api/team-logos', jpeg, { 'content-type': 'image/jpeg', 'x-file-name': '../../evil.jpg' });
    expect(accepted.statusCode).toBe(200); expect(accepted.json().asset.url).toMatch(/^\/team-uploads\/[\w-]+\.png$/);
  });
});
