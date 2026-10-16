import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const leagueExecutable = /(?:^|[\\/])LeagueClient(?:Ux)?\.exe$/i;
const localPath = (value: string) => path.isAbsolute(value) && !value.startsWith('\\\\') && !value.startsWith('//');

async function runningLeagueDirectories(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  try {
    // Never request CommandLine: it can contain the LCU authentication token.
    const script = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_Process -Filter \"Name = 'LeagueClient.exe' OR Name = 'LeagueClientUx.exe'\" -ErrorAction Stop | Select-Object -ExpandProperty ExecutablePath) | ConvertTo-Json -Compress";
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 3000, maxBuffer: 64 * 1024 });
    const paths: unknown = JSON.parse(stdout || '[]');
    return (Array.isArray(paths) ? paths : [paths]).filter((item): item is string => typeof item === 'string' && localPath(item) && leagueExecutable.test(item)).map(item => path.dirname(item));
  } catch { return []; } // Permissions or WMI may be unavailable. Metadata still works.
}

async function riotDirectories(root: string): Promise<string[]> {
  const directories: string[] = [];
  try {
    const record = JSON.parse(await readFile(path.join(root, 'RiotClientInstalls.json'), 'utf8'));
    if (record.associated_client && typeof record.associated_client === 'object') {
      for (const executable of Object.keys(record.associated_client)) {
        if (localPath(executable) && leagueExecutable.test(executable)) directories.push(path.dirname(executable));
      }
    }
  } catch { /* Missing or partial Riot metadata is normal during updates. */ }
  const metadataRoot = path.join(root, 'Metadata');
  const products = await readdir(metadataRoot, { withFileTypes: true }).catch(() => []);
  for (const product of products.filter(item => item.isDirectory() && /^league_of_legends[.\w-]*$/i.test(item.name)).slice(0, 20)) {
    try {
      const raw = await readFile(path.join(metadataRoot, product.name, `${product.name}.product_settings.yaml`), 'utf8');
      // Only the installation path is needed; do not parse unrelated settings.
      const value = raw.match(/^\s*product_install_full_path:\s*(.+?)\s*$/m)?.[1];
      if (value) {
        const directory = value.startsWith('"') ? JSON.parse(value) : value.replace(/^'|'$/g, '').replace(/''/g, "'");
        if (typeof directory === 'string' && localPath(directory)) directories.push(directory);
      }
    } catch { /* Try other installations. */ }
  }
  return directories;
}

export async function discoverLockfileCandidates(): Promise<string[]> {
  const metadataRoots = [process.env.PROGRAMDATA, process.env.LOCALAPPDATA].filter((item): item is string => Boolean(item)).map(root => path.join(root, 'Riot Games'));
  const [running, ...metadata] = await Promise.all([runningLeagueDirectories(), ...metadataRoots.map(riotDirectories)]);
  return [...new Set([...running, ...metadata.flat()].map(directory => path.join(directory, 'lockfile')))].slice(0, 32);
}
