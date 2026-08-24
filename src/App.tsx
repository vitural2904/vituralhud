import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { Broadcast } from "@phosphor-icons/react/Broadcast";
import { CastleTurret } from "@phosphor-icons/react/CastleTurret";
import { Check } from "@phosphor-icons/react/Check";
import { CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CloudArrowDown } from "@phosphor-icons/react/CloudArrowDown";
import { Coin } from "@phosphor-icons/react/Coin";
import { Eye } from "@phosphor-icons/react/Eye";
import { EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { ImageSquare } from "@phosphor-icons/react/ImageSquare";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { PlugsConnected } from "@phosphor-icons/react/PlugsConnected";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { Warning } from "@phosphor-icons/react/Warning";
import { championById, searchChampions } from "./domain/catalog";
import { getMatchLeaders, type MatchLeader } from "./domain/post-match-leaders";
import { getPostMatchOverviewMetrics, postMatchOverviewCoreMetrics } from "./domain/post-match-overview";
import { createInitialState, postMatchMetricLabels } from "./domain/state";
import type { BroadcastCommand, BroadcastState, DraftPhase, PostMatchMetric, PostMatchOverviewMetric, PostMatchPlayerMetric, Side } from "./domain/types";

const phaseNames: Record<DraftPhase, string> = { waiting: "CHỜ TRẬN", "ban-1": "CẤM · LƯỢT 1", "pick-1": "CHỌN · LƯỢT 1", "ban-2": "CẤM · LƯỢT 2", "pick-2": "CHỌN · LƯỢT 2", complete: "HOÀN TẤT" };
const phaseDisplay: Record<DraftPhase, { action: string; round: string }> = { waiting: { action: "CHỜ", round: "TRẬN" }, "ban-1": { action: "CẤM", round: "LƯỢT 1" }, "pick-1": { action: "CHỌN", round: "LƯỢT 1" }, "ban-2": { action: "CẤM", round: "LƯỢT 2" }, "pick-2": { action: "CHỌN", round: "LƯỢT 2" }, complete: { action: "HOÀN", round: "TẤT" } };
const roleSlots = ["top", "jungle", "middle", "bottom", "utility"] as const;
const teamResultMetrics: PostMatchMetric[] = ["kills"];
const postMatchMetricImages: Partial<Record<PostMatchOverviewMetric, string>> = {
  dragons: "/objectives/dragon.png",
  barons: "/objectives/baron.png",
  inhibitors: "/objectives/inhibitor.png",
  voidGrubs: "/objectives/void-grubs.png",
  riftHeralds: "/objectives/herald.png",
};
type TeamLogoAsset = { name: string; url: string; source: "built-in" | "uploaded" };

function useBroadcastState() {
  const [state, setState] = useState<BroadcastState>(createInitialState());
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let active = true;
    let socket: WebSocket | undefined;
    let reconnect: number | undefined;
    let attempts = 0;
    fetch("/api/state").then((response) => response.json()).then((next) => active && setState(next)).catch(() => undefined);
    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${location.host}/ws`);
      socket.onopen = () => { attempts = 0; setConnected(true); };
      socket.onmessage = (event) => { const payload = JSON.parse(event.data) as { type: string; state: BroadcastState }; if (payload.type === "state") setState(payload.state); };
      socket.onclose = () => { setConnected(false); if (active) reconnect = window.setTimeout(connect, Math.min(10_000, 500 * 2 ** attempts++)); };
    };
    connect();
    return () => { active = false; if (reconnect) clearTimeout(reconnect); socket?.close(); };
  }, []);
  const dispatch = useCallback(async (command: BroadcastCommand) => {
    const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
    if (!response.ok) throw new Error("Không thể cập nhật dữ liệu");
    const next = await response.json() as BroadcastState;
    setState(next);
  }, []);
  const resolvePostMatch = useCallback(async (matchId: string) => {
    const response = await fetch("/api/post-match/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ matchId }) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || "Không thể lấy dữ liệu post-match");
    }
    setState(await response.json() as BroadcastState);
  }, []);
  const loadPostMatchFixture = useCallback(async () => {
    const response = await fetch("/api/post-match/fixture", { method: "POST" });
    if (!response.ok) throw new Error("Không thể nạp dữ liệu mẫu");
    setState(await response.json() as BroadcastState);
  }, []);
  return { state, connected, dispatch, resolvePostMatch, loadPostMatchFixture };
}

const formatDraftTimer = (ms: number) => String(Math.ceil(ms / 1000)).padStart(2, "0");
const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const formatCompact = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);

function DraftOverlay({ state, visible }: { state: BroadcastState; visible: boolean }) {
  const { draft, match } = state;
  return <main className={`overlay-shell ${visible ? "is-visible" : "is-hidden"}`}>
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
  </main>;
}

function DraftPick({ state, side, index, slot }: { state: BroadcastState; side: Side; index: number; slot: BroadcastState["draft"]["teams"][Side]["picks"][number] }) {
  const champion = slot.championId ? championById[slot.championId] : undefined;
  const active = state.draft.activeSide === side && !slot.locked;
  return <article className={`pick-card pick-card--${side} ${active ? "is-active" : ""}`}>
    {champion ? <img src={champion.loadingUrl} alt={champion.name} /> : <div className="pick-empty">P{index + 1}</div>}<div className="pick-shade" />
    <div className="pick-meta"><span className="pick-champion">{champion?.name ?? "CHƯA CHỌN"}</span><div className="pick-player-line"><img className="pick-role" src={`/roles/${roleSlots[index]}.svg`} alt="" /><span className="pick-player">{state.match.teams[side].players[index] || "—"}</span>{slot.locked && <Check weight="bold" />}</div></div>
  </article>;
}

function TeamIdentity({ state, side }: { state: BroadcastState; side: Side }) {
  const team = state.match.teams[side];
  const needed = Math.ceil(state.match.bestOf / 2);
  return <div className="team-identity"><span className={`score-pips score-pips--${side}`} style={{ "--score-color": team.color } as React.CSSProperties}>{Array.from({ length: needed }, (_, i) => <i className={i < team.score ? "is-won" : ""} key={i} />)}</span><img className="center-logo" src={team.logoUrl} alt={`Logo ${team.name}`} /></div>;
}

function PostMatchOverlay({ state, visible }: { state: BroadcastState; visible: boolean }) {
  const data = state.postMatch.data; const blue = state.match.teams.blue; const red = state.match.teams.red;
  const overviewMetrics = getPostMatchOverviewMetrics(data.earlyObjective);
  const maxDamage = Math.max(...data.teams.blue.players.map((p) => p.damageToChampions), ...data.teams.red.players.map((p) => p.damageToChampions), 1);
  return <main className={`post-overlay ${visible ? "is-visible" : "is-hidden"}`} aria-hidden={!visible}>
    <header className="post-scoreboard">
      <div className="post-team post-team--blue"><div className="post-logo-frame"><img src={blue.logoUrl} alt={`Logo ${blue.name}`} /></div><div className="post-team-copy"><span>{data.winner === "blue" ? "VICTORY" : "DEFEAT"}</span><strong>{blue.name}</strong></div><b>{data.teams.blue.kills}</b></div>
      <div className="post-duration"><span>GAME TIME</span><strong>{formatClock(data.durationSeconds)}</strong></div>
      <div className="post-team post-team--red"><b>{data.teams.red.kills}</b><div className="post-team-copy"><span>{data.winner === "red" ? "VICTORY" : "DEFEAT"}</span><strong>{red.name}</strong></div><div className="post-logo-frame"><img src={red.logoUrl} alt={`Logo ${red.name}`} /></div></div>
    </header>
    <div className="post-rule" />
    <section className="post-grid">
      <div className="post-overview"><div className="post-section-title"><span>OVERVIEW</span></div>{overviewMetrics.map((metric) => <div className="post-metric" key={metric}><strong>{metric === "gold" ? formatCompact(data.teams.blue[metric]) : data.teams.blue[metric]}</strong><PostMatchMetricSymbol metric={metric} /><strong>{metric === "gold" ? formatCompact(data.teams.red[metric]) : data.teams.red[metric]}</strong></div>)}</div>
      <div className="post-analytics">
        <section className="damage-panel"><div className="post-section-title"><span>DAMAGE TO CHAMPIONS</span></div><div className="damage-columns"><div>{data.teams.blue.players.map((p, i) => <DamageRow key={i} player={p} max={maxDamage} side="blue" />)}</div><div>{data.teams.red.players.map((p, i) => <DamageRow key={i} player={p} max={maxDamage} side="red" />)}</div></div></section>
        <MatchLeadersPanel state={state} />
      </div>
    </section>
  </main>;
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

function Field({ label, value, onChange, type = "text", disabled = false }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <label className="field"><span>{label}</span><input disabled={disabled} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ChampionSearch({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const selected = value ? championById[value] : undefined; const [query, setQuery] = useState(selected?.name ?? ""); const [open, setOpen] = useState(false); const listId = useId(); const matches = useMemo(() => searchChampions(query), [query]);
  useEffect(() => setQuery(selected?.name ?? ""), [selected?.name]);
  return <div className="champion-search"><input aria-label="Tìm tướng" aria-controls={listId} aria-expanded={open} role="combobox" value={query} onFocus={(e) => { e.currentTarget.select(); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 100)} onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(null); }} /><MagnifyingGlass />{open && <div className="champion-options" id={listId} role="listbox">{matches.slice(0, 18).map((champ) => <button type="button" role="option" aria-selected={champ.id === value} key={champ.id} onPointerDown={(e) => e.preventDefault()} onClick={() => { onChange(champ.id); setOpen(false); }}><img src={champ.iconUrl} alt="" /><span>{champ.name}</span></button>)}</div>}</div>;
}

type WorkspaceProps = {
  state: BroadcastState;
  connected: boolean;
  dispatch: (command: BroadcastCommand) => Promise<void>;
  resolvePostMatch: (matchId: string) => Promise<void>;
  loadPostMatchFixture: () => Promise<void>;
};
function ControlShell({ state, connected, children, workspace }: WorkspaceProps & { children: React.ReactNode; workspace: "draft" | "post-match" }) {
  return <main className="control-shell">
    <header className="control-topbar"><div className="product-lockup"><Broadcast weight="fill" /><div><strong>VIRTUALHUD</strong><span>BROADCAST OPERATIONS</span></div></div><nav className="workspace-tabs" aria-label="Không gian điều khiển"><a className={workspace === "draft" ? "is-active" : ""} href="/control/draft">BAN / PICK</a><a className={workspace === "post-match" ? "is-active" : ""} href="/control/post-match">POST-MATCH</a></nav><div className="topbar-actions"><span className="topbar-status"><i className={connected ? "online" : "offline"} />{connected ? "SERVER ONLINE" : "SERVER OFFLINE"}<b>REV {state.revision}</b></span><a className="preview-link" href="/overlay" target="_blank" rel="noreferrer">OBS OUTPUT <ArrowSquareOut /></a></div></header>
    <div className="control-body"><aside className="control-rail"><span className="rail-label">TRẠNG THÁI</span><div className="source-card"><PlugsConnected /><span>Tiến trình</span><strong>{state.lifecycle.toUpperCase()}</strong><small>{state.lcu.message}</small></div><div className="output-state"><span>OUTPUT</span><strong>{state.activeOutput === "none" ? "OFF AIR" : state.activeOutput.toUpperCase()}</strong></div><div className="event-log"><span className="rail-label">NHẬT KÝ</span>{state.events.slice(0, 9).map((event) => <div key={event.id}><b>R{event.revision}</b><span>{event.label}</span><time>{new Date(event.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time></div>)}</div></aside><section className="control-workspace">{children}</section></div>
  </main>;
}

function DraftWorkspace(props: WorkspaceProps) {
  const { state, dispatch } = props; const [error, setError] = useState(""); const safe = async (command: BroadcastCommand) => { try { setError(""); await dispatch(command); } catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); } };
  return <ControlShell {...props} workspace="draft"><div className="workspace-heading"><div><span className="section-kicker">LIVE DRAFT</span><h1>Ban / Pick Control</h1></div><span className="safety-note"><ShieldCheck /> LCU CHỈ ĐỌC</span></div>{error && <div className="error-banner">{error}</div>}
    <section className="match-panel panel"><Field label="Tên trận" value={state.match.matchName} onChange={(value) => void safe({ type: "SET_MATCH", field: "matchName", value })} /><Field label="Ván" value={state.match.gameLabel} onChange={(value) => void safe({ type: "SET_MATCH", field: "gameLabel", value })} /><Field label="Patch" value={state.match.patch} onChange={(value) => void safe({ type: "SET_MATCH", field: "patch", value })} /><label className="field"><span>Thể thức</span><select value={state.match.bestOf} onChange={(e) => void safe({ type: "SET_BEST_OF", value: Number(e.target.value) as 1 | 3 | 5 })}><option value="1">BO1</option><option value="3">BO3</option><option value="5">BO5</option></select></label><label className="field"><span>Giai đoạn</span><select value={state.draft.phase} onChange={(e) => void safe({ type: "SET_PHASE", phase: e.target.value as DraftPhase })}>{Object.entries(phaseNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label></section>
    <div className="teams-grid">{(["blue", "red"] as Side[]).map((side) => <DraftTeamEditor key={side} state={state} side={side} safe={safe} />)}</div>
    <footer className="transport-bar"><div className="timer-control"><button className="icon-button" onClick={() => void safe({ type: "TOGGLE_TIMER" })}>{state.draft.timerRunning ? <Pause /> : <Play />}</button><span>{formatClock(Math.ceil(state.draft.timerMs / 1000))}</span><input type="number" value={Math.ceil(state.draft.timerMs / 1000)} onChange={(e) => void safe({ type: "SET_TIMER", timerMs: Number(e.target.value) * 1000 })} /></div><div className="phase-status">{phaseNames[state.draft.phase]} · {state.draft.activeSide.toUpperCase()}</div><div className="transport-actions"><label className="inline-switch"><input type="checkbox" checked={state.draft.manualOverride} onChange={(e) => void safe({ type: "SET_OVERRIDE", value: e.target.checked })} /> MANUAL</label><button className={`fade-action ${state.activeOutput === "draft" ? "is-live" : ""}`} disabled={!state.draft.manualOverride} onClick={() => void safe({ type: "SET_OUTPUT", output: state.activeOutput === "draft" ? "none" : "draft" })}>{state.activeOutput === "draft" ? <EyeSlash /> : <Eye />}{state.activeOutput === "draft" ? "FADE OUT" : "FADE IN"}</button><button className="primary-action" onClick={() => void safe({ type: "RUN_DEMO_STEP" })}>BƯỚC TIẾP <Check /></button></div></footer>
  </ControlShell>;
}

function DraftTeamEditor({ state, side, safe }: { state: BroadcastState; side: Side; safe: (command: BroadcastCommand) => Promise<void> }) {
  const team = state.match.teams[side]; const draft = state.draft.teams[side];
  return <section className={`panel team-editor team-editor--${side}`}><header className="panel-header"><div className="team-heading"><img src={team.logoUrl} alt="" /><div><span className="section-kicker">{side.toUpperCase()} SIDE</span><h2>{team.name}</h2></div></div><label className="score-input">VÁN THẮNG<input type="number" value={team.score} onChange={(e) => void safe({ type: "SET_SCORE", side, value: Number(e.target.value) })} /></label></header><div className="team-fields"><Field label="Tên đội" value={team.name} onChange={(value) => void safe({ type: "SET_TEAM", side, field: "name", value })} /><Field label="Mã đội" value={team.code} onChange={(value) => void safe({ type: "SET_TEAM", side, field: "code", value })} /><label className="field color-field"><span>Màu</span><input type="color" value={team.color} onChange={(e) => void safe({ type: "SET_TEAM", side, field: "color", value: e.target.value })} /></label><TeamLogoPicker logoUrl={team.logoUrl} teamName={team.name} onChange={(value) => safe({ type: "SET_TEAM", side, field: "logoUrl", value })} /></div><div className="slot-list">{draft.picks.map((pick, i) => <div className="slot-control" key={i}><img className="slot-role" src={`/roles/${roleSlots[i]}.svg`} alt="" /><input value={team.players[i]} onChange={(e) => void safe({ type: "SET_PLAYER", side, index: i, value: e.target.value })} /><ChampionSearch value={pick.championId} onChange={(championId) => void safe({ type: "SET_PICK", side, index: i, championId })} /></div>)}</div><div className="ban-controls"><span>CẤM</span>{draft.bans.map((ban, i) => <ChampionSearch key={i} value={ban} onChange={(championId) => void safe({ type: "SET_BAN", side, index: i, championId })} />)}</div></section>;
}

function TeamLogoPicker({ logoUrl, teamName, onChange }: { logoUrl: string; teamName: string; onChange: (value: string) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null); const [assets, setAssets] = useState<TeamLogoAsset[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { let active = true; fetch("/api/team-logos").then((response) => response.json()).then((payload: { assets?: TeamLogoAsset[] }) => { if (active) setAssets(payload.assets ?? []); }).catch(() => undefined); return () => { active = false; }; }, []);
  const upload = async (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError("Chỉ nhận PNG, JPG hoặc WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Logo phải nhỏ hơn 5 MB."); return; }
    try {
      setBusy(true); setError("");
      const response = await fetch("/api/team-logos", { method: "POST", headers: { "content-type": file.type, "x-file-name": encodeURIComponent(file.name) }, body: file });
      const payload = await response.json() as { asset?: TeamLogoAsset; error?: string };
      if (!response.ok || !payload.asset) throw new Error(payload.error ?? "Không thể tải logo");
      setAssets((current) => [payload.asset!, ...current.filter((asset) => asset.url !== payload.asset!.url)]);
      await onChange(payload.asset.url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không thể tải logo"); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const currentName = assets.find((asset) => asset.url === logoUrl)?.name ?? logoUrl.split("/").at(-1) ?? "Logo hiện tại";
  return <div className="team-logo-picker"><span className="team-logo-picker__label">LOGO ĐỘI</span><div className="team-logo-picker__body"><div className="team-logo-picker__preview"><img src={logoUrl} alt={`Logo ${teamName}`} /></div><div className="team-logo-picker__controls"><label><span>Logo đã lưu</span><select value={logoUrl} onChange={(event) => void onChange(event.target.value)}>{!assets.some((asset) => asset.url === logoUrl) && <option value={logoUrl}>{currentName}</option>}{assets.map((asset) => <option value={asset.url} key={asset.url}>{asset.name}</option>)}</select></label><button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? <CircleNotch className="spin" /> : <UploadSimple />}{busy ? "ĐANG TẢI" : "TẢI LOGO MỚI"}</button><input ref={inputRef} className="team-logo-picker__input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void upload(event.target.files?.[0])} /></div></div>{error ? <small className="team-logo-picker__error"><Warning />{error}</small> : <small className="team-logo-picker__hint"><ImageSquare /> PNG, JPG hoặc WebP · tối đa 5 MB</small>}</div>;
}

function PostMatchWorkspace(props: WorkspaceProps) {
  const { state, dispatch, resolvePostMatch, loadPostMatchFixture } = props; const post = state.postMatch; const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [matchId, setMatchId] = useState(post.matchId);
  const safe = async (command: BroadcastCommand) => { try { setError(""); await dispatch(command); } catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); } };
  const resolve = async () => { try { setBusy(true); setError(""); await resolvePostMatch(matchId); } catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); } finally { setBusy(false); } };
  const loadFixture = async () => { try { setBusy(true); setError(""); await loadPostMatchFixture(); } catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); } finally { setBusy(false); } };
  const editable = !["waiting", "fetching"].includes(post.status);
  return <ControlShell {...props} workspace="post-match"><div className="workspace-heading"><div><span className="section-kicker">MATCH REPORT</span><h1>Post-match Control</h1></div><div className={`review-badge review-badge--${post.status}`}><i />{post.status.toUpperCase()}</div></div>{error && <div className="error-banner">{error}</div>}
    <div className="post-status-strip"><label className="match-id-field"><span>MATCH ID</span><input value={matchId} onChange={(event) => setMatchId(event.target.value.toUpperCase())} placeholder="VN2_123456789" spellCheck={false} /></label><div><span>NGUỒN</span><strong>{post.source.toUpperCase()}</strong></div><div><span>ĐỘ TIN CẬY</span><strong>{post.confidence.toUpperCase()}</strong></div><button disabled={busy || !matchId.trim()} onClick={() => void resolve()}>{busy || post.status === "fetching" ? <CircleNotch className="spin" /> : <CloudArrowDown />}LẤY MATCH-V5</button><button className="fixture-action" disabled={busy} onClick={() => void loadFixture()}>NẠP FIXTURE</button></div>
    {post.warnings.filter((warning) => warning !== error).map((warning) => <div className="warning-banner" key={warning}><Warning />{warning}</div>)}
    <section className="post-preview-panel panel"><div className="panel-title"><div><span className="section-kicker">PREVIEW</span><h2>Broadcast Ledger</h2></div><a href="/preview/post-match" target="_blank" rel="noreferrer">MỞ TOÀN MÀN HÌNH <ArrowSquareOut /></a></div><div className="post-preview-frame"><iframe title="Xem trước post-match" src="/preview/post-match" /></div></section>
    {post.status === "waiting" ? <section className="empty-review panel"><CloudArrowDown /><h2>Chờ dữ liệu trận đấu</h2><p>Nhập Match ID. Hoặc nạp fixture để kiểm tra giao diện.</p><button onClick={() => void loadFixture()}>NẠP DỮ LIỆU MẪU</button></section> : <div className={`post-editor ${editable ? "" : "is-disabled"}`}>
      <section className="panel result-editor"><div className="panel-title"><div><span className="section-kicker">01 · RESULT</span><h2>Kết quả trận</h2></div></div><div className="result-fields"><div className="field-with-source"><label className="field"><span>Đội thắng</span><select value={post.data.winner} disabled={!editable} onChange={(e) => void safe({ type: "POST_MATCH_SET_WINNER", side: e.target.value as Side })}><option value="blue">{state.match.teams.blue.name}</option><option value="red">{state.match.teams.red.name}</option></select></label><SourceTag manual={post.overrideFields.includes("winner")} onReset={() => void safe({ type: "POST_MATCH_RESET_FIELD", field: "winner" })} /></div><div className="field-with-source"><Field disabled={!editable} label="Thời lượng (giây)" type="number" value={post.data.durationSeconds} onChange={(value) => void safe({ type: "POST_MATCH_SET_DURATION", seconds: Number(value) })} /><SourceTag manual={post.overrideFields.includes("durationSeconds")} onReset={() => void safe({ type: "POST_MATCH_RESET_FIELD", field: "durationSeconds" })} /></div><div className="field-with-source"><label className="field"><span>Mục tiêu đầu trận</span><select value={post.data.earlyObjective} disabled={!editable} onChange={(e) => void safe({ type: "POST_MATCH_SET_EARLY_OBJECTIVE", objective: e.target.value as "voidGrubs" | "riftHeralds" })}><option value="voidGrubs">Sâu hư không</option><option value="riftHeralds">Sứ giả khe nứt</option></select></label><SourceTag manual={post.overrideFields.includes("earlyObjective")} onReset={() => void safe({ type: "POST_MATCH_RESET_FIELD", field: "earlyObjective" })} /></div></div></section>
      <div className="post-team-editors">{(["blue", "red"] as Side[]).map((side) => <PostTeamEditor key={side} state={state} side={side} safe={safe} editable={editable} />)}</div>
    </div>}
    <footer className="post-publish-bar"><div><span>{post.overrideFields.length ? `${post.overrideFields.length} TRƯỜNG SỬA TAY` : "KHÔNG CÓ OVERRIDE"}</span><small>{post.lastSyncedAt ? `Đồng bộ ${new Date(post.lastSyncedAt).toLocaleTimeString("vi-VN")}` : "Chưa đồng bộ"}</small></div><button disabled={!post.overrideFields.length} onClick={() => void safe({ type: "POST_MATCH_RESET_OVERRIDES" })}>KHÔI PHỤC NGUỒN</button>{post.status === "review" && <button className="approve-action" onClick={() => void safe({ type: "POST_MATCH_SET_READY", value: true })}><Check /> DUYỆT KẾT QUẢ</button>}{post.status === "ready" && <button className="publish-action" onClick={() => void safe({ type: "SET_OUTPUT", output: "post-match" })}><Eye /> FADE IN</button>}{post.status === "live" && <button className="publish-action is-live" onClick={() => void safe({ type: "SET_OUTPUT", output: "none" })}><EyeSlash /> FADE OUT</button>}</footer>
  </ControlShell>;
}

function SourceTag({ manual, onReset }: { manual: boolean; onReset?: () => void }) {
  return manual && onReset ? <button className="source-tag is-manual" onClick={onReset} title="Khôi phục giá trị từ nguồn" type="button">MANUAL · RESET</button> : <span className={`source-tag ${manual ? "is-manual" : ""}`}>{manual ? "MANUAL" : "SOURCE"}</span>;
}
function PostTeamEditor({ state, side, safe, editable }: { state: BroadcastState; side: Side; safe: (command: BroadcastCommand) => Promise<void>; editable: boolean }) {
  const team = state.match.teams[side]; const data = state.postMatch.data.teams[side]; const hasManual = (field: string) => state.postMatch.overrideFields.includes(field);
  const metrics: PostMatchMetric[] = [...teamResultMetrics, ...postMatchOverviewCoreMetrics, state.postMatch.data.earlyObjective];
  const playerMetrics: Array<{ field: PostMatchPlayerMetric; label: string }> = [
    { field: "damageToChampions", label: "DMG" },
    { field: "kills", label: "K" },
    { field: "assists", label: "A" },
    { field: "largestKillingSpree", label: "SPREE" },
    { field: "damageToObjectives", label: "OBJ DMG" },
  ];
  const hasPlayerManual = data.players.some((_, index) => playerMetrics.some(({ field }) => hasManual(`teams.${side}.players.${index}.${field}`)));
  return <section className={`panel post-team-editor post-team-editor--${side}`}>
    <div className="panel-title"><div className="team-heading"><img src={team.logoUrl} alt="" /><div><span className="section-kicker">{side.toUpperCase()} SIDE</span><h2>{team.name}</h2></div></div><SourceTag manual={metrics.some((m) => hasManual(`teams.${side}.${m}`)) || hasPlayerManual} /></div>
    <div className="metric-input-grid">{metrics.map((metric) => { const field = `teams.${side}.${metric}`; return <label className="metric-input" key={metric}><span>{postMatchMetricLabels[metric]}</span><input disabled={!editable} type="number" min="0" value={data[metric]} onChange={(e) => void safe({ type: "POST_MATCH_SET_METRIC", side, field: metric, value: Number(e.target.value) })} /><SourceTag manual={hasManual(field)} onReset={() => void safe({ type: "POST_MATCH_RESET_FIELD", field })} /></label>; })}</div>
    <div className="player-stat-table">
      <div className="player-stat-head"><span>PLAYER</span>{playerMetrics.map(({ field, label }) => <span key={field}>{label}</span>)}</div>
      {data.players.map((player, index) => { const champ = player.championId ? championById[player.championId] : undefined; return <div className="player-stat-row" key={index}>
        <div className="player-stat-id"><img src={champ?.iconUrl} alt="" /><span>{player.player}</span></div>
        {playerMetrics.map(({ field }) => { const path = `teams.${side}.players.${index}.${field}`; return <label className={hasManual(path) ? "is-manual" : ""} key={field}><input aria-label={`${player.player} ${field}`} disabled={!editable} type="number" min="0" value={player[field]} onChange={(e) => void safe({ type: "POST_MATCH_SET_PLAYER_METRIC", side, index, field, value: Number(e.target.value) })} /><SourceTag manual={hasManual(path)} onReset={() => void safe({ type: "POST_MATCH_RESET_FIELD", field: path })} /></label>; })}
      </div>; })}
    </div>
  </section>;
}

export function App() {
  const data = useBroadcastState(); const route = useMemo(() => location.pathname.replace(/\/$/, "") || "/control", []);
  if (route === "/overlay") return data.state.activeOutput === "post-match" ? <PostMatchOverlay state={data.state} visible /> : <DraftOverlay state={data.state} visible={data.state.activeOutput === "draft"} />;
  if (route === "/preview/post-match") return <PostMatchOverlay state={data.state} visible />;
  if (route === "/preview/draft") return <DraftOverlay state={data.state} visible />;
  if (route === "/control/post-match") return <PostMatchWorkspace {...data} />;
  return <DraftWorkspace {...data} />;
}
