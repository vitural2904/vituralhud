import { motion } from 'motion/react';
import '../overlay-type.css';
import '../draft-overlay.css';
import { DraftCountdown } from '../components/DraftCountdown';
import { DraftArtwork, DraftSelectionVeil, DraftSwap, useDraftReducedMotion } from '../components/DraftMotion';
import { Coin } from '@phosphor-icons/react/Coin';
import { Check } from '@phosphor-icons/react/Check';
import { CastleTurret } from '@phosphor-icons/react/CastleTurret';
import { ImageSquare } from '@phosphor-icons/react/ImageSquare';
import { CircleNotch } from '@phosphor-icons/react/CircleNotch';
import CountUp from '../components/react-bits/micro/CountUp';
import { championById } from '../domain/catalog';
import { getMatchLeaders, type MatchLeader } from '../domain/post-match-leaders';
import { getPostMatchOverviewMetrics } from '../domain/post-match-overview';
import { postMatchMetricLabels } from '../domain/labels';
import type { BroadcastState, Side, PostMatchOverviewMetric } from '../domain/types';
const phaseDisplay = { waiting: { action: 'WAIT', round: 'MATCH' }, 'ban-1': { action: 'BAN', round: 'ROUND 1' }, 'pick-1': { action: 'PICK', round: 'ROUND 1' }, 'ban-2': { action: 'BAN', round: 'ROUND 2' }, 'pick-2': { action: 'PICK', round: 'ROUND 2' }, complete: { action: 'DRAFT', round: 'COMPLETE' } };
const roleSlots = ['top', 'jungle', 'middle', 'bottom', 'utility'] as const;
const postMatchMetricImages = { dragons: '/objectives/dragon.png', barons: '/objectives/baron.png', inhibitors: '/objectives/inhibitor.png', voidGrubs: '/objectives/void-grubs.png', riftHeralds: '/objectives/herald.png' } as Partial<Record<PostMatchOverviewMetric, string>>;
const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const formatCompact = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);

export function DraftOverlay({ state, visible, immediate = false }: { state: BroadcastState; visible: boolean; immediate?: boolean }) {
  const { draft, match } = state;
  const reduced = useDraftReducedMotion();
  const drafting = visible && !['waiting', 'complete'].includes(draft.phase);
  const turn = draft.phase === 'complete' ? 'complete' : draft.phase === 'waiting' ? 'waiting' : draft.activeSide;
  return <motion.main initial={{ opacity: 0 }} animate={{ opacity: visible ? 1 : 0 }} transition={{ duration: immediate || reduced ? 0 : .2, ease: 'easeInOut' }} className={`overlay-shell ${visible ? "is-visible" : "is-hidden"}`} aria-hidden={!visible} data-draft-active={drafting}>
    <section className="broadcast-spine" aria-hidden={!visible} aria-label="Ban pick overlay">
      <div className="draft-bans">{(['blue', 'red'] as const).map(side => <div className={`ban-group ban-group--${side}`} key={side} aria-label={`${side} bans`}>{draft.teams[side].bans.map((_, i) => <DraftBan key={i} state={state} side={side} index={i} drafting={drafting} />)}</div>)}</div>
      <DraftCountdown draft={draft} visible={visible} />
      <div className="draft-board">
        <div className="pick-row pick-row--blue">{draft.teams.blue.picks.map((slot, i) => <DraftPick key={i} state={state} side="blue" index={i} slot={slot} drafting={drafting} />)}</div>
        <div className="match-core">
          <div className="center-identities"><TeamIdentity state={state} side="blue" /><span className="draft-turn" aria-label={draft.phase === 'complete' ? 'Draft hoàn tất' : `${draft.activeSide} ${phaseDisplay[draft.phase].action}`} data-side={draft.activeSide}><DraftSwap value={turn}>{draft.phase === 'complete' ? <Check weight="bold" /> : draft.phase === 'waiting' ? null : draft.activeSide === 'blue' ? '◀' : '▶'}</DraftSwap></span><TeamIdentity state={state} side="red" /></div>
          <div className="draft-match-label" title={match.matchName || match.gameLabel}><DraftSwap value={match.gameLabel}>{match.gameLabel}</DraftSwap><DraftSwap value={draft.phase}>{draft.phase === 'complete' ? 'LOCKED IN' : `${phaseDisplay[draft.phase].action} ${phaseDisplay[draft.phase].round.replace('ROUND ', '')}`}</DraftSwap></div>
        </div>
        <div className="pick-row pick-row--red">{draft.teams.red.picks.map((slot, i) => <DraftPick key={i} state={state} side="red" index={i} slot={slot} drafting={drafting} />)}</div>
      </div>
    </section>
  </motion.main>;
}

