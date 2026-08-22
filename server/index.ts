import path from "node:path";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { DraftCommand, DraftState } from "../src/domain/types";
import { StateManager } from "./state-manager";
import { startLcuAdapter } from "./lcu/adapter";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
const manager = new StateManager(process.env.DRAFT_DATA_DIR);
await manager.init();
await app.register(websocket);

const clients = new Set<{ send: (data: string) => void; readyState: number }>();
const broadcast = (state: DraftState) => {
  const payload = JSON.stringify({ type: "state", state });
  clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
};
manager.subscribe(broadcast);

app.get("/api/health", async () => ({ ok: true, revision: manager.getState().revision, lcu: manager.getState().lcu }));
app.get("/api/state", async () => manager.getState());
app.get("/api/lcu/status", async () => manager.getState().lcu);

const commandSchema = Type.Object({ type: Type.String() }, { additionalProperties: true });
app.post("/api/actions", async (request, reply) => {
  if (!Value.Check(commandSchema, request.body)) return reply.code(400).send({ error: "Lệnh không hợp lệ" });
  try {
    const command = request.body as DraftCommand;
    const source = command.type === "RUN_DEMO_STEP" || command.type === "RESET" ? "mock" : "manual";
    return await manager.dispatch(command, source);
  } catch (error) {
    request.log.error(error);
    return reply.code(400).send({ error: "Không thể áp dụng lệnh" });
  }
});

app.get("/ws", { websocket: true }, (socket) => {
  clients.add(socket);
  socket.send(JSON.stringify({ type: "state", state: manager.getState() }));
  socket.on("close", () => clients.delete(socket));
});

const clientRoot = path.resolve("dist/client");
if (existsSync(clientRoot)) {
  await app.register(fastifyStatic, { root: clientRoot, wildcard: false });
  app.get("/*", async (_request, reply) => reply.sendFile("index.html"));
}

setInterval(() => void manager.tick(1000), 1000).unref();
const stopLcu = process.env.LCU_DISABLED === "1" ? () => undefined : startLcuAdapter(manager);
app.addHook("onClose", async () => stopLcu());

const port = Number(process.env.PORT ?? 4174);
await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
