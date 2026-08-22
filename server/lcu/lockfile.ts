import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LcuLockfile } from "./types";

export function lockfileCandidates() {
  return [
    process.env.LCU_LOCKFILE_PATH,
    "C:\\Riot Games\\League of Legends\\lockfile",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Riot Games", "League of Legends", "lockfile"),
  ].filter(Boolean) as string[];
}

export function parseLockfile(raw: string, sourcePath: string): LcuLockfile {
  const [, , rawPort, password, rawProtocol] = raw.trim().split(":");
  const port = Number(rawPort);
  const protocol = rawProtocol === "http" ? "http" : rawProtocol === "https" ? "https" : null;
  if (!Number.isInteger(port) || port <= 0 || port > 65_535 || !password || !protocol) {
    throw new Error("Lockfile League Client không hợp lệ");
  }
  return { port, password, protocol, sourcePath };
}

export async function readLcuLockfile(): Promise<LcuLockfile | null> {
  for (const candidate of lockfileCandidates()) {
    try {
      return parseLockfile(await readFile(candidate, "utf8"), candidate);
    } catch {
      // League may be closed, updating, or installed elsewhere.
    }
  }
  return null;
}
