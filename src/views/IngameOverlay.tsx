import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { champions } from '../domain/catalog';
import { itemAsset } from '../domain/item-assets';
import type { BroadcastState, Side } from '../domain/types';
import { SponsorDisplay } from '../sponsor/Sponsor';
import { EventFeed } from '../ingame/EventFeed';
import { useIngameSettings } from '../ingame/settings';
import '../ingame-overlay.css';

type Player = { side: Side; name: string; championName: string; level: number | null; kills: number | null; deaths: number | null; assists: number | null; cs: number | null; items: { id: number; count: number; slot?: number | null }[]; summonerSpells?: { name: string; icon: string }[]; isDead: boolean | null; respawnTimer: number | null };
type Feed = { connected: boolean; observedAt: string | null; gameTime: number | null; players: Player[]; events: Record<string, unknown>[] };
const offline: Feed = { connected: false, observedAt: null, gameTime: null, players: [], events: [] };
const mock: Feed = { connected: true, observedAt: null, gameTime: 1146, events: [], players: [
  ...['Gnar', 'Lee Sin', 'Orianna', 'Jhin', 'Rakan'].map((championName, i) => ({ side: 'blue' as const, name: ['Morgan', 'Josedeodo', 'Quid', 'Yeon', 'CoreJJ'][i], championName, level: [14, 13, 13, 11, 9][i], kills: [2, 4, 2, 0, 0][i], deaths: [0, 1, 0, 2, 2][i], assists: [3, 2, 4, 5, 5][i], cs: [195, 171, 185, 180, 24][i], items: [3078, 3047, 3053].map(id => ({ id, count: 1 })), isDead: false, respawnTimer: null })),
  ...['Renekton', 'Vi', 'Azir', 'Lucian', 'Alistar'].map((championName, i) => ({ side: 'red' as const, name: ['Thanatos', 'Blaber', 'Loki', 'Tactical', 'Vulcan'][i], championName, level: [13, 12, 12, 11, 7][i], kills: [0, 0, 1, 3, 1][i], deaths: [2, 2, 2, 2, 1][i], assists: [0, 5, 3, 1, 3][i], cs: [177, 163, 198, 179, 24][i], items: [3071, 3047, 3026].map(id => ({ id, count: 1 })), isDead: false, respawnTimer: null }))
] };
mock.players.forEach((player, i) => { (player as Player).summonerSpells = [{ name: 'Flash', icon: '/summoner-spells/SummonerFlash.png' }, { name: ['Teleport', 'Smite', 'Teleport', 'Heal', 'Exhaust'][i % 5], icon: `/summoner-spells/Summoner${['Teleport', 'Smite', 'Teleport', 'Heal', 'Exhaust'][i % 5]}.png` }]; });
const clean = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const iconFor = (name: string) => champions.find(c => clean(c.name) === clean(name) || clean(c.id) === clean(name))?.iconUrl;
const display = (n: number | null | undefined) => n == null ? '—' : String(n);

function Swap({ value }: { value: string }) {
  const reduced = useReducedMotion();
  return <span className="ig-swap"><AnimatePresence initial={false}><motion.span key={value} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }}>{value}</motion.span></AnimatePresence></span>;
}

function ItemIcon({ id, count }: { id: number; count: number }) {
  const asset = itemAsset(id);
  const [source, setSource] = useState<'local' | 'remote' | 'failed'>(asset.local ? 'local' : 'remote');
  const reduced = useReducedMotion();
  return <motion.span className="ig-item-image" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }}>
    {source === 'failed' ? <span className="ig-item-fallback">{id}</span> : <img src={source === 'local' ? asset.local! : asset.remote} alt="" title={asset.name} onError={() => setSource(source === 'local' ? 'remote' : 'failed')} />}
    {count > 1 && <b className="ig-item-count"><Swap value={String(count)} /></b>}
  </motion.span>;
}

