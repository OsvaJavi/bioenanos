// Rover telemetry panel (spec M4, §6.3): editable payload, summary of the selected route (out / back / round trip),
// verdict with the 20 % reserve, elevation and power profiles, and an animated traverse (×60 / ×600 / ×3600)
// that emits `traverse:progress {mode: 'rover', id, s_km}` for the map marker.
import { C } from './constants.js';
import { lineChart } from './chart.js';
import { dose_mGy } from './atmos.js';
import { routeSummary, stateAt, timeline, validatePayload, verdict } from './models/rover.js';

const STYLE_ID = 'telemetry-rover-style';
const CSS = `
.rv { display: grid; grid-template-columns: minmax(400px, 1.2fr) minmax(280px, 1.1fr) minmax(280px, 0.85fr); gap: 20px; height: 100%; }
.rv-col { overflow: hidden; }
.rv-empty { color: var(--muted); padding: 6px 0; }
.rv-col { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.rv-payload { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rv-payload label { color: var(--muted); }
.rv-payload input { width: 8ch; background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 3px; padding: 3px 6px; font: inherit; }
.rv-payload input[aria-invalid="true"] { border-color: var(--alert); }
.rv-msg { color: var(--alert); font-size: 12px; }
.rv-msg:empty { display: none; }
.rv-verdict { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.rv-badge { font-weight: 600; letter-spacing: 0.06em; padding: 2px 8px; border-radius: 3px; border: 1px solid; }
.rv-badge.ok { color: var(--ok); border-color: var(--ok); }
.rv-badge.oneway { color: var(--walker); border-color: var(--walker); }
.rv-badge.no { color: var(--alert); border-color: var(--alert); }
.rv-note { color: var(--muted); font-size: 12px; display: block; margin: 4px 0 6px; }
.rv-summary { display: block; }
.rv table { border-collapse: collapse; font-size: 12px; width: 100%; }
.rv th, .rv td { padding: 3px 4px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rv th { color: var(--muted); font-weight: 400; }
.rv th:first-child, .rv td:first-child { text-align: left; }
.rv tr.total td { color: var(--text); font-weight: 600; }
.rv canvas { width: 100%; height: 108px; display: block; }
.rv-controls { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.rv-controls button { background: var(--panel-2); color: var(--text); border: 1px solid var(--line); border-radius: 3px; padding: 4px 10px; cursor: pointer; font: inherit; }
.rv-controls button[aria-pressed="true"] { border-color: var(--rover); color: var(--rover); }
.rv-controls .rv-play { border-color: var(--rover); }
.rv-gauges { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; margin: 0; font-size: 12px; }
.rv-gauges div { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--line); padding: 2px 0; }
.rv-gauges dt { color: var(--muted); }
.rv-gauges dd { margin: 0; font-variant-numeric: tabular-nums; }
.rv-gauges div.wide { grid-column: 1 / -1; }
.rv-top { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.rv-bar { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
.rv-bar i { display: block; height: 100%; background: var(--rover); }
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
export function hm(hours) {
  if (!Number.isFinite(hours)) return '—';
  const m = Math.round(hours * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
export function hmShort(hours) {
  if (!Number.isFinite(hours)) return '—';
  const m = Math.round(hours * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
const SPEEDS = [60, 600, 3600];

export function mountRoverPanel(el, ctx) {
  if (!el) return { destroy() {} };
  injectStyle();
  const bus = ctx?.bus ?? document;
  const cap = C.rover.battery_usable_kWh;
  const st = { payload: C.rover.payload_default_kg, poiId: null, out: null, back: null, segs: [], t: 0, speed: 600, playing: false, raf: 0, last: 0 };
  let charts = [];

  const emit = (s_km) => bus.dispatchEvent(new CustomEvent('traverse:progress', { detail: { mode: 'rover', id: st.poiId, s_km } }));

  function stop(clearMarker = false) {
    st.playing = false;
    cancelAnimationFrame(st.raf);
    const btn = el.querySelector('.rv-play');
    if (btn) btn.textContent = st.t > 0 && !stateAt(st.segs, st.t)?.done ? 'Resume' : 'Simulate traverse';
    if (clearMarker) emit(null);
  }

  function select(id) {
    stop(true);
    st.poiId = id;
    st.t = 0;
    st.out = id ? ctx.data.getRoute(id, 'rover', 'out') : null;
    st.back = id ? ctx.data.getRoute(id, 'rover', 'back') : null;
    render();
  }

  function compute() {
    const opts = { payload_kg: st.payload };
    const o = routeSummary(st.out, opts);
    const b = st.back ? routeSummary(st.back, opts) : null;
    const v = verdict(o.E_total_kWh, b ? b.E_total_kWh : Infinity);
    st.segs = timeline(st.out.points, opts);
    return { o, b, v };
  }

  function summaryHTML({ o, b, v }) {
    const row = (name, key, s) => `<tr data-row="${key}"><td>${name}</td>
      <td data-k="${key}.E_total_kWh" data-v="${s.E_total_kWh}">${f(s.E_total_kWh, 1)}</td>
      <td data-k="${key}.battery_pct" data-v="${s.battery_pct}">${f(s.battery_pct, 0)} %</td>
      <td>${f(s.kWh_per_100km, 1)}</td><td>${hmShort(s.time_h)}</td>
      <td>${f(s.ascent_m, 0)} / ${f(s.descent_m, 0)}</td><td>${f(s.max_grade_deg, 1)}°</td></tr>`;
    const tot = b ? {
      E_total_kWh: o.E_total_kWh + b.E_total_kWh, battery_pct: o.battery_pct + b.battery_pct,
      kWh_per_100km: (100 * (o.E_total_kWh + b.E_total_kWh)) / (o.length_km + b.length_km), time_h: o.time_h + b.time_h,
      ascent_m: o.ascent_m + b.ascent_m, descent_m: o.descent_m + b.descent_m, max_grade_deg: Math.max(o.max_grade_deg, b.max_grade_deg),
    } : null;
    const cls = { 'ROUND TRIP OK': 'ok', 'ONE-WAY ONLY': 'oneway', 'NOT REACHABLE': 'no' }[v.verdict];
    const limit = (1 - C.rover.reserve_frac) * cap;
    const note = v.verdict === 'NOT REACHABLE'
      ? `Needs ${f(o.E_total_kWh, 1)} kWh one way; the battery holds ${f(cap, 0)} kWh.`
      : `Battery left on arrival ${f(v.left_kWh, 1)} kWh (${f((100 * v.left_kWh) / cap, 0)} %). Round trip limit ${f(limit, 1)} kWh with a ${f(100 * C.rover.reserve_frac, 0)} % reserve.`;
    return {
      verdict: `<span class="rv-badge ${cls}" data-verdict="${v.verdict}">${v.verdict}</span>`,
      body: `<small class="rv-note">${note}</small>
      <table aria-label="Rover energy summary"><thead><tr><th>Leg</th><th title="Energy used">kWh</th><th>Battery</th><th>kWh/100 km</th><th title="hours:minutes">Time</th><th title="Ascent / descent in metres">Up / down m</th><th title="Maximum grade">Max</th></tr></thead>
      <tbody>${row('Out', 'out', o)}${b ? row('Back', 'back', b) : ''}${tot ? row('Round trip', 'total', tot).replace('<tr ', '<tr class="total" ') : ''}</tbody></table>`,
    };
  }

  function render() {
    charts.forEach((c) => c.destroy());
    charts = [];
    if (!st.poiId || !st.out) {
      el.innerHTML = `<div class="rv"><p class="rv-empty">${st.poiId ? 'No rover route for this point of interest.' : 'Select a point of interest to see rover energy, battery and a simulated traverse.'}</p></div>`;
      return;
    }
    const poi = ctx.data.getPOI(st.poiId);
    const sum = summaryHTML(compute());
    el.innerHTML = `<div class="rv" data-poi="${st.poiId}">
      <div class="rv-col">
        <div class="rv-top">
          <div class="rv-payload"><label for="rv-payload">Payload (kg)</label>
            <input id="rv-payload" type="number" inputmode="numeric" min="0" max="${C.rover.payload_max_kg}" step="1" value="${st.payload}" aria-describedby="rv-msg"></div>
          <div class="rv-verdict">${sum.verdict}</div>
        </div>
        <span class="rv-msg" id="rv-msg" role="alert"></span>
        <div class="rv-summary">${sum.body}</div>
      </div>
      <div class="rv-col">
        <canvas class="rv-elev" aria-label="Elevation profile of the out route"></canvas>
        <canvas class="rv-power" aria-label="Battery power along the out route"></canvas>
      </div>
      <div class="rv-col">
        <div class="rv-controls" role="group" aria-label="Simulate traverse">
          <button type="button" class="rv-play">Simulate traverse</button>
          ${SPEEDS.map((s) => `<button type="button" class="rv-speed" data-speed="${s}" aria-pressed="${s === st.speed}">×${s}</button>`).join('')}
          <button type="button" class="rv-reset">Reset</button>
        </div>
        <div class="rv-bar" aria-hidden="true"><i style="width:100%"></i></div>
        <dl class="rv-gauges" aria-live="off">
          ${[['speed', 'Speed'], ['battery', 'Battery'], ['energy', 'Energy used'], ['power', 'Power'], ['grade', 'Grade'], ['remaining', 'Remaining'], ['eta', 'ETA'], ['dose', 'Dose'], ['tbatt', 'Battery temp']]
            .map(([k, l]) => `<div${k === 'tbatt' ? ' class="wide"' : ''}><dt>${l}</dt><dd data-g="${k}"></dd></div>`).join('')}
        </dl>
      </div></div>`;
    el.querySelector('.rv-payload input').addEventListener('change', onPayload);
    el.querySelector('.rv-play').addEventListener('click', () => (st.playing ? stop() : play()));
    el.querySelectorAll('.rv-speed').forEach((b) => b.addEventListener('click', () => {
      st.speed = Number(b.dataset.speed);
      el.querySelectorAll('.rv-speed').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    el.querySelector('.rv-reset').addEventListener('click', () => { stop(true); st.t = 0; paint(); });
    const pts = st.out.points;
    const x = pts.map((p) => p.s_km);
    const segX = st.segs.flatMap((s) => [s.s0, s.s1]);
    const segP = st.segs.flatMap((s) => [s.P_W / 1000, s.P_W / 1000]);
    const rover = getComputedStyle(el).getPropertyValue('--rover').trim() || '#7fb8ea'; // canvas cannot resolve var()
    charts = [
      lineChart(el.querySelector('.rv-elev'), [{ name: 'Elevation', x, y: pts.map((p) => p.z_m) }],
        { title: `Elevation (m), AP-1 to ${poi.short}`, xLabel: 'km', color: rover, fill: true }),
      lineChart(el.querySelector('.rv-power'), [{ name: 'Power', x: segX, y: segP }],
        { title: 'Battery power (kW)', xLabel: 'km', digits: 1, yMin: 0, color: rover }),
    ];
    paint();
  }

  function paint() {
    const s = stateAt(st.segs, st.t);
    if (!s) return;
    const used_kWh = s.E_J / 3.6e6;
    const pct = 100 * (1 - used_kWh / cap);
    const set = (k, txt, v) => { const d = el.querySelector(`[data-g="${k}"]`); if (d) { d.textContent = txt; if (v != null) d.dataset.v = v; } };
    set('speed', s.done ? '0.0 km/h' : `${f(C.rover.v_ms * 3.6, 1)} km/h`, s.done ? 0 : C.rover.v_ms * 3.6);
    set('battery', `${f(pct, 1)} %`, pct);
    set('energy', `${f(used_kWh, 2)} kWh`, used_kWh);
    set('power', s.done ? '0.00 kW' : `${f(s.P_W / 1000, 2)} kW`, s.done ? 0 : s.P_W / 1000);
    set('grade', `${s.grade_deg >= 0 ? '+' : ''}${f(s.grade_deg, 1)}°`, s.grade_deg);
    set('remaining', `${f(s.total_s_km - s.s_km, 1)} km`, s.total_s_km - s.s_km);
    set('eta', s.done ? 'Arrived' : `${hm((s.total_t_s - s.t_s) / 3600)} left`, (s.total_t_s - s.t_s) / 3600);
    set('dose', `${f(dose_mGy(s.t_s / 3600), 3)} mGy`, dose_mGy(s.t_s / 3600));
    set('tbatt', `${f(C.rover.T_batt_set_K - 273.15, 0)} °C, held by heater`, C.rover.T_batt_set_K);
    const bar = el.querySelector('.rv-bar i');
    if (bar) bar.style.width = `${Math.max(0, pct).toFixed(1)}%`;
    charts.forEach((c) => c.setCursor(st.t > 0 ? s.s_km : null));
    el.querySelector('.rv')?.setAttribute('data-done', String(s.done));
    return s;
  }

  function frame(now) {
    if (!st.playing) return;
    const dt = Math.min(0.25, (now - st.last) / 1000);
    st.last = now;
    st.t += dt * st.speed;
    const s = paint();
    emit(s.s_km);
    if (s.done) { stop(); return; }
    st.raf = requestAnimationFrame(frame);
  }

  function play() {
    if (!st.segs.length) return;
    if (stateAt(st.segs, st.t).done) st.t = 0;
    st.playing = true;
    st.last = performance.now();
    el.querySelector('.rv-play').textContent = 'Pause';
    st.raf = requestAnimationFrame(frame);
  }

  function onPayload(e) {
    const r = validatePayload(e.target.value);
    const msg = el.querySelector('.rv-msg');
    e.target.setAttribute('aria-invalid', String(!r.ok));
    msg.textContent = r.message;
    if (!r.ok) return;
    st.payload = r.value;
    stop(true);
    st.t = 0;
    const sum = summaryHTML(compute());
    el.querySelector('.rv-summary').innerHTML = sum.body;
    el.querySelector('.rv-verdict').innerHTML = sum.verdict;
    const segX = st.segs.flatMap((s) => [s.s0, s.s1]);
    charts[1]?.update([{ name: 'Power', x: segX, y: st.segs.flatMap((s) => [s.P_W / 1000, s.P_W / 1000]) }]);
    paint();
  }

  const onSelected = (e) => select(e.detail?.id ?? null);
  const onCleared = () => select(null);
  const onMode = (e) => { if (e.detail?.mode !== 'rover') stop(true); };
  bus.addEventListener('poi:selected', onSelected);
  bus.addEventListener('poi:cleared', onCleared);
  bus.addEventListener('mode:changed', onMode);
  select(ctx?.getState?.().poiId ?? null);

  return {
    destroy() {
      stop(true);
      charts.forEach((c) => c.destroy());
      bus.removeEventListener('poi:selected', onSelected);
      bus.removeEventListener('poi:cleared', onCleared);
      bus.removeEventListener('mode:changed', onMode);
      el.innerHTML = '';
    },
    _state: st,
  };
}
