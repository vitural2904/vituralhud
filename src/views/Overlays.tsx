import { motion } from 'motion/react';
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
const formatDraftTimer = (ms: number) => String(Math.ceil(ms / 1000)).padStart(2, "0");
const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const formatCompact = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);

export function DraftOverlay({ state, visible, immediate = false }: { state: BroadcastState; visible: boolean; immediate?: boolean }) {
  const { draft, match } = state;
  return <motion.main initial={false} animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 22 }} transition={{ duration: immediate ? 0 : visible ? 0.55 : 0.42, ease: [0.22, 1, 0.36, 1] }} className={`overlay-shell ${visible ? "is-visible" : "is-hidden"}`}>
    <section className="broadcast-spine" aria-hidden={!visible} aria-label="Ban pick overlay">
      <div className="ban-group ban-group--blue"><span className="ban-label">BANS</span>{draft.teams.blue.bans.map((id, i) => <div className="ban-tile" key={i}>{id ? <img src={championById[id]?.iconUrl} alt={championById[id]?.name ?? id} /> : <span>{i + 1}</span>}</div>)}</div>
      <div className="ban-group ban-group--red"><span className="ban-label">BANS</span>{draft.teams.red.bans.map((id, i) => <div className="ban-tile" key={i}>{id ? <img src={championById[id]?.iconUrl} alt={championById[id]?.name ?? id} /> : <span>{i + 1}</span>}</div>)}</div>
      <div className="draft-board">
        <div className="pick-row pick-row--blue">{draft.teams.blue.picks.map((slot, i) => <DraftPick key={i} state={state} side="blue" index={i} slot={slot} />)}</div>
        <div className="match-core">
          <div className="center-meta"><strong>{match.gameLabel}</strong><span>PATCH {match.patch}</span><div className="phase"><b>{phaseDisplay[draft.phase].action}</b><i /><b>{phaseDisplay[draft.phase].round}</b></div></div>
          <div className="center-identities"><TeamIdentity state={state} side="blue" /><div className={`timer timer--${draft.activeSide}`}>{formatDraftTimer(draft.timerMs)}</div><TeamIdentity state={state} side="red" /></div>
        </div>
        <div className="pick-row pick-row--red">{draft.teams.red.picks.map((slot, i) => <DraftPick key={i} state={state} side="red" index={i} slot={slot} />)}</div>
      </div>
      <div className="team-footers"><div className="team-footer team-footer--blue" style={{ "--team-color": match.teams.blue.color } as React.CSSProperties}><strong>{match.teams.blue.name}</strong></div><div className="footer-core" /><div className="team-footer team-footer--red" style={{ "--team-color": match.teams.red.color } as React.CSSProperties}><strong>{match.teams.red.name}</strong></div></div>
    </section>
  </motion.main>;
}

function DraftPick({ state, side, index, slot }: { state: BroadcastState; side: Side; index: number; slot: BroadcastState["draft"]["teams"][Side]["picks"][number] }) {
  const champion = slot.championId ? championById[slot.championId] : undefined;
  const active = state.draft.activeSide === side && !slot.locked;
  return <article className={`pick-card pick-card--${side} ${active ? "is-active" : ""}`}>
    {champion ? <img src={champion.loadingUrl} alt={champion.name} /> : <div className="pick-empty">P{index + 1}</div>}<div className="pick-shade" />
    <div className="pick-meta"><span className="pick-champion">{champion?.name ?? "OPEN SLOT"}</span><div className="pick-player-line"><img className="pick-role" src={`/roles/${roleSlots[index]}.svg`} alt="" /><span className="pick-player">{state.match.teams[side].players[index] || "—"}</span>{slot.locked && <Check weight="bold" />}</div></div>
  </article>;
}

function TeamIdentity({ state, side }: { state: BroadcastState; side: Side }) {
  const team = state.match.teams[side];
  const needed = Math.ceil(state.match.bestOf / 2);
  return <div className="team-identity"><span className={`score-pips score-pips--${side}`} style={{ "--score-color": team.color } as React.CSSProperties}>{Array.from({ length: needed }, (_, i) => <i className={i < team.score ? "is-won" : ""} key={i} />)}</span>{team.logoUrl ? <img className="center-logo" src={team.logoUrl} alt={`Logo ${team.name}`} /> : <span className="center-logo logo-placeholder" />}</div>;
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
