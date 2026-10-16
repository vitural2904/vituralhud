import { describe, expect, it } from 'vitest';
import { StateChannel, isRuntimeState } from './state-channel';
import { createInitialState } from './domain/initial-state';
const state = (revision: number, serverInstanceId = 'epoch-a') => ({ ...createInitialState(), revision, serverInstanceId });
describe('F14 state ordering and shape', () => {
  it('ignores late HTTP revisions and retired server epochs', () => {
    const channel = new StateChannel();
    channel.receive(state(20)); expect(channel.receive(state(19))).toBeUndefined();
    expect(channel.receive(state(1, 'epoch-b'))).toBeUndefined();
    expect(channel.receive(state(1, 'epoch-b'), true)?.revision).toBe(1);
    expect(channel.receive(state(30), true)).toBeUndefined(); expect(channel.current?.serverInstanceId).toBe('epoch-b');
  });
  it('rejects malformed shapes before rendering', () => {
    expect(isRuntimeState(state(1))).toBe(true);
    for (const corrupt of [null, {}, { ...state(1), revision: NaN }, { ...state(1), outputOwner: 'fake' }]) expect(isRuntimeState(corrupt)).toBe(false);
    const broken = state(1) as any; broken.postMatch.data.teams.blue.players[0].kills = '0'; expect(isRuntimeState(broken)).toBe(false);
    broken.postMatch.data.teams.blue.players[0].kills = 0; broken.draft.teams.blue.picks[0] = null; expect(isRuntimeState(broken)).toBe(false);
  });
  it('validates optional transition metadata and keeps the last good revision on bad updates', () => {
    const channel = new StateChannel();
    const valid = state(2);
    valid.draft.timerDurationMs = 30000; valid.draft.timerWindow = 'pick:1'; valid.draft.finalizationMs = 15000;
    valid.draft.teams.red.banLocked = [true, false, false, false, false];
    expect(channel.receive(valid)).toBe(valid);
    for (const patch of [{ timerDurationMs: -1 }, { timerDurationMs: '30000' }, { timerWindow: 123 }, { finalizationMs: 15001 }]) {
      const bad = state(3); Object.assign(bad.draft, patch);
      expect(channel.receive(bad)).toBeUndefined();
    }
    for (const locks of [[true], [true, false, 'false', false, false], null]) {
      const bad = state(3) as any; bad.draft.teams.red.banLocked = locks;
      expect(channel.receive(bad)).toBeUndefined();
    }
    expect(channel.current).toBe(valid);
    expect(isRuntimeState(state(1))).toBe(true); // Older schema-2 states remain usable.
  });
});
