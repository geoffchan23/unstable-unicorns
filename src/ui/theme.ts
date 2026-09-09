// Theme: light, dark, or barf (rainbow everywhere). Stored per device; without a choice the device setting wins.
export type Theme = 'light' | 'dark' | 'barf';
const KEY = 'uu.theme';
export const THEMES: { id: Theme; label: string }[] = [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'barf', label: 'Barf' }];

export function storedTheme(): Theme | null {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' || t === 'barf' ? t : null; } catch { return null; }
}
/** the theme in effect: the stored choice, else what the device prefers */
export function currentTheme(): Theme {
  return storedTheme() ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
export function applyTheme(t: Theme | null): void {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name=theme-color]:not([media])');
  if (meta) meta.content = t === 'dark' ? '#121015' : t === 'barf' ? '#ffd6ec' : '#ffffff';
}
export function setTheme(t: Theme): void {
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  applyTheme(t);
}
