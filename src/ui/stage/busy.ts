// A tiny shared flag: is the table still playing events? Bots wait for it to clear so the picture never
// runs far behind the engine.
type Listener = (busy: boolean) => void;
let busy = false;
const listeners = new Set<Listener>();

export const stageBusy = {
  get: () => busy,
  set(b: boolean) {
    if (b === busy) return;
    busy = b;
    for (const l of [...listeners]) l(b);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  /** resolves once the stage is idle (immediately when it already is) */
  idle(): Promise<void> {
    if (!busy) return Promise.resolve();
    return new Promise((resolve) => {
      const off = stageBusy.subscribe((b) => { if (!b) { off(); resolve(); } });
    });
  },
};
