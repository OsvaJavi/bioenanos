// STUB created by M0 — final signature, owned by M5 (spec §3.5). Replace the body; keep the signature.
// ctx = {data, bus: document, getState} (spec M3 'Contratos expuestos'); getState() -> {mode, poiId}.
export function mountWalkerPanel(el, ctx) {
  if (el) el.innerHTML = '<div class="pending-module">Pending module M5 — on-foot telemetry</div>';
  return { destroy() { if (el) el.innerHTML = ''; } };
}