function DraftBan({ state, side, index, drafting }: { state: BroadcastState; side: Side; index: number; drafting: boolean }) {
  const team = state.draft.teams[side];
  const id = team.bans[index];
  const champion = id ? championById[id] : undefined;
  const locked = team.banLocked?.[index] ?? Boolean(id);
  const selection = id ? locked ? 'locked' : 'hover' : locked ? 'skipped' : 'empty';
  const status = id ? locked ? 'Đã khóa ban' : 'Chưa khóa ban' : locked ? 'Bỏ lượt ban' : 'Chưa chọn';
  return <div className="ban-tile" data-selection={selection} aria-label={`${side} · Ban ${index + 1} · ${champion?.name ?? id ?? '—'} · ${status}`}>
    <DraftArtwork src={champion?.iconUrl} alt={champion?.name ?? id ?? ''} fallback={selection === 'skipped' ? <span className="ban-skip" aria-hidden="true">—</span> : null} fallbackKey={selection === 'skipped' ? 'skipped' : 'empty'} />
    <DraftSelectionVeil active={drafting && selection === 'hover'} />
  </div>;
}

function DraftPick({ state, side, index, slot, drafting }: { state: BroadcastState; side: Side; index: number; slot: BroadcastState["draft"]["teams"][Side]["picks"][number]; drafting: boolean }) {
  const champion = slot.championId ? championById[slot.championId] : undefined;
  const player = state.match.teams[side].players[index] || '—';
  const selection = slot.championId ? slot.locked ? 'locked' : 'hover' : 'empty';
  return <article className={`pick-card pick-card--${side}`} data-selection={selection} aria-label={`${player} · ${roleSlots[index]} · ${champion?.name ?? 'Chưa chọn'}${slot.championId ? slot.locked ? ' · Đã khóa' : ' · Chưa khóa' : ''}`}>
    <DraftArtwork src={champion?.loadingUrl} alt={champion?.name ?? ''} fallback={<span className="pick-empty">P{index + 1}</span>} /><div className="pick-shade" />
    <DraftSelectionVeil active={drafting && selection === 'hover'} />
    <div className="pick-meta"><div className="pick-player-line"><DraftSwap className="pick-player" title={player} value={player}>{player}</DraftSwap></div><img className="pick-role" src={`/roles/${roleSlots[index]}.svg`} alt={roleSlots[index]} /></div>
  </article>;
}

function TeamIdentity({ state, side }: { state: BroadcastState; side: Side }) {
  const team = state.match.teams[side];
  const needed = Math.ceil(state.match.bestOf / 2);
  return <div className={`team-identity team-identity--${side}`} title={team.name}>
    <span className={`score-pips score-pips--${side}`} aria-label={`${team.name}: ${team.score} trận thắng`}><DraftSwap value={String(needed)}>{Array.from({ length: needed }, (_, i) => <i className={i < team.score ? "is-won" : ""} key={i} />)}</DraftSwap></span>
    <span className="draft-side-label">{side.toUpperCase()} SIDE</span>
    <DraftArtwork className="center-logo" src={team.logoUrl || undefined} alt={`Logo ${team.name}`} fallback={<span className="center-monogram" aria-hidden="true">{team.code.slice(0, 2)}</span>} fallbackKey={team.code} />
    <DraftSwap className="center-team-code" value={team.code}>{team.code}</DraftSwap>
  </div>;
}

