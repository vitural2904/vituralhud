import { describe, expect, it } from 'vitest';
import { countdownNeedsFrame, countdownRatio, syncCountdown } from './countdown';

const input = { windowId: 'pick-1', remainingMs: 30000, durationMs: 30000, running: true };
describe('broadcast countdown', () => {
  it('moves both endpoints equally; stays centered at full, half and zero', () => {
    const animation = syncCountdown(undefined, input, 0);
    for (const [time, expected] of [[0, 1], [15000, .5], [30000, 0], [35000, 0]]) {
      const ratio = countdownRatio(animation, time);
      expect(ratio).toBe(expected);
      const left = (1 - ratio) / 2, right = 1 - left;
      expect((left + right) / 2).toBe(.5);
    }
    expect(countdownRatio(animation, 5123)).toBeCloseTo(.8292333); // Between authoritative one-second ticks.
  });
  it('freezes immediately on pause, resumes, then resets for another action', () => {
    const active = syncCountdown(undefined, input, 0);
    const paused = syncCountdown(active, { ...input, remainingMs: 20000, running: false }, 10500);
    expect(countdownRatio(paused, 10500)).toBe(.65);
    expect(countdownRatio(paused, 25000)).toBe(.65);
    const resumed = syncCountdown(paused, { ...input, remainingMs: 19500 }, 25000);
    expect(countdownRatio(resumed, 30000)).toBeCloseTo(14500 / 30000);
    const reset = syncCountdown(resumed, { ...input, windowId: 'pick-2' }, 30000);
    expect(countdownRatio(reset, 30000)).toBeCloseTo(14500 / 30000);
    expect(countdownRatio(reset, 30100)).toBeGreaterThan(.7);
    expect(countdownRatio(reset, 30200)).toBeCloseTo(29800 / 30000);
    expect(countdownRatio(reset, 31000)).toBeCloseTo(29000 / 30000);
  });
  it('refills smoothly from empty in 200ms, including a paused new window', () => {
    const empty = syncCountdown(undefined, { ...input, remainingMs: 0 }, 0);
    const reset = syncCountdown(empty, { ...input, windowId: 'pick-2', running: false }, 1000);
    const samples = [0, 20, 50, 100, 150, 180, 200].map(time => countdownRatio(reset, 1000 + time));
    expect(samples[0]).toBe(0);
    expect(samples[3]).toBeCloseTo(.5);
    expect(samples.at(-1)).toBe(1);
    for (let index = 1; index < samples.length; index++) expect(samples[index]).toBeGreaterThan(samples[index - 1]);
    // Soft start and finish; no sudden constant-speed slide.
    expect(samples[1]).toBeLessThan(.05);
    expect(samples[5]).toBeGreaterThan(.95);
    expect(countdownRatio(reset, 2000)).toBe(1);
    expect(countdownNeedsFrame(reset, 1000)).toBe(true);
    expect(countdownNeedsFrame(reset, 1200)).toBe(false);
    const tick = syncCountdown(reset, { ...input, windowId: 'pick-2', running: false }, 1100);
    expect(countdownRatio(tick, 1100)).toBeCloseTo(.5);
    expect(countdownRatio(tick, 1200)).toBe(1);
  });
  it('keeps the refill continuous across server ticks without restarting it', () => {
    const previous = syncCountdown(undefined, input, 0);
    const reset = syncCountdown(previous, { ...input, windowId: 'pick-2' }, 20000);
    const updated = syncCountdown(reset, { ...input, windowId: 'pick-2', remainingMs: 29900 }, 20100);
    expect(countdownRatio(updated, 20100)).toBeCloseTo(countdownRatio(reset, 20100));
    expect(countdownRatio(updated, 20200)).toBeCloseTo(29800 / 30000);
  });
  it('freezes a refill on pause and starts another reset from its visible position', () => {
    const previous = syncCountdown(undefined, input, 0);
    const reset = syncCountdown(previous, { ...input, windowId: 'pick-2' }, 20000);
    const visible = countdownRatio(reset, 20080);
    const paused = syncCountdown(reset, { ...input, windowId: 'pick-2', remainingMs: 29920, running: false }, 20080);
    expect(countdownRatio(paused, 21000)).toBeCloseTo(visible);
    const interrupted = syncCountdown(reset, { ...input, windowId: 'pick-3' }, 20080);
    expect(countdownRatio(interrupted, 20080)).toBeCloseTo(visible);
    expect(countdownRatio(interrupted, 20280)).toBeCloseTo(29800 / 30000);
    const zero = syncCountdown(interrupted, { ...input, windowId: 'pick-3', remainingMs: 0 }, 20100);
    expect(countdownRatio(zero, 20100)).toBeCloseTo(countdownRatio(interrupted, 20100));
    expect(countdownRatio(zero, 20260)).toBe(0);
    expect(countdownNeedsFrame(zero, 20100)).toBe(true);
    expect(countdownNeedsFrame(zero, 20260)).toBe(false);
  });
  it('closes an interrupted countdown smoothly without extending repeated zero updates', () => {
    const active = syncCountdown(undefined, input, 0);
    const stopped = syncCountdown(active, { ...input, remainingMs: 0, running: false }, 10000);
    expect(countdownRatio(stopped, 10000)).toBeCloseTo(2 / 3);
    expect(countdownRatio(stopped, 10080)).toBeCloseTo(1 / 3);
    const repeated = syncCountdown(stopped, { ...input, remainingMs: 0, running: false }, 10080);
    expect(countdownRatio(repeated, 10160)).toBe(0);
    const restarted = syncCountdown(stopped, input, 10080);
    expect(countdownRatio(restarted, 10080)).toBeCloseTo(1 / 3);
    expect(countdownRatio(restarted, 10280)).toBeCloseTo(29800 / 30000);
    // Normal expiry already reaches zero continuously; no extra tail.
    const expired = syncCountdown(active, { ...input, remainingMs: 0, running: false }, 30000);
    expect(countdownRatio(expired, 30000)).toBe(0);
    expect(countdownNeedsFrame(expired, 30000)).toBe(false);
  });
  it('resynchronizes continuously without a visible jump, then follows the new time', () => {
    const active = syncCountdown(undefined, input, 0);
    const corrected = syncCountdown(active, { ...input, remainingMs: 12000 }, 10000);
    expect(countdownRatio(corrected, 10000)).toBeCloseTo(2 / 3);
    expect(countdownRatio(corrected, 10001)).toBeCloseTo(countdownRatio(active, 10001), 5);
    expect(countdownRatio(corrected, 10160)).toBeCloseTo(11840 / 30000);
    expect(countdownRatio(corrected, 22000)).toBe(0);
  });
  it('never expands backwards when a delayed same-action snapshot arrives', () => {
    const active = syncCountdown(undefined, input, 0);
    const before = countdownRatio(active, 11000);
    const delayed = syncCountdown(active, { ...input, remainingMs: 20000 }, 11000);
    expect(countdownRatio(delayed, 11000)).toBeCloseTo(before);
    expect(countdownRatio(delayed, 11100)).toBeLessThan(before);
    expect(countdownRatio(delayed, 31000)).toBe(0);
  });
});
