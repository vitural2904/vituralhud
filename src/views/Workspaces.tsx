import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { PlugsConnected } from "@phosphor-icons/react/PlugsConnected";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { Warning } from "@phosphor-icons/react/Warning";
import { motion } from "motion/react";
import { ChampionCombobox } from "../components/ChampionCombobox";
import { ActionButton, LatticeLoader, NoticeToast, NumberField, SegmentField, SelectField, StateMark, TextField, ToggleField, WarmTooltip } from "../components/VirtualControls";
import CountUp from "../components/react-bits/micro/CountUp";
import RefineFrame from "../components/react-bits/micro/RefineFrame";
import RubberSegment from "../components/react-bits/micro/RubberSegment";
import { championById } from "../domain/catalog";
import { getMatchLeaders, type MatchLeader } from "../domain/post-match-leaders";
import { getPostMatchOverviewMetrics, postMatchOverviewCoreMetrics } from "../domain/post-match-overview";
import { postMatchMetricLabels } from "../domain/labels";
import type { BroadcastCommand, BroadcastState, DraftPhase, PostMatchMetric, PostMatchOverviewMetric, PostMatchPlayerMetric, Side } from "../domain/types";

const phaseNames: Record<DraftPhase, string> = { waiting: "WAITING", "ban-1": "BAN · ROUND 1", "pick-1": "PICK · ROUND 1", "ban-2": "BAN · ROUND 2", "pick-2": "PICK · ROUND 2", complete: "COMPLETE" };
const phaseDisplay: Record<DraftPhase, { action: string; round: string }> = { waiting: { action: "WAIT", round: "MATCH" }, "ban-1": { action: "BAN", round: "ROUND 1" }, "pick-1": { action: "PICK", round: "ROUND 1" }, "ban-2": { action: "BAN", round: "ROUND 2" }, "pick-2": { action: "PICK", round: "ROUND 2" }, complete: { action: "DRAFT", round: "COMPLETE" } };
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


import { controlRequest } from '../control-request';
import type { BroadcastClient } from '../use-broadcast-state';
import { numericPostFields } from '../domain/fields';
import { DraftOverlay, PostMatchOverlay } from './Overlays';