export function PostMatchOverlay({ state, visible, immediate = false }: { state: BroadcastState; visible: boolean; immediate?: boolean }) {
  const data = state.postMatch.data; const blue = state.match.teams.blue; const red = state.match.teams.red;
  const overviewMetrics = getPostMatchOverviewMetrics(data.earlyObjective);
  const maxDamage = Math.max(...data.teams.blue.players.map((p) => p.damageToChampions), ...data.teams.red.players.map((p) => p.damageToChampions), 1);
  return <motion.main initial={false} animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.985 }} transition={{ duration: immediate ? 0 : visible ? 0.6 : 0.4, ease: [0.22, 1, 0.36, 1] }} className={`post-overlay ${visible ? "is-visible" : "is-hidden"}`} aria-hidden={!visible}>
    <header className="post-scoreboard">
      <div className="post-team post-team--blue"><div className="post-logo-frame">{blue.logoUrl ? <img src={blue.logoUrl} alt={`Logo ${blue.name}`} /> : <span className="logo-placeholder" />}</div><div className="post-team-copy"><span>{data.winner === "blue" ? "VICTORY" : "DEFEAT"}</span><strong>{blue.name}</strong></div><b><CountUp to={data.teams.blue.kills} duration={0.7} /></b></div>
      <div className="post-duration"><span>GAME TIME</span><strong>{formatClock(data.durationSeconds)}</strong></div>
      <div className="post-team post-team--red"><b><CountUp to={data.teams.red.kills} duration={0.7} /></b><div className="post-team-copy"><span>{data.winner === "red" ? "VICTORY" : "DEFEAT"}</span><strong>{red.name}</strong></div><div className="post-logo-frame">{red.logoUrl ? <img src={red.logoUrl} alt={`Logo ${red.name}`} /> : <span className="logo-placeholder" />}</div></div>
    </header>
    <div className="post-rule" />
    <section className="post-grid">
      <div className="post-overview"><div className="post-section-title"><span>OVERVIEW</span></div>{overviewMetrics.map((metric) => <div className="post-metric" key={metric}><strong>{metric === "gold" ? formatCompact(data.teams.blue[metric]) : data.teams.blue[metric]}</strong><PostMatchMetricSymbol metric={metric} /><strong>{metric === "gold" ? formatCompact(data.teams.red[metric]) : data.teams.red[metric]}</strong></div>)}</div>
      <div className="post-analytics">
        <section className="damage-panel"><div className="post-section-title"><span>DAMAGE TO CHAMPIONS</span></div><div className="damage-columns"><div>{data.teams.blue.players.map((p, i) => <DamageRow key={i} player={p} max={maxDamage} side="blue" />)}</div><div>{data.teams.red.players.map((p, i) => <DamageRow key={i} player={p} max={maxDamage} side="red" />)}</div></div></section>
        <MatchLeadersPanel state={state} />
      </div>
    </section>
  </motion.main>;
}

function PostMatchMetricSymbol({ metric }: { metric: PostMatchOverviewMetric }) {
  const className = `post-metric-symbol post-metric-symbol--${metric}`;
  const label = postMatchMetricLabels[metric];
  if (metric === "gold") return <Coin className={className} weight="fill" aria-label={label} />;
  if (metric === "towers") return <CastleTurret className={className} weight="fill" aria-label={label} />;
  if (metric === "voidGrubs") return <span className={`${className} post-metric-grubs`} role="img" aria-label={label} />;
  return <img className={className} src={postMatchMetricImages[metric]} alt={label} />;
}

function DamageRow({ player, max, side }: { player: BroadcastState["postMatch"]["data"]["teams"][Side]["players"][number]; max: number; side: Side }) {
  const champ = player.championId ? championById[player.championId] : undefined;
  const icon = <img src={champ?.iconUrl} alt={champ?.name ?? "Champion"} />;
  const bar = <div className="damage-track"><i style={{ width: `${Math.max(4, player.damageToChampions / max * 100)}%` }} /></div>;
  const value = <strong>{formatCompact(player.damageToChampions)}</strong>;
  return <div className={`damage-row damage-row--${side}`}>{side === "blue" ? <>{bar}{value}{icon}</> : <>{icon}{value}{bar}</>}</div>;
}

function MatchLeadersPanel({ state }: { state: BroadcastState }) {
  const leaders = getMatchLeaders(state.postMatch.data);
  const killChampion = leaders.kills.player.championId ? championById[leaders.kills.player.championId] : undefined;
  return <section className="match-leaders-panel">
    <div className="post-section-title"><span>MATCH LEADERS</span></div>
    <div className="match-leaders-layout">
      <article className={`leader-feature leader--${leaders.kills.side}`}>
        <img src={killChampion?.iconUrl} alt={killChampion?.name ?? "Kill leader"} />
        <i />
        <div className="leader-feature-copy">
          <span>KILL LEADER</span>
          <strong>{leaders.kills.player.kills}</strong>
          <b>KILLS</b>
          <small>{leaders.kills.player.largestKillingSpree} KILLING SPREE</small>
        </div>
      </article>
      <div className="leader-support">
        <LeaderSupportRow leader={leaders.assists} label="ASSIST LEADER" value={String(leaders.assists.player.assists)} />
        <LeaderSupportRow leader={leaders.damageToObjectives} label="OBJECTIVE DAMAGE" value={formatCompact(leaders.damageToObjectives.player.damageToObjectives)} />
      </div>
    </div>
  </section>;
}

function LeaderSupportRow({ leader, label, value }: { leader: MatchLeader; label: string; value: string }) {
  const champion = leader.player.championId ? championById[leader.player.championId] : undefined;
  return <article className={`leader-support-row leader--${leader.side}`}>
    <img src={champion?.iconUrl} alt={champion?.name ?? label} />
    <i />
    <div><span>{label}</span><strong>{value}</strong></div>
  </article>;
}
