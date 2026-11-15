// STUB created by M0 — final signature, owned by M4 (spec §3.5). Replace the body; keep the signature.
// ctx = {data, bus: document, getState} (spec M3 'Contratos expuestos'); getState() -> {mode, poiId}.
export function mountRoverPanel(el, ctx) {
  if (el) el.innerHTML = '<div class="pending-module">Pending module M4 — rover telemetry</div>';
  return { destroy() { if (el) el.innerHTML = ''; } };
}
