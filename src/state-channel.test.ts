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
});
