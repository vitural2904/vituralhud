import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DraftFeedSnapshot } from "../src/domain/types";
import { StateManager } from "./state-manager";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("StateManager revision", () => {
  it("stays strictly monotonic across undo and redo", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-state-"));
    tempDirs.push(dir);
    const manager = new StateManager(dir);
    await manager.init();
    const first = await manager.dispatch({ type: "SET_SCORE", side: "blue", value: 1 });
    const undone = await manager.dispatch({ type: "UNDO" });
    const redone = await manager.dispatch({ type: "REDO" });
    expect([first.revision, undone.revision, redone.revision]).toEqual([2, 3, 4]);
    expect(redone.teams.blue.score).toBe(1);
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
    expect(state.phase).toBe("pick-1");
    expect(state.activeSide).toBe("red");
    expect(state.teams.blue.picks[0]).toEqual({ championId: "Ryze", locked: true, player: "Người chơi" });
    expect(state.teams.blue.bans[0]).toBe("Aatrox");
    expect(state.lcu.sessionId).toBe("fixture-1");
    const jittered = await manager.ingestDraftFeed({ ...snapshot, timerMs: 27_500 });
    expect(jittered.revision).toBe(2);
    expect(jittered.timerMs).toBe(28_000);
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
    expect(state.revision).toBe(before.revision);
    expect(state.phase).toBe(before.phase);
  });

  it("shows the overlay only during LCU champ select", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "virtualhud-overlay-"));
    tempDirs.push(dir);
    const manager = new StateManager(dir);
    await manager.init();

    const visible = await manager.setLcuStatus({
      connected: true,
      message: "Đang đọc champ select",
      feed: "champ-select",
      gameflowPhase: "ChampSelect",
    });
    const hidden = await manager.setLcuStatus({
      connected: true,
      message: "League Client: Lobby",
      feed: "idle",
      gameflowPhase: "Lobby",
    });

    expect(visible.overlayVisible).toBe(true);
    expect(hidden.overlayVisible).toBe(false);
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

    expect(state.overlayVisible).toBe(true);
  });
});
