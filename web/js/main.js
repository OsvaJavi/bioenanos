// App entry: loads data, builds the map and sidebar, owns the UI state and the event contract (spec M3):
//   mode:changed {mode} · poi:selected {id, mode} · poi:cleared {} · traverse:progress {mode, id, s_km} (from M4/M5)
// and mounts the telemetry modules with ctx = {data, bus: document, getState}.
import * as data from './data.js';
import { createMap } from './map.js';
import * as ui from './ui.js';
import { mountEnvStrip } from './env_strip.js';
import { mountRoverPanel } from './telemetry_rover.js';
import { mountWalkerPanel } from './telemetry_walker.js';

const bus = document;
const layerErrors = {}; // M6: layer images that failed to load, by overlay kind
const state = { mode: 'rover', poiId: null, layerId: 'hillshade', detailSub: 'hillshade', showReturn: false };
export const getState = () => ({ mode: state.mode, poiId: state.poiId });
let mapApi = null;

const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

function layers() { return data.getLayers().layers; }
function layerById(id) { return layers().find((l) => l.id === id); }

function applyLayer() {
  const layer = layerById(state.layerId);
  const detail = layerById('detail');
  mapApi.setLayer(layer, detail, state.detailSub, layerById('hillshade'));
  ui.renderLegend(layer, state.detailSub);
  ui.renderDetailSub({
    detail, show: state.layerId === 'detail', sub: state.detailSub,
    onChange: (sub) => { state.detailSub = sub; applyLayer(); },
  });
}

function drawSelection({ fit = true } = {}) {
  const poi = state.poiId ? data.getPOI(state.poiId) : null;
  mapApi.setSelected(state.poiId);
  if (!poi) {
    mapApi.clearRoute();
    ui.setListHint(null);
    return;
  }
  const out = data.getRoute(poi.id, state.mode, 'out');
  const back = state.showReturn ? data.getRoute(poi.id, state.mode, 'back') : null;
  mapApi.drawRoute(out, back, state.mode, { fit });
  ui.setListHint(poi, out);
}

function renderList() {
  ui.renderPOIList({ pois: data.getPOIs(), mode: state.mode, selectedId: state.poiId, getRoute: data.getRoute, onSelect: selectPOI });
  document.getElementById('clear-selection').hidden = !state.poiId;
}

export function selectPOI(id) {
  if (!data.getPOI(id)) return;
  state.poiId = id;
  renderList();
  drawSelection();
  emit('poi:selected', { id, mode: state.mode });
}

export function clearPOI() {
  if (!state.poiId) return;
  state.poiId = null;
  renderList();
  drawSelection();
  mapApi.resetView();
  emit('poi:cleared', {});
}

export function setMode(mode) {
  if (mode !== 'rover' && mode !== 'walker') return;
  if (mode === state.mode) return;
  state.mode = mode;
  ui.setModeButtons(mode);
  renderList();
  drawSelection({ fit: false });
  emit('mode:changed', { mode });
}

async function start() {
  try {
    await data.loadData();
  } catch (err) {
    ui.showFatal(`Could not load mission data: ${err.message}. Check that web/data/ was deployed with the site.`);
    console.warn('[main] data load failed', err);
    return;
  }
  const { C_meta } = data.getConstants();
  ui.setMockBanner(data.isMock());
  for (const w of data.getWarnings()) console.warn('[data]', w);
  ui.setBaseLine(data.getBase());

  mapApi = createMap(document.getElementById('map'), {
    layersDoc: data.getLayers(), base: data.getBase(), pois: data.getPOIs(),
    onSelect: selectPOI, onCursor: (text) => ui.setCursor(text),
    onLayerStatus: (kind, label) => { layerErrors[kind] = label; ui.setLayerNotice(Object.values(layerErrors).filter(Boolean)); },
  });
  if (!layerById(state.layerId)?.available) state.layerId = layers().find((l) => l.available)?.id ?? state.layerId;
  ui.renderLayerList({
    layers: layers(), activeId: state.layerId,
    onChange: (id) => {
      state.layerId = id;
      applyLayer();
      if (id === 'detail') mapApi.fitDetail(layerById('detail'));
    },
  });
  applyLayer();
  renderList();
  ui.setModeButtons(state.mode);
  if (C_meta) ui.renderAbout(C_meta);
  ui.renderCredits();

  document.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.getElementById('show-return').addEventListener('change', (e) => { state.showReturn = e.target.checked; drawSelection({ fit: false }); });
  document.getElementById('clear-selection').addEventListener('click', clearPOI);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) clearPOI(); });
  document.getElementById('open-about').addEventListener('click', () => document.getElementById('about').showModal());
  document.getElementById('open-credits').addEventListener('click', () => document.getElementById('credits').showModal());

  bus.addEventListener('traverse:progress', (e) => {
    const { mode, id, s_km } = e.detail ?? {};
    const route = id ? data.getRoute(id, mode ?? state.mode, 'out') : null;
    mapApi.setProgress(route, s_km);
  });

  const ctx = { data, bus, getState };
  const mount = (fn, id) => {
    try { fn(document.getElementById(id), ctx); } catch (err) { console.warn(`[main] ${id} failed to mount`, err); }
  };
  mount(mountEnvStrip, 'env-strip');
  mount(mountRoverPanel, 'telemetry-rover');
  mount(mountWalkerPanel, 'telemetry-walker');
  document.body.dataset.ready = 'true';
}

// Audit H-03: anything that fails after the data loaded (map, layers, panels) shows a readable message instead
// of leaving a blank page with an uncaught error.
start().catch((err) => {
  ui.showFatal(`The app could not start: ${err.message}. Reload the page; if it persists, check the files in web/data/.`);
  console.warn('[main] start failed', err);
});
