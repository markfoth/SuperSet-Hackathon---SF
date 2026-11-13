// Static data loader. Everything lives in public/data (synced from data/sf/processed),
// is fetched once per session and cached in memory.
const cache = new Map<string, Promise<unknown>>();

export function loadData<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    const url = `${import.meta.env.BASE_URL}data/${file}`;
    cache.set(
      file,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${file} (HTTP ${r.status})`);
        return r.json();
      }).catch((error: unknown) => { cache.delete(file); throw error; }),
    );
    // Bounded spatial cache. Revisiting an evicted tile uses HTTP caching;
    // repeated navigation cannot retain every context feature in JS memory.
    const spatial=[...cache.keys()].filter(key=>/^(cells|context)\//.test(key));
    while(spatial.length>48)cache.delete(spatial.shift()!);
  }
  return cache.get(file) as Promise<T>;
}
