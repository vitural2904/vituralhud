import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from '@phosphor-icons/react/Check';
import { Warning } from '@phosphor-icons/react/Warning';
import GlideSelect, { type GlideSelectOption } from "./react-bits/micro/GlideSelect";
import HoldButton, { type HoldButtonStatus } from "./react-bits/micro/HoldButton";
import LatticeLoader from "./react-bits/micro/LatticeLoader";
import RubberSegment, { type RubberSegmentItem } from "./react-bits/micro/RubberSegment";
import ScrubField from "./react-bits/micro/ScrubField";
import SquishSwitch from "./react-bits/micro/SquishSwitch";
import StatusMark, { type StatusMarkStatus } from "./react-bits/micro/StatusMark";
import SwipeToast from "./react-bits/micro/SwipeToast";
import WarmTooltip from "./react-bits/micro/WarmTooltip";

const ink = "#f3efe4";
const panel = "#181816";
const raised = "#26231d";
const brass = "#caa56a";

export function TextField({ label, value, onChange, disabled = false, placeholder, className = "" }: {
  label: string;
  value: string;
  onChange: (value: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  const cancelled = useRef(false);
  const canonicalValue = useRef(value);
  canonicalValue.current = value;
  useEffect(() => { if (!editing.current) setDraft(value); }, [value]);
  return <label className={`field ${className}`}><span>{label}</span><input aria-label={label} disabled={disabled} maxLength={label.includes('player') ? 24 : label.includes('Team') ? 28 : 40} value={draft} placeholder={placeholder} onFocus={() => { editing.current = true; cancelled.current = false; }} onChange={(event) => setDraft(event.target.value)} onBlur={() => { editing.current = false; if (cancelled.current) { setDraft(value); return; } if (draft !== value) { try { void Promise.resolve(onChange(draft)).catch(() => { if (!editing.current) setDraft(canonicalValue.current); }); } catch { setDraft(canonicalValue.current); } } }} onKeyDown={(event) => { if (event.key === 'Escape') { cancelled.current = true; setDraft(value); event.currentTarget.blur(); } else if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

export function SegmentField({ label, value, items, onChange, disabled = false, className = "" }: {
  label: string;
  value: string;
  items: RubberSegmentItem[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return <div className={`micro-field ${className}`}><span>{label}</span><RubberSegment items={items} value={value} onChange={onChange} disabled={disabled} size="md" draggable={false} trackColor={panel} thumbColor={brass} textColor="#b8b1a4" activeTextColor="#17130d" radius={8} aria-label={label} /></div>;
}

export function SelectField({ label, value, options, onChange, disabled = false, className = "" }: {
  label: string;
  value: string;
  options: (string | GlideSelectOption)[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return <div className={`micro-field ${className}`}><span>{label}</span><GlideSelect value={value} options={options} onChange={onChange} disabled={disabled} size="lg" accentColor={brass} surfaceColor={panel} highlightColor={raised} textColor={ink} radius={8} ariaLabel={label} menuWidth={220} /></div>;
}

export function NumberField({ label, ariaLabel = label, missing = false, value, min = 0, max = 999999999, suffix = "", onCommit, disabled = false, compact = false }: {
  label: string;
  ariaLabel?: string;
  missing?: boolean;
  value: number;
  min?: number;
  max?: number;
  suffix?: string;
  onCommit: (value: number) => void | Promise<void>;
  disabled?: boolean;
  compact?: boolean;
}) {
  return <div className={`micro-field number-field ${compact ? "is-compact" : ""}`}><span>{label}</span><ScrubField label="Drag" ariaLabel={ariaLabel} unfilled={missing} value={value} min={min} max={max} step={1} fineMultiplier={1} suffix={suffix} disabled={disabled} size={compact ? "sm" : "md"} sensitivity={compact ? 3 : 2} showDelta showFill accent={brass} chipColor={panel} onCommit={(next) => onCommit(next)} /></div>;
}

export function ToggleField({ label, checked, onChange, disabled = false }: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return <div className="toggle-field"><SquishSwitch checked={checked} onChange={onChange} disabled={disabled} label="" ariaLabel={label} width={58} height={30} trackColor="#302d27" trackOnColor={brass} thumbColor="#aaa397" thumbOnColor="#17130d" /><span>{label}</span></div>;
}

export function ActionButton({ children, doneLabel = "Done", icon, doneIcon = <Check weight="bold" />, onAction, disabled = false, className = "", tooltip, "aria-label": ariaLabel }: {
  children: ReactNode;
  doneLabel?: ReactNode;
  icon?: ReactNode;
  doneIcon?: ReactNode;
  onAction: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  tooltip?: string;
  "aria-label"?: string;
}) {
  const [status, setStatus] = useState<HoldButtonStatus>("idle");
  const timer = useRef<number | undefined>(undefined);
  const completedLabel = useRef<ReactNode>(doneLabel);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = async () => {
    if (status === "working" || disabled) return;
    completedLabel.current = doneLabel;
    setStatus("working");
    try {
      await onAction();
      setStatus("done");
    } catch {
      setStatus("error");
    }
    timer.current = window.setTimeout(() => setStatus("idle"), 1100);
  };
  const button = <HoldButton mode="tap" status={status} ariaLabel={ariaLabel} disabled={disabled || status === "working"} onTap={() => void run()} icon={status === "working" ? <LatticeLoader label="Working" showTimer={false} cellSize={4} gap={1} fontSize={0} /> : icon} doneIcon={doneIcon} doneLabel={status === "done" ? completedLabel.current : doneLabel} backgroundColor={panel} fillColor={brass} textColor={ink} fillTextColor="#17130d" radius={8} wave={false} glow={false} className={className}>{children}</HoldButton>;
  return tooltip ? <WarmTooltip content={tooltip} side="top" surfaceColor="#f3efe4" inkColor="#17130d"><span className="action-tooltip-anchor">{button}</span></WarmTooltip> : button;
}

export function StateMark({ state, label }: { state: "idle" | "running" | "done" | "failed" | "offline"; label: ReactNode }) {
  const status: StatusMarkStatus = state === "offline" ? "cancelled" : state === "idle" ? "pending" : state;
  return <StatusMark status={status} label={label} strike={false} color="#9e978a" doneColor="#7bb487" errorColor="#d36961" size={18} fontSize={12} />;
}

export function NoticeToast({ id, title, description, tone = "success", onClose }: {
  id: string;
  title: string;
  description?: string;
  tone?: "success" | "error";
  onClose: () => void;
}) {
  return <div className="toast-dock" key={id}><SwipeToast title={title} description={description} icon={tone === "success" ? <Check weight="bold" /> : <Warning weight="bold" />} background={tone === "success" ? "#223027" : "#3a2421"} color={ink} fuseColor={tone === "success" ? "#7bb487" : "#d36961"} duration={3600} closeButton onClose={onClose} /></div>;
}

export { LatticeLoader, WarmTooltip };
