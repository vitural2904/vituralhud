import path from 'node:path';
import { createApp } from './app';
import { startLcuAdapter } from './lcu/adapter';
import { acquireProcessLock } from './process-lock';
const host = process.env.HOST ?? '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('VirtualHUD chỉ chạy trên loopback.');
const port = Number(process.env.PORT ?? 4174);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT không hợp lệ.');
const dataDir = process.env.DRAFT_DATA_DIR ?? path.resolve('data');
const releaseLock = await acquireProcessLock(dataDir);
let service;
try { service = await createApp({ dataDir, logoDir: process.env.TEAM_LOGO_DIR, port, apiKey: process.env.RIOT_API_KEY, regionalRoute: process.env.RIOT_REGIONAL_ROUTE, logger: true }); }
catch (error) { await releaseLock(); throw error; }
const { app, manager } = service;
const stopLcu = process.env.LCU_DISABLED === '1' ? () => undefined : startLcuAdapter(manager);
let previousTick = performance.now();
const timer = setInterval(() => { const now = performance.now(); const elapsed = now - previousTick; previousTick = now; void manager.tick(elapsed).catch(() => app.log.error('Timer không lưu được.')); }, 1000);
timer.unref();
app.addHook('onClose', async () => { clearInterval(timer); stopLcu(); await releaseLock(); });
try { await app.listen({ host, port }); } catch (error) { await app.close(); throw error; }
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
