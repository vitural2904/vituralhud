import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLockfileReader, parseLockfile, readLcuLockfile } from "./lockfile";
const directories: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

describe("LCU lockfile", () => {
  it('finds a custom League installation from Riot metadata without a configured path', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-discovery-'));
    directories.push(root);
    const game = path.join(root, 'Custom games', 'League of Legends');
    const riot = path.join(root, 'Riot Games');
    await mkdir(game, { recursive: true }); await mkdir(riot, { recursive: true });
    await writeFile(path.join(game, 'lockfile'), 'LeagueClient:1234:45678:fixture:https');
    await writeFile(path.join(riot, 'RiotClientInstalls.json'), JSON.stringify({ associated_client: { [path.join(game, 'LeagueClient.exe')]: 'C:/Riot/RiotClientServices.exe' } }));
    vi.stubEnv('PROGRAMDATA', root); vi.stubEnv('LCU_LOCKFILE_PATH', '');
    expect((await readLcuLockfile())?.sourcePath).toBe(path.join(game, 'lockfile'));
  });
  it("parses credentials without exposing them elsewhere", () => {
    expect(parseLockfile("LeagueClient:1234:45678:secret:https", "C:/lockfile")).toEqual({
      port: 45_678,
      password: "secret",
      protocol: "https",
      sourcePath: "C:/lockfile",
    });
  });

  it("rejects malformed ports", () => {
    expect(() => parseLockfile("LeagueClient:1234:nope:secret:https", "C:/lockfile")).toThrow();
  });
  it('skips another Riot product and stale credentials; re-reads a rotated lockfile', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-candidates-')); directories.push(root);
    const other = path.join(root, 'riot-lockfile'), stale = path.join(root, 'old-lockfile'), current = path.join(root, 'current-lockfile');
    await writeFile(other, 'RiotClient:123:11111:fixture:https');
    await writeFile(stale, 'LeagueClient:123:22222:fixture:https');
    await writeFile(current, 'LeagueClient:123:33333:fixture:https');
    vi.stubEnv('LCU_LOCKFILE_PATH', stale);
    const discover = vi.fn(async () => [other, stale, current]);
    const read = createLockfileReader(discover);
    const first = await read(async lockfile => lockfile.port === 33333);
    expect(first?.sourcePath).toBe(current);
    await writeFile(current, 'LeagueClient:123:44444:new-fixture:https');
    const rotated = await read(async lockfile => lockfile.port === 44444);
    expect(rotated?.password).toBe('new-fixture');
    expect(discover).toHaveBeenCalledTimes(1);
  });
  it('uses Riot product settings when the installs index is missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'virtualhud-product-')); directories.push(root);
    const product = 'league_of_legends.live';
    const metadata = path.join(root, 'Riot Games', 'Metadata', product);
    const game = path.join(root, 'LMHT game');
    await mkdir(metadata, { recursive: true }); await mkdir(game);
    await writeFile(path.join(metadata, `${product}.product_settings.yaml`), `product_install_full_path: ${JSON.stringify(game)}\n`);
    await writeFile(path.join(game, 'lockfile'), 'LeagueClient:123:55555:fixture:https');
    vi.stubEnv('PROGRAMDATA', root); vi.stubEnv('LCU_LOCKFILE_PATH', '');
    expect((await createLockfileReader()())?.sourcePath).toBe(path.join(game, 'lockfile'));
  });
});
