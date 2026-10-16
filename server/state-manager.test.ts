import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DraftFeedSnapshot } from "../src/domain/types";
import { createInitialState } from "../src/domain/state";
import { StateManager, migrateSavedState } from "./state-manager";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("StateManager revision", () => {
  it('reads older bans as final and preserves explicit hover locks through saved-state loading', () => {
    const old = createInitialState();
    old.draft.teams.blue.bans[0] = 'Ashe';
    const loaded = migrateSavedState(old);
    expect(loaded.draft.teams.blue.bans[0]).toBe('Ashe');
    expect(loaded.draft.teams.blue.banLocked).toBeUndefined();
    old.draft.teams.blue.banLocked = [false, false, false, false, false];
    expect(migrateSavedState(old).draft.teams.blue.banLocked?.[0]).toBe(false);
  });
  it('marks new missing legacy metrics as unknown instead of confirmed zeros', () => {
    const legacy = createInitialState() as any;
    delete legacy.schemaVersion; legacy.postMatch.status = 'review';
    delete legacy.postMatch.missingFields; delete legacy.postMatch.baselineMissingFields;
    delete legacy.postMatch.data.teams.blue.inhibitors;
    delete legacy.postMatch.baseline.teams.blue.inhibitors;
    expect(migrateSavedState(legacy).postMatch.missingFields).toContain('teams.blue.inhibitors');
    expect(migrateSavedState(legacy).postMatch.baselineMissingFields).toContain('teams.blue.inhibitors');
  });
  it("stays strictly monotonic across undo and redo", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-state-"));
    tempDirs.push(dir);
    const manager = new StateManager(dir);
    await manager.init();
    const first = await manager.dispatch({ type: "SET_SCORE", side: "blue", value: 1 });
    const undone = await manager.dispatch({ type: "UNDO" });
    const redone = await manager.dispatch({ type: "REDO" });
    expect([first.revision, undone.revision, redone.revision]).toEqual([2, 3, 4]);
    expect(redone.match.teams.blue.score).toBe(1);
  });

  it("applies one external snapshot as one atomic revision", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-feed-"));
    tempDirs.push(dir);
    const manager = new StateManager(dir);
    await manager.init();
    const emptyPicks = () => Array.from({ length: 5 }, () => ({ championId: null, locked: false }));
    const snapshot: DraftFeedSnapshot = {
      feedId: "fixture-1",
      observedAt: "2026-08-23T00:00:00.000Z",
      phase: "pick-1",
      timerMs: 28_000,
      timerRunning: true,
      activeSide: "red",
      teams: {
        blue: { picks: emptyPicks(), bans: ["Aatrox", null, null, null, null] },
        red: { picks: emptyPicks(), bans: ["Xayah", null, null, null, null] },
      },
    };
    snapshot.teams.blue.picks[0] = { championId: "Ryze", locked: true, player: "Người chơi" };
    const state = await manager.ingestDraftFeed(snapshot);
    expect(state.revision).toBe(2);
    expect(state.draft.phase).toBe("pick-1");
    expect(state.draft.activeSide).toBe("red");
    expect(state.draft.teams.blue.picks[0]).toEqual({ championId: "Ryze", locked: true });
    expect(state.match.teams.blue.players[0]).toBe("Người chơi");
    expect(state.draft.teams.blue.bans[0]).toBe("Aatrox");
    expect(state.lcu.sessionId).toBe("fixture-1");
    const jittered = await manager.ingestDraftFeed({ ...snapshot, timerMs: 27_500 });
    expect(jittered.revision).toBe(2);
    expect(jittered.draft.timerMs).toBe(28_000);
    expect(jittered.draft.timerDurationMs).toBe(28_000);
    const adjusted = await manager.ingestDraftFeed({ ...snapshot, timerMs: 20_000 });
    expect(adjusted.draft.timerDurationMs).toBe(28_000);
    expect(adjusted.draft.timerWindow).toBe(jittered.draft.timerWindow);
    const nextAction = await manager.ingestDraftFeed({ ...snapshot, timerKey: 'next-action', timerMs: 15_000 });
    expect(nextAction.draft.timerDurationMs).toBe(15_000);
    expect(nextAction.draft.timerWindow).not.toBe(jittered.draft.timerWindow);
    await manager.setLcuStatus({ connected: false, message: 'Reconnect fixture' });
    const reconnected = await manager.ingestDraftFeed({ ...snapshot, timerKey: 'next-action', timerMs: 10000 });
    expect(reconnected.draft.timerDurationMs).toBe(15000);
  });

  it("does not apply an external snapshot during manual override", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-override-"));
    tempDirs.push(dir);
    const manager = new StateManager(dir);
    await manager.init();
    await manager.dispatch({ type: "SET_OVERRIDE", value: true });
    const before = manager.getState();
    const state = await manager.ingestDraftFeed({
      feedId: "blocked",
      observedAt: "2026-08-23T00:00:00.000Z",
      phase: "waiting",
      timerMs: 0,
      timerRunning: false,
      teams: {
        blue: { picks: [], bans: [] },
        red: { picks: [], bans: [] },
      },
    });
    expect(state.revision).toBeGreaterThan(before.revision);
    expect(state.lcu.connected).toBe(true);
    expect(state.draft.phase).toBe(before.draft.phase);
  });

  it("shows the overlay only during LCU champ select", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-overlay-"));
    tempDirs.push(dir);
    const manager = new StateManager(dir);
    await manager.init();

    const unresolved = await manager.setLcuStatus({
      connected: true,
      message: "Đang đọc champ select",
      feed: "champ-select",
      gameflowPhase: "ChampSelect",
    });
    expect(unresolved.activeOutput).toBe('none');
    await manager.dispatch({ type: 'RESUME_AUTO_OUTPUT' });
    const visible = await manager.ingestDraftFeed({ feedId: 'real-session', observedAt: new Date().toISOString(), phase: 'pick-1', timerMs: 30000, timerRunning: true, teams: { blue: { picks: Array.from({length: 5}, () => ({ championId: null, locked: false })), bans: Array(5).fill(null) }, red: { picks: Array.from({length: 5}, () => ({ championId: null, locked: false })), bans: Array(5).fill(null) } } });
    const hidden = await manager.setLcuStatus({
      connected: true,
      message: "League Client: Lobby",
      feed: "idle",
      gameflowPhase: "Lobby",
    });

    expect(visible.activeOutput).toBe("draft");
    expect(hidden.activeOutput).toBe("none");
  });

  it("does not override the director fade while manual override is active", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-director-"));
    tempDirs.push(dir);
    const manager = new StateManager(dir);
    await manager.init();
    await manager.dispatch({ type: "SET_OVERRIDE", value: true });
    await manager.dispatch({ type: "SET_OVERLAY_VISIBLE", value: true });

    const state = await manager.setLcuStatus({
      connected: true,
      message: "League Client: Lobby",
      feed: "idle",
      gameflowPhase: "Lobby",
    });

    expect(state.activeOutput).toBe("draft");
  });

  it("does not take a live post-match report off air when LCU disconnects", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-post-live-"));
    tempDirs.push(dir);
    const manager = new StateManager(dir);
    await manager.init();
    await manager.dispatch({ type: "POST_MATCH_LOAD_FIXTURE" });
    await manager.dispatch({ type: "POST_MATCH_SET_READY", value: true });
    await manager.dispatch({ type: "SET_OUTPUT", output: "post-match" });

    const offline = await manager.setLcuStatus({
      connected: false,
      message: "Chưa thấy League Client",
    });
    const nextChampSelect = await manager.setLcuStatus({
      connected: true,
      message: "Đang đọc champ select",
      feed: "champ-select",
      gameflowPhase: "ChampSelect",
    });

    expect(offline.activeOutput).toBe("post-match");
    expect(offline.lifecycle).toBe("post-match");
    expect(offline.postMatch.status).toBe("live");
    expect(nextChampSelect.activeOutput).toBe("post-match");
    expect(nextChampSelect.lifecycle).toBe("post-match");
  });

  it("migrates a v1 snapshot without losing team or player data", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-migrate-"));
    tempDirs.push(dir);
    await writeFile(path.join(dir, "snapshot.json"), JSON.stringify({
      revision: 42,
      matchName: "CCS XI",
      gameLabel: "GAME 2",
      patch: "16.16.1",
      bestOf: 5,
      phase: "pick-1",
      overlayVisible: true,
      teams: {
        blue: { name: "T1", code: "T1", logoUrl: "/teams/T1.png", score: 1, picks: [{ championId: "Ashe", player: "vitural", locked: true }], bans: ["Aatrox"] },
        red: { name: "GEN.G", code: "GEN", logoUrl: "/teams/GENG.png", score: 0, picks: [], bans: [] },
      },
    }));
    const manager = new StateManager(dir);
    await manager.init();
    const state = manager.getState();
    expect(state.revision).toBe(42);
    expect(state.match.matchName).toBe("CCS XI");
    expect(state.match.teams.blue.name).toBe("T1");
    expect(state.match.teams.blue.players[0]).toBe("vitural");
    expect(state.draft.teams.blue.picks[0].championId).toBe("Ashe");
    expect(state.activeOutput).toBe("none");
  });

  it("adds new overview fields to an existing nested snapshot", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-post-migrate-"));
    tempDirs.push(dir);
    const legacy = createInitialState() as any;
    delete legacy.schemaVersion;
    delete legacy.postMatch.data.earlyObjective;
    delete legacy.postMatch.data.teams.blue.inhibitors;
    delete legacy.postMatch.data.teams.blue.voidGrubs;
    delete legacy.postMatch.baseline.teams.blue.inhibitors;
    delete legacy.postMatch.baseline.teams.blue.voidGrubs;
    await writeFile(path.join(dir, "snapshot.json"), JSON.stringify(legacy));
    const manager = new StateManager(dir);
    await manager.init();
    const state = manager.getState();
    expect(state.postMatch.data.earlyObjective).toBe("voidGrubs");
    expect(state.postMatch.data.teams.blue.inhibitors).toBe(0);
    expect(state.postMatch.data.teams.blue.voidGrubs).toBe(0);
  });
});
