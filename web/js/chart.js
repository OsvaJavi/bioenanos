// STUB created by M0 — final signature, owned by M4 (spec §3.5). Replace the body; keep the signature.
// Own canvas line chart, no external libraries. series = [{name, x: number[], y: number[]}]; returns {update(series), destroy()}.
export function lineChart(canvas, series, opts = {}) {
  const ctx2d = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (ctx2d) {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.fillStyle = '#8fa';
    ctx2d.font = '12px monospace';
    ctx2d.fillText('Pending module M4 — chart', 8, 18);
  }
  return { update() {}, destroy() {} };
}
