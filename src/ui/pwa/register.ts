let waiting: ServiceWorker | null = null;

export function registerServiceWorker(onUpdate: () => void) {
  if (__DEV__ || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const track = (sw: ServiceWorker | null) => {
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) { waiting = sw; onUpdate(); }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; onUpdate(); }
      track(reg.installing);
      reg.addEventListener('updatefound', () => track(reg.installing));
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloading) { reloading = true; location.reload(); }
      });
    } catch (e) { console.warn('sw', e); }
  });
}

export function applyUpdate() { waiting?.postMessage('SKIP_WAITING'); }
