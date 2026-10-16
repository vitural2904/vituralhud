import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from 'node:http';
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StateManager } from "../state-manager";
import { pollLcuOnce, startLcuAdapter } from "./adapter";
import { LcuHttpError } from "./http-client";
import { discoverLockfileCandidates } from './discovery';
vi.mock('./discovery', () => ({ discoverLockfileCandidates: vi.fn(async () => []) }));

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("LCU polling pipeline", () => {
  it('skips a stale lockfile whose reused port only returns 404 and discovers the real client', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-candidate-')); tempDirs.push(dir);
    const raw = JSON.parse(await readFile(path.resolve('fixtures/lcu/spectator-champ-select-session.json'), 'utf8'));
    const stale = createServer((_request, response) => { response.writeHead(404, { 'content-type': 'application/json' }); response.end('{}'); });
    const live = createServer((request, response) => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(request.url?.includes('gameflow') ? 'ChampSelect' : raw)); });
    await Promise.all([stale, live].map(server => new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))));
    const oldFile = path.join(dir, 'old-lock'), realFile = path.join(dir, 'real-lock');
    await writeFile(oldFile, `LeagueClient:${process.pid}:${(stale.address() as { port: number }).port}:fixture:http`);
    await writeFile(realFile, `LeagueClient:${process.pid}:${(live.address() as { port: number }).port}:fixture:http`);
    vi.stubEnv('LCU_LOCKFILE_PATH', oldFile);
    vi.mocked(discoverLockfileCandidates).mockResolvedValue([realFile]);
    const manager = new StateManager(dir); await manager.init();
    const stop = startLcuAdapter(manager);
    try { await vi.waitFor(() => expect(manager.getState().lcu.sessionId).toBe(String(raw.gameId)), { timeout: 2500 }); }
    finally { stop(); await Promise.all([stale, live].map(server => new Promise<void>(resolve => server.close(() => resolve())))); }
  });
  it('keeps a shared action-group clock when one simultaneous ban locks', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-shared-clock-')); tempDirs.push(dir);
    const manager = new StateManager(dir); await manager.init();
    const blue = { type: 'ban', actorCellId: 0, championId: 266, completed: false, isInProgress: true };
    const red = { type: 'ban', actorCellId: 5, championId: 22, completed: false, isInProgress: true };
    const raw = { gameId: 12, blueTeam: [{ cellId: 0 }], redTeam: [{ cellId: 5 }], actions: [[blue, red]], timer: { phase: 'BAN_PICK', adjustedTimeLeftInPhase: 30000 } };
    const client = { async getJson<T>(endpoint: string): Promise<T> { return (endpoint.includes('gameflow') ? 'ChampSelect' : raw) as T; } };
    await pollLcuOnce(client, manager); const initial = manager.getState().draft;
    blue.completed = true; blue.isInProgress = false; raw.timer.adjustedTimeLeftInPhase = 15000;
    await pollLcuOnce(client, manager); const remaining = manager.getState().draft;
    expect(remaining.timerMs).toBe(15000);
    expect(remaining.timerWindow).toBe(initial.timerWindow);
    expect(remaining.timerDurationMs).toBe(30000);
    raw.actions = [[blue, { ...red, completed: true, isInProgress: false }], [{ ...red, championId: 13 }]];
    raw.timer.adjustedTimeLeftInPhase = 30000;
    await pollLcuOnce(client, manager);
    expect(manager.getState().draft.timerWindow).not.toBe(initial.timerWindow);
  });
  it('publishes hover changes and lock-only changes for picks and bans', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-lock-states-'));
    tempDirs.push(dir);
    const manager = new StateManager(dir);
    await manager.init();
    const pick = { id: 1, actorCellId: 0, championId: 266, type: 'pick', completed: false, isInProgress: true };
    const ban = { id: 2, actorCellId: 5, championId: 22, type: 'ban', completed: false, isInProgress: true };
    const raw = { gameId: 123, blueTeam: [{ cellId: 0 }], redTeam: [{ cellId: 5 }], actions: [[pick, ban]], timer: { phase: 'BAN_PICK', adjustedTimeLeftInPhase: 30000 } };
    const client = { async getJson<T>(endpoint: string): Promise<T> { return (endpoint.includes('gameflow') ? 'ChampSelect' : raw) as T; } };
    await pollLcuOnce(client, manager);
    const hover = manager.getState();
    expect(hover.draft.teams.blue.picks[0]).toEqual({ championId: 'Aatrox', locked: false });
    expect(hover.draft.teams.red.bans[0]).toBe('Ashe');
    expect(hover.draft.teams.red.banLocked?.[0]).toBe(false);
    ban.championId = 13;
    await pollLcuOnce(client, manager);
    expect(manager.getState().draft.teams.red.bans[0]).toBe('Ryze');
    pick.completed = ban.completed = true;
    pick.isInProgress = ban.isInProgress = false;
    await pollLcuOnce(client, manager);
    const locked = manager.getState();
    expect(locked.revision).toBeGreaterThan(hover.revision);
    expect(locked.draft.teams.blue.picks[0]).toEqual({ championId: 'Aatrox', locked: true });
    expect(locked.draft.teams.red.bans[0]).toBe('Ryze');
    expect(locked.draft.teams.red.banLocked?.[0]).toBe(true);
  });
  it('holds the final lineup for 15 seconds across finalization and session removal', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-finalization-'));
    tempDirs.push(dir);
    let now = 0;
    const manager = new StateManager(dir, undefined, () => now);
    await manager.init();
    await manager.dispatch({ type: 'RESUME_AUTO_OUTPUT' });
    const raw = JSON.parse(await readFile(path.resolve('fixtures/lcu/spectator-champ-select-session.json'), 'utf8'));
    let phase = 'ChampSelect';
    let session: unknown = raw;
    const client = { async getJson<T>(endpoint: string): Promise<T> {
      if (endpoint.includes('gameflow')) return phase as T;
      if (!session) throw new LcuHttpError('LCU 404', 404, endpoint);
      return session as T;
    } };
    await pollLcuOnce(client, manager);
    expect(manager.getState().activeOutput).toBe('draft');
    raw.actions = [[...raw.blueTeam, ...raw.redTeam].map((player: { cellId: number }, index: number) => ({
      id: index, actorCellId: player.cellId, championId: index === 9 ? 22 : 266, type: 'pick', completed: true,
    }))];
    raw.timer.phase = 'FINALIZATION';
    await pollLcuOnce(client, manager);
    expect(manager.getState().draft.phase).toBe('complete');
    expect(manager.getState().draft.teams.red.picks[4].championId).toBe('Ashe');
    expect(manager.getState().activeOutput).toBe('draft');
    now += 10000;
    await manager.tick(10000);
    await pollLcuOnce(client, manager); // Repeated completed polls must not renew the hold.
    session = null; phase = 'GameStart';
    await pollLcuOnce(client, manager);
    now += 4999;
    await manager.tick(4999);
    expect(manager.getState().activeOutput).toBe('draft');
    session = raw;
    await pollLcuOnce(client, manager); // Endpoint can reappear during finalization.
    expect(manager.getState().activeOutput).toBe('draft');
    now += 1;
    await manager.tick(1);
    expect(manager.getState().activeOutput).toBe('none');
    await pollLcuOnce(client, manager);
    expect(manager.getState().activeOutput).toBe('none');
    // A new game can go live again. Operator fade then takes priority over its hold.
    raw.gameId++; raw.timer.phase = 'PLANNING';
    raw.actions[0][9].completed = false; raw.actions[0][9].isInProgress = true;
    phase = 'ChampSelect';
    await pollLcuOnce(client, manager);
    expect(manager.getState().activeOutput).toBe('draft');
    raw.actions[0][9].completed = true; raw.timer.phase = 'FINALIZATION';
    await pollLcuOnce(client, manager);
    expect(manager.getState().draft.finalizationMs).toBe(15000);
    await manager.dispatch({ type: 'SET_OUTPUT', output: 'none' });
    await pollLcuOnce(client, manager);
    expect(manager.getState().activeOutput).toBe('none');
    await manager.dispatch({ type: 'RESUME_AUTO_OUTPUT' });
    expect(manager.getState().activeOutput).toBe('none');
    raw.gameId++; raw.timer.phase = 'PLANNING'; raw.actions[0][9].completed = false;
    await pollLcuOnce(client, manager);
    raw.actions[0][9].completed = true; raw.timer.phase = 'FINALIZATION';
    await pollLcuOnce(client, manager);
    expect(manager.getState().activeOutput).toBe('draft');
    session = null; phase = 'Lobby';
    await pollLcuOnce(client, manager);
    expect(manager.getState().activeOutput).toBe('none');
  });
  it("moves a spectator payload through transport, mapper and state ingest", async () => {
    const raw = JSON.parse(await readFile(path.resolve("fixtures/lcu/spectator-champ-select-session.json"), "utf8")) as unknown;
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-lcu-poll-"));
    tempDirs.push(dir);
    const manager = new StateManager(dir);
    await manager.init();
    const client = {
      async getJson<T>(endpoint: string): Promise<T> {
        return (endpoint.includes("gameflow") ? "ChampSelect" : raw) as T;
      },
    };
    const result = await pollLcuOnce(client, manager);
    const state = manager.getState();
    expect(result.hasSession).toBe(true);
    expect(state.lcu.feed).toBe("champ-select");
    expect(state.lcu.sessionKind).toBe("spectator");
    expect(state.lcu.gameflowPhase).toBe("ChampSelect");
    expect(state.draft.teams.blue.picks[0].championId).toBe("Aatrox");
    expect(state.draft.teams.red.picks[0].championId).toBe("Syndra");
  });

  it("treats a missing champ-select session as an idle connected client", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-lcu-idle-"));
    tempDirs.push(dir);
    const manager = new StateManager(dir);
    await manager.init();
    const client = {
      async getJson<T>(endpoint: string): Promise<T> {
        if (endpoint.includes("gameflow")) return "Lobby" as T;
        throw new LcuHttpError("LCU 404", 404, endpoint);
      },
    };
    const result = await pollLcuOnce(client, manager);
    expect(result.hasSession).toBe(false);
    expect(result.status.connected).toBe(true);
    expect(result.status.feed).toBe("idle");
    expect(result.status.gameflowPhase).toBe("Lobby");
  });
});
