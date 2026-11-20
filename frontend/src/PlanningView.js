import React, { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useAadtMap } from "./context/AadtMapContext";
import {
  chainageIntervalIcon,
  chainageIntervalZIndex,
  chainagePointKey,
  pickChainageIntervalMarkers
} from "./chainageMarkers";
import {
  MapController,
  MapViewportSync,
  ViewportWatcher,
  chainagePointLimit,
  chainageSampleStepKm,
  chainageShowIntervalPoints
} from "./map/mapUtils";
import MapBaseLayer from "./map/MapBaseLayer";
import { useBufferedViewportFetch } from "./map/useBufferedViewportFetch";
import {
  addDays,
  applyChainagePick,
  cancelChainagePick,
  daysBetween,
  findOverlaps,
  formatChainage,
  formatDate,
  formatLength,
  lineForRange,
  listSites,
  pointNearChainage,
  projectLabel,
  siteActiveOnDate,
  siteLabel,
  timelineExtent,
  timelineRuler
} from "./planningModel";


function boundsFromPoints(groups) {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  let count = 0;
  groups.forEach(points => {
    (points || []).forEach(point => {
      const lat = Number(point.Latitude);
      const lon = Number(point.Longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      count += 1;
    });
  });
  if (!count) return null;
  if (south === north && west === east) {
    return [[south - 0.01, west - 0.01], [north + 0.01, east + 0.01]];
  }
  return [[south, west], [north, east]];
}

const WORK = { color: "#0c6e78", weight: 5, opacity: 0.9 };
const APPROACH = { color: "#38bdf8", weight: 5, opacity: 1, dashArray: "8 6" };
const DEPARTURE = { color: "#c4a15a", weight: 4, opacity: 0.9, dashArray: "6 6" };
const OVERLAP = { color: "#dc2626", weight: 7, opacity: 0.95 };

function rangeKey(site, zone) {
  return [
    site.roadSectionId,
    site.carriageway,
    zone.combined.start.toFixed(4),
    zone.combined.end.toFixed(4)
  ].join("|");
}

function SitePopup({ project, site, zone }) {
  return (
    <Popup>
      <b>{siteLabel(site)}</b>
      <br />
      {projectLabel(project)}
      <br />
      {site.roadDescription || `Section ${site.roadSectionId}`}
      <br />
      Work {formatChainage(zone.work.start)}–{formatChainage(zone.work.end)} km
      <br />
      Approach {formatLength(zone.approachKm)} · Departure {formatLength(zone.departureKm)}
      {site.startDate || site.endDate ? (
        <>
          <br />
          {site.startDate ? formatDate(site.startDate) : "Open"} to {site.endDate ? formatDate(site.endDate) : "open"}
        </>
      ) : null}
      {site.details ? (
        <>
          <br />
          {site.details}
        </>
      ) : null}
    </Popup>
  );
}

function PlanningView({
  darkMode,
  showAerial,
  greyScale,
  state,
  meta,
  onStateChange
}) {
  const { center, zoom, bounds, setMapViewport, clearBounds, setBounds } = useAadtMap();
  const [bbox, setBbox] = useState(null);
  const [lines, setLines] = useState([]);
  const [geometryNote, setGeometryNote] = useState("");
  const jobsRef = useRef([]);
  const cacheRef = useRef(new Map());

  const minZoom = meta?.minZoom ?? 13;
  const picking = Boolean(state.pick);
  const canLoadMarkers = Boolean(state.showOnMap && picking && bbox && bbox.zoom >= minZoom);
  const cacheKey = canLoadMarkers ? String(chainageSampleStepKm(bbox.zoom)) : "";

  const fetchPoints = React.useCallback((fetchBbox, { signal }) => {
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
      .then(data => ({ points: data.points || [] }));
  }, [minZoom]);

  const { points } = useBufferedViewportFetch({
    viewport: bbox,
    enabled: canLoadMarkers,
    cacheKey,
    fetchPoints
  });

  const catalog = useMemo(() => (
    listSites(state.projects).filter(row => row.zone && row.site.roadSectionId && row.site.carriageway)
  ), [state.projects]);

  const jobs = useMemo(() => catalog.map(row => ({
    key: `${row.site.id}|${rangeKey(row.site, row.zone)}`,
    fetchKey: rangeKey(row.site, row.zone),
    siteId: row.site.id,
    projectId: row.project.id,
    roadSectionId: String(row.site.roadSectionId),
    carriageway: String(row.site.carriageway),
    min: row.zone.combined.start,
    max: row.zone.combined.end
  })), [catalog]);
  jobsRef.current = jobs;

  const geometryKey = jobs.map(job => job.key).join(";");

  useEffect(() => {
    if (!state.showOnMap) return undefined;
    const currentJobs = jobsRef.current;
    const publish = () => currentJobs.map(job => ({
      key: job.key,
      siteId: job.siteId,
      points: cacheRef.current.get(job.fetchKey) || []
    }));
    if (!currentJobs.length) {
      setLines([]);
      setGeometryNote("");
      return undefined;
    }
    const missing = [];
    const seen = new Set();
    currentJobs.forEach(job => {
      if (seen.has(job.fetchKey) || cacheRef.current.has(job.fetchKey)) return;
      seen.add(job.fetchKey);
      missing.push(job);
    });
    if (!missing.length) {
      setLines(publish());
      setGeometryNote("");
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    Promise.all(missing.map(job => {
      const params = new URLSearchParams({
        road_section_id: job.roadSectionId,
        carriageway: job.carriageway,
        chainage_min: String(Math.max(0, job.min - 0.2)),
        chainage_max: String(job.max + 0.2)
      });
      return fetch(`/api/chainage/section?${params.toString()}`, { signal: controller.signal })
        .then(res => {
          if (!res.ok) throw new Error("Road geometry request failed.");
          return res.json();
        })
        .then(data => {
          if (!active) return;
          cacheRef.current.set(job.fetchKey, data.points || []);
        });
    }))
      .then(() => {
        if (!active) return;
        setLines(publish());
        setGeometryNote("");
      })
      .catch(err => {
        if (!active || err.name === "AbortError") return;
        console.error(err);
        setLines(publish());
        setGeometryNote("Some road geometry could not be loaded.");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [geometryKey, state.showOnMap]);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const token = state.centerToken || 0;
    if (!token) return undefined;
    const current = stateRef.current;
    const project = current.projects.find(item => item.id === current.activeProjectId) || current.projects[0];
    if (!project) return undefined;
    const rows = listSites([project]).filter(row => (
      row.zone && row.site.roadSectionId && row.site.carriageway
    ));
    if (!rows.length) return undefined;
    const controller = new AbortController();
    let active = true;
    Promise.all(rows.map(row => {
      const key = rangeKey(row.site, row.zone);
      const cached = cacheRef.current.get(key);
      if (cached) return Promise.resolve(cached);
      const params = new URLSearchParams({
        road_section_id: String(row.site.roadSectionId),
        carriageway: String(row.site.carriageway),
        chainage_min: String(Math.max(0, row.zone.combined.start - 0.2)),
        chainage_max: String(row.zone.combined.end + 0.2)
      });
      return fetch(`/api/chainage/section?${params.toString()}`, { signal: controller.signal })
        .then(res => (res.ok ? res.json() : { points: [] }))
        .then(data => {
          const points = data.points || [];
          cacheRef.current.set(key, points);
          return points;
        });
    }))
      .then(groups => {
        if (!active) return;
        const fit = boundsFromPoints(groups);
        if (fit) setBounds(fit);
        else setGeometryNote("Could not find this project on the map.");
      })
      .catch(err => {
        if (!active || err.name === "AbortError") return;
        console.error(err);
        setGeometryNote("Could not find this project on the map.");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [state.centerToken, setBounds]);

  const pointsBySite = useMemo(() => {
    const map = new Map();
    lines.forEach(line => map.set(line.siteId, line.points));
    return map;
  }, [lines]);

  const visible = catalog.filter(row => state.showOnMap && siteActiveOnDate(row.site, state.timelineDate));
  const overlaps = state.showOnMap ? findOverlaps(state.projects, state.timelineDate) : [];
  const extent = timelineExtent(state.projects);
  const span = extent ? Math.max(0, daysBetween(extent.start, extent.end)) : 0;
  const ruler = extent && span > 0 ? timelineRuler(extent.start, extent.end) : { breaks: [], months: [] };
  const sliderIndex = extent && state.timelineDate
    ? Math.min(span, Math.max(0, daysBetween(extent.start, state.timelineDate)))
    : 0;

  const viewportZoom = bbox?.zoom ?? 0;
  const showIntervalPoints = chainageShowIntervalPoints(viewportZoom);
  const pointColor = darkMode ? "#7dd3fc" : "#0369a1";
  const { intervalMarkers, intervalPoints } = useMemo(() => {
    if (!canLoadMarkers) return { intervalMarkers: [], intervalPoints: [] };
    const { markers, labeledPointKeys } = pickChainageIntervalMarkers(points, viewportZoom);
    const blue = points.filter(point => !labeledPointKeys.has(chainagePointKey(point)));
    return {
      intervalMarkers: markers,
      intervalPoints: showIntervalPoints ? blue : []
    };
  }, [canLoadMarkers, points, showIntervalPoints, viewportZoom]);

  const acceptPickRef = useRef(true);
  useEffect(() => {
    acceptPickRef.current = true;
  }, [state.pick]);

  function choosePoint(point) {
    if (!acceptPickRef.current) return;
    const current = stateRef.current;
    const next = applyChainagePick(current, point);
    if (next === current) return;
    acceptPickRef.current = false;
    onStateChange(next);
  }

  const showZoomHint = picking && (bbox?.zoom ?? zoom) < minZoom;

  return (
    <div className="map-view-root">
      {picking ? (
        <div className="planning-pick-banner" role="status">
          <span>
            {state.pick.field === "chainageFrom"
              ? "Click a chainage marker for the start"
              : "Click a chainage marker for the finish"}
          </span>
          <button
            type="button"
            onClick={() => onStateChange(cancelChainagePick(stateRef.current))}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {geometryNote ? (
        <div className="planning-geometry-note" role="status">{geometryNote}</div>
      ) : null}
      {showZoomHint ? (
        <div
          className="chainage-zoom-hint"
          style={extent ? { bottom: 100 } : undefined}
          role="status"
        >
          Zoom in slightly to view chainage markers
        </div>
      ) : null}
      {extent ? (
        <div className="planning-timeline">
          <button
            type="button"
            className={state.timelineDate ? "" : "is-on"}
            onClick={() => onStateChange({ ...state, timelineDate: "" })}
          >
            All dates
          </button>
          {span === 0 ? (
            <button
              type="button"
              className={state.timelineDate ? "is-on" : ""}
              onClick={() => onStateChange({ ...state, timelineDate: extent.start })}
            >
              {formatDate(extent.start)}
            </button>
          ) : (
            <div className="planning-timeline-slider">
              <div className="planning-timeline-ruler" aria-hidden="true">
                {ruler.breaks.map(mark => (
                  <span key={mark.key} className="planning-timeline-break" style={{ left: `${mark.percent}%` }} />
                ))}
                {ruler.months.map(month => (
                  month.label ? (
                    <span key={month.key} className="planning-timeline-month" style={{ left: `${month.percent}%` }}>
                      {month.label}{month.showYear ? ` '${month.year}` : ""}
                    </span>
                  ) : null
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={span}
                step={1}
                value={sliderIndex}
                aria-label="Planning date"
                onChange={event => onStateChange({
                  ...state,
                  timelineDate: addDays(extent.start, Number(event.target.value))
                })}
              />
            </div>
          )}
          {span > 0 ? (
            <span className="planning-timeline-date">
              {state.timelineDate ? formatDate(state.timelineDate) : "All dates"}
            </span>
          ) : null}
        </div>
      ) : null}
      <MapContainer
        center={center}
        zoom={zoom}
        preferCanvas
        style={{ height: "100%", width: "100%", borderRadius: 12, minHeight: 320 }}
      >
        <MapController center={center} bounds={bounds} zoom={zoom} onBoundsApplied={clearBounds} />
        <MapViewportSync onViewportChange={setMapViewport} />
        <ViewportWatcher onViewportChange={setBbox} />
        <MapBaseLayer showAerial={showAerial} darkMode={darkMode} greyScale={greyScale} />
        {visible.map(row => {
          const roadPoints = pointsBySite.get(row.site.id) || [];
          const approach = lineForRange(roadPoints, row.zone.approach.start, row.zone.approach.end);
          const work = lineForRange(roadPoints, row.zone.work.start, row.zone.work.end);
          const departure = lineForRange(roadPoints, row.zone.departure.start, row.zone.departure.end);
          const anchor = work ? null : pointNearChainage(roadPoints, row.zone.work.start);
          return (
            <React.Fragment key={row.site.id}>
              {approach ? (
                <Polyline positions={approach} pathOptions={APPROACH} interactive={!picking} />
              ) : null}
              {departure ? (
                <Polyline positions={departure} pathOptions={DEPARTURE} interactive={!picking} />
              ) : null}
              {work ? (
                <Polyline positions={work} pathOptions={WORK} interactive={!picking}>
                  <SitePopup project={row.project} site={row.site} zone={row.zone} />
                </Polyline>
              ) : null}
              {anchor ? (
                <CircleMarker
                  center={anchor}
                  radius={7}
                  pathOptions={{ color: "#0c6e78", fillColor: "#0c6e78", fillOpacity: 0.9, weight: 2 }}
                  interactive={!picking}
                >
                  <SitePopup project={row.project} site={row.site} zone={row.zone} />
                </CircleMarker>
              ) : null}
            </React.Fragment>
          );
        })}
        {overlaps.filter(hit => hit.sameTime).map(hit => {
          const roadPoints = pointsBySite.get(hit.left.site.id) || pointsBySite.get(hit.right.site.id) || [];
          const positions = lineForRange(roadPoints, hit.range.start, hit.range.end);
          if (!positions) return null;
          return (
            <Polyline
              key={`${hit.left.site.id}-${hit.right.site.id}`}
              positions={positions}
              pathOptions={OVERLAP}
              interactive={!picking}
            >
              <Popup>
                <b>Overlapping signage</b>
                <br />
                {siteLabel(hit.left.site)} ({projectLabel(hit.left.project)})
                <br />
                {siteLabel(hit.right.site)} ({projectLabel(hit.right.project)})
                <br />
                {formatLength(hit.km)}
              </Popup>
            </Polyline>
          );
        })}
        {intervalMarkers.map(({ point: markerPoint, tickKm, tierId, label }, idx) => (
          <Marker
            key={`${tierId}-${markerPoint.Road_Section_Id}-${markerPoint.Carriageway_Code}-${tickKm}-${idx}`}
            position={[markerPoint.Latitude, markerPoint.Longitude]}
            icon={chainageIntervalIcon(label, tierId, darkMode)}
            zIndexOffset={chainageIntervalZIndex(tierId)}
            eventHandlers={{ click: () => choosePoint(markerPoint) }}
          />
        ))}
        {intervalPoints.map((markerPoint, idx) => (
          <CircleMarker
            key={`pick-${markerPoint.Road_Section_Id}-${markerPoint.Carriageway_Code}-${markerPoint.Tdist_Start}-${idx}`}
            center={[markerPoint.Latitude, markerPoint.Longitude]}
            radius={4}
            pathOptions={{ color: pointColor, fillColor: pointColor, fillOpacity: 0.85, weight: 1 }}
            eventHandlers={{ click: () => choosePoint(markerPoint) }}
          />
        ))}
      </MapContainer>
    </div>
  );
}

export default PlanningView;
