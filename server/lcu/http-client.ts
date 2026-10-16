import http from "node:http";
import https from "node:https";
import type { LcuLockfile } from "./types";

export class LcuHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = "LcuHttpError";
  }
}

export class LcuHttpClient {
  constructor(
    private readonly lockfile: LcuLockfile,
    private readonly timeoutMs = 1_800,
  ) {}

  getJson<T>(endpoint: string): Promise<T> {
    const transport = this.lockfile.protocol === "https" ? https : http;
    return new Promise((resolve, reject) => {
      const request = transport.request(
        {
          hostname: "127.0.0.1",
          port: this.lockfile.port,
          path: endpoint,
          method: "GET",
          rejectUnauthorized: this.lockfile.protocol === "https" ? false : undefined,
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(`riot:${this.lockfile.password}`).toString("base64")}`,
          },
        },
        (response) => {
          let body = "";
          response.on("error", () => reject(new LcuHttpError("LCU ngắt phản hồi", null, endpoint)));
          response.on("aborted", () => reject(new LcuHttpError("LCU ngắt phản hồi", null, endpoint)));
          response.setEncoding("utf8");
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => {
            const statusCode = response.statusCode ?? null;
            if (statusCode === null || statusCode < 200 || statusCode >= 300) {
              reject(new LcuHttpError(`LCU ${statusCode ?? "không phản hồi"}`, statusCode, endpoint));
              return;
            }
            try {
              resolve(JSON.parse(body) as T);
            } catch {
              reject(new LcuHttpError("LCU trả JSON không hợp lệ", statusCode, endpoint));
            }
          });
        },
      );
      request.setTimeout(this.timeoutMs, () => request.destroy(new LcuHttpError("LCU timeout", null, endpoint)));
      request.on("error", (error) => reject(error));
      request.end();
    });
  }
}

export function isLcuNotFound(error: unknown) {
  return error instanceof LcuHttpError && error.statusCode === 404;
}
