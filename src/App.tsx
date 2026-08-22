import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowUUpRight } from "@phosphor-icons/react/ArrowUUpRight";
import { Broadcast } from "@phosphor-icons/react/Broadcast";
import { Check } from "@phosphor-icons/react/Check";
import { CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { Eye } from "@phosphor-icons/react/Eye";
import { EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { PlugsConnected } from "@phosphor-icons/react/PlugsConnected";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { Sparkle } from "@phosphor-icons/react/Sparkle";
import { championById, searchChampions } from "./domain/catalog";
import { createInitialState } from "./domain/state";
import type { DraftCommand, DraftPhase, DraftState, Side } from "./domain/types";

const phaseNames: Record<DraftPhase, string> = {
  waiting: "CHỜ TRẬN",
  "ban-1": "CẤM · LƯỢT 1",
  "pick-1": "CHỌN · LƯỢT 1",
  "ban-2": "CẤM · LƯỢT 2",
  "pick-2": "CHỌN · LƯỢT 2",
  complete: "HOÀN TẤT",
};

const phaseDisplay: Record<DraftPhase, { action: string; round: string }> = {
  waiting: { action: "CHỜ", round: "TRẬN" },
  "ban-1": { action: "CẤM", round: "LƯỢT 1" },
  "pick-1": { action: "CHỌN", round: "LƯỢT 1" },
  "ban-2": { action: "CẤM", round: "LƯỢT 2" },
  "pick-2": { action: "CHỌN", round: "LƯỢT 2" },
  complete: { action: "HOÀN", round: "TẤT" },
};

const roleSlots = [
  { id: "top", label: "Đường trên" },
  { id: "jungle", label: "Đi rừng" },
  { id: "middle", label: "Đường giữa" },
  { id: "bottom", label: "Đường dưới" },
  { id: "utility", label: "Hỗ trợ" },
] as const;

function useDraftState() {
  const [state, setState] = useState<DraftState>(createInitialState());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | undefined;
    let reconnect: number | undefined;
    let attempts = 0;

    fetch("/api/state")
      .then((response) => response.json())
      .then((next) => active && setState(next))
      .catch(() => undefined);

    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${location.host}/ws`);
      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
      };
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as { type: string; state: DraftState };
        if (payload.type === "state") setState(payload.state);
      };
      socket.onclose = () => {
        setConnected(false);
        if (active) reconnect = window.setTimeout(connect, Math.min(10_000, 500 * 2 ** attempts++));
      };
    };
    connect();
    return () => {
      active = false;
      if (reconnect) clearTimeout(reconnect);
      socket?.close();
    };
  }, []);

  const dispatch = useCallback(async (command: DraftCommand) => {
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    if (!response.ok) throw new Error("Không thể cập nhật draft");
    const next = (await response.json()) as DraftState;
    setState(next);
  }, []);

  return { state, connected, dispatch };
}

const formatTimer = (timerMs: number) => {
  const seconds = Math.ceil(timerMs / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

const formatOverlayTimer = (timerMs: number) => String(Math.ceil(timerMs / 1000)).padStart(2, "0");

function BanStrip({ state }: { state: DraftState }) {
  return (
    <div className="ban-strip" aria-label="Danh sách lượt cấm">
      {(["blue", "red"] as Side[]).map((side) => (
        <div className={`ban-group ban-group--${side}`} key={side}>
          <span className="ban-label">BANS</span>
          {state.teams[side].bans.map((id, index) => (
            <div className="ban-tile" key={`${side}-${index}`}>
              {id ? <img src={championById[id]?.iconUrl} alt={championById[id]?.name ?? id} /> : <span>{index + 1}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PickCard({ state, side, index }: { state: DraftState; side: Side; index: number }) {
  const slot = state.teams[side].picks[index];
  const champion = slot.championId ? championById[slot.championId] : undefined;
  const role = roleSlots[index];
  const active = state.activeSide === side && !slot.locked;
  return (
    <article className={`pick-card pick-card--${side} ${active ? "is-active" : ""}`}>
      {champion ? <img src={champion.loadingUrl} alt={champion.name} /> : <div className="pick-empty">P{index + 1}</div>}
      <div className="pick-shade" />
      <div className="pick-meta">
        <span className="pick-champion">{champion?.name ?? "CHƯA CHỌN"}</span>
        <div className="pick-player-line">
          <img className="pick-role" src={`/roles/${role.id}.svg`} alt={role.label} />
          <span className="pick-player">{slot.player || "—"}</span>
          {slot.locked && <Check aria-label="Đã khóa" weight="bold" />}
        </div>
      </div>
    </article>
  );
}

function ScorePips({ state, side }: { state: DraftState; side: Side }) {
  const team = state.teams[side];
  const winsNeeded = Math.ceil(state.bestOf / 2);
  return (
    <span
      className={`score-pips score-pips--${side}`}
      aria-label={`${team.name}: ${team.score} trên ${winsNeeded} ván thắng cần thiết`}
      style={{ "--score-color": team.color } as React.CSSProperties}
    >
      {Array.from({ length: winsNeeded }, (_, index) => (
        <i className={index < team.score ? "is-won" : ""} key={index} aria-hidden="true" />
      ))}
    </span>
  );
}

function TeamFooter({ state, side }: { state: DraftState; side: Side }) {
  const team = state.teams[side];
  return (
    <div className={`team-footer team-footer--${side}`} style={{ "--team-color": team.color } as React.CSSProperties}>
      <strong>{team.name}</strong>
    </div>
  );
}

export function Overlay({ state, connected }: { state: DraftState; connected: boolean }) {
  return (
    <main className={`overlay-shell ${state.overlayVisible ? "is-visible" : "is-hidden"}`}>
      <div className="overlay-status" aria-label={connected ? "Server đang kết nối" : "Server mất kết nối"}>
        <span className={connected ? "online" : "offline"} />
        REV {state.revision}
      </div>
      <section className="broadcast-spine" aria-hidden={!state.overlayVisible} aria-label="Ban pick overlay">
        <BanStrip state={state} />
        <div className="draft-board">
          <div className="pick-row pick-row--blue">
            {state.teams.blue.picks.map((_, index) => <PickCard state={state} side="blue" index={index} key={index} />)}
          </div>
          <div className="match-core">
            <div className="center-meta">
              <strong>{state.gameLabel}</strong>
              <span>PATCH {state.patch}</span>
              <div className="phase"><b>{phaseDisplay[state.phase].action}</b><Sparkle weight="fill" aria-hidden="true" /><b>{phaseDisplay[state.phase].round}</b></div>
            </div>
            <div className="center-identities">
              <div className="team-identity">
                <ScorePips state={state} side="blue" />
                <img className="center-logo" src={state.teams.blue.logoUrl} alt={`Logo ${state.teams.blue.name}`} />
              </div>
              <div className="countdown-block">
                <div className={`timer timer--${state.activeSide}`}>{formatOverlayTimer(state.timerMs)}</div>
              </div>
              <div className="team-identity">
                <ScorePips state={state} side="red" />
                <img className="center-logo" src={state.teams.red.logoUrl} alt={`Logo ${state.teams.red.name}`} />
              </div>
            </div>
          </div>
          <div className="pick-row pick-row--red">
            {state.teams.red.picks.map((_, index) => <PickCard state={state} side="red" index={index} key={index} />)}
          </div>
        </div>
        <div className="team-footers">
          <TeamFooter state={state} side="blue" />
          <div className="footer-core" aria-hidden="true" />
          <TeamFooter state={state} side="red" />
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ChampionSearch({ value, onChange, direction = "down" }: { value: string | null; onChange: (value: string | null) => void; direction?: "down" | "up" }) {
  const selected = value ? championById[value] : undefined;
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = `champions-${useId().replace(/:/g, "")}`;
  const matches = useMemo(() => searchChampions(query), [query]);

  useEffect(() => {
    setQuery(selected?.name ?? "");
  }, [selected?.name]);

  const choose = (championId: string) => {
    const champion = championById[championId];
    setQuery(champion?.name ?? "");
    setOpen(false);
    onChange(championId);
  };

  return (
    <div className={`champion-search champion-search--${direction}`}>
      <input
        aria-activedescendant={open && matches[activeIndex] ? `${listId}-${matches[activeIndex].id}` : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-label="Tìm tướng"
        autoComplete="off"
        role="combobox"
        value={query}
        onBlur={() => window.setTimeout(() => {
          setOpen(false);
          setQuery(value ? championById[value]?.name ?? "" : "");
        }, 100)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          setActiveIndex(0);
          if (!next) onChange(null);
        }}
        onFocus={(event) => {
          event.currentTarget.select();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => matches.length ? Math.min(index + 1, matches.length - 1) : 0);
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          }
          if (event.key === "Enter" && open && matches[activeIndex]) {
            event.preventDefault();
            choose(matches[activeIndex].id);
          }
          if (event.key === "Escape") {
            setOpen(false);
            setQuery(selected?.name ?? "");
          }
        }}
      />
      <MagnifyingGlass aria-hidden="true" />
      {open && (
        <div className="champion-options" id={listId} role="listbox">
          {matches.map((champion, index) => (
            <button
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "is-active" : ""}
              id={`${listId}-${champion.id}`}
              key={champion.id}
              onClick={() => choose(champion.id)}
              onPointerDown={(event) => event.preventDefault()}
              role="option"
              type="button"
            >
              <img src={champion.iconUrl} alt="" />
              <span>{champion.name}</span>
            </button>
          ))}
          {matches.length === 0 && <span className="champion-empty">Không tìm thấy tướng</span>}
        </div>
      )}
    </div>
  );
}

function TeamEditor({ state, side, dispatch }: { state: DraftState; side: Side; dispatch: (command: DraftCommand) => Promise<void> }) {
  const team = state.teams[side];
  return (
    <section className={`panel team-editor team-editor--${side}`}>
      <header className="panel-header">
        <div className="team-heading"><img src={team.logoUrl} alt="" /><div><span className="section-kicker">{side === "blue" ? "BLUE SIDE" : "RED SIDE"}</span><h2>{team.name}</h2></div></div>
        <label className="score-input">VÁN THẮNG<input type="number" min="0" max={Math.ceil(state.bestOf / 2)} value={team.score} onChange={(event) => void dispatch({ type: "SET_SCORE", side, value: Number(event.target.value) })} /></label>
      </header>
      <div className="team-fields">
        <Field label="Tên đội" value={team.name} onChange={(value) => void dispatch({ type: "SET_TEAM", side, field: "name", value })} />
        <Field label="Mã đội" value={team.code} onChange={(value) => void dispatch({ type: "SET_TEAM", side, field: "code", value })} />
        <label className="field color-field"><span>Màu tỉ số</span><input type="color" value={team.color} onInput={(event) => void dispatch({ type: "SET_TEAM", side, field: "color", value: event.currentTarget.value })} /></label>
        <div className="logo-url-field"><Field label="Logo URL" value={team.logoUrl} onChange={(value) => void dispatch({ type: "SET_TEAM", side, field: "logoUrl", value })} /></div>
      </div>
      <div className="slot-list">
        {team.picks.map((slot, index) => (
          <div className="slot-control" key={index}>
            <img className="slot-role" src={`/roles/${roleSlots[index].id}.svg`} alt={roleSlots[index].label} title={roleSlots[index].label} />
            <input aria-label={`Tuyển thủ ${index + 1}`} value={slot.player} onChange={(event) => void dispatch({ type: "SET_PLAYER", side, index, value: event.target.value })} />
            <ChampionSearch value={slot.championId} onChange={(championId) => void dispatch({ type: "SET_PICK", side, index, championId })} />
          </div>
        ))}
      </div>
      <div className="ban-controls">
        <span>CẤM</span>
        {team.bans.map((championId, index) => (
          <ChampionSearch key={index} direction="up" value={championId} onChange={(value) => void dispatch({ type: "SET_BAN", side, index, championId: value })} />
        ))}
      </div>
    </section>
  );
}

export function Control({ state, connected, dispatch }: { state: DraftState; connected: boolean; dispatch: (command: DraftCommand) => Promise<void> }) {
  const [error, setError] = useState("");
  const safeDispatch = useCallback(async (command: DraftCommand) => {
    try {
      setError("");
      await dispatch(command);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Lỗi không xác định");
    }
  }, [dispatch]);
  const sourceText = state.manualOverride ? "MANUAL OVERRIDE" : state.lcu.connected ? "LCU LIVE" : "MOCK READY";

  return (
    <main className="control-shell">
      <header className="control-topbar">
        <div className="product-lockup"><Broadcast weight="fill" /><div><strong>VIRTUALHUD</strong><span>DRAFT OPERATIONS</span></div></div>
        <div className="topbar-status"><span className={connected ? "online" : "offline"} />{connected ? "SERVER ONLINE" : "LOCAL FALLBACK"}<b>REV {state.revision}</b></div>
        <a className="preview-link" href="/overlay" target="_blank" rel="noreferrer">MỞ OVERLAY <ArrowUUpRight /></a>
      </header>

      <div className="control-body">
        <aside className="control-rail">
          <span className="rail-label">TRẠNG THÁI</span>
          <div className="source-card"><PlugsConnected /><span>Nguồn dữ liệu</span><strong>{sourceText}</strong><small>{state.lcu.message}</small></div>
          <label className="switch-row"><span><strong>Tự đồng bộ</strong><small>Đọc LCU khi có</small></span><input type="checkbox" checked={state.autoSync} onChange={(event) => void safeDispatch({ type: "SET_AUTO_SYNC", value: event.target.checked })} /></label>
          <label className="switch-row"><span><strong>Manual override</strong><small>Khóa quyền sửa tay</small></span><input type="checkbox" checked={state.manualOverride} onChange={(event) => void safeDispatch({ type: "SET_OVERRIDE", value: event.target.checked })} /></label>
          <div className="rail-actions">
            <button onClick={() => void safeDispatch({ type: "UNDO" })}><ArrowCounterClockwise /> Hoàn tác</button>
            <button onClick={() => void safeDispatch({ type: "REDO" })}><ArrowUUpRight /> Làm lại</button>
          </div>
          <div className="event-log"><span className="rail-label">NHẬT KÝ</span>{state.events.slice(0, 8).map((event) => <div key={event.id}><b>R{event.revision}</b><span>{event.label}</span><time>{new Date(event.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time></div>)}</div>
        </aside>

        <section className="control-workspace">
          <div className="workspace-heading"><div><span className="section-kicker">LIVE DRAFT</span><h1>Ban / Pick Control</h1></div><span className="safety-note"><ShieldCheck /> LCU CHỈ ĐỌC</span></div>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <section className="match-panel panel">
            <Field label="Tên trận" value={state.matchName} onChange={(value) => void safeDispatch({ type: "SET_MATCH", field: "matchName", value })} />
            <Field label="Ván" value={state.gameLabel} onChange={(value) => void safeDispatch({ type: "SET_MATCH", field: "gameLabel", value })} />
            <Field label="Patch" value={state.patch} onChange={(value) => void safeDispatch({ type: "SET_MATCH", field: "patch", value })} />
            <label className="field"><span>Thể thức</span><select value={state.bestOf} onChange={(event) => void safeDispatch({ type: "SET_BEST_OF", value: Number(event.target.value) as 1 | 3 | 5 })}><option value={1}>BO1</option><option value={3}>BO3</option><option value={5}>BO5</option></select></label>
            <label className="field"><span>Giai đoạn</span><select value={state.phase} onChange={(event) => void safeDispatch({ type: "SET_PHASE", phase: event.target.value as DraftPhase })}>{Object.entries(phaseNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          </section>
          <div className="teams-grid">
            <TeamEditor state={state} side="blue" dispatch={safeDispatch} />
            <TeamEditor state={state} side="red" dispatch={safeDispatch} />
          </div>
        </section>
      </div>

      <footer className="transport-bar">
        <div className="timer-control"><button className="icon-button" aria-label={state.timerRunning ? "Tạm dừng" : "Chạy đồng hồ"} onClick={() => void safeDispatch({ type: "TOGGLE_TIMER" })}>{state.timerRunning ? <Pause weight="fill" /> : <Play weight="fill" />}</button><span>{formatTimer(state.timerMs)}</span><input aria-label="Số giây" type="number" min="0" max="300" value={Math.ceil(state.timerMs / 1000)} onChange={(event) => void safeDispatch({ type: "SET_TIMER", timerMs: Number(event.target.value) * 1000 })} /></div>
        <div className="phase-status"><CircleNotch className={state.timerRunning ? "spin" : ""} />{phaseNames[state.phase]} · {state.activeSide === "blue" ? "BLUE" : "RED"} · OVERLAY {state.overlayVisible ? "ON" : "OFF"}</div>
        <div className="transport-actions">
          <button onClick={() => void safeDispatch({ type: "RESET" })}>ĐẶT LẠI</button>
          <button
            aria-pressed={state.overlayVisible}
            className={`fade-action ${state.overlayVisible ? "is-live" : ""}`}
            disabled={!state.manualOverride}
            onClick={() => void safeDispatch({ type: "SET_OVERLAY_VISIBLE", value: !state.overlayVisible })}
            title={state.manualOverride ? "Chuyển trạng thái overlay" : "Bật Manual override để điều khiển fade"}
          >
            {state.overlayVisible ? <EyeSlash weight="bold" /> : <Eye weight="bold" />}
            {state.overlayVisible ? "FADE OUT" : "FADE IN"}
          </button>
          <button className="primary-action" onClick={() => void safeDispatch({ type: "RUN_DEMO_STEP" })}>BƯỚC TIẾP <Check weight="bold" /></button>
        </div>
      </footer>
    </main>
  );
}

export function App() {
  const { state, connected, dispatch } = useDraftState();
  const route = useMemo(() => location.pathname.replace(/\/$/, "") || "/control", []);
  return route === "/overlay" ? <Overlay state={state} connected={connected} /> : <Control state={state} connected={connected} dispatch={dispatch} />;
}
