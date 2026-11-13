import type { PreferenceLevel, TravelMode, Workplace } from '../../types';
import { DEFAULT_PRIORITY } from '../filters/preferences';

export interface Home {
  id: string;
  name: string;
  lat: number;
  lon: number;
  rent: number | null;
  bedrooms: number | null;
  listingUrl: string;
  notes: string;
  /** User-entered return fare per destination day, not a provider fare estimate. */
  transportReturnFare: number | null;
  monthlyTransportOther: number;
  createdAt: string;
}

export interface LocationBookmark {
  id: string;
  kind: 'cell' | 'neighbourhood';
  name: string;
  neighbourhoodId: string;
  cellId?: string;
  lat?: number;
  lon?: number;
  notes: string;
  settingsFingerprint: string;
  savedSettings?: Pick<ScenarioSnapshot, 'workplaces' | 'prefs' | 'priorityOrder'>;
  savedAt: string;
}

export interface ScenarioSnapshot {
  workplaces: Workplace[];
  prefs: Record<string, PreferenceLevel>;
  priorityOrder: string[];
  shortlist: string[];
  bookmarks: LocationBookmark[];
  homes: Home[];
}

export interface SavedScenario {
  id: string;
  name: string;
  notes: string;
  savedAt: string;
  snapshot: ScenarioSnapshot;
}

export interface ScenarioFile {
  format: 'common-ground';
  version: 1;
  shared: boolean;
  includesPreciseLocations: boolean;
  scenario: SavedScenario;
}

export const SCENARIOS_KEY = 'cg:scenarios:v1';
export const WORKSPACE_KEY = 'cg:household-workspace:v1';
const MAX_FILE_BYTES = 500_000;
const MAX_SHARE_CHARS = 32_000;
const modes = new Set<TravelMode>(['transit', 'walk', 'bike', 'drive']);
const levels = new Set<PreferenceLevel>(['off', 'nice', 'important', 'must']);
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
};
const str = (value: unknown, label: string, max = 250): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} must be text of at most ${max} characters.`);
  return value;
};
const nonempty = (value: unknown, label: string, max = 250): string => {
  const text = str(value, label, max).trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
};
const num = (value: unknown, label: string, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
};
const nullableNum = (value: unknown, label: string, min: number, max: number): number | null => value == null ? null : num(value, label, min, max);
const list = <T>(value: unknown, label: string, max: number, parse: (value: unknown) => T): T[] => {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must contain at most ${max} entries.`);
  const result = value.map(parse);
  return result;
};
const uniqueIds = <T extends { id: string }>(items: T[], label: string): T[] => {
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error(`${label} contains duplicate identifiers.`);
  return items;
};

export function validListingUrl(value: string): boolean {
  if (!value) return true;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}

export function validateHome(value: unknown): Home {
  const home = record(value);
  const listingUrl = str(home.listingUrl ?? '', 'Listing URL', 2_000);
  if (!validListingUrl(listingUrl)) throw new Error('Listing URL must be an ordinary http or https link.');
  const bedrooms = nullableNum(home.bedrooms, 'Bedrooms', 0, 30);
  if (bedrooms != null && !Number.isInteger(bedrooms)) throw new Error('Bedrooms must be a whole number.');
  return {
    id: nonempty(home.id, 'Home identifier', 100), name: nonempty(home.name, 'Home name', 160),
    lat: num(home.lat, 'Latitude', -90, 90), lon: num(home.lon, 'Longitude', -180, 180),
    rent: nullableNum(home.rent, 'Monthly rent', 0, 1_000_000), bedrooms,
    listingUrl, notes: str(home.notes ?? '', 'Home notes', 5_000),
    transportReturnFare: nullableNum(home.transportReturnFare, 'Return fare', 0, 10_000),
    monthlyTransportOther: num(home.monthlyTransportOther ?? 0, 'Other monthly transport costs', 0, 1_000_000),
    createdAt: str(home.createdAt ?? new Date().toISOString(), 'Creation date', 60),
  };
}

