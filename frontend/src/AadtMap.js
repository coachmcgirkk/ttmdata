import React from "react";
import PublishNotes from "./PublishNotes";
import { MapContainer, Marker, Popup, Polyline } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useAadtMap } from "./context/AadtMapContext";
import { GOLD_COAST_MARKER_COLOR } from "./colorPalette";
import { MapController, MapClearClick, MapViewportSync, speedToColor } from "./map/mapUtils";
import MapBaseLayer from "./map/MapBaseLayer";
import MapLoadingOverlay from "./components/MapLoadingOverlay";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

function AadtMap() {
  const {
    darkMode,
    onSelectSite,
    sites,
    sitesLoading,
    goldCoastLoading,
    oversizeLoading,
    showMarkers,
    showGoldCoastCounts,
    goldCoastCounts,
    goldCoastGrowth,
    center,
    bounds,
    zoom,
    setMapViewport,
    clearBounds,
    showOversizeRoutes,
    oversizeRoutes,
    showAerial,
    greyScale
  } = useAadtMap();

  const loading =
    (showMarkers && sitesLoading) ||
    (showGoldCoastCounts && goldCoastLoading) ||
    (showOversizeRoutes && oversizeLoading);

  const loadingLabel = sitesLoading && showMarkers
    ? "Loading AADT sites…"
    : goldCoastLoading && showGoldCoastCounts
      ? "Loading Gold Coast counts…"
      : "Loading map data…";

  return (
    <div className={`map-view-root${loading ? " is-loading" : ""}`}>
      <MapLoadingOverlay show={loading} label={loadingLabel} />
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
        <MapClearClick onClear={() => onSelectSite(null)} />
        <MapBaseLayer showAerial={showAerial} darkMode={darkMode} greyScale={greyScale} />
        {showOversizeRoutes &&
          oversizeRoutes.map((feature, i) => {
            if (feature.geometry?.type === "LineString") {
              return (
                <Polyline
                  key={i}
                  positions={feature.geometry.coordinates.map(([lng, lat]) => [lat, lng])}
                  pathOptions={{ color: "#2980b9", weight: 5, opacity: 0.7 }}
                >
                  {(feature.properties?.name || feature.properties?.Description) && (
                    <Popup>
                      <b>{feature.properties.name || "Oversize Route"}</b>
                      <br />
                      {feature.properties.Description}
                    </Popup>
                  )}
                </Polyline>
              );
            }
            return null;
          })}
        <MarkerClusterGroup>
          {showMarkers &&
            sites
              .filter(
                site =>
                  typeof site.SITE_LATITUDE === "number" &&
                  typeof site.SITE_LONGITUDE === "number" &&
                  !isNaN(site.SITE_LATITUDE) &&
                  !isNaN(site.SITE_LONGITUDE)
              )
              .map(site => {
                const speed = site.SPEED_LIMIT || 40;
                const color = speedToColor(speed);
                const icon = new L.Icon({
                  iconUrl: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='48' viewBox='0 0 32 48'><path d='M16 1C8 1 1 8 1 16c0 11 15 31 15 31s15-20 15-31C31 8 24 1 16 1z' fill='${encodeURIComponent(color)}' stroke='black' stroke-width='2'/></svg>`,
                  iconSize: [32, 48],
                  iconAnchor: [16, 48],
                  popupAnchor: [0, -48],
                  shadowUrl: markerShadow,
                  shadowSize: [41, 41],
                  shadowAnchor: [13, 41]
                });
                return (
                  <Marker
                    key={site.SITE_ID}
                    position={[site.SITE_LATITUDE, site.SITE_LONGITUDE]}
                    icon={icon}
                    eventHandlers={{ click: () => onSelectSite(site.SITE_ID) }}
                  >
                    <Popup>
                      <b>{site.ROAD_NAME}</b>
                      <br />
                      {site.DESCRIPTION}
                      <br />
                      <b>Speed Limit:</b> {speed} km/h
                      <PublishNotes notes={site.publishNotes} />
                    </Popup>
                  </Marker>
                );
              })}
          {showGoldCoastCounts &&
            goldCoastCounts.map((pt, i) => {
              let adjustedVPD = pt.VPD;
              let surveyYear = null;
              if (pt.SURVEY_DATE) {
                const match = String(pt.SURVEY_DATE).match(/(\d{4})/);
                if (match) surveyYear = parseInt(match[1], 10);
              }
              const nowYear = new Date().getFullYear();
              if (surveyYear && pt.VPD && !isNaN(pt.VPD)) {
                const years = Math.max(0, nowYear - surveyYear);
                adjustedVPD = Math.round(Number(pt.VPD) * Math.pow(1 + goldCoastGrowth / 100, years));
              }
              return (
                <Marker
                  key={pt.GlobalID || i}
                  position={[pt.lat, pt.lon]}
                  icon={new L.Icon({
                    iconUrl: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='48' viewBox='0 0 32 48'><circle cx='16' cy='24' r='14' fill='${encodeURIComponent(GOLD_COAST_MARKER_COLOR)}' stroke='black' stroke-width='2'/></svg>`,
                    iconSize: [32, 48],
                    iconAnchor: [16, 48],
                    popupAnchor: [0, -48],
                    shadowUrl: markerShadow,
                    shadowSize: [41, 41],
                    shadowAnchor: [13, 41]
                  })}
                >
                  <Popup>
                    <b>{pt.STREET}</b>
                    <br />
                    {pt.LOCATION}
                    <br />
                    <b>Survey Date:</b> {pt.SURVEY_DATE}
                    <br />
                    <b>Survey VPD:</b> {pt.VPD}
                    <br />
                    <b>Estimated VPD:</b> {adjustedVPD}{" "}
                    <span style={{ fontSize: 12, color: "#888" }}>({goldCoastGrowth}% growth)</span>
                    <br />
                    <b>Suburb:</b> {pt.SUBURB}
                  </Popup>
                </Marker>
              );
            })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}

export default AadtMap;
