// STUB created by M0 — final signature, owned by M4 (spec §3.5). Replace the body; keep the signature.
// Environment strip: T, P, rho (at the mean z of the selected route), irradiance (tau 0.4 / 2.0), dose rate.
export function mountEnvStrip(el, ctx) {
  if (el) el.innerHTML = '<div class="pending-module">Pending module M4 — environment strip</div>';
  return { destroy() { if (el) el.innerHTML = ''; } };
}
