// Own canvas line chart, no external libraries (spec M4). Shared with M5 (which must not modify it).
//   const ch = lineChart(canvas, [{name, x: number[], y: number[], color?}], opts)
//   ch.update(series?, opts?) · ch.setCursor(x | null) · ch.destroy()
// opts: {title, xLabel, yLabel, color, yMin, yMax, markers: [{x, label}], fill: bool, digits}
// Colours default to the page's CSS variables (--rover, --walker, --mode, --text, --muted, --line).
const DPR = () => (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

function cssVar(el, name, fallback) {
  try {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** "Nice" tick values covering [lo, hi] (about n ticks). Exported for tests. */
export function niceTicks(lo, hi, n = 4) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi === lo) { hi = lo + 1; lo -= 1; }
  const raw = (hi - lo) / n;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

export function lineChart(canvas, series, opts = {}) {
  if (!canvas || !canvas.getContext) return { update() {}, setCursor() {}, destroy() {} };
  const g = canvas.getContext('2d');
  let S = series ?? [];
  let O = { ...opts };
  let cursor = null;
  let ro = null;

  function size() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width));
    const h = Math.max(10, Math.round(r.height));
    const d = DPR();
    if (canvas.width !== w * d || canvas.height !== h * d) { canvas.width = w * d; canvas.height = h * d; }
    g.setTransform(d, 0, 0, d, 0, 0);
    return { w, h };
  }

  function draw() {
    const { w, h } = size();
    const text = cssVar(canvas, '--text', '#e6ddd0');
    const muted = cssVar(canvas, '--muted', '#9fadbd');
    const line = cssVar(canvas, '--line', '#2b3b50');
    const accent = O.color ?? cssVar(canvas, '--mode', '#7fb8ea');
    const font = `11px ${cssVar(canvas, '--font', 'monospace')}`;
    g.clearRect(0, 0, w, h);
    g.font = font;
    const pad = { l: 52, r: 10, t: O.title ? 18 : 8, b: 22 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    g.textAlign = 'left'; // canvas state persists between draws: reset before every text block
    if (O.title) { g.fillStyle = text; g.textBaseline = 'top'; g.fillText(O.title, pad.l, 2); }
    const xs = S.flatMap((s) => s.x);
    const ys = S.flatMap((s) => s.y).filter(Number.isFinite);
    if (!xs.length || !ys.length || pw <= 0 || ph <= 0) {
      g.fillStyle = muted; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillText(O.empty ?? 'No data', pad.l, pad.t + ph / 2);
      return;
    }
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    let y0 = O.yMin ?? Math.min(...ys);
    let y1 = O.yMax ?? Math.max(...ys);
    if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
    const yt = niceTicks(y0, y1, 3);
    if (O.yMin == null && yt.length) y0 = Math.min(y0, yt[0]);
    if (O.yMax == null && yt.length) y1 = Math.max(y1, yt[yt.length - 1]);
    const X = (v) => pad.l + ((v - x0) / (x1 - x0 || 1)) * pw;
    const Y = (v) => pad.t + ph - ((v - y0) / (y1 - y0 || 1)) * ph;
    // grid + y ticks
    g.strokeStyle = line; g.lineWidth = 1; g.fillStyle = muted; g.textBaseline = 'middle'; g.textAlign = 'right';
    const dig = O.digits ?? 0;
    for (const v of yt) {
      if (v < y0 - 1e-9 || v > y1 + 1e-9) continue;
      g.beginPath(); g.moveTo(pad.l, Y(v) + 0.5); g.lineTo(pad.l + pw, Y(v) + 0.5); g.stroke();
      g.fillText(v.toFixed(dig), pad.l - 6, Y(v));
    }
    // x ticks
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (const v of niceTicks(x0, x1, 5)) {
      if (v < x0 - 1e-9 || v > x1 + 1e-9) continue;
      g.fillText(String(+v.toFixed(2)), X(v), pad.t + ph + 5);
    }
    if (O.xLabel) { g.textAlign = 'right'; g.fillText(O.xLabel, pad.l + pw, pad.t + ph + 5 + 0); }
    if (O.yLabel) { g.save(); g.translate(11, pad.t + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(O.yLabel, 0, 0); g.restore(); }
    // markers (e.g. EVA boundaries for M5)
    for (const m of O.markers ?? []) {
      const mx = X(m.x);
      g.strokeStyle = muted; g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(mx + 0.5, pad.t); g.lineTo(mx + 0.5, pad.t + ph); g.stroke(); g.setLineDash([]);
      if (m.label) { g.fillStyle = muted; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(m.label, mx + 3, pad.t + 1); }
    }
    // series
    for (const s of S) {
      const col = s.color ?? accent;
      g.strokeStyle = col; g.lineWidth = 1.6; g.lineJoin = 'round';
      g.beginPath();
      let started = false;
      for (let k = 0; k < s.x.length; k++) {
        if (!Number.isFinite(s.y[k])) { started = false; continue; }
        const px = X(s.x[k]); const py = Y(s.y[k]);
        if (!started) { g.moveTo(px, py); started = true; } else g.lineTo(px, py);
      }
      g.stroke();
      if (O.fill && s.x.length > 1) {
        g.lineTo(X(s.x[s.x.length - 1]), pad.t + ph); g.lineTo(X(s.x[0]), pad.t + ph); g.closePath();
        g.globalAlpha = 0.12; g.fillStyle = col; g.fill(); g.globalAlpha = 1;
      }
    }
    // cursor
    if (cursor != null && cursor >= x0 && cursor <= x1) {
      g.strokeStyle = text; g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(cursor) + 0.5, pad.t); g.lineTo(X(cursor) + 0.5, pad.t + ph); g.stroke();
    }
  }

  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
  }
  draw();
  return {
    update(series2, opts2) { if (series2) S = series2; if (opts2) O = { ...O, ...opts2 }; draw(); },
    setCursor(x) { cursor = x; draw(); },
    destroy() { ro?.disconnect(); g.clearRect(0, 0, canvas.width, canvas.height); },
  };
}
