import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CastleTurret, Sword } from '@phosphor-icons/react';
import { champions } from '../domain/catalog';
import { advanceEvents, type EventCursor, type Notice } from './events';
import './event-feed.css';

type Player = { name: string; aliases?: string[]; championName: string; side: 'blue' | 'red' };
type Feed = { connected: boolean; gameTime: number | null; events: Record<string, unknown>[]; players: Player[] };
const sample: Notice[] = [{ id: 1, time: 1138, kind: 'kill', killer: 'Josedeodo', victim: 'Blaber' }, { id: 2, time: 1141, kind: 'dragon', killer: 'Quid', dragon: 'Rồng Lửa', dragonType: 'fire' }];
const objectiveIcon: Partial<Record<Notice['kind'], string>> = { dragon: '/objectives/dragon.png', baron: '/objectives/baron.png', herald: '/objectives/herald.png', horde: '/objectives/void-grubs.png', inhibitor: '/objectives/inhibitor.png' };
const elementIcons = new Set(['air', 'chemtech', 'earth', 'fire', 'hextech', 'water', 'elder']);
const iconFor = (notice: Notice) => notice.kind === 'dragon' && notice.dragonType && elementIcons.has(notice.dragonType) ? `/ingame-objectives/dragon-${notice.dragonType}.png` : objectiveIcon[notice.kind];
const key = (s: string) => s.trim().toLocaleLowerCase();
function resolve(name: string | undefined, players: Player[]) {
  if (!name) return undefined;
  const matches = players.filter(p => [p.name, ...(p.aliases ?? [])].some(alias => key(alias) === key(name)));
  return matches.length === 1 ? matches[0] : undefined;
}
function portrait(player: Player | undefined) {
  if (!player) return undefined;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return champions.find(c => normalize(c.id) === normalize(player.championName) || normalize(c.name) === normalize(player.championName))?.iconUrl;
}
export function EventFeed({ feed, preview = false }: { feed: Feed; preview?: boolean }) {
  const cursor = useRef<EventCursor>(null);
  const [queue, setQueue] = useState<Notice[]>(preview ? sample : []);
  const timers = useRef(new Set<number>());
  const reduced = useReducedMotion();
  useEffect(() => {
    if (preview) return;
    const result = advanceEvents(cursor.current, feed.connected, feed.gameTime, feed.events);
    cursor.current = result.cursor;
    if (result.reset) { for (const timer of timers.current) clearTimeout(timer); timers.current.clear(); setQueue([]); }
    else if (result.notices.length) {
      setQueue(old => [...old, ...result.notices].slice(-5));
      for (const notice of result.notices) {
        const timer = window.setTimeout(() => { timers.current.delete(timer); setQueue(old => old.filter(item => item.id !== notice.id)); }, 1800);
        timers.current.add(timer);
      }
    }
  }, [feed, preview]);
  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); timers.current.clear(); }, []);
  return <aside className="ig-event-feed" aria-label="Sự kiện trận đấu" aria-live="polite"><AnimatePresence initial={false}>
    {queue.slice(0, 5).map(notice => {
      const killer = resolve(notice.killer, feed.players); const victim = resolve(notice.victim, feed.players);
      const killerIcon = portrait(killer); const targetIcon = notice.kind === 'kill' ? portrait(victim) : iconFor(notice);
      const label = `${notice.killer || 'Không rõ'} → ${notice.victim || notice.dragon || notice.kind}`;
      return <motion.div className={`ig-event ig-event--${killer?.side ?? 'unknown'}`} key={notice.id} layout initial={{ opacity: 1, x: reduced ? 0 : 25 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : 20 }} transition={{ duration: reduced ? 0 : .12 }} aria-label={label} title={label}>
        <span className="ig-event-portrait">{killerIcon ? <img src={killerIcon} alt="" /> : <span aria-label="Nguồn không xác định">?</span>}</span>
        <Sword className="ig-event-sword" aria-hidden="true" />
        <span className="ig-event-portrait ig-event-target">{notice.kind === 'turret' ? <CastleTurret /> : targetIcon ? <img src={targetIcon} alt="" /> : <span aria-label="Mục tiêu không xác định">?</span>}</span>
      </motion.div>;
    })}
  </AnimatePresence></aside>;
}
