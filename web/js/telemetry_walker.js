// On-foot telemetry panel (spec M5, §6.4–6.6): astronaut form with validation, round-trip summary (EVAs, kcal, VO₂,
// O₂ required in litres STPD + kg + max per EVA), alerts, and a playback of the whole round trip with biometric gauges
// and EVA separators. Reuses chart.js and env_strip.js from M4 unchanged. Emits traverse:progress {mode:'walker', ...}.
import { C } from './constants.js';
import { lineChart } from './chart.js';
import {
  FIELDS, defaultForm, fromForm, o2Plan, roundTripTimeline, segment, validateForm, walkerStateAt,
} from './models/walker.js';

const STYLE_ID = 'telemetry-walker-style';
const CSS = `
.wk { display: grid; grid-template-columns: minmax(330px, 1.05fr) minmax(250px, 0.85fr) minmax(280px, 1fr) minmax(190px, 0.6fr); gap: 18px; height: 100%; }
.wk-col { min-width: 0; overflow: hidden; display: flex; flex-direction: column; gap: 6px; }
.wk-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px 10px; margin: 0; }
.wk-form label { display: flex; flex-direction: column; gap: 0; font-size: 11px; line-height: 1.25; color: var(--muted); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wk-form input, .wk-form select { background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 3px; padding: 1px 5px; font: 12px var(--font); width: 100%; height: 21px; }
.wk-form input[type="range"] { padding: 0; accent-color: var(--walker); }
.wk-form [aria-invalid="true"] { border-color: var(--alert); }
.wk-err { color: var(--alert); font-size: 12px; min-height: 1em; }
.wk-o2 { display: flex; align-items: baseline; gap: 8px; }
.wk-o2 b { white-space: nowrap; }
.wk-o2 > span { font-size: 11px; line-height: 1.3; }
.wk-o2 b { font-size: 22px; color: var(--walker); font-variant-numeric: tabular-nums; }
.wk-o2 span { color: var(--muted); font-size: 12px; }
.wk dl.wk-sum { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; margin: 0; font-size: 12px; }
.wk dl.wk-sum dt { color: var(--muted); }
.wk dl.wk-sum dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.wk-alerts { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 3px; font-size: 11px; line-height: 1.35; }
.wk-alerts li { color: var(--walker); border-left: 2px solid var(--walker); padding-left: 6px; }
.wk-alerts li.bad { color: var(--alert); border-color: var(--alert); }
.wk-stale { color: var(--muted); font-size: 12px; }
.wk canvas { width: 100%; flex: 1 1 0; min-height: 70px; display: block; }
.wk-summary { overflow-y: auto; }
.wk-controls { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.wk-controls button { background: var(--panel-2); color: var(--text); border: 1px solid var(--line); border-radius: 3px; padding: 3px 9px; cursor: pointer; font: inherit; }
.wk-controls button[aria-pressed="true"] { border-color: var(--walker); color: var(--walker); }
.wk-controls .wk-play { border-color: var(--walker); }
.wk-gauges { display: grid; grid-template-columns: 1fr; gap: 1px; margin: 0; font-size: 12px; }
.wk-gauges div { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--line); padding: 1px 0; }
.wk-gauges dt { color: var(--muted); }
.wk-gauges dd { margin: 0; font-variant-numeric: tabular-nums; white-space: nowrap; }
.wk-empty { color: var(--muted); padding: 6px 0; }
.wk-status { color: var(--muted); font-size: 12px; }
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const hm = (h) => {
  if (!Number.isFinite(h)) return '—';
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};
const SPEEDS = [600, 3600, 36000];
export const MULTI_EVA_ALERT = 'Multi-EVA traverse — overnight shelter and resupply are not modeled';

/** Summary + alerts for a round trip with a given walker (pure; exported for tests). */
export function walkerSummary(out, back, w, plan) {
  const segs = [];
  let pMin = Infinity;
  let pMax = -Infinity;
  let kcal = 0;
  for (const r of [out, back]) {
    if (!r) continue;
    const p = r.points;
    for (let k = 1; k < p.length; k++) {
      const s = segment(w, 1000 * (p[k].s_km - p[k - 1].s_km), p[k].grade_deg, p[k].rough);
      segs.push({ t_s: s.t_s, O2_L: s.O2_L });
      kcal += s.E_kcal;
      pMin = Math.min(pMin, s.P_total_W);
      pMax = Math.max(pMax, s.P_total_W);
    }
  }
  const o2 = o2Plan(segs, plan);
  const tl = roundTripTimeline(out, back, w, plan);
  const tcMax = Math.max(...tl.segs.map((s) => s.tc1));
  const alerts = [];
  if (o2.n_evas > 1) alerts.push({ key: 'multi-eva', bad: false, text: `${MULTI_EVA_ALERT}.` });
  if (tcMax > C.bio.Tc_alert_C) alerts.push({ key: 'core-temp', bad: true, text: `Core temp up to ${f(tcMax, 1)} °C (limit ${C.bio.Tc_alert_C} °C).` });
  if (pMin < C.walker.P_warn_min_W || pMax > C.walker.P_warn_max_W) {
    alerts.push({ key: 'metabolic', bad: true, text: `Metabolic rate ${f(pMin, 0)}–${f(pMax, 0)} W: outside typical EVA metabolic range (${C.walker.P_warn_min_W}–${C.walker.P_warn_max_W} W).` });
  }
  return { o2, kcal, tl, tcMax, pMin, pMax, alerts, km_out: out ? out.length_km_3d : 0, km_back: back ? back.length_km_3d : 0 };
}

export function mountWalkerPanel(el, ctx) {
  if (!el) return { destroy() {} };
  injectStyle();
  const bus = ctx?.bus ?? document;
  const st = { form: defaultForm(), poiId: null, out: null, back: null, res: null, t: 0, speed: 3600, playing: false, raf: 0, last: 0 };
  let chart = null;

  const emit = (s_km) => bus.dispatchEvent(new CustomEvent('traverse:progress', { detail: { mode: 'walker', id: st.poiId, s_km } }));

  function stop(clearMarker = false) {
    st.playing = false;
    cancelAnimationFrame(st.raf);
    const btn = el.querySelector('.wk-play');
    if (btn) btn.textContent = st.t > 0 && st.res && !walkerStateAt(st.res.tl, st.t, st.plan?.eva_limit_h).done ? 'Resume' : 'Simulate traverse';
    if (clearMarker) emit(null);
  }

  function formHTML() {
    const v = st.form;
    const num = (k) => {
      const [label, lo, hi, unit, step] = FIELDS[k];
      const type = k === 'k_suit' ? 'range' : 'number';
      return `<label>${label} (${unit})<input name="${k}" type="${type}" min="${lo}" max="${hi}" step="${step}" value="${v[k]}" ${type === 'range' ? `aria-valuetext="${v[k]}"` : ''}></label>`;
    };
    const levels = Object.entries(C.walker.vo2max_levels);
    return `<form class="wk-form" aria-label="Astronaut" novalidate>
      ${num('H_cm')}${num('W')}
      <label>Sex<select name="sex"><option value="M"${v.sex === 'M' ? ' selected' : ''}>M</option><option value="F"${v.sex === 'F' ? ' selected' : ''}>F</option></select></label>
      ${num('age')}
      <label>Fitness (VO₂max)<select name="fitness">${levels.map(([k, val]) => `<option value="${k}"${v.fitness === k ? ' selected' : ''}>${k} ${val}</option>`).join('')}</select></label>
      ${num('L_suit')}${num('L_gear')}${num('v')}${num('hr_rest')}${num('eva_limit_h')}${num('reserve_min')}${num('contingency_pct')}
      <label><span>Suit penalty <span data-ks>×${f(Number(v.k_suit), 2)}</span></span><input name="k_suit" type="range" min="1" max="1.5" step="0.05" value="${v.k_suit}"></label>
    </form><div class="wk-err" id="wk-err" role="alert"></div>`;
  }

  function summaryHTML() {
    const r = st.res;
    if (!r) return '<p class="wk-stale">Fix the highlighted field to recalculate.</p>';
    const o = r.o2;
    return `<div class="wk-o2"><b data-s="O2_required_L" data-v="${o.O2_required_L}">${f(o.O2_required_L, 0)} L</b>
        <span>Oxygen required (L, STP), <span data-s="O2_required_kg" data-v="${o.O2_required_kg}">${f(o.O2_required_kg, 2)} kg</span></span></div>
      <dl class="wk-sum">
        <dt>Max O₂ in one EVA</dt><dd data-s="O2_max_per_EVA_L" data-v="${o.O2_max_per_EVA_L}">${f(o.O2_max_per_EVA_L, 0)} L</dd>
        <dt>EVAs required</dt><dd data-s="n_evas" data-v="${o.n_evas}" data-single="${o.single_eva_feasible}">${o.n_evas}${o.single_eva_feasible ? ' (single EVA)' : ''}</dd>
        <dt>Round trip</dt><dd data-s="t_round_h" data-v="${o.t_round_h}">${f(r.km_out + r.km_back, 1)} km, ${hm(o.t_round_h)}</dd>
        <dt>Energy</dt><dd data-s="kcal" data-v="${r.kcal}">${f(r.kcal, 0)} kcal</dd>
        <dt>Mean VO₂</dt><dd data-s="VO2_mean" data-v="${o.VO2_mean_Lmin}">${f(o.VO2_mean_Lmin, 2)} L/min</dd>
      </dl>
      <ul class="wk-alerts">${r.alerts.map((a) => `<li class="${a.bad ? 'bad' : ''}" data-alert="${a.key}">${a.text}</li>`).join('')}</ul>`;
  }

  function compute() {
    const val = validateForm(st.form);
    const err = el.querySelector('#wk-err');
    el.querySelectorAll('.wk-form [name]').forEach((i) => i.setAttribute('aria-invalid', String(i.name in val.errors)));
    if (err) err.textContent = Object.values(val.errors)[0] ?? '';
    if (!val.ok) { st.res = null; return; }
    const { w, plan } = fromForm(val.values);
    st.w = w;
    st.plan = plan;
    st.res = walkerSummary(st.out, st.back, w, plan);
  }

  function select(id) {
    stop(true);
    st.poiId = id;
    st.t = 0;
    st.out = id ? ctx.data.getRoute(id, 'walker', 'out') : null;
    st.back = id ? ctx.data.getRoute(id, 'walker', 'back') : null;
    render();
  }

  function render() {
    chart?.destroy();
    chart = null;
    if (!st.poiId || !st.out) {
      el.innerHTML = `<div class="wk"><p class="wk-empty">${st.poiId ? 'No on-foot route for this point of interest.' : 'Select a point of interest to plan an on-foot traverse: EVAs, oxygen and biometrics.'}</p></div>`;
      return;
    }
    el.innerHTML = `<div class="wk" data-poi="${st.poiId}">
      <div class="wk-col">${formHTML()}</div>
      <div class="wk-col wk-summary"></div>
      <div class="wk-col">
        <div class="wk-controls" role="group" aria-label="Simulate traverse">
          <button type="button" class="wk-play">Simulate traverse</button>
          ${SPEEDS.map((s) => `<button type="button" class="wk-speed" data-speed="${s}" aria-pressed="${s === st.speed}">×${s}</button>`).join('')}
          <button type="button" class="wk-reset">Reset</button>
        </div>
        <div class="wk-status" aria-live="off"></div>
        <canvas class="wk-chart" aria-label="Elevation along the round trip with EVA boundaries"></canvas>
      </div>
      <div class="wk-col">
        <dl class="wk-gauges">
          ${[['eva', 'EVA'], ['hr', 'Heart rate'], ['vo2', 'VO₂'], ['kcal', 'Energy'], ['o2', 'O₂ used'], ['hyd', 'Hydration loss'], ['tc', 'Core temp (est.)'], ['dose', 'Dose'], ['dist', 'Walked']]
            .map(([k, l]) => `<div title="${l}"><dt>${l}</dt><dd data-g="${k}"></dd></div>`).join('')}
        </dl>
      </div></div>`;
    const form = el.querySelector('.wk-form');
    form.addEventListener('change', onForm);
    form.addEventListener('input', (e) => { if (e.target.name === 'k_suit') el.querySelector('[data-ks]').textContent = `×${f(Number(e.target.value), 2)}`; });
    form.addEventListener('submit', (e) => e.preventDefault());
    el.querySelector('.wk-play').addEventListener('click', () => (st.playing ? stop() : play()));
    el.querySelectorAll('.wk-speed').forEach((b) => b.addEventListener('click', () => {
      st.speed = Number(b.dataset.speed);
      el.querySelectorAll('.wk-speed').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    el.querySelector('.wk-reset').addEventListener('click', () => { stop(true); st.t = 0; paint(); });
    compute();
    refresh();
  }

  function refresh() {
    el.querySelector('.wk-summary').innerHTML = summaryHTML();
    const color = getComputedStyle(el).getPropertyValue('--walker').trim() || '#e0a867'; // canvas cannot resolve var()
    const r = st.res;
    const series = r ? [{ name: 'Elevation', x: r.tl.segs.flatMap((s) => [s.s0, s.s1]), y: r.tl.segs.flatMap((s) => [s.z0, s.z1]) }] : [];
    const opts = { title: `Elevation (m), round trip to ${ctx.data.getPOI(st.poiId).short} and back`, xLabel: 'km', color, fill: true,
      markers: r ? r.tl.evaMarks.map((m) => ({ x: m.s_km, label: m.label })) : [], empty: 'Fix the form to see the profile' };
    if (!chart) chart = lineChart(el.querySelector('.wk-chart'), series, opts);
    else chart.update(series, opts);
    paint();
  }

  function paint() {
    const set = (k, txt, v) => { const d = el.querySelector(`[data-g="${k}"]`); if (d) { d.textContent = txt; if (v != null) d.dataset.v = v; } };
    if (!st.res) { el.querySelectorAll('[data-g]').forEach((d) => { d.textContent = '—'; }); return null; }
    const s = walkerStateAt(st.res.tl, st.t, st.plan.eva_limit_h);
    set('eva', `${s.eva} of ${st.res.o2.n_evas}`, s.eva);
    set('hr', s.done ? '—' : `${f(s.HR, 0)} bpm`, s.HR);
    set('vo2', s.done ? '—' : `${f(s.VO2_Lmin, 2)} L/min`, s.VO2_Lmin);
    set('kcal', `${f(s.kcal, 0)} kcal`, s.kcal);
    set('o2', `${f(s.O2_L, 1)} L`, s.O2_L);
    set('hyd', `${f(s.sweat_L, 2)} L`, s.sweat_L);
    set('tc', `${f(s.Tc, 2)} °C`, s.Tc);
    set('dose', `${f(s.dose_mGy, 3)} mGy`, s.dose_mGy);
    set('dist', `${f(s.s_km, 1)} km`, s.s_km);
    const status = el.querySelector('.wk-status');
    if (status) status.textContent = s.done ? `Back at AP-1 after ${hm(s.t_s / 3600)}` : `${hm(s.t_s / 3600)} elapsed, ${f(s.total_s_km - s.s_km, 1)} km to go${s.leg === 'back' ? ' (return leg)' : ''}`;
    chart?.setCursor(st.t > 0 ? s.s_km : null);
    el.querySelector('.wk')?.setAttribute('data-done', String(s.done));
    return s;
  }

  function frame(now) {
    if (!st.playing) return;
    const dt = Math.min(0.25, (now - st.last) / 1000);
    st.last = now;
    st.t += dt * st.speed;
    const s = paint();
    if (!s) { stop(); return; }
    // the map marker lives on the OUT route: on the way back, mirror the fraction of the back leg onto it
    const outLen = st.out.length_km_3d;
    emit(s.leg === 'out' ? s.outS_km : outLen * (1 - s.legFrac));
    if (s.done) { stop(); return; }
    st.raf = requestAnimationFrame(frame);
  }

  function play() {
    if (!st.res) return;
    if (walkerStateAt(st.res.tl, st.t, st.plan.eva_limit_h).done) st.t = 0;
    st.playing = true;
    st.last = performance.now();
    el.querySelector('.wk-play').textContent = 'Pause';
    st.raf = requestAnimationFrame(frame);
  }

  function onForm(e) {
    const t = e.target;
    if (!t.name) return;
    st.form = { ...st.form, [t.name]: t.value };
    stop(true);
    st.t = 0;
    compute();
    refresh();
  }

  const onSelected = (e) => select(e.detail?.id ?? null);
  const onCleared = () => select(null);
  const onMode = (e) => { if (e.detail?.mode !== 'walker') stop(true); };
  bus.addEventListener('poi:selected', onSelected);
  bus.addEventListener('poi:cleared', onCleared);
  bus.addEventListener('mode:changed', onMode);
  select(ctx?.getState?.().poiId ?? null);

  return {
    destroy() {
      stop(true);
      chart?.destroy();
      bus.removeEventListener('poi:selected', onSelected);
      bus.removeEventListener('poi:cleared', onCleared);
      bus.removeEventListener('mode:changed', onMode);
      el.innerHTML = '';
    },
    _state: st,
  };
}
