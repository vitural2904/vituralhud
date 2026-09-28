import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState } from './domain/initial-state';
import type { BroadcastCommand } from './domain/types';
import { StateChannel } from './state-channel';
import { controlRequest } from './control-request';

export function useBroadcastState() {
  const [state, setState] = useState(createInitialState());
  const [connected, setConnected] = useState(false);
  const [fresh, setFresh] = useState(false);
  const channel = useRef(new StateChannel());
  const receivedAt = useRef(0);
  const accept = useCallback((value: unknown, authoritative = false) => {
    const next = channel.current.receive(value, authoritative);
    if (next) { setState(next); receivedAt.current = performance.now(); setFresh(true); }
    return Boolean(next);
  }, []);
  useEffect(() => {
    let active = true; let socket: WebSocket | undefined; let reconnect: number | undefined; let attempts = 0; let connection = 0;
    void fetch('/api/state', { cache: 'no-store' }).then(async response => { if (response.ok && active) accept(await response.json()); }).catch(() => undefined);
    const connect = () => {
      const sequence = ++connection; let initial = true;
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      socket.onopen = () => { if (active && sequence === connection) { attempts = 0; setConnected(true); } };
      socket.onmessage = event => {
        if (!active || sequence !== connection) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'state') { if (accept(payload.state, initial)) initial = false; }
          else if (payload.type === 'heartbeat' && payload.serverInstanceId === channel.current.current?.serverInstanceId) {
            if (payload.revision === channel.current.current?.revision) { receivedAt.current = performance.now(); setFresh(true); }
            else void fetch('/api/state', { cache: 'no-store' }).then(async response => { if (response.ok && active && sequence === connection) accept(await response.json()); }).catch(() => undefined);
          }
        } catch { /* malformed message must not replace the last good state */ }
      };
      socket.onclose = () => { if (active && sequence === connection) { setConnected(false); reconnect = window.setTimeout(connect, Math.min(10000, 500 * 2 ** attempts++)); } };
    };
    connect();
    const freshness = window.setInterval(() => { if (!receivedAt.current || performance.now() - receivedAt.current >= 5000) setFresh(false); }, 100);
    return () => { active = false; ++connection; clearInterval(freshness); clearTimeout(reconnect); if (socket) { socket.onclose = null; socket.onmessage = null; if (socket.readyState === WebSocket.OPEN) socket.close(); else socket.onopen = () => socket?.close(); } };
  }, [accept]);
  const request = useCallback(async (url: string, body?: unknown) => {
    const response = await controlRequest(url, body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${payload.message ?? 'Không lưu được thay đổi.'}${payload.fields?.length ? ` (${payload.fields.join(', ')})` : ''}`);
    accept(payload);
  }, [accept]);
  const dispatch = useCallback((command: BroadcastCommand) => request('/api/actions', command), [request]);
  const resolvePostMatch = useCallback((matchId: string) => request('/api/post-match/resolve', { matchId }), [request]);
  const cancelPostMatch = useCallback(() => request('/api/post-match/cancel'), [request]);
  const loadPostMatchFixture = useCallback(() => request('/api/post-match/fixture'), [request]);
  return { state, connected, fresh, dispatch, resolvePostMatch, cancelPostMatch, loadPostMatchFixture };
}
export type BroadcastClient = ReturnType<typeof useBroadcastState>;
