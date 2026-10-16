import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LcuLockfile } from "./types";
import { discoverLockfileCandidates } from './discovery';

export function lockfileCandidates() {
  return [
    process.env.LCU_LOCKFILE_PATH,
    "C:\\Riot Games\\League of Legends\\lockfile",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Riot Games", "League of Legends", "lockfile"),
  ].filter(Boolean) as string[];
}

export function parseLockfile(raw: string, sourcePath: string): LcuLockfile {
  const fields = raw.trim().split(':');
  const [name, pid, rawPort, password, rawProtocol] = fields;
  const port = Number(rawPort);
  const protocol = rawProtocol === "http" ? "http" : rawProtocol === "https" ? "https" : null;
  if (fields.length !== 5 || name !== 'LeagueClient' || !/^\d+$/.test(pid) || !Number.isSafeInteger(Number(pid)) || Number(pid) <= 0 || !Number.isInteger(port) || port <= 0 || port > 65_535 || !password || !protocol) {
    throw new Error("Lockfile League Client không hợp lệ");
  }
  return { port, password, protocol, sourcePath };
}

export function createLockfileReader(discover = discoverLockfileCandidates) {
  let discovered: string[] = [];
  let refreshAt = 0;
  let lastWorking: string | undefined;
  return async (accept: (lockfile: LcuLockfile) => Promise<boolean> = async () => true): Promise<LcuLockfile | null> => {
    const tryCandidates = async (candidates: (string | undefined)[]) => {
      for (const candidate of new Set(candidates.filter((value): value is string => Boolean(value)))) {
        try {
          const lockfile = parseLockfile(await readFile(candidate, 'utf8'), candidate);
          if (await accept(lockfile)) { lastWorking = candidate; return lockfile; }
        } catch { /* Stale files, partial writes and inactive installations are skipped. */ }
      }
      return null;
    };
    // Discovery is bounded and cached. Credentials are always re-read after disconnect.
    const known = await tryCandidates([process.env.LCU_LOCKFILE_PATH, lastWorking]);
    if (known) return known;
    if (Date.now() >= refreshAt) {
      discovered = await discover().catch(() => []);
      refreshAt = Date.now() + 5000;
    }
    return tryCandidates([...discovered, ...lockfileCandidates().filter(candidate => candidate !== process.env.LCU_LOCKFILE_PATH)]);
  };
}

export const readLcuLockfile = createLockfileReader();
