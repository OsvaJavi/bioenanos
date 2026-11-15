// Leaflet map in LEQ km (spec §3.3): L.CRS.Simple, 1 map unit = 1 km, L.latLng(y_km, x_km).
// Exposes a small API used by ui.js/main.js; knows nothing about the DOM outside its container.
import * as L from '../vendor/leaflet/leaflet-src.esm.js';
import { llToXYkm, xyKmToLL } from './geo.js';
import { formatLatLon, layerUrl, pointAtS } from './data.js';

const ll = (x_km, y_km) => L.latLng(y_km, x_km);
const boundsOf = (b) => L.latLngBounds([b.y_min, b.x_min], [b.y_max, b.x_max]);

/** Scale bar in km (Leaflet's own scale assumes metres and a geographic CRS). LEQ km ≈ real km (±2 %). */
const ScaleBar = L.Control.extend({
  options: { position: 'bottomleft', maxPx: 120 },
  onAdd(map) {
    this._el = L.DomUtil.create('div', 'scale-bar');
    this._el.setAttribute('aria-hidden', 'true');
    map.on('zoomend moveend resize', this._update, this);
    this._update();
    return this._el;
  },
  onRemove(map) { map.off('zoomend moveend resize', this._update, this); },
  _update() {
    const map = this._map;
    const y = map.getSize().y / 2;
    const maxKm = map.containerPointToLatLng([this.options.maxPx, y]).lng - map.containerPointToLatLng([0, y]).lng;
    const pow = 10 ** Math.floor(Math.log10(maxKm));
    const nice = [5, 2, 1].map((m) => m * pow).find((v) => v <= maxKm) ?? pow;
    const px = Math.round((nice / maxKm) * this.options.maxPx);
    const label = nice >= 1 ? `${nice} km` : `${Math.round(nice * 1000)} m`;
    this._el.innerHTML = `<div>${label}</div><div class="scale-bar-line" style="width:${px}px"></div>`;
  },
});

