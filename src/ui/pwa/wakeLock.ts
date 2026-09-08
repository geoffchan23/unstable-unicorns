import { useEffect } from 'react';

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try { if (!stopped && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); }
      catch { /* denied */ }
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
