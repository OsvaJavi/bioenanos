// Data layer (spec M3 "Contratos expuestos"). Loads pois.json, routes.json and layers/layers.json; falls back to
// data/mock/* when a real file is missing (isMock() -> true, the UI shows "MOCK DATA").
//   await loadData(); getBase(); getPOIs(); getPOI(id); getRoute(poiId, mode, direction='out');
//   getLayers(); isMock(); getConstants() -> {C, C_meta}
// Pure helpers (no DOM, no Leaflet) are exported for unit tests: sortByDistance, pointAtS, formatLatLon, layerUrl.
import { C, C_meta, constantsError } from './constants.js';

const DATA_BASE = new URL('../data/', import.meta.url);

const state = {
  loaded: false,
  pois: null,
  routes: null,
  layers: null,
  index: new Map(),
  mock: { routes: false, layers: false },
  warnings: [],
};

async function defaultFetchJson(rel) {
  const url = new URL(rel, DATA_BASE);
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(url, 'utf8'));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.json();
}

const key = (poi, mode, direction) => `${poi}|${mode}|${direction}`;

/** Load everything. `fetchJson(relPathUnderData)` can be injected (tests). Throws only if pois.json is missing. */
export async function loadData({ fetchJson = defaultFetchJson } = {}) {
  if (constantsError) state.warnings.push(`constants.json: ${constantsError.message}`);
  state.pois = await fetchJson('pois.json');
  state.mock = { routes: false, layers: false };
  try {
    state.routes = await fetchJson('routes.json');
  } catch (err) {
    state.warnings.push(`routes.json not found (${err.message}); using mock routes`);
    state.routes = await fetchJson('mock/routes.json');
    state.mock.routes = true;
  }
  try {
    state.layers = await fetchJson('layers/layers.json');
  } catch (err) {
    state.warnings.push(`layers/layers.json not found (${err.message}); using mock layers`);
    state.layers = await fetchJson('mock/layers.json');
    state.mock.layers = true;
  }
  if (state.routes.mock) state.mock.routes = true;
  if (state.layers.mock) state.mock.layers = true;
  state.index = new Map(state.routes.routes.map((r) => [key(r.poi, r.mode, r.direction), r]));
  state.loaded = true;
  return state;
}

export const getBase = () => state.pois.base;
export const getPOIs = () => state.pois.pois;
export const getPOI = (id) => state.pois.pois.find((p) => p.id === id) ?? (state.pois.base.id === id ? state.pois.base : null);
export const getRoute = (poiId, mode, direction = 'out') => state.index.get(key(poiId, mode, direction)) ?? null;
export const getLayers = () => state.layers;
export const isMock = () => state.mock.routes || state.mock.layers;
export const getConstants = () => ({ C, C_meta });
export const getWarnings = () => [...state.warnings];
export const getSummary = () => state.routes?.summary ?? null;

/** Absolute URL of a layer file (`file` in layers.json is relative to web/data/). */
export function layerUrl(file) {
  return file ? new URL(file, DATA_BASE).href : null;
}

/** POIs sorted by the 3-D length of their `out` route in `mode` (ascending); missing routes go last. */
export function sortByDistance(pois, mode, routeOf = getRoute) {
  const len = (p) => routeOf(p.id, mode, 'out')?.length_km_3d ?? Infinity;
  return [...pois].sort((a, b) => len(a) - len(b) || a.id.localeCompare(b.id));
}

/** Point on a route at cumulative 3-D distance s_km (linear interpolation; clamped to the ends). */
export function pointAtS(route, s_km) {
  const pts = route.points;
  if (s_km <= pts[0].s_km) return { ...pts[0] };
  const last = pts[pts.length - 1];
  if (s_km >= last.s_km) return { ...last };
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].s_km <= s_km) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const f = (s_km - a.s_km) / (b.s_km - a.s_km);
  const lerp = (k) => a[k] + f * (b[k] - a[k]);
  return { x_km: lerp('x_km'), y_km: lerp('y_km'), lat: lerp('lat'), lon: lerp('lon'), z_m: lerp('z_m'), s_km };
}

/** "39.800°N 202.100°E" (planetocentric, °E 0–360). */
export function formatLatLon(lat, lon, digits = 3) {
  const ns = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(digits)}°${ns} ${(((lon % 360) + 360) % 360).toFixed(digits)}°E`;
}

/** Constants tagged ASSUMPTION or PROXY, for the About panel: [{key, value, unit, source, ref}]. */
export function assumptionRows(meta = C_meta) {
  const out = [];
  const walk = (node, prefix) => {
    for (const [k, v] of Object.entries(node)) {
      const kk = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && 'value' in v) {
        if (v.source === 'ASSUMPTION' || v.source === 'PROXY') out.push({ key: kk, ...v });
      } else if (v && typeof v === 'object') walk(v, kk);
    }
  };
  walk(meta, '');
  return out;
}

/** Reset (tests only). */
export function _reset() {
  Object.assign(state, { loaded: false, pois: null, routes: null, layers: null, index: new Map(),
    mock: { routes: false, layers: false }, warnings: [] });
}