function PlayerRow({ player, side }: { player?: Player; side: Side }) {
  const icon = player && iconFor(player.championName);
  const reduced = useReducedMotion();
  return <div className={`ig-player ig-player--${side} ${player?.isDead ? 'is-dead' : ''}`}>
    <div className="ig-items">{Array.from({ length: 7 }, (_, i) => { const items = player?.items ?? []; const item = items.some(entry => entry.slot != null) ? items.find(entry => entry.slot === i) : items[i]; return <div className="ig-item" key={i}><AnimatePresence initial={false}>{item && <ItemIcon key={item.id} id={item.id} count={item.count} />}</AnimatePresence></div>; })}</div>
    <div className="ig-spells" aria-label="Phép bổ trợ">{Array.from({ length: 2 }, (_, i) => { const spell = player?.summonerSpells?.[i]; return <span className="ig-spell" key={i} title={spell?.name || 'Không có dữ liệu phép bổ trợ'}>{spell?.icon ? <img src={spell.icon} alt={spell.name} /> : '—'}</span>; })}</div>
    <div className="ig-portrait"><AnimatePresence initial={false}>{icon && <motion.img key={icon} src={icon} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }} />}</AnimatePresence><strong><Swap value={display(player?.level)} /></strong><AnimatePresence>{player?.isDead && <motion.span className="ig-death" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }}><Swap value={display(player.respawnTimer == null ? null : Math.ceil(player.respawnTimer))} /></motion.span>}</AnimatePresence></div>
    <div className="ig-player-info"><span className="ig-player-name"><Swap value={player?.name || '—'} /></span><span className="ig-player-stats"><b title="CS spectator có thể bị game làm tròn"><Swap value={player?.cs == null ? '—' : `≈${player.cs}`} /></b><span><Swap value={player ? `${display(player.kills)}/${display(player.deaths)}/${display(player.assists)}` : '—/—/—'} /></span></span><span className="ig-ultimate" title="Chưa có dữ liệu trạng thái chiêu cuối" aria-label="Trạng thái chiêu cuối không có dữ liệu">R —</span></div>
  </div>;
}

export function IngameOverlay({ state, preview = false }: { state: BroadcastState; preview?: boolean }) {
  const [feed, setFeed] = useState<Feed>(preview ? mock : offline);
  const settings = useIngameSettings();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (preview) return;
    let stopped = false; let timer = 0; let socket: WebSocket;
    const connect = () => {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/ingame`);
      socket.onmessage = event => { try { const next = JSON.parse(event.data) as Feed; if (!stopped && typeof next.connected === 'boolean' && Array.isArray(next.players) && Array.isArray(next.events)) setFeed(next); } catch { /* ignore malformed frames */ } };
      socket.onclose = () => { if (!stopped) { setFeed(offline); timer = window.setTimeout(connect, 500); } };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => { stopped = true; clearTimeout(timer); if (socket.readyState === WebSocket.CONNECTING) socket.onopen = () => socket.close(); else socket.close(); };
  }, [preview]);
  const players = (side: Side) => feed.players.filter(p => p.side === side).slice(0, 5);
  return <main className="ig-overlay" aria-label={preview ? 'Xem thử HUD ingame' : 'HUD ingame'}>
    {preview && <div className="ig-preview-label">DỮ LIỆU MẪU</div>}
    <motion.div className="ig-frame" initial={false} animate={{ opacity: feed.connected && settings.visible ? 1 : 0 }} transition={{ duration: reduced ? 0 : .3 }} aria-hidden={!feed.connected || !settings.visible}>
      <motion.div initial={false} animate={{ opacity: settings.events ? 1 : 0 }} transition={{ duration: reduced ? 0 : .3 }} aria-hidden={!settings.events}><EventFeed feed={feed} preview={preview} /></motion.div>
      <section className="ig-top" aria-label="Tên đội">
        {(['blue', 'red'] as const).map(side => <div className={`ig-team ig-team--${side}`} key={side}>
          <span className="ig-team-logo"><AnimatePresence initial={false}>{state.match.teams[side].logoUrl && <motion.img key={state.match.teams[side].logoUrl} src={state.match.teams[side].logoUrl} alt="" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }} />}</AnimatePresence></span>
          <div className="ig-team-name"><b title={state.match.teams[side].name}><Swap value={state.match.teams[side].code || state.match.teams[side].name || side.toUpperCase()} /></b></div>
        </div>)}
      </section>
      <motion.section className="ig-roster" aria-label="Bảng chỉ số người chơi" initial={false} animate={{ opacity: settings.roster ? 1 : 0 }} transition={{ duration: reduced ? 0 : .3 }} aria-hidden={!settings.roster}>
        <div className="ig-roster-side">{Array.from({ length: 5 }, (_, i) => <PlayerRow key={i} side="blue" player={players('blue')[i]} />)}</div>
        <div className="ig-roster-center">{Array.from({ length: 5 }, (_, i) => <div key={i}>—</div>)}</div>
        <div className="ig-roster-side">{Array.from({ length: 5 }, (_, i) => <PlayerRow key={i} side="red" player={players('red')[i]} />)}</div>
      </motion.section>
      <motion.aside className="ig-sponsor" initial={false} animate={{ opacity: settings.sponsor ? 1 : 0 }} transition={{ duration: reduced ? 0 : .3 }} aria-hidden={!settings.sponsor}><SponsorDisplay /></motion.aside>
    </motion.div>
  </main>;
}
