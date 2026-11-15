// Single source of constants (spec §0, B.4): loads web/data/constants.json.
//   import { C, C_meta } from './constants.js';
//   C.geo.R_km            -> 3388           (value only)
//   C_meta.geo.R_km       -> {value, unit, source, ref}
// Works in the browser (fetch, relative to this module) and in Node/Vitest (fs).
// The module awaits the load at import time (top-level await). If loading fails, C stays null and
// `constantsError` holds the error, so the UI can show a notice instead of a blank page.

export const VALID_SOURCES = ['FUENTE', 'VERIFICADO', 'ASSUMPTION', 'PROXY', 'DECISION', 'DERIVED'];

export let C = null;
export let C_meta = null;
export let constantsError = null;

const URL_JSON = new URL('../data/constants.json', import.meta.url);

export function isLeaf(node) {
  return node !== null && typeof node === 'object' && !Array.isArray(node) && 'value' in node;
}

function values(node) {
  if (isLeaf(node)) return node.value;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = values(v);
  return out;
}

/** Build {C, C_meta} from a parsed constants.json object ('_meta' is excluded). */
export function buildConstants(raw) {
  const groups = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith('_')) groups[k] = v;
  return { C: values(groups), C_meta: groups };
}

/** Yield [dottedKey, leaf] for every constant (used by tests and the About panel). */
export function* leaves(meta = C_meta, prefix = '') {
  for (const [k, v] of Object.entries(meta)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isLeaf(v)) yield [key, v];
    else if (v && typeof v === 'object') yield* leaves(v, key);
  }
}

async function readRaw() {
  if (URL_JSON.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(URL_JSON, 'utf8'));
  }
  const res = await fetch(URL_JSON);
  if (!res.ok) throw new Error(`constants.json HTTP ${res.status}`);
  return res.json();
}

/** (Re)load constants. Pass a parsed object to inject (tests); otherwise reads constants.json. */
export async function loadConstants(raw) {
  try {
    const built = buildConstants(raw ?? (await readRaw()));
    C = built.C;
    C_meta = built.C_meta;
    constantsError = null;
  } catch (err) {
    constantsError = err;
    console.error('[constants] failed to load constants.json:', err);
  }
  return { C, C_meta };
}

await loadConstants();
