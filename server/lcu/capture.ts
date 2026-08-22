import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LcuRawFrame } from "./types";

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    /(authorization|credential|password|secret|token)/i.test(key) ? "[REDACTED]" : redact(item),
  ]));
}

export async function captureLcuFrame(frame: LcuRawFrame) {
  const captureDir = process.env.LCU_CAPTURE_DIR;
  if (!captureDir) return;
  const targetDir = path.resolve(captureDir);
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    path.join(targetDir, "champ-select-latest.json"),
    JSON.stringify(redact(frame), null, 2),
    "utf8",
  );
}
