import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useAadtMap } from "./context/AadtMapContext";
import {
  chainageIntervalIcon,
  chainageIntervalZIndex,
  chainagePointKey,
  pickChainageIntervalMarkers
} from "./chainageMarkers";
import {
  MapClearClick,
  MapController,
  MapViewportSync,
  ViewportWatcher,
  chainageLabelTiersForZoom,
  chainagePointLimit,
  chainageSampleStepKm,
  chainageShowIntervalPoints,
  googleMapsUrl,
  googleStreetViewUrl
} from "./map/mapUtils";
import MapBaseLayer from "./map/MapBaseLayer";
import MapLoadingOverlay from "./components/MapLoadingOverlay";
import { useBufferedViewportFetch } from "./map/useBufferedViewportFetch";

function ChainageMarkerPopup({ point, title }) {
  return (
    <Popup>
      <b>{title}</b>
      <br />
      {point.Description}
      <br />
      Road Section: {point.Road_Section_Id}
      <br />
      Chainage: {point.Tdist_Start}
      <br />
      AADT: {point.AADT}
      <br />
      <a
        href={googleMapsUrl(point.Latitude, point.Longitude)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Google Maps
      </a>
      {" · "}
      <a
        href={googleStreetViewUrl(point.Latitude, point.Longitude)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Street View
      </a>
    </Popup>
  );
}

function ChainageView({
  darkMode,
  showAerial,
  greyScale,
  state,
  meta,
  onResultChange,
  onSelectPoint
}) {
  const { center, zoom, bounds, setMapViewport, clearBounds } = useAadtMap();
  const [bbox, setBbox] = useState(null);

  const minZoom = meta?.minZoom ?? 13;
  const canLoad = Boolean(state.showOnMap && bbox && meta && bbox.zoom >= minZoom);
  const cacheKey = canLoad ? String(chainageSampleStepKm(bbox.zoom)) : "";

  const fetchPoints = useCallback((fetchBbox, { signal }) => {
    const params = new URLSearchParams({
      min_lat: String(fetchBbox.min_lat),
      max_lat: String(fetchBbox.max_lat),
      min_lon: String(fetchBbox.min_lon),
      max_lon: String(fetchBbox.max_lon),
      zoom: String(fetchBbox.zoom),
      min_zoom: String(minZoom),
      limit: String(Math.min(60000, chainagePointLimit(fetchBbox.zoom) * 3))
    });
    return fetch(`/api/chainage/points?${params.toString()}`, { signal })
      .then(res => res.json())
      .then(data => ({
        points: data.points || [],
        returned: data.returned ?? 0,
        truncated: Boolean(data.truncated),
        sampleStepKm: data.sampleStepKm,
        message: data.message || ""
      }));
  }, [minZoom]);

  const { points, loading, extra } = useBufferedViewportFetch({
    viewport: bbox,
    enabled: canLoad,
    cacheKey,
    fetchPoints
  });

  useEffect(() => {
    if (!state.showOnMap || !bbox || !meta) {
      onResultChange({ returned: 0, truncated: false, message: "Chainage layer is hidden." });
      return;
    }
    if (bbox.zoom < minZoom) {
      onResultChange({
        returned: 0,
        truncated: false,
        message: `Zoom in to at least ${minZoom} to load chainage.`
      });
      return;
    }
    if (loading) return;
    if (!extra) return;
    const activeTiers = chainageLabelTiersForZoom(bbox.zoom).map(t => t.id);
    onResultChange({
      returned: extra.returned ?? 0,
      truncated: Boolean(extra.truncated),
      sampleStepKm: extra.sampleStepKm,
      showIntervalPoints: chainageShowIntervalPoints(bbox.zoom),
      labelTiers: activeTiers,
      message: extra.message || extra.error ? extra.message || "Failed to load chainage." : ""
    });
  }, [bbox, extra, loading, meta, minZoom, onResultChange, state.showOnMap]);

  const viewportZoom = bbox?.zoom ?? 0;
  const showIntervalPoints = chainageShowIntervalPoints(viewportZoom);

  const pointColor = useMemo(() => (darkMode ? "#60a5fa" : "#2563eb"), [darkMode]);
  const { intervalMarkers, intervalPoints } = useMemo(() => {
    const { markers, labeledPointKeys } = pickChainageIntervalMarkers(points, viewportZoom);
    const blue = points.filter(p => !labeledPointKeys.has(chainagePointKey(p)));
    return {
      intervalMarkers: markers,
      intervalPoints: showIntervalPoints ? blue : []
    };
  }, [points, showIntervalPoints, viewportZoom]);

  return (
    <div className={`map-view-root${loading ? " is-loading" : ""}`}>
      <MapLoadingOverlay show={loading} label="Loading chainage…" />
      <MapContainer
        center={center}
        zoom={zoom}
        preferCanvas
        style={{ height: "100%", width: "100%", borderRadius: 12, minHeight: 320 }}
      >
        <MapController
          center={center}
          bounds={bounds}
          zoom={zoom}
          onBoundsApplied={clearBounds}
        />
        <MapViewportSync onViewportChange={setMapViewport} />
        <MapClearClick onClear={() => onSelectPoint(null)} />
        <ViewportWatcher onViewportChange={setBbox} />
        <MapBaseLayer showAerial={showAerial} darkMode={darkMode} greyScale={greyScale} />
        {intervalMarkers.map(({ point: p, tickKm, tierId, label }, idx) => (
          <Marker
            key={`${tierId}-${p.Road_Section_Id}-${p.Carriageway_Code}-${tickKm}-${idx}`}
            position={[p.Latitude, p.Longitude]}
            icon={chainageIntervalIcon(label, tierId, darkMode)}
            zIndexOffset={chainageIntervalZIndex(tierId)}
            eventHandlers={{ click: () => onSelectPoint(p) }}
          >
            <ChainageMarkerPopup point={p} title={label} />
          </Marker>
        ))}
        {intervalPoints.map((p, idx) => (
          <CircleMarker
            key={`${p.Road_Section_Id}-${p.Carriageway_Code}-${p.Tdist_Start}-${idx}`}
            center={[p.Latitude, p.Longitude]}
            radius={state.markerSize}
            pathOptions={{ color: pointColor, fillColor: pointColor, fillOpacity: 0.8, weight: 1 }}
            eventHandlers={{ click: () => onSelectPoint(p) }}
          >
            <ChainageMarkerPopup point={p} title={p.Description} />
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

export default ChainageView;
