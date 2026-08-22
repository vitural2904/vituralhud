import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StateManager } from "../state-manager";
import { pollLcuOnce } from "./adapter";
import { LcuHttpError } from "./http-client";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("LCU polling pipeline", () => {
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
    expect(state.teams.blue.picks[0].championId).toBe("Aatrox");
    expect(state.teams.red.picks[0].championId).toBe("Syndra");
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