export function validateWorkplace(value: unknown): Workplace {
  const w = record(value);
  if (!modes.has(w.mode as TravelMode)) throw new Error('Unknown travel mode.');
  const result: Workplace & Record<string, unknown> = {
    id: nonempty(w.id, 'Destination identifier', 100), name: nonempty(w.name, 'Destination label', 160),
    lat: num(w.lat, 'Latitude', -90, 90), lon: num(w.lon, 'Longitude', -180, 180),
    mode: w.mode as TravelMode, maxMinutes: num(w.maxMinutes, 'Commute limit', 1, 180),
  };
  for (const key of ['personId', 'personName', 'placeName']) if (w[key] != null) result[key] = str(w[key], key, 250);
  if (w.colour != null) {
    const colour = str(w.colour, 'Person colour', 20);
    if (!/^#[0-9a-f]{6}$/i.test(colour)) throw new Error('Person colour must be a six-digit hex colour.');
    result.colour = colour;
  }
  if (w.officeDays != null) result.officeDays = num(w.officeDays, 'Office days', 0, 7);
  if (w.arrivalTime != null) {
    const arrival = str(w.arrivalTime, 'Arrival time', 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(arrival)) throw new Error('Arrival time must use HH:MM.');
    result.arrivalTime = arrival;
  }
  return result;
}

export function validateBookmark(value: unknown): LocationBookmark {
  const b = record(value);
  if (b.kind !== 'cell' && b.kind !== 'neighbourhood') throw new Error('Unknown bookmark kind.');
  return {
    id: nonempty(b.id, 'Bookmark identifier', 160), kind: b.kind,
    name: nonempty(b.name, 'Bookmark name', 200), neighbourhoodId: nonempty(b.neighbourhoodId, 'Neighbourhood identifier', 160),
    ...(b.cellId != null ? { cellId: str(b.cellId, 'Map cell identifier', 100) } : {}),
    ...(b.lat != null ? { lat: num(b.lat, 'Latitude', -90, 90) } : {}),
    ...(b.lon != null ? { lon: num(b.lon, 'Longitude', -180, 180) } : {}),
    notes: str(b.notes ?? '', 'Bookmark notes', 5_000),
    settingsFingerprint: str(b.settingsFingerprint, 'Settings reference', 100),
    ...(b.savedSettings != null ? { savedSettings: (() => { const s = validateSnapshot({ ...record(b.savedSettings), bookmarks: [], homes: [], shortlist: [] }); return { workplaces: s.workplaces, prefs: s.prefs, priorityOrder: s.priorityOrder }; })() } : {}),
    savedAt: str(b.savedAt, 'Save date', 60),
  };
}

export function validateSnapshot(value: unknown): ScenarioSnapshot {
  const state = record(value), prefs = record(state.prefs ?? {});
  const cleanPrefs: Record<string, PreferenceLevel> = {};
  for (const [key, value] of Object.entries(prefs)) {
    if (!DEFAULT_PRIORITY.includes(key) || !levels.has(value as PreferenceLevel)) throw new Error('Scenario contains an unsupported preference.');
    cleanPrefs[key] = value as PreferenceLevel;
  }
  const priorityOrder = list(state.priorityOrder ?? DEFAULT_PRIORITY, 'Priorities', 30, (v) => str(v, 'Priority', 100));
  if (priorityOrder.some((id) => !DEFAULT_PRIORITY.includes(id))) throw new Error('Unknown priority.');
  return {
    workplaces: uniqueIds(list(state.workplaces ?? [], 'Destinations', 20, validateWorkplace), 'Destinations'), prefs: cleanPrefs,
    priorityOrder: [...new Set([...priorityOrder, ...DEFAULT_PRIORITY])],
    shortlist: [...new Set(list(state.shortlist ?? [], 'Shortlist', 100, (v) => nonempty(v, 'Neighbourhood identifier', 160)))],
    bookmarks: uniqueIds(list(state.bookmarks ?? [], 'Bookmarks', 100, validateBookmark), 'Bookmarks'),
    homes: uniqueIds(list(state.homes ?? [], 'Homes', 30, validateHome), 'Homes'),
  };
}

export function validateScenario(value: unknown): SavedScenario {
  const s = record(value);
  return { id: nonempty(s.id, 'Scenario identifier', 100), name: nonempty(s.name, 'Scenario name', 160),
    notes: str(s.notes ?? '', 'Scenario notes', 5_000), savedAt: str(s.savedAt, 'Save date', 60), snapshot: validateSnapshot(s.snapshot) };
}

export function makeScenario(name: string, notes: string, snapshot: ScenarioSnapshot): SavedScenario {
  return validateScenario({ id: crypto.randomUUID(), name, notes, savedAt: new Date().toISOString(), snapshot });
}

export function createHome(lat: number, lon: number, name = 'Prospective home'): Home {
  return validateHome({ id: crypto.randomUUID(), name, lat, lon, rent: null, bedrooms: null, listingUrl: '', notes: '', transportReturnFare: null, monthlyTransportOther: 0, createdAt: new Date().toISOString() });
}

export function createBookmark(location: Pick<LocationBookmark, 'id' | 'kind' | 'name' | 'neighbourhoodId' | 'cellId' | 'lat' | 'lon'>, snapshot: Pick<ScenarioSnapshot, 'workplaces' | 'prefs' | 'priorityOrder'>): LocationBookmark {
  return validateBookmark({ ...location, notes: '', settingsFingerprint: settingsFingerprint(snapshot), savedSettings: snapshot, savedAt: new Date().toISOString() });
}

/** Stable comparison identifier, not a secret and never a substitute for encryption. */
export function settingsFingerprint(snapshot: Pick<ScenarioSnapshot, 'workplaces' | 'prefs' | 'priorityOrder'>): string {
  const canonical = JSON.stringify({
    workplaces: snapshot.workplaces.map((w) => ({ id: w.id, lat: w.lat, lon: w.lon, mode: w.mode, maxMinutes: w.maxMinutes,
      arrivalTime: (w as Workplace & { arrivalTime?: string }).arrivalTime ?? '08:45' })).sort((a, b) => a.id.localeCompare(b.id)),
    prefs: Object.entries(snapshot.prefs).filter(([, value]) => value !== 'off').sort(([a], [b]) => a.localeCompare(b)), priorityOrder: [...new Set([...snapshot.priorityOrder, ...DEFAULT_PRIORITY])],
  });
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) { hash ^= canonical.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function scenarioFile(scenario: SavedScenario, shared = false, includePreciseLocations = true): ScenarioFile {
  const clean = validateScenario(scenario);
  const snapshot = includePreciseLocations ? clean.snapshot : { ...clean.snapshot, workplaces: [], homes: [], bookmarks: [] };
  return { format: 'common-ground', version: 1, shared, includesPreciseLocations: includePreciseLocations,
    scenario: { ...clean, snapshot } };
}

export function parseScenarioFile(text: string): ScenarioFile {
  if (text.length > MAX_FILE_BYTES || new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('Scenario file is too large (maximum 500 KB).');
  let file: Record<string, unknown>;
  try { file = record(JSON.parse(text)); } catch { throw new Error('Choose a valid Common Ground JSON scenario.'); }
  if (file.format !== 'common-ground' || file.version !== 1) throw new Error('This scenario format is not supported.');
  const parsed = { format: 'common-ground' as const, version: 1 as const, shared: file.shared === true,
    includesPreciseLocations: file.includesPreciseLocations === true, scenario: validateScenario(file.scenario) };
  // Privacy metadata must describe the actual payload, including externally edited files.
  if (!parsed.includesPreciseLocations && (parsed.scenario.snapshot.workplaces.length || parsed.scenario.snapshot.homes.length || parsed.scenario.snapshot.bookmarks.length)) {
    throw new Error('The privacy label does not match the locations in this file.');
  }
  return parsed;
}

export function makeShareLink(scenario: SavedScenario, includePreciseLocations = false, baseUrl = window.location.href): string {
  const text = JSON.stringify(scenarioFile(scenario, true, includePreciseLocations));
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (encoded.length > MAX_SHARE_CHARS) throw new Error('This scenario is too large for a link. Export a JSON file instead.');
  const url = new URL(baseUrl); url.search = ''; url.hash = `scenario=${encoded}`;
  return url.toString();
}

export function readSharedScenario(hash = window.location.hash): ScenarioFile | null {
  const encoded = new URLSearchParams(hash.replace(/^#/, '')).get('scenario');
  if (!encoded) return null;
  if (encoded.length > MAX_SHARE_CHARS || !/^[\w-]+$/.test(encoded)) throw new Error('This scenario link is invalid or too large.');
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    return parseScenarioFile(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch (error) { throw new Error(error instanceof Error ? `Could not open shared scenario: ${error.message}` : 'Could not open shared scenario.'); }
}

export interface StorageResult<T> { value: T; error: string | null }
export function loadScenarios(storage?: Pick<Storage, 'getItem'>): StorageResult<SavedScenario[]> {
  try {
    const raw = (storage ?? localStorage).getItem(SCENARIOS_KEY);
    return { value: raw ? uniqueIds(list(JSON.parse(raw), 'Saved scenarios', 50, validateScenario), 'Saved scenarios') : [], error: null };
  } catch { return { value: [], error: 'Saved scenarios could not be read. Existing storage has not been changed. Import an exported file to recover a copy.' }; }
}

export function saveScenarios(scenarios: SavedScenario[], storage?: Pick<Storage, 'setItem'>): string | null {
  try { (storage ?? localStorage).setItem(SCENARIOS_KEY, JSON.stringify(uniqueIds(list(scenarios, 'Saved scenarios', 50, validateScenario), 'Saved scenarios'))); return null; }
  catch { return 'Your browser could not save this change. Keep this tab open and export a JSON copy before leaving.'; }
}

export function loadWorkspace(storage?: Pick<Storage, 'getItem'>): StorageResult<ScenarioSnapshot | null> {
  try { const raw = (storage ?? localStorage).getItem(WORKSPACE_KEY); return { value: raw ? validateSnapshot(JSON.parse(raw)) : null, error: null }; }
  catch { return { value: null, error: 'Your saved household could not be read. Start a new search or import a scenario file.' }; }
}

export function saveWorkspace(snapshot: ScenarioSnapshot, storage?: Pick<Storage, 'setItem'>): string | null {
  try { (storage ?? localStorage).setItem(WORKSPACE_KEY, JSON.stringify(validateSnapshot(snapshot))); return null; }
  catch { return 'This browser cannot save your household. Changes remain in this tab; export a scenario to keep them.'; }
}
