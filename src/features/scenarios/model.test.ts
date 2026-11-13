import { describe, expect, it } from 'vitest';
import { createBookmark, createHome, loadScenarios, loadWorkspace, makeScenario, makeShareLink, parseScenarioFile, readSharedScenario,
  saveScenarios, saveWorkspace, scenarioFile, settingsFingerprint, validateHome, validateSnapshot, type ScenarioSnapshot } from './model';

const snapshot = (): ScenarioSnapshot => ({ workplaces: [{ id: 'person-work', name: 'Private office', placeName: 'Precise workplace address', personId: 'p1', personName: 'Alex', colour: '#59796b', officeDays: 3, arrivalTime: '09:15', lat: 37.79, lon: -122.40, mode: 'transit', maxMinutes: 45 }],
  prefs: { parks: 'important', lowCrime: 'must' }, priorityOrder: ['parks', 'lowCrime'], shortlist: ['mission', 'noe-valley', 'glen-park'],
  bookmarks: [], homes: [createHome(37.75, -122.41, 'A prospective home')] });

describe('portable household scenarios', () => {
  it('reads legacy mode fields without losing saved homes, bookmarks or destinations',()=>{
    const prior=snapshot();prior.bookmarks=[createBookmark({id:'old-cell',kind:'cell',name:'Saved corner',neighbourhoodId:'mission',cellId:'8928308280fffff',lat:37.75,lon:-122.41},prior)];
    const migrated=validateSnapshot({...prior,mapMode:'explore',mode:'compare'});
    expect(migrated.homes).toEqual(prior.homes);expect(migrated.bookmarks).toEqual(prior.bookmarks);expect(migrated.workplaces).toEqual(prior.workplaces);
    expect('mapMode' in migrated).toBe(false);
  });
  it('round-trips a complete export with homes, three shortlisted neighbourhoods and household fields', () => {
    const scenario = makeScenario('Our next chapter', 'Café nearby, please', snapshot());
    const file = parseScenarioFile(JSON.stringify(scenarioFile(scenario)));
    expect(file.scenario.snapshot.workplaces[0]).toMatchObject({ placeName: 'Precise workplace address', personId: 'p1', officeDays: 3, arrivalTime: '09:15' });
    expect(file.scenario.snapshot.shortlist).toHaveLength(3);
    expect(file.scenario.snapshot.homes[0].rent).toBeNull();
    expect(file.scenario.notes).toBe('Café nearby, please');
  });
  it('share links omit exact destinations, homes and bookmarks by default', () => {
    const state = snapshot();
    state.bookmarks = [createBookmark({ id: 'cell-1', kind: 'cell', name: 'Quiet corner', cellId: '89abc', neighbourhoodId: 'mission', lat: 37.751, lon: -122.419 }, state)];
    const link = makeShareLink(makeScenario('Household plan', '', state), false, 'https://example.org/?workplaceLat=37.79&workplaceLon=-122.40');
    expect(new URL(link).search).toBe('');
    const shared = readSharedScenario(new URL(link).hash)!;
    expect(shared.includesPreciseLocations).toBe(false);
    expect(shared.scenario.snapshot.workplaces).toEqual([]);
    expect(shared.scenario.snapshot.homes).toEqual([]);
    expect(shared.scenario.snapshot.bookmarks).toEqual([]);
    expect(shared.scenario.snapshot.shortlist).toHaveLength(3);
    expect(shared.scenario.snapshot.prefs.parks).toBe('important');
  });
  it('includes exact locations only after explicit opt-in and handles Unicode names', () => {
    const scenario = makeScenario('Café & 家', 'Near the station', snapshot());
    const file = readSharedScenario(new URL(makeShareLink(scenario, true, 'https://example.org/')).hash)!;
    expect(file.includesPreciseLocations).toBe(true);
    expect(file.scenario.name).toBe('Café & 家');
    expect(file.scenario.snapshot.workplaces[0].lat).toBe(37.79);
  });
  it('refuses a false privacy label or unsupported versions', () => {
    const file = scenarioFile(makeScenario('Private', '', snapshot()));
    expect(() => parseScenarioFile(JSON.stringify({ ...file, includesPreciseLocations: false }))).toThrow(/privacy label/);
    expect(() => parseScenarioFile(JSON.stringify({ ...file, version: 2 }))).toThrow(/not supported/);
  });
  it('validates imports before changing any household state', () => {
    const state = snapshot();
    expect(() => validateSnapshot({ ...state, workplaces: [...state.workplaces, ...state.workplaces] })).toThrow(/duplicate/);
    expect(() => validateSnapshot({ ...state, prefs: { impossible: 'must' } })).toThrow(/unsupported preference/);
    expect(() => validateSnapshot({ ...state, workplaces: [{ ...state.workplaces[0], lat: 100 }] })).toThrow(/Latitude/);
    expect(() => validateSnapshot({ ...state, workplaces: [{ ...state.workplaces[0], arrivalTime: '25:00' }] })).toThrow(/HH:MM/);
    expect(() => validateSnapshot({ ...state, homes: Array.from({ length: 31 }, () => state.homes[0]) })).toThrow(/at most 30/);
    expect(() => parseScenarioFile('x'.repeat(500_001))).toThrow(/too large/);
  });
  it('bounds and rejects malformed share fragments', () => {
    expect(readSharedScenario('#other=value')).toBeNull();
    expect(() => readSharedScenario('#scenario=%%%')).toThrow(/invalid/);
    expect(() => readSharedScenario(`#scenario=${'a'.repeat(32_001)}`)).toThrow(/too large/);
  });
  it('does not allow active URL schemes or credential-bearing listing URLs', () => {
    const home = createHome(37.75, -122.41);
    expect(() => validateHome({ ...home, listingUrl: 'javascript:alert(1)' })).toThrow(/http or https/);
    expect(() => validateHome({ ...home, listingUrl: 'https://user:password@example.org/' })).toThrow(/http or https/);
    expect(validateHome({ ...home, listingUrl: 'https://example.org/listing' }).listingUrl).toContain('https:');
  });
  it('retains saved settings for a specific-location bookmark and detects eligibility setting changes', () => {
    const state = snapshot(), bookmark = createBookmark({ id: 'cell-1', kind: 'cell', name: 'A corner', cellId: 'abc', neighbourhoodId: 'mission' }, state);
    expect(bookmark.savedSettings?.workplaces[0].maxMinutes).toBe(45);
    expect(bookmark.settingsFingerprint).toBe(settingsFingerprint(state));
    expect(settingsFingerprint({ ...state, workplaces: [{ ...state.workplaces[0], maxMinutes: 60 }] })).not.toBe(bookmark.settingsFingerprint);
    expect(settingsFingerprint({ ...state, workplaces: [{ ...state.workplaces[0], name: 'New display label' }] })).toBe(bookmark.settingsFingerprint);
  });
});

describe('reliable browser persistence', () => {
  const storage = () => {
    const map = new Map<string, string>();
    return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
  };
  it('reloads named scenarios and the current workspace without losing null costs', () => {
    const store = storage(), scenario = makeScenario('Three days', '', snapshot());
    expect(saveScenarios([scenario], store)).toBeNull();
    expect(loadScenarios(store).value[0].name).toBe('Three days');
    expect(saveWorkspace(scenario.snapshot, store)).toBeNull();
    expect(loadWorkspace(store).value?.homes[0].rent).toBeNull();
  });
  it('reports denied or full storage so the UI can offer export', () => {
    const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect(loadScenarios(denied).error).toBeTruthy();
    expect(saveScenarios([], denied)).toContain('export');
    expect(loadWorkspace(denied).error).toBeTruthy();
    expect(saveWorkspace(snapshot(), denied)).toContain('export');
  });
  it('leaves malformed stored data untouched and returns a recovery message', () => {
    const corrupt = { getItem: () => '{broken' };
    expect(loadScenarios(corrupt)).toMatchObject({ value: [], error: expect.any(String) });
    expect(loadWorkspace(corrupt)).toMatchObject({ value: null, error: expect.any(String) });
  });
});
