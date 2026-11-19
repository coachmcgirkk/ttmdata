import React, { useMemo, useState } from "react";
import { MapContainer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import { MapClearClick, MapController, MapViewportSync, ClosePopupOnDrag } from "../map/mapUtils";
import MapBaseLayer from "../map/MapBaseLayer";
import {
  NSW_MARKER_COLOR,
  NSW_MARKER_HOURLY_COLOR,
  NSW_MARKER_SELECTED_COLOR
} from "./nswConstants";
import MapLoadingOverlay from "../components/MapLoadingOverlay";

function formatAadt(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Math.round(Number(value)).toLocaleString();
}

function markerIcon(color, selected) {
  const size = selected ? 14 : 11;
  const fill = selected ? NSW_MARKER_SELECTED_COLOR : color;
  return new L.DivIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${fill};border:2px solid #1e293b;box-shadow:0 1px 3px rgba(0,0,0,.35);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function NswMapView({
  stations,
  loading,
  darkMode,
  showAerial,
  greyScale,
  center,
  zoom,
  bounds,
  onViewportChange,
  onBoundsApplied,
  selectedStationKey,
  onSelectStation,
  filterPermanentOnly,
  filterHasHourly
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = stations;
    if (filterPermanentOnly) list = list.filter(s => s.permanent);
    if (filterHasHourly) list = list.filter(s => s.hasHourly);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(s => {
        const hay = [s.name, s.roadName, s.suburb, s.lga, s.region, String(s.stationId), String(s.stationKey)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [stations, filterPermanentOnly, filterHasHourly, search]);

  const icons = useMemo(
    () => ({
      yearly: markerIcon(NSW_MARKER_COLOR, false),
      hourly: markerIcon(NSW_MARKER_HOURLY_COLOR, false),
      selected: markerIcon(NSW_MARKER_SELECTED_COLOR, true)
    }),
    []
  );

  return (
    <div className={`map-view-root${loading ? " is-loading" : ""}`}>
      <MapLoadingOverlay show={loading} label="Loading NSW stations…" />
      <div className="nsw-map-search">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter stations on map…"
          aria-label="Filter NSW stations"
        />
        <span className="nsw-map-count">
          {filtered.length.toLocaleString()} station{filtered.length === 1 ? "" : "s"}
        </span>
      </div>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%", borderRadius: 12, minHeight: 320 }}
      >
        <MapController
          center={center}
          bounds={bounds}
          zoom={zoom}
          onBoundsApplied={onBoundsApplied}
        />
        <MapViewportSync onViewportChange={onViewportChange} />
        <MapClearClick onClear={() => onSelectStation(null)} />
        <ClosePopupOnDrag />
        <MapBaseLayer showAerial={showAerial} darkMode={darkMode} greyScale={greyScale} />
        <MarkerClusterGroup chunkedLoading showCoverageOnHover={false} maxClusterRadius={48}>
          {filtered.map(station => {
            const isSelected = station.stationKey === selectedStationKey;
            const icon = isSelected
              ? icons.selected
              : station.hasHourly
                ? icons.hourly
                : icons.yearly;
            return (
              <Marker
                key={station.stationKey}
                position={[station.latitude, station.longitude]}
                icon={icon}
                eventHandlers={{ click: () => onSelectStation(station.stationKey) }}
              >
                <Popup>
                  <strong>{station.name}</strong>
                  <br />
                  {station.roadName}
                  <br />
                  {station.suburb}
                  {station.lga ? `, ${station.lga}` : ""}
                  <br />
                  AADT {formatAadt(station.latestAadt)}
                  {station.latestYear ? ` (${station.latestYear})` : ""}
                  {station.hasHourly ? " · hourly sample" : ""}
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}

export default NswMapView;
