import React, { useCallback, useEffect, useState } from "react";
import { MapContainer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import { useAadtMap } from "./context/AadtMapContext";
import { MapController, MapClearClick, MapViewportSync, ViewportWatcher, crashSeverityColor } from "./map/mapUtils";
import MapBaseLayer from "./map/MapBaseLayer";
import MapLoadingOverlay from "./components/MapLoadingOverlay";
import { useBufferedViewportFetch } from "./map/useBufferedViewportFetch";

function buildCrashQuery(filters, bbox, meta) {
  const params = new URLSearchParams();
  params.set("min_year", String(filters.minYear));
  params.set("max_year", String(filters.maxYear));
  if (filters.severities.length) params.set("severities", filters.severities.join(","));
  if (filters.regions.length) params.set("regions", filters.regions.join(","));
  if (filters.fatalOnly) params.set("fatal_only", "true");
  params.set("min_lat", String(bbox.min_lat));
  params.set("max_lat", String(bbox.max_lat));
  params.set("min_lon", String(bbox.min_lon));
  params.set("max_lon", String(bbox.max_lon));
  params.set("zoom", String(bbox.zoom));
  params.set("min_zoom", String(meta.minZoom ?? 12));
  params.set("limit", "40000");
  return params.toString();
}

function CrashHistoryView({
  meta,
  filters,
  darkMode,
  showAerial,
  greyScale,
  selectedCrash,
  onSelectCrash,
  onLoadResult
}) {
  const { center, zoom, bounds, setMapViewport, clearBounds } = useAadtMap();
  const [bbox, setBbox] = useState(null);

  const minZoom = meta?.minZoom ?? 12;
  const canLoad =
    Boolean(meta?.ready && filters.showOnMap && bbox && bbox.zoom >= minZoom) &&
    Boolean(filters.severities.length && filters.regions.length);

  const cacheKey = [
    filters.minYear,
    filters.maxYear,
    filters.fatalOnly ? "fatal" : "all",
    filters.severities.join(","),
    filters.regions.join(",")
  ].join("|");

  const fetchPoints = useCallback(
    (fetchBbox, { signal }) =>
      fetch(`/api/crash-locations?${buildCrashQuery(filters, fetchBbox, meta)}`, { signal })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => ({
          points: data.points || [],
          count: data.count ?? 0,
          returned: data.returned ?? 0,
          truncated: Boolean(data.truncated),
          message: data.message || ""
        })),
    [filters, meta]
  );

  const { points, loading, extra } = useBufferedViewportFetch({
    viewport: bbox,
    enabled: canLoad,
    cacheKey,
    fetchPoints
  });

  useEffect(() => {
    if (!meta?.ready || !filters.showOnMap) {
      onLoadResult({
        loading: false,
        count: 0,
        returned: 0,
        truncated: false,
        message: !meta?.ready ? meta?.error || "Crash data not indexed yet." : ""
      });
      return;
    }
    if (!filters.severities.length || !filters.regions.length) {
      onLoadResult({
        loading: false,
        count: 0,
        returned: 0,
        truncated: false,
        message: "Select at least one severity and region."
      });
      return;
    }
    if (bbox && bbox.zoom < minZoom) {
      onLoadResult({
        loading: false,
        count: 0,
        returned: 0,
        truncated: false,
        message: `Zoom in to at least ${minZoom} to load crashes.`
      });
      return;
    }
    if (loading) {
      onLoadResult({ loading: true });
      return;
    }
    if (extra) {
      onLoadResult({
        loading: false,
        count: extra.count ?? 0,
        returned: extra.returned ?? 0,
        truncated: Boolean(extra.truncated),
        message: extra.message || ""
      });
    }
  }, [bbox, extra, filters, loading, meta, minZoom, onLoadResult]);

  if (!meta?.ready) {
    return (
      <div className="map-placeholder">
        {meta?.error || "Indexing crash data… Run split_crash_locations.py on the server."}
      </div>
    );
  }

  return (
    <div className={`map-view-root${loading ? " is-loading" : ""}`}>
      <MapLoadingOverlay show={loading} label="Loading crash history…" />
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%", borderRadius: 12, minHeight: 320 }}
      >
        <MapController
          center={center}
          bounds={bounds}
          zoom={zoom}
          onBoundsApplied={clearBounds}
        />
        <MapViewportSync onViewportChange={setMapViewport} />
        <ViewportWatcher onViewportChange={setBbox} />
        <MapClearClick onClear={() => onSelectCrash(null)} />
        <MapBaseLayer showAerial={showAerial} darkMode={darkMode} greyScale={greyScale} />
        <MarkerClusterGroup>
          {points.map(crash => {
            const lat = Number(crash.Crash_Latitude);
            const lon = Number(crash.Crash_Longitude);
            if (!isFinite(lat) || !isFinite(lon)) return null;
            const color = crashSeverityColor(crash.Crash_Severity);
            const selected = selectedCrash?.Crash_Ref_Number === crash.Crash_Ref_Number;
            const icon = new L.DivIcon({
              className: "",
              html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid ${selected ? "#fff" : "#1e293b"};box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            });
            return (
              <Marker
                key={crash.Crash_Ref_Number}
                position={[lat, lon]}
                icon={icon}
                eventHandlers={{ click: () => onSelectCrash(crash) }}
              >
                <Popup>
                  <b>{crash.Crash_Severity}</b> — {crash.Crash_Year}
                  <br />
                  {crash.Crash_Street}
                  <br />
                  {crash.Crash_Nature}
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}

export default CrashHistoryView;
