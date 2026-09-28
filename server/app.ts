import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import sharp from 'sharp';
import { DomainError, validateCommand } from '../src/domain/validation';
import { StateManager } from './state-manager';
import { MAX_TEAM_LOGO_BYTES, buildTeamLogoFilename, detectTeamLogoFormat } from './team-logo-assets';
import { fetchMatchV5 } from './post-match/match-v5';

export async function createApp(options: { dataDir: string; logoDir?: string; port?: number; apiKey?: string; regionalRoute?: string; fetchImpl?: typeof fetch; logger?: boolean; timeoutMs?: number }) {
  const port = options.port ?? 4174;
  const app = Fastify({ forceCloseConnections: true, logger: options.logger ? { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.x-virtualhud-control', 'req.headers.authorization'] } : false, ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  const manager = new StateManager(options.dataDir); await manager.init();
  const logoRoot = path.resolve(options.logoDir ?? path.join(options.dataDir, 'team-logos')); await mkdir(logoRoot, { recursive: true });
  const token = randomBytes(32).toString('hex');
  const hosts = new Set(['127.0.0.1', 'localhost', '[::1]'].flatMap(host => [`${host}:${port}`, `${host}:4173`]));
  const origins = new Set([...hosts].map(host => `http://${host}`));
  app.addHook('onRequest', async (request, reply) => {
    const deny = (code: string) => reply.code(403).send({ code, message: 'Yêu cầu điều khiển không được phép.', fields: [] });
    if (!hosts.has(request.headers.host ?? '')) return deny('HOST_DENIED');
    if (request.headers.origin && !origins.has(request.headers.origin)) return deny('ORIGIN_DENIED');
    if (request.url.startsWith('/api/control-session') && request.headers['sec-fetch-site'] === 'cross-site') return deny('ORIGIN_DENIED');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const value = typeof request.headers['x-virtualhud-control'] === 'string' ? request.headers['x-virtualhud-control'] : '';
      if (!/^[0-9a-f]{64}$/.test(value) || !timingSafeEqual(Buffer.from(value), Buffer.from(token))) return deny('CONTROL_REQUIRED');
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    const known = error instanceof DomainError;
    const statusCode = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    const status = known ? error.statusCode : statusCode < 500 ? statusCode : 500;
    return reply.code(status).send({ code: known ? error.code : 'REQUEST_FAILED', message: known ? error.message : status < 500 ? 'Yêu cầu không hợp lệ.' : 'Không thể xử lý yêu cầu.', fields: known ? error.fields : [] });
  });
  await app.register(websocket, { preClose: async () => {
    for (const client of app.websocketServer.clients) client.terminate();
    app.server.removeAllListeners('upgrade');
    await new Promise<void>(resolve => app.websocketServer.close(() => resolve()));
  } });
  await app.register(fastifyStatic, { root: logoRoot, prefix: '/team-uploads/', decorateReply: false });
  app.addContentTypeParser(/^image\/(?:png|jpeg|webp)$/i, { parseAs: 'buffer', bodyLimit: MAX_TEAM_LOGO_BYTES }, (_request, body, done) => done(null, body));
  const clients = new Set<{ send: (data: string) => void; readyState: number; close: () => void }>();
  const send = (payload: unknown) => { const json = JSON.stringify(payload); for (const client of clients) if (client.readyState === 1) { try { client.send(json); } catch { clients.delete(client); } } };
  const unsubscribe = manager.subscribe(state => send({ type: 'state', state }));
  const heartbeat = setInterval(() => send({ type: 'heartbeat', serverInstanceId: manager.instanceId, revision: manager.getState().revision }), 1000); heartbeat.unref();
  app.get('/api/control-session', async (_request, reply) => reply.header('cache-control', 'no-store').send({ token, serverInstanceId: manager.instanceId }));
  app.get('/api/health', async () => ({ app: 'virtualhud-lol', version: '1.2.0', ok: true, revision: manager.getState().revision, storageWarning: manager.getState().storageWarning, lcu: manager.getState().lcu }));
  app.get('/api/state', async (_request, reply) => reply.header('cache-control', 'no-store').send(manager.getState()));
  app.get('/api/lcu/status', async () => manager.getState().lcu);
  app.get('/api/post-match', async () => manager.getState().postMatch);
  app.get('/api/fonts', async () => {
    const root = path.resolve(existsSync('dist/client') ? 'dist/client/fonts/lens-grotesk' : 'public/fonts/lens-grotesk');
    const faces = await readdir(root).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    return { faces: faces.filter(name => /^LensGrotesk-[A-Za-z]+\.woff2$/.test(name)) };
  });
  app.get('/api/team-logos', async () => {
    const builtIn = path.resolve('public/teams');
    const list = async (root: string, prefix: string, source: 'uploaded' | 'built-in') => (await readdir(root)).filter(name => /^[\w .%-]+\.(png|jpe?g|webp)$/i.test(name)).map(name => ({ name, url: `${prefix}/${encodeURIComponent(name)}`, source }));
    return { assets: [...await list(logoRoot, '/team-uploads', 'uploaded'), ...(existsSync(builtIn) ? await list(builtIn, '/teams', 'built-in') : [])] };
  });
  app.post('/api/team-logos', { bodyLimit: MAX_TEAM_LOGO_BYTES }, async request => {
    if (!Buffer.isBuffer(request.body) || !detectTeamLogoFormat(request.body)) throw new DomainError('INVALID_IMAGE', 'Chỉ nhận PNG, JPG hoặc WebP hợp lệ.', [], 415);
    let png: Buffer;
    try {
      const image = sharp(request.body, { limitInputPixels: 16000000, failOn: 'warning' }); const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) throw new Error('invalid image');
      png = await image.png().toBuffer(); if (png.length > MAX_TEAM_LOGO_BYTES) throw new Error('image too large');
    } catch { throw new DomainError('INVALID_IMAGE', 'Ảnh lỗi, ảnh động hoặc vượt giới hạn.', [], 415); }
    let name = 'team-logo'; try { name = decodeURIComponent(String(request.headers['x-file-name'] ?? name)); } catch { /* safe default */ }
    const fileName = buildTeamLogoFilename(name, 'png', crypto.randomUUID().slice(0, 8)); await writeFile(path.join(logoRoot, fileName), png, { flag: 'wx' });
    return { asset: { name: fileName, url: `/team-uploads/${fileName}`, source: 'uploaded' } };
  });
  let pending: { generation: number; controller: AbortController } | undefined;
  const abortPending = () => { pending?.controller.abort(); pending = undefined; };
  const dispatch = async (request: { body: unknown }) => {
    validateCommand(request.body, true); const command = request.body;
    const result = await manager.dispatch(command, ['RUN_DEMO_STEP', 'POST_MATCH_LOAD_FIXTURE'].includes(command.type) ? 'mock' : 'manual');
    if (['RESET', 'POST_MATCH_RESET', 'POST_MATCH_CREATE_MANUAL', 'POST_MATCH_LOAD_FIXTURE', 'UNDO', 'REDO'].includes(command.type)) abortPending();
    return result;
  };
  for (const route of ['/api/actions', '/api/draft/actions', '/api/post-match/actions']) app.post(route, dispatch);
  app.post('/api/post-match/fixture', async () => { const result = await manager.dispatch({ type: 'POST_MATCH_LOAD_FIXTURE' }, 'mock'); abortPending(); return result; });
  app.post('/api/post-match/cancel', async () => { const result = await manager.cancelPostMatchFetch(); abortPending(); return result; });
  app.post('/api/post-match/resolve', async request => {
    const body = request.body as { matchId?: unknown } | null;
    if (!body || typeof body !== 'object' || Object.keys(body).some(key => key !== 'matchId') || typeof body.matchId !== 'string' || !/^[A-Z0-9]+_\d+$/i.test(body.matchId.trim())) throw new DomainError('INVALID_MATCH_ID', 'Match ID không hợp lệ.', ['matchId'], 400);
    if (!options.apiKey) throw new DomainError('MISSING_API_KEY', 'Thiếu RIOT_API_KEY trên server.', [], 400);
    if (options.regionalRoute && !['sea', 'asia', 'europe', 'americas'].includes(options.regionalRoute)) throw new DomainError('INVALID_RIOT_ROUTE', 'Riot route không hợp lệ.', [], 400);
    const generation = await manager.beginPostMatchFetch(); abortPending();
    const controller = new AbortController(); pending = { controller, generation };
    try {
      const result = await fetchMatchV5(body.matchId, { apiKey: options.apiKey, regionalRoute: options.regionalRoute, fetchImpl: options.fetchImpl, signal: controller.signal, timeoutMs: options.timeoutMs });
      return await manager.ingestPostMatch(result.data, { matchId: result.matchId, source: 'match-v5', confidence: result.missingFields.length ? 'low' : result.warnings.length ? 'medium' : 'high', warnings: result.warnings, missingFields: result.missingFields, generation });
    } catch (error) {
      if (!manager.isCurrentFetch(generation)) return manager.getState();
      const timeout = error instanceof Error && error.name === 'TimeoutError';
      const message = timeout ? 'Match-V5 quá 10 giây. Thử lại.' : error instanceof Error ? error.message : 'Match-V5 lỗi.';
      await manager.failPostMatch(message, generation); throw new DomainError(timeout ? 'MATCH_TIMEOUT' : 'RIOT_FAILED', message, [], timeout ? 504 : 502);
    } finally { if (pending?.generation === generation) pending = undefined; }
  });
  app.get('/ws', { websocket: true }, socket => { clients.add(socket); socket.send(JSON.stringify({ type: 'state', state: manager.getState() })); socket.on('close', () => clients.delete(socket)); });
  const clientRoot = path.resolve('dist/client');
  if (existsSync(clientRoot)) {
    await app.register(fastifyStatic, { root: clientRoot });
    app.setNotFoundHandler(async (request, reply) => {
      const pathname = (request.raw.url ?? '').split('?')[0];
      if (request.method === 'GET' && !pathname.startsWith('/api/') && !pathname.startsWith('/ws') && !/\.[a-z0-9]+$/i.test(pathname)) return reply.type('text/html').sendFile('index.html');
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Không tìm thấy.', fields: [] });
    });
  }
  app.addHook('onClose', async () => { clearInterval(heartbeat); abortPending(); unsubscribe(); for (const client of clients) client.close(); });
  return { app, manager };
}
