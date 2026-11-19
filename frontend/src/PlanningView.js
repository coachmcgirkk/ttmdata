import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useAadtMap } from "./context/AadtMapContext";
import {
  chainageIntervalIcon,
  chainageIntervalZIndex,
  chainagePointKey,
  pickChainageIntervalMarkers
} from "./chainageMarkers";
import {
  analyzeWorkAreas,
  applyChainagePick,
  APPROACH_SIGNAGE_DASH,
  buildZoneMapSegments,
  chainageLoadRange,
  pickModeLabel,
  pointMatchesRoadSection,
  workAreaColors,
  workAreaDisplayName
} from "./planningUtils";
import {
  MapClearClick,
  MapController,
  MapViewportSync,
  ViewportWatcher,
  chainagePointLimit,
  chainageSampleStepKm,
  chainageShowIntervalPoints,
  googleMapsUrl,
  googleStreetViewUrl
} from "./map/mapUtils";
import MapBaseLayer from "./map/MapBaseLayer";
import MapLoadingOverlay from "./components/MapLoadingOverlay";
import { useBufferedViewportFetch } from "./map/useBufferedViewportFetch";

function ChainageMarkerPopup({ point }) {
  return (
    <Popup>
      <b>{point.Description}</b>
      <br />
      Chainage: {point.Tdist_Start} km
      <br />
      <a href={googleMapsUrl(point.Latitude, point.Longitude)} target="_blank" rel="noopener noreferrer">
        Google Maps
      </a>
      {" · "}
      <a href={googleStreetViewUrl(point.Latitude, point.Longitude)} target="_blank" rel="noopener noreferrer">
        Street View
      </a>
    </Popup>
  );
}

