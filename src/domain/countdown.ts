export type CountdownInput = { windowId: string; remainingMs: number; durationMs: number; running: boolean };
export type CountdownAnimation = CountdownInput & {
  at: number;
  correction: number;
  ratioScale: number;
  refill?: { from: number; at: number };
  drain?: { from: number; at: number };
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const correctionMs = 160;
const refillMs = 200;
const drainMs = 160;
const smooth = (progress: number) => progress * progress * progress * (progress * (progress * 6 - 15) + 10);

function clockRatio(animation: CountdownAnimation, now: number) {
  if (animation.durationMs <= 0) return 0;
  const elapsed = Math.max(0, now - animation.at);
  const remaining = animation.remainingMs - (animation.running ? elapsed : 0);
  if (remaining <= 0) return 0;
  const correction = animation.correction * (1 - smooth(clamp(elapsed / correctionMs)));
  return clamp(remaining / animation.durationMs * animation.ratioScale + correction);
}

export function countdownRatio(animation: CountdownAnimation, now: number) {
  if (animation.drain) return animation.drain.from * (1 - smooth(clamp((now - animation.drain.at) / drainMs)));
  const target = clockRatio(animation, now);
  if (!animation.refill || target === 0) return target;
  const progress = clamp((now - animation.refill.at) / refillMs);
  // Quintic easing softens both ends and joins the still-running clock smoothly.
  const flow = smooth(progress);
  return animation.refill.from + (target - animation.refill.from) * flow;
}

export function countdownNeedsFrame(animation: CountdownAnimation, now: number) {
  if (animation.drain) return now < animation.drain.at + drainMs;
  return clockRatio(animation, now) > 0 && (animation.running || !!animation.refill && now < animation.refill.at + refillMs);
}

export function syncCountdown(previous: CountdownAnimation | undefined, input: CountdownInput, now: number): CountdownAnimation {
  const next: CountdownAnimation = { ...input, remainingMs: Math.max(0, input.remainingMs), durationMs: Math.max(0, input.durationMs), at: now, correction: 0, ratioScale: 1 };
  if (!previous) return next;
  const current = countdownRatio(previous, now);
  if (next.remainingMs === 0 || next.durationMs === 0) {
    if (current > 0) next.drain = previous.drain ?? { from: current, at: now };
    return next;
  }
  if (previous.windowId !== input.windowId || previous.drain) {
    if (clockRatio(next, now) !== current) next.refill = { from: current, at: now };
    return next;
  }
  // A pause interrupts the refill immediately. Ordinary ticks keep its original
  // start time, while resynchronizing the clock underneath it without a jump.
  if (previous.running && !input.running) {
    next.remainingMs = current * next.durationMs;
    return next;
  }
  if (previous.refill && now < previous.refill.at + refillMs) next.refill = previous.refill;
  const baseline = next.refill ? clockRatio(previous, now) : current;
  if (!input.running) {
    // Freeze at the displayed position immediately; no drift while paused.
    next.remainingMs = baseline * next.durationMs;
  } else {
    const target = clamp(next.remainingMs / next.durationMs);
    // Late snapshots may be ahead of the displayed clock. Slow the remaining
    // travel to that deadline instead of visibly growing the bar backwards.
    if (target > baseline) next.ratioScale = baseline / target;
    else next.correction = baseline - target;
  }
  return next;
}
