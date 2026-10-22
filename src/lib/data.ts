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
      }),
    );
  }
  return cache.get(file) as Promise<T>;
}