const formatClock = (seconds: number) => String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
type WorkspaceProps = BroadcastClient;
function ControlShell({ state, connected, children, workspace }: WorkspaceProps & { children: React.ReactNode; workspace: "draft" | "post-match" }) {
  return <main className="control-shell">
    <header className="control-topbar">
      <div className="product-lockup"><Broadcast weight="fill" /><div><strong>VIRTUALHUD</strong><span>BROADCAST DESK</span></div></div>
      <nav className="workspace-tabs" aria-label="Operator workspace"><RubberSegment items={[{ value: "/control/draft", label: "BAN / PICK" }, { value: "/control/post-match", label: "POST-MATCH" }]} value={`/control/${workspace}`} onChange={(value) => location.assign(value)} draggable={false} size="md" trackColor="#151513" thumbColor="#caa56a" textColor="#aaa397" activeTextColor="#17130d" radius={8} /></nav>
      <div className="topbar-actions"><b className="revision-tag">REV {state.revision}</b><a className="preview-link" href="/overlay" target="_blank" rel="noreferrer">OBS OUTPUT <ArrowSquareOut /></a></div>
    </header>
    <div className="connection-strip" role="status"><StateMark state={connected ? "done" : "offline"} label={connected ? "Server online" : "Server offline"} /><span>{state.outputOwner === "lcu" ? "LCU controls output" : "Operator controls output"}</span></div>{state.storageWarning && <div className="warning-banner" role="alert">{state.storageWarning}</div>}
    <div className="control-body"><aside className="control-rail"><span className="rail-label">SYSTEM</span><div className="source-card"><PlugsConnected /><span>Lifecycle</span><strong>{state.lifecycle.toUpperCase()}</strong><small>{state.lcu.connected ? state.lcu.message : "League Client unavailable"}</small></div><div className="output-state" data-live={state.activeOutput !== "none" || undefined}><span>PROGRAM OUTPUT</span><strong>{state.activeOutput === "none" ? "OFF AIR" : state.activeOutput.toUpperCase()}</strong></div><div className="rail-status-stack"><StateMark state={state.lcu.connected ? "done" : "offline"} label={state.lcu.connected ? "LCU connected" : "LCU offline"} /><StateMark state={state.postMatch.status === "fetching" ? "running" : state.postMatch.status === "error" ? "failed" : state.postMatch.status === "waiting" ? "idle" : "done"} label={`Review: ${state.postMatch.status}`} /><StateMark state={state.activeOutput === "none" ? "idle" : "done"} label={state.activeOutput === "none" ? "Output hidden" : "Output live"} /></div><div className="event-log"><span className="rail-label">ACTIVITY</span>{state.events.length ? state.events.slice(0, 9).map((event) => <div key={event.id}><b>R{event.revision}</b><span>{event.label}</span><time>{new Date(event.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</time></div>) : <p>No activity yet.</p>}</div></aside><section className="control-workspace">{children}</section></div>
  </main>;
}

export function DraftWorkspace(props: WorkspaceProps) {
  const { state, dispatch } = props;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ id: string; title: string; tone: "success" | "error" } | null>(null);
  const safe = (command: BroadcastCommand, quiet = false) => { const task = (async () => { try { setError(""); await dispatch(command); if (!quiet) setNotice({ id: crypto.randomUUID(), title: "Change saved", tone: "success" }); } catch (caught) { const message = caught instanceof Error ? caught.message : "Could not save the change."; setError(message); setNotice({ id: crypto.randomUUID(), title: message, tone: "error" }); throw caught; } })(); void task.catch(() => undefined); return task; };
  return <ControlShell {...props} workspace="draft"><div className="workspace-heading"><div><span className="section-kicker">LIVE DRAFT</span><h1>Ban / Pick Control</h1><p>Build the draft. Check program output. Take it live.</p></div><span className="safety-note"><ShieldCheck /> LCU READ ONLY</span></div>{error && <div className="error-banner" role="alert"><Warning />{error}</div>}
    <section className="match-panel panel"><TextField label="Match name" value={state.match.matchName} onChange={(value) => safe({ type: "SET_MATCH", field: "matchName", value }, true)} /><TextField label="Game" value={state.match.gameLabel} onChange={(value) => safe({ type: "SET_MATCH", field: "gameLabel", value }, true)} /><TextField label="Patch" value={state.match.patch} onChange={(value) => safe({ type: "SET_MATCH", field: "patch", value }, true)} /><SegmentField label="Series" value={String(state.match.bestOf)} items={[{ value: "1", label: "BO1" }, { value: "3", label: "BO3" }, { value: "5", label: "BO5" }]} onChange={(value) => void safe({ type: "SET_BEST_OF", value: Number(value) as 1 | 3 | 5 })} /><SelectField label="Draft phase" value={state.draft.phase} options={Object.entries(phaseNames).map(([value, label]) => ({ value, label }))} onChange={(value) => void safe({ type: "SET_PHASE", phase: value as DraftPhase })} /></section>
    <div className="teams-grid">{(["blue", "red"] as Side[]).map((side) => <DraftTeamEditor key={side} state={state} side={side} safe={safe} />)}</div>
    <details className="preview-drawer panel"><summary><span><Eye /> PROGRAM PREVIEW</span><small>Collapsed by default</small></summary><div className="draft-preview-frame"><iframe title="Draft program preview" src="/preview/draft" /></div></details>
    <footer className="transport-bar"><div className="timer-control"><ActionButton className="icon-action" aria-label="Timer" tooltip={state.draft.timerRunning ? "Pause timer" : "Start timer"} icon={state.draft.timerRunning ? <Pause /> : <Play />} onAction={() => safe({ type: "TOGGLE_TIMER" })}>{state.draft.timerRunning ? "PAUSE" : "START"}</ActionButton><strong>{formatClock(Math.ceil(state.draft.timerMs / 1000))}</strong><NumberField label="Seconds" value={Math.ceil(state.draft.timerMs / 1000)} min={0} max={300} suffix="s" compact onCommit={(value) => safe({ type: "SET_TIMER", timerMs: value * 1000 })} /></div><div className="phase-status"><span>{phaseNames[state.draft.phase]}</span><b>{state.draft.activeSide.toUpperCase()} SIDE</b></div><div className="transport-actions"><ToggleField label="Manual" checked={state.draft.manualOverride} onChange={(value) => void safe({ type: "SET_OVERRIDE", value })} /><ActionButton className={`fade-action ${state.activeOutput === "draft" ? "is-live" : ""}`} disabled={!state.draft.manualOverride} tooltip={!state.draft.manualOverride ? "Turn on Manual to control output" : state.activeOutput === "draft" ? "Hide draft output" : "Show draft output"} icon={state.activeOutput === "draft" ? <EyeSlash /> : <Eye />} doneLabel={state.activeOutput === "draft" ? "Hidden" : "Live"} onAction={() => safe({ type: "SET_OUTPUT", output: state.activeOutput === "draft" ? "none" : "draft" })}>{state.activeOutput === "draft" ? "FADE OUT" : "FADE IN"}</ActionButton><ActionButton onAction={() => safe({ type: "RESUME_AUTO_OUTPUT" })}>TRẢ QUYỀN CHO LCU</ActionButton><ActionButton className="primary-action" icon={<Check />} onAction={() => safe({ type: "RUN_DEMO_STEP" })}>DEMO STEP</ActionButton></div></footer>
    {notice ? <NoticeToast {...notice} onClose={() => setNotice(null)} /> : null}
  </ControlShell>;
}

function DraftTeamEditor({ state, side, safe }: { state: BroadcastState; side: Side; safe: (command: BroadcastCommand, quiet?: boolean) => Promise<void> }) {
  const team = state.match.teams[side]; const draft = state.draft.teams[side];
  return <section className={`panel team-editor team-editor--${side}`}><header className="panel-header"><div className="team-heading">{team.logoUrl ? <img src={team.logoUrl} alt="" /> : <span className="logo-placeholder" aria-hidden="true" />}<div><span className="section-kicker">{side.toUpperCase()} SIDE</span><h2>{team.name}</h2></div></div><NumberField label="Game wins" ariaLabel={`${side} game wins`} value={team.score} min={0} max={Math.ceil(state.match.bestOf / 2)} onCommit={(value) => safe({ type: "SET_SCORE", side, value })} compact /></header><div className="team-fields"><TextField label="Team name" value={team.name} onChange={(value) => safe({ type: "SET_TEAM", side, field: "name", value }, true)} /><TextField label="Team code" value={team.code} onChange={(value) => safe({ type: "SET_TEAM", side, field: "code", value }, true)} /><label className="field color-field"><span>Team color</span><input aria-label={`${side} team color`} type="color" value={team.color} onChange={(event) => void safe({ type: "SET_TEAM", side, field: "color", value: event.target.value })} /></label><TeamLogoPicker logoUrl={team.logoUrl} teamName={team.name} onChange={(value) => safe({ type: "SET_TEAM", side, field: "logoUrl", value })} /></div><div className="slot-section"><div className="subsection-title"><span>PICKS</span><small>Player and champion</small></div><div className="slot-list">{draft.picks.map((pick, index) => <div className="slot-control" key={index}><span className="slot-index">P{index + 1}</span><img className="slot-role" src={`/roles/${roleSlots[index]}.svg`} alt="" /><TextField label={`${side} player ${index + 1}`} value={team.players[index]} onChange={value => safe({ type: "SET_PLAYER", side, index, value }, true)} /><ChampionCombobox label={`${side} pick ${index + 1}`} value={pick.championId} onChange={(championId) => safe({ type: "SET_PICK", side, index, championId }, true)} /></div>)}</div></div><div className="ban-controls"><div className="subsection-title"><span>BANS</span><small>Five slots</small></div>{draft.bans.map((ban, index) => <div className="ban-slot" key={index}><b>B{index + 1}</b><ChampionCombobox label={`${side} ban ${index + 1}`} value={ban} onChange={(championId) => safe({ type: "SET_BAN", side, index, championId }, true)} /></div>)}</div></section>;
}

function TeamLogoPicker({ logoUrl, teamName, onChange }: { logoUrl: string; teamName: string; onChange: (value: string) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null); const [assets, setAssets] = useState<TeamLogoAsset[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { let active = true; fetch("/api/team-logos").then((response) => response.json()).then((payload: { assets?: TeamLogoAsset[] }) => { if (active) setAssets(payload.assets ?? []); }).catch(() => undefined); return () => { active = false; }; }, []);
  const upload = async (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError("Use a PNG, JPG, or WebP file."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Logo must be smaller than 5 MB."); return; }
    try {
      setBusy(true); setError("");
      const response = await controlRequest("/api/team-logos", { method: "POST", headers: { "content-type": file.type, "x-file-name": encodeURIComponent(file.name) }, body: file });
      const payload = await response.json() as { asset?: TeamLogoAsset; message?: string };
      if (!response.ok || !payload.asset) throw new Error(payload.message ?? "Could not upload the logo.");
      setAssets((current) => [payload.asset!, ...current.filter((asset) => asset.url !== payload.asset!.url)]);
      await onChange(payload.asset.url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not upload the logo."); throw caught; }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const currentName = assets.find((asset) => asset.url === logoUrl)?.name ?? logoUrl.split("/").at(-1) ?? "Current logo";
  const options = [...(!assets.some((asset) => asset.url === logoUrl) ? [{ name: currentName, url: logoUrl, source: "built-in" as const }] : []), ...assets].map((asset) => ({ value: asset.url, label: asset.name, tag: asset.source }));
  return <div className="team-logo-picker"><span className="team-logo-picker__label">TEAM LOGO</span><div className="team-logo-picker__body"><RefineFrame status={busy ? "refining" : error ? "error" : "complete"} aspectRatio="1 / 1" width={72} radius={10} showStatus={busy} labels={{ refining: "Uploading", complete: "Ready", error: "Failed" }}><img src={logoUrl} alt={`Logo ${teamName}`} /></RefineFrame><div className="team-logo-picker__controls"><SelectField label="Saved logo" value={logoUrl} options={options} onChange={(value) => void onChange(value)} /><ActionButton disabled={busy} icon={busy ? <CircleNotch className="spin" /> : <UploadSimple />} onAction={() => inputRef.current?.click()}>UPLOAD LOGO</ActionButton><input ref={inputRef} className="team-logo-picker__input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void upload(event.target.files?.[0]).catch(() => undefined)} /></div></div>{error ? <small className="team-logo-picker__error"><Warning />{error}</small> : <small className="team-logo-picker__hint"><ImageSquare /> PNG, JPG, or WebP · max 5 MB</small>}</div>;
}

export function PostMatchWorkspace(props: WorkspaceProps) {
  const { state, dispatch, resolvePostMatch, cancelPostMatch, loadPostMatchFixture } = props; const post = state.postMatch; const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [matchId, setMatchId] = useState(post.matchId); const [notice, setNotice] = useState<{ id: string; title: string; tone: "success" | "error" } | null>(null);
  const report = (title: string, tone: "success" | "error" = "success") => setNotice({ id: crypto.randomUUID(), title, tone });
  const safe = (command: BroadcastCommand, quiet = false) => { const task = (async () => { try { setError(""); await dispatch(command); if (!quiet) report("Change saved"); } catch (caught) { const message = caught instanceof Error ? caught.message : "Could not save the change."; setError(message); report(message, "error"); throw caught; } })(); void task.catch(() => undefined); return task; };
  const resolve = async () => { try { setBusy(true); setError(""); await resolvePostMatch(matchId); report("Match data loaded"); } catch (caught) { const message = caught instanceof Error ? caught.message : "Could not load match data."; setError(message); report(message, "error"); throw caught; } finally { setBusy(false); } };
  const loadFixture = async () => { try { setBusy(true); setError(""); await loadPostMatchFixture(); report("Fixture loaded"); } catch (caught) { const message = caught instanceof Error ? caught.message : "Could not load fixture data."; setError(message); report(message, "error"); throw caught; } finally { setBusy(false); } };
  const editable = !["waiting", "fetching"].includes(post.status);
  useEffect(() => setMatchId(post.matchId), [post.matchId]);
  const reached = (step: "load" | "review" | "ready" | "live") => ({ load: post.status !== "waiting", review: ["review", "ready", "live"].includes(post.status), ready: ["ready", "live"].includes(post.status), live: post.status === "live" })[step];
  return <ControlShell {...props} workspace="post-match"><div className="workspace-heading"><div><span className="section-kicker">MATCH REPORT</span><h1>Post-match Control</h1><p>Load. Review. Approve. Take live.</p></div><div className={`review-badge review-badge--${post.status}`}><i />{post.status.toUpperCase()}</div></div>{error && <div className="error-banner" role="alert"><Warning />{error}</div>}
    <div className="review-flow" aria-label="Publishing flow">{(["load", "review", "ready", "live"] as const).map((step, index) => <div className={reached(step) ? "is-reached" : ""} key={step}><StateMark state={post.status === "fetching" && step === "load" ? "running" : reached(step) ? "done" : "idle"} label={`${index + 1}. ${step.toUpperCase()}`} /></div>)}</div>
    <div className="post-status-strip"><label className="match-id-field"><span>MATCH ID</span><input value={matchId} onChange={(event) => setMatchId(event.target.value.toUpperCase())} placeholder="VN2_123456789" spellCheck={false} /></label><div><span>SOURCE</span><strong>{post.source.toUpperCase()}</strong></div><div><span>CONFIDENCE</span><strong>{post.confidence.toUpperCase()}</strong></div><ActionButton disabled={busy || !matchId.trim()} icon={busy || post.status === "fetching" ? <LatticeLoader label="Fetching" showTimer={false} cellSize={4} gap={1} fontSize={0} /> : <CloudArrowDown />} tooltip={!matchId.trim() ? "Enter a Match ID first" : "Load official Match-V5 data"} onAction={resolve}>LOAD MATCH-V5</ActionButton><ActionButton className="fixture-action" disabled={busy} onAction={loadFixture}>LOAD FIXTURE</ActionButton><ActionButton disabled={busy} onAction={() => safe({ type: "POST_MATCH_CREATE_MANUAL" })}>TẠO BÁO CÁO TAY</ActionButton>{post.status === "fetching" && <ActionButton onAction={cancelPostMatch}>HỦY FETCH</ActionButton>}</div>
    {post.warnings.filter((warning) => warning !== error).map((warning) => <div className="warning-banner" key={warning}><Warning />{warning}</div>)}
    {post.missingFields.length > 0 && post.status !== 'waiting' && <section className="missing-fields panel"><details><summary>{post.missingFields.length} trường chưa rõ</summary><ul>{post.missingFields.map(field => <li key={field}>{describeField(field)}</li>)}</ul></details>{post.status === 'review' && <ActionButton onAction={() => { const fields = post.missingFields.filter(field => numericPostFields.includes(field)); if (window.confirm('Xác nhận số 0 cho các trường số còn thiếu? Tên, tướng, winner và duration vẫn cần kiểm tra.')) return safe({ type: 'POST_MATCH_CONFIRM_ZERO', fields }); }}>XÁC NHẬN SỐ 0 CÒN THIẾU</ActionButton>}</section>}
    <section className="post-preview-panel panel"><div className="panel-title"><div><span className="section-kicker">PROGRAM PREVIEW</span><h2>Broadcast Ledger</h2></div><a href="/preview/post-match" target="_blank" rel="noreferrer">OPEN FULL SCREEN <ArrowSquareOut /></a></div><RefineFrame status={busy ? "refining" : post.status === "error" ? "error" : "complete"} aspectRatio="16 / 9" width={640} radius={10} showStatus={busy} labels={{ refining: "Loading data", complete: "Ready", error: "Failed" }}><iframe title="Post-match program preview" src="/preview/post-match" /></RefineFrame></section>
    {post.status === "waiting" ? <section className="empty-review panel"><CloudArrowDown /><h2>Waiting for match data</h2><p>Lấy Match-V5. Hoặc tạo báo cáo trống.</p><ActionButton onAction={() => safe({ type: "POST_MATCH_CREATE_MANUAL" })}>TẠO BÁO CÁO TRỐNG</ActionButton></section> : <div className={`post-editor ${editable ? "" : "is-disabled"}`}>
      <section className="panel result-editor"><div className="panel-title"><div><span className="section-kicker">01 · RESULT</span><h2>Match result</h2></div></div><div className="result-fields"><div className="field-with-source"><SegmentField label="Winner" value={post.missingFields.includes("winner") ? "" : post.data.winner} disabled={!editable} items={[{ value: "blue", label: state.match.teams.blue.code }, { value: "red", label: state.match.teams.red.code }]} onChange={(value) => void safe({ type: "POST_MATCH_SET_WINNER", side: value as Side })} /><SourceTag manual={post.overrideFields.includes("winner")} onReset={() => void safe({ type: "POST_MATCH_RESET_FIELD", field: "winner" })} /></div><div className="field-with-source"><NumberField disabled={!editable} label="Duration" missing={post.missingFields.includes("durationSeconds")} value={post.data.durationSeconds} min={0} max={14400} suffix="s" onCommit={(value) => safe({ type: "POST_MATCH_SET_DURATION", seconds: value })} /><SourceTag manual={post.overrideFields.includes("durationSeconds")} onReset={() => void safe({ type: "POST_MATCH_RESET_FIELD", field: "durationSeconds" })} /></div><div className="field-with-source"><SelectField label="Early objective" value={post.missingFields.includes("earlyObjective") ? "" : post.data.earlyObjective} disabled={!editable} options={[{ value: "voidGrubs", label: "Void Grubs" }, { value: "riftHeralds", label: "Rift Herald" }]} onChange={(value) => void safe({ type: "POST_MATCH_SET_EARLY_OBJECTIVE", objective: value as "voidGrubs" | "riftHeralds" })} /><SourceTag manual={post.overrideFields.includes("earlyObjective")} onReset={() => void safe({ type: "POST_MATCH_RESET_FIELD", field: "earlyObjective" })} /></div></div></section>
      <div className="post-team-editors">{(["blue", "red"] as Side[]).map((side) => <PostTeamEditor key={side} state={state} side={side} safe={safe} editable={editable} />)}</div>
    </div>}
    <footer className="post-publish-bar"><div><span>{post.overrideFields.length ? `${post.overrideFields.length} MANUAL FIELDS` : "SOURCE DATA INTACT"}</span><small>{post.lastSyncedAt ? `Synced ${new Date(post.lastSyncedAt).toLocaleTimeString("en-GB")}` : "Not synced"}</small></div><ActionButton disabled={!post.overrideFields.length} tooltip={!post.overrideFields.length ? "No manual changes to reset" : "Reset all fields to source data"} onAction={() => safe({ type: "POST_MATCH_RESET_OVERRIDES" })}>RESET ALL</ActionButton>{post.status === "review" && <ActionButton className="approve-action" icon={<Check />} doneLabel="Approved" onAction={() => safe({ type: "POST_MATCH_SET_READY", value: true })}>APPROVE RESULT</ActionButton>}{post.status === "ready" && <ActionButton className="publish-action" icon={<Eye />} doneLabel="Live" onAction={() => safe({ type: "SET_OUTPUT", output: "post-match" })}>FADE IN</ActionButton>}{post.status === "live" && <ActionButton className="publish-action is-live" icon={<EyeSlash />} doneLabel="Hidden" onAction={() => safe({ type: "SET_OUTPUT", output: "none" })}>FADE OUT</ActionButton>}</footer>
    {notice ? <NoticeToast {...notice} onClose={() => setNotice(null)} /> : null}
  </ControlShell>;
}

function SourceTag({ manual, onReset }: { manual: boolean; onReset?: () => void }) {
  return manual && onReset ? <WarmTooltip content="Reset this field to source data"><button className="source-tag is-manual" onClick={onReset} type="button">MANUAL · RESET</button></WarmTooltip> : <span className={`source-tag ${manual ? "is-manual" : ""}`}>{manual ? "MANUAL" : "SOURCE"}</span>;
}
function PostTeamEditor({ state, side, safe, editable }: { state: BroadcastState; side: Side; safe: (command: BroadcastCommand) => Promise<void>; editable: boolean }) {
  const team = state.match.teams[side]; const data = state.postMatch.data.teams[side]; const hasManual = (field: string) => state.postMatch.overrideFields.includes(field);
  const metrics: PostMatchMetric[] = [...teamResultMetrics, ...postMatchOverviewCoreMetrics, state.postMatch.data.earlyObjective];
  const playerMetrics: Array<{ field: PostMatchPlayerMetric; label: string }> = [
    { field: "damageToChampions", label: "DAMAGE" },
    { field: "kills", label: "KILLS" },
    { field: "assists", label: "ASSISTS" },
    { field: "largestKillingSpree", label: "SPREE" },
    { field: "damageToObjectives", label: "OBJECTIVE" },
  ];
  const hasPlayerManual = data.players.some((_, index) => playerMetrics.some(({ field }) => hasManual(`teams.${side}.players.${index}.${field}`)));
  return <section className={`panel post-team-editor post-team-editor--${side}`}>
    <div className="panel-title"><div className="team-heading">{team.logoUrl ? <img src={team.logoUrl} alt="" /> : <span className="logo-placeholder" aria-hidden="true" />}<div><span className="section-kicker">{side.toUpperCase()} SIDE</span><h2>{team.name}</h2></div></div><SourceTag manual={metrics.some((m) => hasManual(`teams.${side}.${m}`)) || hasPlayerManual} /></div>
    <div className="metric-input-grid">{metrics.map((metric) => { const field = `teams.${side}.${metric}`; return <div className="metric-input" key={metric}><NumberField label={postMatchMetricLabels[metric]} ariaLabel={`${side} ${postMatchMetricLabels[metric]}`} missing={state.postMatch.missingFields.includes(field)} value={data[metric]} min={0} max={999999999} compact disabled={!editable} onCommit={(value) => safe({ type: "POST_MATCH_SET_METRIC", side, field: metric, value })} /><SourceTag manual={hasManual(field)} onReset={() => void safe({ type: "POST_MATCH_RESET_FIELD", field })} /></div>; })}</div>
    <div className="player-stat-scroll"><div className="player-stat-table">
      <div className="player-stat-head"><span>PLAYER</span>{playerMetrics.map(({ field, label }) => <span key={field}>{label}</span>)}</div>
      {data.players.map((player, index) => { const champ = player.championId ? championById[player.championId] : undefined; return <div className="player-stat-row" key={index}>
        <div className="player-stat-id"><fieldset disabled={!editable}><TextField label={`${side} player ${index + 1} name`} value={player.player} onChange={value => safe({ type: 'POST_MATCH_SET_PLAYER_IDENTITY', side, index, field: 'player', value })} /><ChampionCombobox label={`${side} player ${index + 1} champion`} value={player.championId} onChange={value => safe({ type: 'POST_MATCH_SET_PLAYER_IDENTITY', side, index, field: 'championId', value })} /></fieldset></div>
        {playerMetrics.map(({ field }) => { const path = `teams.${side}.players.${index}.${field}`; return <div className={hasManual(path) ? "is-manual" : ""} key={field}><NumberField label={field} ariaLabel={`${side} player ${index + 1} ${field}`} missing={state.postMatch.missingFields.includes(path)} value={player[field]} min={0} max={999999999} compact disabled={!editable} onCommit={(value) => safe({ type: "POST_MATCH_SET_PLAYER_METRIC", side, index, field, value })} /><SourceTag manual={hasManual(path)} onReset={() => void safe({ type: "POST_MATCH_RESET_FIELD", field: path })} /></div>; })}
      </div>; })}
    </div></div>
  </section>;
}




function describeField(field: string) {
  return field.replace(/^teams\.(blue|red)\./, (_, side) => side + ' · ').replace(/players\.(\d+)\./, (_, index) => 'Player ' + (Number(index) + 1) + ' · ').replace(/([a-z])([A-Z])/g, '$1 $2');
}
