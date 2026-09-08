import { useMemo, useSyncExternalStore } from 'react';
import { GameClient } from './client';

export function serverUrl(): string {
  const q = new URLSearchParams(location.search).get('server');
  if (q) {
    try {
      localStorage.setItem('uu.server', q);
    } catch {
      /* ignore */
    }
    return q;
  }
  try {
    const s = localStorage.getItem('uu.server');
    if (s) return s;
  } catch {
    /* ignore */
  }
  return __SERVER_URL__;
}

let singleton: GameClient | null = null;
export function getClient() {
  return (singleton ??= new GameClient(serverUrl()));
}

export function useClient() {
  const client = useMemo(getClient, []);
  const snap = useSyncExternalStore(
    (fn) => client.subscribe(fn),
    () => client.snapshot(),
  );
  return { client, snap };
}
