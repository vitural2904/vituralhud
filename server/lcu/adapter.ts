import type { DraftState } from "../../src/domain/types";
import type { StateManager } from "../state-manager";
import { captureLcuFrame } from "./capture";
import { LcuHttpClient, isLcuNotFound } from "./http-client";
import { readLcuLockfile } from "./lockfile";
import { normalizeChampSelectSession } from "./normalize";
import type { LcuRawFrame } from "./types";

type JsonClient = Pick<LcuHttpClient, "getJson">;

const GAMEFLOW_ENDPOINT = "/lol-gameflow/v1/gameflow-phase";
const CHAMP_SELECT_ENDPOINT = "/lol-champ-select/v1/session";

async function optionalJson<T>(client: JsonClient, endpoint: string): Promise<T | null> {
  try {
    return await client.getJson<T>(endpoint);
  } catch (error) {
    if (isLcuNotFound(error)) return null;
    throw error;
  }
}

export async function readLcuFrame(client: JsonClient, observedAt = new Date().toISOString()): Promise<LcuRawFrame> {
  let gameflowPhase: string | null = null;
  try {
    gameflowPhase = await optionalJson<string>(client, GAMEFLOW_ENDPOINT);
  } catch {
    // Some client builds briefly unload gameflow while champ select is still readable.
  }
  const session = await optionalJson<unknown>(client, CHAMP_SELECT_ENDPOINT);
  return { observedAt, gameflowPhase, session };
}

export type LcuPollResult = {
  hasSession: boolean;
  status: DraftState["lcu"];
};

export async function pollLcuOnce(client: JsonClient, manager: StateManager): Promise<LcuPollResult> {
  const frame = await readLcuFrame(client);
  try {
    await captureLcuFrame(frame);
  } catch {
    // Diagnostics must never stop the live feed.
  }

  if (!frame.session) {
    const status = await manager.setLcuStatus({
      connected: true,
      message: frame.gameflowPhase ? `League Client: ${frame.gameflowPhase}` : "League Client đã kết nối",
      feed: "idle",
      gameflowPhase: frame.gameflowPhase,
      sessionKind: "unknown",
      sessionId: null,
      warnings: [],
    });
    return { hasSession: false, status: status.lcu };
  }

  const normalized = normalizeChampSelectSession(frame.session, frame.observedAt);
  if (!normalized.snapshot) {
    const status = await manager.setLcuStatus({
      connected: true,
      message: "Đã thấy champ select. Chưa map được Blue/Red",
      feed: "unresolved",
      gameflowPhase: frame.gameflowPhase,
      sessionKind: normalized.sessionKind,
      sessionId: null,
      warnings: normalized.warnings,
    });
    return { hasSession: true, status: status.lcu };
  }

  await manager.setLcuStatus({
    connected: true,
    message: normalized.sessionKind === "spectator"
      ? "Đang đọc champ select · spectator"
      : "Đang đọc champ select",
    feed: "champ-select",
    gameflowPhase: frame.gameflowPhase,
    sessionKind: normalized.sessionKind,
    sessionId: normalized.snapshot.feedId,
    warnings: normalized.warnings,
  });
  const state = await manager.ingestDraftFeed(normalized.snapshot);
  return { hasSession: true, status: state.lcu };
}

export function startLcuAdapter(manager: StateManager) {
  let stopped = false;
  let reconnectDelay = 1_500;
  let timer: NodeJS.Timeout | null = null;
  let client: LcuHttpClient | null = null;
  const configuredPollMs = Number(process.env.LCU_POLL_MS ?? 350);
  const activePollMs = Number.isFinite(configuredPollMs) ? Math.max(150, configuredPollMs) : 350;

  const schedule = (delay: number) => {
    if (!stopped) timer = setTimeout(() => void poll(), delay);
  };

  const poll = async () => {
    if (stopped) return;
    try {
      if (!client) {
        const lockfile = await readLcuLockfile();
        if (!lockfile) throw new Error("Chưa thấy League Client");
        client = new LcuHttpClient(lockfile);
      }
      const result = await pollLcuOnce(client, manager);
      reconnectDelay = 1_500;
      schedule(result.hasSession ? activePollMs : 1_200);
    } catch (error) {
      client = null;
      await manager.setLcuStatus({
        connected: false,
        message: error instanceof Error ? error.message : "LCU chưa sẵn sàng",
      });
      reconnectDelay = Math.min(12_000, Math.round(reconnectDelay * 1.6));
      schedule(reconnectDelay);
    }
  };

  void poll();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