export function createMap(el, { layersDoc, base, pois, onSelect, onCursor, onLayerStatus }) {
  const g = layersDoc.grid;
  const region = L.latLngBounds([g.y_min_km, g.x_min_km], [g.y_max_km, g.x_max_km]);
  const map = L.map(el, {
    crs: L.CRS.Simple, minZoom: 1, maxZoom: 8, zoomSnap: 0.25, zoomDelta: 0.5,
    maxBounds: region.pad(0.25), attributionControl: false, keyboard: true,
  });
  map.fitBounds(region);
  new ScaleBar().addTo(map);
  map.createPane('detailPane').style.zIndex = 420;
  map.createPane('routePane').style.zIndex = 450;

  let overlay = null;
  let detailOverlay = null;
  const markers = new Map();
  let routeLayers = [];
  let progress = null;
  const svg = L.svg({ pane: 'routePane' });

  // --- base and POI markers (spec M3: AP-1 with its own icon; POIs with permanent short labels)
  const baseMarker = L.marker(ll(...xyOf(base)), {
    icon: L.divIcon({ className: 'base-marker', html: '<span></span>', iconSize: [22, 22] }),
    keyboard: false, title: base.name, alt: base.name,
  }).bindTooltip(base.short ?? base.id, { permanent: true, direction: 'right', offset: [12, 0], className: 'base-label' });
  baseMarker.addTo(map);
  for (const p of pois) {
    const m = L.marker(ll(...xyOf(p)), {
      icon: L.divIcon({ className: 'poi-marker', html: '<span></span>', iconSize: [18, 18] }),
      title: p.name, alt: p.name, keyboard: true, riseOnHover: true,
    }).bindTooltip(p.short, { permanent: true, direction: 'right', offset: [10, 0], className: 'poi-label' });
    m.on('click', () => onSelect?.(p.id));
    m.on('keypress', (e) => { if (e.originalEvent.key === 'Enter') onSelect?.(p.id); });
    m.addTo(map);
    markers.set(p.id, m);
  }

  map.on('mousemove', (e) => {
    const [lat, lon] = xyKmToLL(e.latlng.lng, e.latlng.lat);
    onCursor?.(formatLatLon(lat, lon), e.latlng);
  });

  function xyOf(site) {
    return llToXYkm(site.lat, site.lon); // POIs carry lat/lon only; conversion lives in geo.js
  }

  // M6: a layer image that fails to load is reported (onLayerStatus(kind, label | null)) instead of leaving a silent gap.
  let regionalLabel = null;
  function watchImage(ov, kind, label) {
    ov.on('error', () => onLayerStatus?.(kind, label()));
    ov.on('load', () => onLayerStatus?.(kind, null));
    return ov;
  }

  function setLayer(layer, detailLayer = null, detailSub = 'hillshade', regionalFallback = null) {
    onLayerStatus?.('regional', null);
    onLayerStatus?.('detail', null);
    // Regional overlay: the chosen layer, or (for "detail") the regional hillshade underneath.
    const regional = layer.id === 'detail' ? regionalFallback : layer;
    if (regional?.available) {
      const url = layerUrl(regional.file);
      regionalLabel = regional.label;
      if (!overlay) overlay = watchImage(L.imageOverlay(url, boundsOf(regional.bounds_km), { className: 'layer-overlay', alt: regional.label }),
        'regional', () => regionalLabel).addTo(map);
      else { overlay.setUrl(url); overlay.setBounds(boundsOf(regional.bounds_km)); }
    } else if (overlay) { map.removeLayer(overlay); overlay = null; }

    if (detailOverlay) { map.removeLayer(detailOverlay); detailOverlay = null; }
    if (layer.id === 'detail' && detailLayer?.available) {
      const file = detailLayer.subfiles?.[detailSub] ?? detailLayer.file;
      detailOverlay = watchImage(L.imageOverlay(layerUrl(file), boundsOf(detailLayer.bounds_km),
        { pane: 'detailPane', className: 'detail-overlay', alt: detailLayer.label }), 'detail', () => detailLayer.label).addTo(map);
    }
    return overlay;
  }

  function fitDetail(detailLayer) {
    if (detailLayer?.bounds_km) map.flyToBounds(boundsOf(detailLayer.bounds_km), { padding: [30, 30], duration: 0.6 });
  }

  function clearRoute() {
    routeLayers.forEach((l) => map.removeLayer(l));
    routeLayers = [];
    setProgress(null);
  }

  /** Draw the `out` route (solid) and optionally the `back` route (dashed). Returns the drawn layers. */
  function drawRoute(out, back, mode, { fit = true } = {}) {
    clearRoute();
    if (!out) return [];
    const line = (r, cls) => L.polyline(r.points.map((p) => ll(p.x_km, p.y_km)), {
      renderer: svg, weight: cls === 'out' ? 3.5 : 2.5, className: `route-line ${mode} ${cls}`, interactive: false,
    }).addTo(map);
    routeLayers.push(line(out, 'out'));
    if (back) routeLayers.push(line(back, 'back'));
    if (fit) map.flyToBounds(routeLayers[0].getBounds(), { padding: [60, 60], duration: 0.6, maxZoom: 6 });
    return routeLayers;
  }

  function setSelected(id) {
    for (const [pid, m] of markers) m.getElement()?.classList.toggle('is-selected', pid === id);
  }

  function setProgress(route, s_km) {
    if (!route || s_km == null) {
      if (progress) { map.removeLayer(progress); progress = null; }
      return;
    }
    const p = pointAtS(route, s_km);
    if (!progress) progress = L.circleMarker(ll(p.x_km, p.y_km), { renderer: svg, radius: 6, weight: 2, className: 'progress-dot', interactive: false }).addTo(map);
    else progress.setLatLng(ll(p.x_km, p.y_km));
  }

  return { map, setLayer, fitDetail, drawRoute, clearRoute, setSelected, setProgress, region,
    resetView: () => map.flyToBounds(region, { duration: 0.6 }) };
}
