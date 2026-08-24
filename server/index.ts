import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { BroadcastCommand, BroadcastState } from "../src/domain/types";
import { StateManager } from "./state-manager";
import { buildTeamLogoFilename, detectTeamLogoFormat, isTeamLogoFile, MAX_TEAM_LOGO_BYTES } from "./team-logo-assets";
import { startLcuAdapter } from "./lcu/adapter";
import { fetchMatchV5 } from "./post-match/match-v5";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
const dataRoot = process.env.DRAFT_DATA_DIR ?? path.resolve("data");
const manager = new StateManager(dataRoot);
await manager.init();
await app.register(websocket);

const teamLogoRoot = path.resolve(process.env.TEAM_LOGO_DIR ?? path.join(dataRoot, "team-logos"));
const builtInTeamLogoRoot = path.resolve("public/teams");
await mkdir(teamLogoRoot, { recursive: true });
await app.register(fastifyStatic, { root: teamLogoRoot, prefix: "/team-uploads/", decorateReply: false });
app.addContentTypeParser(/^image\/(?:png|jpeg|webp)$/i, { parseAs: "buffer", bodyLimit: MAX_TEAM_LOGO_BYTES }, (_request, body, done) => done(null, body));

const clients = new Set<{ send: (data: string) => void; readyState: number }>();
const broadcast = (state: BroadcastState) => {
  const payload = JSON.stringify({ type: "state", state });
  clients.forEach((client) => { if (client.readyState === 1) client.send(payload); });
};
manager.subscribe(broadcast);

app.get("/api/health", async () => ({ ok: true, revision: manager.getState().revision, lcu: manager.getState().lcu }));
app.get("/api/state", async () => manager.getState());
app.get("/api/lcu/status", async () => manager.getState().lcu);
app.get("/api/post-match", async () => manager.getState().postMatch);
app.get("/api/team-logos", async () => {
  const builtIn = existsSync(builtInTeamLogoRoot) ? (await readdir(builtInTeamLogoRoot)).filter(isTeamLogoFile).map((name) => ({ name, url: `/teams/${encodeURIComponent(name)}`, source: "built-in" as const })) : [];
  const uploaded = (await readdir(teamLogoRoot)).filter(isTeamLogoFile).map((name) => ({ name, url: `/team-uploads/${encodeURIComponent(name)}`, source: "uploaded" as const }));
  return { assets: [...uploaded.reverse(), ...builtIn] };
});
app.post("/api/team-logos", { bodyLimit: MAX_TEAM_LOGO_BYTES }, async (request, reply) => {
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) return reply.code(400).send({ error: "File logo trống" });
  const format = detectTeamLogoFormat(request.body);
  if (!format) return reply.code(415).send({ error: "Chỉ nhận PNG, JPG hoặc WebP hợp lệ" });
  let originalName = "team-logo";
  try { originalName = decodeURIComponent(String(request.headers["x-file-name"] ?? originalName)); } catch { originalName = "team-logo"; }
  const fileName = buildTeamLogoFilename(originalName, format.extension, crypto.randomUUID().slice(0, 8));
  await writeFile(path.join(teamLogoRoot, fileName), request.body, { flag: "wx" });
  return { asset: { name: fileName, url: `/team-uploads/${encodeURIComponent(fileName)}`, source: "uploaded" as const } };
});

const commandSchema = Type.Object({ type: Type.String() }, { additionalProperties: true });
const dispatchCommand = async (request: any, reply: any) => {
  if (!Value.Check(commandSchema, request.body)) return reply.code(400).send({ error: "Lệnh không hợp lệ" });
  try {
    const command = request.body as BroadcastCommand;
    const source = command.type === "RUN_DEMO_STEP" || command.type === "RESET" || command.type === "POST_MATCH_LOAD_FIXTURE" ? "mock" : "manual";
    return await manager.dispatch(command, source);
  } catch (error) {
    request.log.error(error);
    return reply.code(400).send({ error: "Không thể áp dụng lệnh" });
  }
};
app.post("/api/actions", dispatchCommand);
app.post("/api/draft/actions", dispatchCommand);
app.post("/api/post-match/actions", dispatchCommand);
app.post("/api/post-match/resolve", async (request, reply) => {
  await manager.dispatch({ type: "POST_MATCH_BEGIN_FETCH" }, "manual");
  try {
    const body = request.body && typeof request.body === "object" ? request.body as { matchId?: unknown } : {};
    const matchId = typeof body.matchId === "string" ? body.matchId : "";
    const resolved = await fetchMatchV5(matchId, {
      apiKey: process.env.RIOT_API_KEY ?? "",
      regionalRoute: process.env.RIOT_REGIONAL_ROUTE,
    });
    return manager.ingestPostMatch(resolved.data, {
      matchId: resolved.matchId,
      source: "match-v5",
      confidence: resolved.warnings.length ? "medium" : "high",
      warnings: resolved.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể lấy dữ liệu Match-V5";
    request.log.warn({ err: error }, "post-match resolve failed");
    await manager.failPostMatch(message);
    return reply.code(502).send({ error: message });
  }
});
app.post("/api/post-match/fixture", async () => {
  await manager.dispatch({ type: "POST_MATCH_BEGIN_FETCH" }, "manual");
  return manager.dispatch({ type: "POST_MATCH_LOAD_FIXTURE" }, "mock");
});

app.get("/ws", { websocket: true }, (socket) => {
  clients.add(socket);
  socket.send(JSON.stringify({ type: "state", state: manager.getState() }));
  socket.on("close", () => clients.delete(socket));
});

const clientRoot = path.resolve("dist/client");
if (existsSync(clientRoot)) {
  await app.register(fastifyStatic, { root: clientRoot });
  app.setNotFoundHandler(async (request, reply) => {
    const pathname = request.raw.url ?? "";
    if (request.method === "GET" && !pathname.startsWith("/api/") && !pathname.startsWith("/ws")) {
      return reply.type("text/html").sendFile("index.html");
    }
    return reply.code(404).send({ error: "Không tìm thấy endpoint" });
  });
}

setInterval(() => void manager.tick(1000), 1000).unref();
const stopLcu = process.env.LCU_DISABLED === "1" ? () => undefined : startLcuAdapter(manager);
app.addHook("onClose", async () => stopLcu());

const port = Number(process.env.PORT ?? 4174);
await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
