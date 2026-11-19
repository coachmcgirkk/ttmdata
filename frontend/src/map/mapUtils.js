import React, { useCallback, useEffect, useRef } from "react";
import { useMap, useMapEvent } from "react-leaflet";
import { speedToColor, CRASH_SEVERITY_COLORS, crashSeverityColor } from "../colorPalette";

export { speedToColor, CRASH_SEVERITY_COLORS, crashSeverityColor };

/** Persists pan/zoom to app state so view switches keep the same map position. */
export function MapViewportSync({ onViewportChange }) {
  const map = useMap();
  const report = useCallback(() => {
    const c = map.getCenter();
    onViewportChange([c.lat, c.lng], map.getZoom());
  }, [map, onViewportChange]);
  useMapEvent("moveend", report);
  useMapEvent("zoomend", report);
  return null;
}

/** Address search / fit-bounds only — does not reset the map on every view mount. */
export function MapController({ center, bounds, zoom, onBoundsApplied }) {
  const map = useMap();
  const appliedBoundsKey = useRef(null);
  const lastFlyKey = useRef(null);

  useEffect(() => {
    if (!bounds) {
      appliedBoundsKey.current = null;
      return;
    }
    const key = JSON.stringify(bounds);
    if (appliedBoundsKey.current === key) return;
    map.fitBounds(bounds, { padding: [30, 30] });
    appliedBoundsKey.current = key;
    onBoundsApplied?.();
  }, [bounds, map, onBoundsApplied]);

  useEffect(() => {
    if (bounds || !center || zoom == null) return;
    const key = `${center[0].toFixed(6)},${center[1].toFixed(6)},${zoom}`;
    if (lastFlyKey.current === key) return;
    const mapCenter = map.getCenter();
    const mapZoom = map.getZoom();
    const atSameView =
      Math.abs(mapCenter.lat - center[0]) < 1e-5 &&
      Math.abs(mapCenter.lng - center[1]) < 1e-5 &&
      mapZoom === zoom;
    if (!atSameView) {
      map.setView(center, zoom);
    }
    lastFlyKey.current = key;
  }, [center, zoom, bounds, map]);

  return null;
}

export function MapClearClick({ onClear }) {
  useMapEvent("click", () => onClear());
  return null;
}

/** Reports the visible map bbox after pan/zoom so layers can fetch viewport data. */
export function ViewportWatcher({ onViewportChange }) {
  const map = useMap();
  const report = useCallback(() => {
    const b = map.getBounds();
    onViewportChange({
      min_lat: b.getSouth(),
      max_lat: b.getNorth(),
      min_lon: b.getWest(),
      max_lon: b.getEast(),
      zoom: map.getZoom()
    });
  }, [map, onViewportChange]);
  useMapEvent("moveend", report);
  useEffect(() => {
    report();
  }, [report]);
  return null;
}

/** Close any open Leaflet popup when the user drags the map (avoids auto-pan fighting). */
export function ClosePopupOnDrag() {
  const map = useMap();
  useMapEvent("dragstart", () => {
    map.closePopup();
  });
  return null;
}

export function googleMapsUrl(lat, lon) {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

export function googleStreetViewUrl(lat, lon) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
}

/** Chainage spacing (km) used when zoomed out — must match backend/app.py. */
export function chainageSampleStepKm(zoom) {
  if (zoom >= 17) return 0.02;
  if (zoom >= 16) return 0.05;
  if (zoom >= 15) return 0.1;
  if (zoom >= 14) return 0.25;
  return 0.5;
}

export function chainagePointLimit(zoom) {
  if (zoom >= 17) return 25000;
  if (zoom >= 16) return 15000;
  if (zoom >= 15) return 8000;
  if (zoom >= 14) return 4000;
  return 2000;
}

/** Blue interval markers only when zoomed in enough to stay responsive. */
export function chainageShowIntervalPoints(zoom) {
  return zoom >= 15;
}

/** Labelled chainage ticks shown at each zoom (coarser tiers always on). */
export const CHAINAGE_LABEL_TIERS = [
  { id: "1km", stepKm: 1, minZoom: 13 },
  { id: "500m", stepKm: 0.5, minZoom: 14 },
  { id: "100m", stepKm: 0.1, minZoom: 16 }
];

export function chainageLabelTiersForZoom(zoom) {
  return CHAINAGE_LABEL_TIERS.filter(t => zoom >= t.minZoom);
}

export function formatChainageTickLabel(tickKm, tierId) {
  if (tierId === "1km") return `${tickKm} km`;
  const metres = Math.round(tickKm * 1000);
  if (metres % 1000 === 0) return `${metres / 1000} km`;
  return `${metres} m`;
}

/** Skip ticks already labelled by a coarser interval (e.g. no 500 m label at 1.0 km). */
export function isExclusiveChainageTick(tickKm, stepKm, coarserStepsKm) {
  for (const coarse of coarserStepsKm) {
    if (coarse <= stepKm) continue;
    const ratio = tickKm / coarse;
    if (Math.abs(ratio - Math.round(ratio)) < 1e-4) return false;
  }
  return true;
}
