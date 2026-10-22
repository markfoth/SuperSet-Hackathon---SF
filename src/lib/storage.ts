// Prototype persistence. Settings are per-browser conveniences, so every access
// is guarded: private windows and blocked storage must never break the app.
export function readStored<T>(key: string, fallback: T, store: 'local' | 'session' = 'local'): T {
  try {
    const raw = (store === 'local' ? localStorage : sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown, store: 'local' | 'session' = 'local'): void {
  try {
    (store === 'local' ? localStorage : sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}
