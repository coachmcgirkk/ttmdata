import React, { useEffect, useMemo, useState } from "react";
import PublishNotes from "./PublishNotes";
import { MapContainer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import { useAadtMap } from "./context/AadtMapContext";
import { MapClearClick, MapController, MapViewportSync, ClosePopupOnDrag } from "./map/mapUtils";
import MapBaseLayer from "./map/MapBaseLayer";
import { GazettalDirectionArrows, GazettalDirectionLegend, popupOffsetForBearing } from "./map/gazettalArrows";
import MapLoadingOverlay from "./components/MapLoadingOverlay";

function HourlyVolumesView({
  state,
  darkMode,
  showAerial,
  greyScale,
  selectedSiteId,
  onSelectSite,
  recordYear
}) {
  const { center, zoom, bounds, setMapViewport, clearBounds } = useAadtMap();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    fetch("/api/hourly-volumes/sites", { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!cancelled) setSites(data);
      })
      .catch(err => {
        if (err.name !== "AbortError") {
          console.error(err);
          if (!cancelled) setSites([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const hourlyIcon = new L.DivIcon({
    className: "",
    html: `<div style="width:18px;height:18px;box-sizing:border-box;border-radius:50%;background:#fbbf24;opacity:1;border:2px solid #111316;box-shadow:0 0 0 1px rgba(0,0,0,.55);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });

  const selectedSite = useMemo(
    () => sites.find(site => site.siteId === selectedSiteId) || null,
    [sites, selectedSiteId]
  );

  const showDirectionArrows =
    selectedSite &&
    selectedSite.gazettalBearing != null &&
    isFinite(Number(selectedSite.gazettalBearing));

  return (
    <div className={`map-view-root${loading ? " is-loading" : ""}`}>
      <MapLoadingOverlay show={loading} label="Loading hourly volumes…" />
      {showDirectionArrows && <GazettalDirectionLegend darkMode={darkMode} />}
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
        <ClosePopupOnDrag />
        <MapBaseLayer showAerial={showAerial} darkMode={darkMode} greyScale={greyScale} />
        {state.showOnMap && (
          <MarkerClusterGroup>
            {sites.map(site => {
              const lat = Number(site.latitude);
              const lon = Number(site.longitude);
              if (!isFinite(lat) || !isFinite(lon)) return null;
              const selected = selectedSiteId === site.siteId;
              const popupOffset =
                selected && site.gazettalBearing != null && isFinite(Number(site.gazettalBearing))
                  ? popupOffsetForBearing(Number(site.gazettalBearing))
                  : [0, -18];
              return (
                <Marker
                  key={site.siteId}
                  position={[lat, lon]}
                  icon={
                    selected
                      ? new L.DivIcon({
                          className: "",
                          html: `<div style="width:22px;height:22px;box-sizing:border-box;border-radius:50%;background:#ffffff;opacity:1;border:3px solid #111316;box-shadow:0 0 0 1px rgba(0,0,0,.65);"></div>`,
                          iconSize: [22, 22],
                          iconAnchor: [11, 11]
                        })
                      : hourlyIcon
                  }
                  eventHandlers={{ click: () => onSelectSite(site.siteId) }}
                >
                  <Popup
                    offset={popupOffset}
                    className="hourly-site-popup"
                    autoPan={false}
                    closeButton
                  >
                    <b>
                      {site.roadName}
                      {recordYear ? ` · ${recordYear}` : ""}
                    </b>
                    <br />
                    {site.description}
                    <br />
                    Site {site.siteId}
                    <PublishNotes notes={site.publishNotes} />
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        )}
        {showDirectionArrows && (
          <GazettalDirectionArrows
            lat={Number(selectedSite.latitude)}
            lon={Number(selectedSite.longitude)}
            bearing={Number(selectedSite.gazettalBearing)}
          />
        )}
      </MapContainer>
    </div>
  );
}

export default HourlyVolumesView;