function PlanningView({
  darkMode,
  showAerial,
  greyScale,
  state,
  chainageMeta,
  onStateChange,
  onResultChange
}) {
  const { center, zoom, bounds, setMapViewport, clearBounds, setBounds } = useAadtMap();
  const [sectionPoints, setSectionPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewport, setViewport] = useState(null);

  const analysis = useMemo(() => analyzeWorkAreas(state.workAreas), [state.workAreas]);
  const hasRoad = Boolean(state.roadSectionId?.trim() && state.carriageway?.trim());
  const hasValidWorkAreas = analysis.validItems.length > 0;
  const pickModeActive = Boolean(state.pickMode);
  const showChainageMarkers = pickModeActive || state.showChainage;
  const viewportZoom = viewport?.zoom ?? zoom;
  const minChainageZoom = chainageMeta?.minZoom ?? 13;

  // Load full road section for work-area overlays and centreline
  useEffect(() => {
    if (!state.showOnMap || !hasRoad) {
      setSectionPoints([]);
      if (!pickModeActive) {
        onResultChange({
          returned: 0,
          message: !hasRoad ? "Select a road section or pick a chainage marker on the map." : "Work area layer is hidden."
        });
      }
      return undefined;
    }

    const range = chainageLoadRange(state);
    const params = new URLSearchParams({
      road_section_id: state.roadSectionId.trim(),
      carriageway: state.carriageway.trim(),
      chainage_min: String(range.min),
      chainage_max: String(range.max)
    });

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    fetch(`/api/chainage/section?${params.toString()}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        const points = data.points || [];
        setSectionPoints(points);
        if (!pickModeActive) {
          onResultChange({
            returned: data.returned ?? points.length,
            message: data.message || "",
            description: data.description || state.roadDescription,
            chainageMin: data.chainageMin,
            chainageMax: data.chainageMax
          });
        }
      })
      .catch(err => {
        if (err.name !== "AbortError" && !cancelled) {
          setSectionPoints([]);
          if (!pickModeActive) {
            onResultChange({ returned: 0, message: "Failed to load road chainage." });
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRoad, pickModeActive, state.carriageway, state.roadSectionId, state.showOnMap, state.workAreas]);

  useEffect(() => {
    if (!state.mapFitToken || sectionPoints.length < 2) return;
    const lats = sectionPoints.map(p => p.Latitude);
    const lons = sectionPoints.map(p => p.Longitude);
    setBounds([
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)]
    ]);
  }, [state.mapFitToken, sectionPoints, setBounds]);

  const needsViewportChainageForMarkers = showChainageMarkers;
  const needsViewportChainageForOverlays = hasRoad && hasValidWorkAreas && sectionPoints.length === 0;
  const needsViewportChainage = needsViewportChainageForMarkers || needsViewportChainageForOverlays;
  const canLoadViewport =
    Boolean(needsViewportChainage && viewport && chainageMeta && viewport.zoom >= minChainageZoom);

  const fetchViewportPoints = useCallback((fetchBbox, { signal }) => {
    const params = new URLSearchParams({
      min_lat: String(fetchBbox.min_lat),
      max_lat: String(fetchBbox.max_lat),
      min_lon: String(fetchBbox.min_lon),
      max_lon: String(fetchBbox.max_lon),
      zoom: String(fetchBbox.zoom),
      min_zoom: String(minChainageZoom),
      limit: String(Math.min(60000, chainagePointLimit(fetchBbox.zoom) * 3))
    });
    return fetch(`/api/chainage/points?${params.toString()}`, { signal })
      .then(res => res.json())
      .then(data => ({
        points: data.points || [],
        returned: data.returned ?? 0,
        truncated: Boolean(data.truncated),
        message: data.message || ""
      }));
  }, [minChainageZoom]);

  const {
    points: rawViewportPoints,
    loading: viewportLoading,
    extra: viewportExtra
  } = useBufferedViewportFetch({
    viewport,
    enabled: canLoadViewport,
    cacheKey: canLoadViewport ? String(chainageSampleStepKm(viewport.zoom)) : "",
    fetchPoints: fetchViewportPoints
  });

  const viewportPoints = useMemo(() => {
    if (!rawViewportPoints.length) return [];
    if (!hasRoad) return rawViewportPoints;
    return rawViewportPoints.filter(p => pointMatchesRoadSection(p, state));
  }, [hasRoad, rawViewportPoints, state]);

  useEffect(() => {
    if (!needsViewportChainageForMarkers && !needsViewportChainageForOverlays) return;
    if (viewport && viewport.zoom < minChainageZoom) {
      onResultChange({
        returned: 0,
        message: `Zoom in to at least ${minChainageZoom} to see chainage markers.`
      });
      return;
    }
    if (viewportLoading || !viewportExtra) return;
    onResultChange({
      returned: viewportPoints.length,
      truncated: Boolean(viewportExtra.truncated),
      message: pickModeActive
        ? viewportPoints.length
          ? `Click a chainage marker to set ${state.pickMode?.field === "chainageFrom" ? "start" : "finish"}`
          : hasRoad
            ? "No chainage markers for this road in the current map view — pan or zoom."
            : "No chainage markers in view — pan to a road and zoom in."
        : state.showChainage
          ? viewportPoints.length
            ? `${viewportPoints.length.toLocaleString()} chainage points shown`
            : "No chainage markers in the current map view."
          : viewportPoints.length
            ? `${viewportPoints.length.toLocaleString()} chainage points loaded for work area display`
            : "Loading chainage for work area overlays…"
    });
  }, [
    hasRoad,
    minChainageZoom,
    needsViewportChainageForMarkers,
    needsViewportChainageForOverlays,
    onResultChange,
    pickModeActive,
    state.pickMode?.field,
    state.showChainage,
    viewport,
    viewportExtra,
    viewportLoading,
    viewportPoints.length
  ]);

  const overlayPoints = useMemo(() => {
    if (sectionPoints.length) return sectionPoints;
    if (!hasRoad) return [];
    return viewportPoints
      .filter(p => pointMatchesRoadSection(p, state))
      .sort((a, b) => Number(a.Tdist_Start) - Number(b.Tdist_Start));
  }, [hasRoad, sectionPoints, state, viewportPoints]);

  const markerPoints = useMemo(() => {
    if (!showChainageMarkers) return [];
    if (pickModeActive) {
      if (viewportPoints.length) return viewportPoints;
      if (hasRoad && sectionPoints.length) return sectionPoints;
      return viewportPoints;
    }
    if (viewportPoints.length) return viewportPoints;
    if (hasRoad && sectionPoints.length) return sectionPoints;
    return [];
  }, [hasRoad, pickModeActive, sectionPoints, showChainageMarkers, viewportPoints]);

  const showDetailPoints =
    showChainageMarkers && (pickModeActive || chainageShowIntervalPoints(viewportZoom));
  const pointColor = useMemo(() => (darkMode ? "#60a5fa" : "#2563eb"), [darkMode]);
  const pickHighlightColor = darkMode ? "#fbbf24" : "#d97706";

  const { intervalMarkers, intervalPoints } = useMemo(() => {
    const { markers, labeledPointKeys } = pickChainageIntervalMarkers(markerPoints, viewportZoom);
    const detail = markerPoints.filter(p => !labeledPointKeys.has(chainagePointKey(p)));
    return {
      intervalMarkers: markers,
      intervalPoints: showDetailPoints ? detail : []
    };
  }, [markerPoints, showDetailPoints, viewportZoom]);

  const handlePointClick = point => {
    if (hasRoad && !pointMatchesRoadSection(point, state)) return;

    if (pickModeActive) {
      onStateChange(applyChainagePick(state, point));
    }
  };

  const roadPolyline = useMemo(() => {
    if (!overlayPoints.length) return [];
    return overlayPoints.map(p => [p.Latitude, p.Longitude]);
  }, [overlayPoints]);

  const segments = useMemo(() => {
    if (!overlayPoints.length || !hasValidWorkAreas) return [];
    return analysis.validItems.flatMap(item => {
      const zones = item.zones;
      const colors = workAreaColors(item.index, darkMode);
      const label = workAreaDisplayName(item.workArea, item.index);
      const midChainage = (zones.work.start + zones.work.end) / 2;
      const segmentArgs = {
        overlayPoints,
        item,
        validItems: analysis.validItems,
        colors,
        workAreaLabel: label,
        showWorkAreaTooltip: state.showWorkAreaTooltips,
        midChainage
      };

      return [
        ...buildZoneMapSegments({
          ...segmentArgs,
          rangeStart: zones.signageStart.start,
          rangeEnd: zones.signageStart.end,
          baseKey: `${item.workArea.id}-signage-start`,
          segmentType: "signage",
          dashArray: APPROACH_SIGNAGE_DASH,
          opacity: 0.85
        }),
        ...buildZoneMapSegments({
          ...segmentArgs,
          rangeStart: zones.signageEnd.start,
          rangeEnd: zones.signageEnd.end,
          baseKey: `${item.workArea.id}-signage-end`,
          segmentType: "signage",
          dashArray: APPROACH_SIGNAGE_DASH,
          opacity: 0.85
        }),
        ...buildZoneMapSegments({
          ...segmentArgs,
          rangeStart: zones.work.start,
          rangeEnd: zones.work.end,
          baseKey: `${item.workArea.id}-work`,
          segmentType: "work",
          dashArray: null,
          opacity: 0.95
        })
      ];
    });
  }, [
    analysis.validItems,
    darkMode,
    hasValidWorkAreas,
    overlayPoints,
    state.showWorkAreaTooltips
  ]);

  const pickLabel = pickModeLabel(state.pickMode, state.workAreas);
  const zoomTooLow = pickModeActive && viewportZoom < minChainageZoom;

  return (
    <div className={`map-view-root${loading || viewportLoading ? " is-loading" : ""}`}>
      <MapLoadingOverlay show={loading || viewportLoading} label="Loading planning data…" />
      {pickLabel && (
        <div className={`planning-pick-badge${zoomTooLow ? " planning-pick-badge-warn" : ""}`}>
          {zoomTooLow ? `Zoom in to at least ${minChainageZoom} to see chainage markers` : pickLabel}
        </div>
      )}
      <MapContainer
        center={center}
        zoom={zoom}
        preferCanvas
        style={{ height: "100%", width: "100%", borderRadius: 12, minHeight: 320 }}
      >
        <MapController center={center} bounds={bounds} zoom={zoom} onBoundsApplied={clearBounds} />
        <MapViewportSync onViewportChange={setMapViewport} />
        <ViewportWatcher onViewportChange={setViewport} />
        <MapClearClick
          onClear={() => {
            if (pickModeActive) onStateChange({ ...state, pickMode: null });
          }}
        />
        <MapBaseLayer showAerial={showAerial} darkMode={darkMode} greyScale={greyScale} />

        {roadPolyline.length >= 2 && (
          <Polyline
            positions={roadPolyline}
            pathOptions={{
              color: darkMode ? "#94a3b8" : "#64748b",
              weight: 3,
              opacity: pickModeActive ? 0.5 : 0.7
            }}
          />
        )}

        {segments.map(seg => (
          <Polyline
            key={seg.key}
            positions={seg.coords}
            pathOptions={{
              color: seg.color,
              weight: seg.weight,
              opacity: seg.opacity ?? 0.95,
              dashArray: seg.dashArray || undefined
            }}
          >
            {seg.showTooltip && (
              <Tooltip permanent direction="top" className="planning-work-area-tooltip">
                {seg.tooltipLabel}
              </Tooltip>
            )}
          </Polyline>
        ))}

        {showChainageMarkers &&
          intervalMarkers.map(({ point: p, tickKm, tierId, label }, idx) => (
            <Marker
              key={`${tierId}-${p.Road_Section_Id}-${p.Carriageway_Code}-${tickKm}-${idx}`}
              position={[p.Latitude, p.Longitude]}
              icon={chainageIntervalIcon(label, tierId, darkMode)}
              zIndexOffset={chainageIntervalZIndex(tierId) + (pickModeActive ? 400 : 0)}
              eventHandlers={{ click: () => handlePointClick(p) }}
            >
              <ChainageMarkerPopup point={p} />
            </Marker>
          ))}

        {showChainageMarkers &&
          intervalPoints.map((p, idx) => (
            <CircleMarker
              key={`${p.Road_Section_Id}-${p.Carriageway_Code}-${p.Tdist_Start}-${idx}`}
              center={[p.Latitude, p.Longitude]}
              radius={pickModeActive ? 7 : 4}
              pathOptions={{
                color: pickModeActive ? pickHighlightColor : pointColor,
                fillColor: pickModeActive ? pickHighlightColor : pointColor,
                fillOpacity: 0.9,
                weight: pickModeActive ? 2 : 1
              }}
              eventHandlers={{ click: () => handlePointClick(p) }}
            >
              <ChainageMarkerPopup point={p} />
            </CircleMarker>
          ))}
      </MapContainer>
    </div>
  );
}

export default PlanningView;
