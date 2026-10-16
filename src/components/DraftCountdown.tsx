import { useLayoutEffect, useRef } from 'react';
import { countdownNeedsFrame, countdownRatio, syncCountdown, type CountdownAnimation } from '../domain/countdown';
import type { DraftRuntimeState } from '../domain/types';
import { useDraftReducedMotion } from './DraftMotion';

export function DraftCountdown({ draft, visible = true }: { draft: DraftRuntimeState; visible?: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  const animation = useRef<CountdownAnimation | undefined>(undefined);
  const reduced = useDraftReducedMotion();
  const enabled = visible && !['waiting', 'complete'].includes(draft.phase);
  const remainingMs = enabled ? draft.timerMs : 0;
  const windowId = draft.timerWindow ?? `${draft.phase}:${draft.activeSide}`;
  // Older saved states have no duration; keep their first observed duration stable.
  const durationMs = draft.timerDurationMs ?? (animation.current?.windowId === windowId ? animation.current.durationMs : draft.timerMs);
  useLayoutEffect(() => {
    // The parent owns the exit fade. Keep this last painted frame while hidden,
    // stop work, then read the current clock afresh on the next reveal.
    if (!visible) { animation.current = undefined; return; }
    animation.current = syncCountdown(animation.current, { windowId, remainingMs, durationMs, running: draft.timerRunning && enabled }, performance.now());
    if (reduced) { animation.current.refill = undefined; animation.current.drain = undefined; }
    let frame = 0;
    const paint = () => {
      const now = performance.now();
      const ratio = countdownRatio(animation.current!, now);
      if (bar.current) bar.current.style.transform = `scaleX(${ratio})`;
      if (countdownNeedsFrame(animation.current!, now)) frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [windowId, remainingMs, durationMs, draft.timerRunning, enabled, reduced, visible]);
  return <div className="draft-countdown" data-running={draft.timerRunning && enabled} role="progressbar" aria-label="Thời gian lượt ban/pick" aria-valuemin={0} aria-valuemax={Math.ceil(durationMs / 1000)} aria-valuenow={Math.ceil(remainingMs / 1000)} aria-valuetext={enabled ? `${Math.ceil(remainingMs / 1000)} giây · ${draft.timerRunning ? 'Đang chạy' : 'Tạm dừng'}` : 'Không có lượt đang đếm'}>
    <div ref={bar} className="draft-countdown__bar" style={{ transform: 'scaleX(0)' }} />
  </div>;
}
