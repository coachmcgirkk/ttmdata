import React, { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, useMap, useMapEvent, Polyline } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import proj4 from "proj4";
import Papa from "papaparse";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import JSZip from "jszip";
import { kml } from "@tmcw/togeojson";
import Modal from "react-modal";
import { speedToColor } from "./colorPalette";
import MapBaseLayer from "./map/MapBaseLayer";

// Define EPSG:28356 (GDA94 / MGA zone 56)
proj4.defs("EPSG:28356", "+proj=utm +zone=56 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

// Fix leaflet's default icon path issues with Webpack
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Helper component to imperatively control the map
function MapController({ center, bounds, zoom }) {
  const map = useMap();
  React.useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30] });
    } else if (center) {
      map.setView(center, zoom);
    }
  }, [center, bounds, zoom, map]);
  return null;
}

// Helper to clear selection on map click
function MapClearClick({ onClear }) {
  useMapEvent('click', () => {
    onClear();
  });
  return null;
}

function MapView({ onSelectSite, darkMode, onToggleDarkMode }) {
  const [sites, setSites] = useState([]);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showGoldCoastCounts, setShowGoldCoastCounts] = useState(false);
  const [goldCoastCounts, setGoldCoastCounts] = useState([]);
  const [goldCoastGrowth, setGoldCoastGrowth] = useState(3);
  const [searchAddress, setSearchAddress] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [center, setCenter] = useState([-27.96, 153.41]);
  const [bounds, setBounds] = useState(null);
  const [zoom, setZoom] = useState(12);
  const [showCrashStats, setShowCrashStats] = useState(false);
  const [crashStats, setCrashStats] = useState([]);
  const [crashYears, setCrashYears] = useState(5);
  const [showOversizeRoutes, setShowOversizeRoutes] = useState(false);
  const [oversizeRoutes, setOversizeRoutes] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [datasourceText, setDatasourceText] = useState("");
  const [recommendationLink, setRecommendationLink] = useState("");
  const [recommendationStatus, setRecommendationStatus] = useState("");
  const [showAerial, setShowAerial] = useState(false);
  const [greyScale, setGreyScale] = useState(false);

  useEffect(() => {
    fetch("/api/sites")
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to load sites (${res.status}). Is the backend running on port 1357?`);
        }
        return res.json();
      })
      .then(data => {
        console.log("Fetched sites:", data);
        setSites(data);
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (showGoldCoastCounts && goldCoastCounts.length === 0) {
      fetch("/api/goldcoast-traffic-counts-csv")
        .then(res => res.text())
        .then(text => {
          const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
          const features = parsed.data.map(obj => {
            const x = parseFloat(obj.x);
            const y = parseFloat(obj.y);
            if (!isFinite(x) || !isFinite(y)) return null;
            const [lon, lat] = proj4('EPSG:28356', 'WGS84', [x, y]);
            if (!isFinite(lat) || !isFinite(lon)) return null;
            obj.lat = lat;
            obj.lon = lon;
            return obj;
          }).filter(Boolean);
          setGoldCoastCounts(features);
        });
    }
  }, [showGoldCoastCounts, goldCoastCounts.length]);

  useEffect(() => {
    if (showCrashStats) {
      fetch(`/api/crash-points?years=${crashYears}`)
        .then(res => res.json())
        .then(data => setCrashStats(data));
    }
  }, [showCrashStats, crashYears]);

  useEffect(() => {
    if (showOversizeRoutes && oversizeRoutes.length === 0) {
      fetch("/api/oversize-routes.kmz")
        .then(res => res.arrayBuffer())
        .then(JSZip.loadAsync)
        .then(zip => {
          // Find the first KML file in the KMZ
          const kmlFile = Object.keys(zip.files).find(name => name.endsWith('.kml'));
          if (!kmlFile) throw new Error('No KML file found in KMZ');
          return zip.files[kmlFile].async('string');
        })
        .then(kmlText => {
          const dom = new window.DOMParser().parseFromString(kmlText, 'text/xml');
          const geojson = kml(dom);
          setOversizeRoutes(geojson.features || []);
        })
        .catch(err => {
          console.error('Failed to load oversize routes:', err);
        });
    }
  }, [showOversizeRoutes, oversizeRoutes.length]);

  const handleSearch = async (e) => {
    e.preventDefault();
    setSearchError("");
    if (!searchAddress.trim()) return;
    setSearchLoading(true);
    // Use Nominatim API for geocoding
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.length > 0) {
        const { lat, lon, boundingbox } = data[0];
        if (boundingbox) {
          // boundingbox: [south, north, west, east]
          const fitBounds = [
            [parseFloat(boundingbox[0]), parseFloat(boundingbox[2])], // SW
            [parseFloat(boundingbox[1]), parseFloat(boundingbox[3])]  // NE
          ];
          setBounds(fitBounds);
        } else {
          setCenter([parseFloat(lat), parseFloat(lon)]);
          setZoom(15); // Zoom in closer
          setBounds(null);
        }
        setSearchError("");
      } else {
        setSearchError("Address not found. Please try a different search.");
      }
    } catch (err) {
      setSearchError("Error searching for address. Please try again later.");
    } finally {
      setSearchLoading(false);
    }
  };

  const openDatasourceModal = async () => {
    setModalOpen(true);
    if (!datasourceText) {
      try {
        const res = await fetch("/api/datasources");
        const text = await res.text();
        setDatasourceText(text);
      } catch (e) {
        setDatasourceText("Failed to load data sources.");
      }
    }
  };

  const closeDatasourceModal = () => setModalOpen(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        gap: 12,
        width: "100%",
        height: "100%",
        minHeight: 0
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          background: darkMode ? "#23272f" : "#f8f9fa",
          color: darkMode ? "#f1f5f9" : "#181a1b",
          borderRadius: 12,
          padding: 16,
          boxShadow: darkMode ? "0 2px 8px rgba(0,0,0,0.7)" : "0 2px 8px rgba(0,0,0,0.1)",
          overflowY: "auto"
        }}
      >
        <form onSubmit={handleSearch} style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Reposition Map</div>
          <input
            type="text"
            placeholder="Enter address or place name"
            value={searchAddress}
            onChange={e => setSearchAddress(e.target.value)}
            style={{ width: "90%", marginBottom: 6, borderRadius: 4, border: "1px solid #ccc", padding: 4 }}
            disabled={searchLoading}
          />
          <button type="submit" style={{ width: 80, borderRadius: 4, padding: 6, background: darkMode ? "#444" : "#e0e0e0", color: darkMode ? "#f1f5f9" : "#181a1b", border: "none", fontWeight: 600, transition: 'none' }} disabled={searchLoading}>
            {searchLoading ? "Searching..." : "Go"}
          </button>
          {searchError && (
            <div style={{ color: "#e57373", marginTop: 6, fontSize: 13 }}>{searchError}</div>
          )}
        </form>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={showMarkers} onChange={e => setShowMarkers(e.target.checked)} />
            Show TMR AADT Counts
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={showGoldCoastCounts} onChange={e => setShowGoldCoastCounts(e.target.checked)} />
            Show Gold Coast Traffic Counts
          </label>
          {showGoldCoastCounts && (
            <div style={{ marginTop: 8, marginLeft: 24 }}>
              <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                Assumed growth: <b>{goldCoastGrowth}%</b>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.1}
                  value={goldCoastGrowth}
                  onChange={e => setGoldCoastGrowth(Number(e.target.value))}
                  style={{ width: 120, marginLeft: 8 }}
                />
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.1}
                  value={goldCoastGrowth}
                  onChange={e => {
                    let val = Number(e.target.value);
                    if (isNaN(val)) val = 0;
                    if (val < 0) val = 0;
                    if (val > 20) val = 20;
                    setGoldCoastGrowth(val);
                  }}
                  style={{ width: 50, marginLeft: 8, fontSize: 14, padding: '2px 4px', borderRadius: 4, border: '1px solid #ccc' }}
                />
              </label>
            </div>
          )}
        </div>
        <div style={{ marginBottom: 12, opacity: 0.5, pointerEvents: 'none' }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={false} disabled />
            Show Crash Statistics <span style={{ fontStyle: 'italic', color: '#888', marginLeft: 4 }}>(feature coming soon)</span>
          </label>
          <div style={{ marginTop: 8 }}>
            <label>
              Last 5 years
              <input
                type="range"
                min={1}
                max={15}
                value={5}
                disabled
                style={{ width: 120, marginLeft: 8 }}
              />
            </label>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={showAerial} onChange={e => setShowAerial(e.target.checked)} />
            Aerial Map Imagery
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={greyScale} onChange={e => setGreyScale(e.target.checked)} />
            Grey Scale
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={darkMode} onChange={e => onToggleDarkMode?.(e.target.checked)} />
            Dark Mode
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: '#aaa', cursor: 'not-allowed' }}>
            <input type="checkbox" checked={false} disabled style={{ accentColor: '#aaa' }} />
            Show Oversize Routes <span style={{ fontStyle: 'italic', fontSize: 13 }}>(feature coming soon)</span>
          </label>
        </div>
        <div style={{ marginBottom: 12, fontStyle: "italic", color: darkMode ? "#aaa" : "#555" }}>
          {/* Placeholder for additional data sets */}
          <span>Additional Data Sets (coming soon)</span>
        </div>
        <div style={{ marginBottom: 12, width: 325 }}>
          <button onClick={openDatasourceModal} style={{ width: '100%', padding: 8, fontSize: 15, background: '#2980b9', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Data Source
          </button>
        </div>
        <div style={{ marginBottom: 12, fontSize: 13, color: '#b00', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '8px 10px', width: 325, wordBreak: 'break-word' }}>
          This website is an experimental project. All data should be verified prior to use and used in conjunction with engineering judgement.
        </div>
        <div style={{ marginBottom: 12, fontSize: 13, color: '#222', background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 6, padding: '8px 10px', width: 325 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Have more data? Send a link</div>
          <form
            onSubmit={async e => {
              e.preventDefault();
              if (!recommendationLink.trim()) return;
              setRecommendationStatus('');
              try {
                const res = await fetch('/api/recommendation', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ link: recommendationLink })
                });
                const data = await res.json();
                if (data.success) {
                  setRecommendationStatus('Thank you! Link submitted.');
                  setRecommendationLink('');
                } else {
                  setRecommendationStatus(data.error || 'Failed to submit.');
                }
              } catch (err) {
                setRecommendationStatus('Failed to submit.');
              }
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            <input
              type="url"
              placeholder="Paste link here"
              value={recommendationLink}
              onChange={e => setRecommendationLink(e.target.value)}
              style={{ fontSize: 13, padding: '4px 6px', borderRadius: 4, border: '1px solid #ccc', marginBottom: 2 }}
              required
            />
            <button type="submit" style={{ fontSize: 13, padding: '4px 0', borderRadius: 4, border: 'none', background: '#1890ff', color: 'white', cursor: 'pointer' }}>Send</button>
            {recommendationStatus && <div style={{ fontSize: 12, color: recommendationStatus.startsWith('Thank') ? 'green' : 'red' }}>{recommendationStatus}</div>}
          </form>
        </div>
        <Modal
          isOpen={modalOpen}
          onRequestClose={closeDatasourceModal}
          contentLabel="Data Sources"
          style={{
            overlay: { backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 2000 },
            content: { maxWidth: 500, margin: 'auto', borderRadius: 8, padding: 24, zIndex: 2100 }
          }}
        >
          <h2>Data Sources</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f8f8f8', padding: 12, borderRadius: 4, fontSize: 14 }}>{datasourceText}</pre>
          <button onClick={closeDatasourceModal} style={{ marginTop: 16, padding: '6px 18px', fontSize: 15, background: '#2980b9', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Close</button>
        </Modal>
      </div>
      {/* Map */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: "100%", width: "100%", borderRadius: 12, minHeight: 320 }}
        >
          <MapController center={center} bounds={bounds} zoom={zoom} />
          <MapClearClick onClear={() => onSelectSite(null)} />
          <MapBaseLayer showAerial={showAerial} darkMode={darkMode} greyScale={greyScale} />
          {showOversizeRoutes && oversizeRoutes.map((feature, i) => {
            if (feature.geometry.type === 'LineString') {
              return (
                <Polyline
                  key={i}
                  positions={feature.geometry.coordinates.map(([lng, lat]) => [lat, lng])}
                  pathOptions={{ color: '#2980b9', weight: 5, opacity: 0.7 }}
                >
                  {feature.properties && (feature.properties.name || feature.properties.Description) && (
                    <Popup>
                      <b>{feature.properties.name || 'Oversize Route'}</b><br />
                      {feature.properties.Description}
                    </Popup>
                  )}
                </Polyline>
              );
            }
            // Optionally handle MultiLineString, Polygon, etc.
            return null;
          })}
          <MarkerClusterGroup>
            {showMarkers && sites
              .filter(site =>
                typeof site.SITE_LATITUDE === "number" &&
                typeof site.SITE_LONGITUDE === "number" &&
                !isNaN(site.SITE_LATITUDE) &&
                !isNaN(site.SITE_LONGITUDE)
              )
              .map(site => {
                // Get speed limit (default to 40 if missing)
                const speed = site.SPEED_LIMIT || 40;
                const color = speedToColor(speed);
                // Create a custom colored icon
                const icon = new L.Icon({
                  iconUrl: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='48' viewBox='0 0 32 48'><path d='M16 1C8 1 1 8 1 16c0 11 15 31 15 31s15-20 15-31C31 8 24 1 16 1z' fill='${encodeURIComponent(color)}' stroke='black' stroke-width='2'/></svg>` ,
                  iconSize: [32, 48],
                  iconAnchor: [16, 48],
                  popupAnchor: [0, -48],
                  shadowUrl: markerShadow,
                  shadowSize: [41, 41],
                  shadowAnchor: [13, 41],
                });
                return (
                  <Marker
                    key={site.SITE_ID}
                    position={[site.SITE_LATITUDE, site.SITE_LONGITUDE]}
                    icon={icon}
                    eventHandlers={{
                      click: () => onSelectSite(site.SITE_ID)
                    }}
                  >
                    <Popup>
                      <b>{site.ROAD_NAME}</b>
                      <br />
                      {site.DESCRIPTION}
                      <br />
                      <b>Speed Limit:</b> {speed} km/h
                    </Popup>
                  </Marker>
                );
              })}
            {showGoldCoastCounts && goldCoastCounts.map((pt, i) => {
              // Calculate adjusted VPD with compounding growth
              let adjustedVPD = pt.VPD;
              let surveyYear = null;
              if (pt.SURVEY_DATE) {
                // Try to extract year from SURVEY_DATE (supports YYYY or DD/MM/YYYY)
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
                    iconUrl: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='48' viewBox='0 0 32 48'><circle cx='16' cy='24' r='14' fill='%23e67e22' stroke='black' stroke-width='2'/></svg>` ,
                    iconSize: [32, 48],
                    iconAnchor: [16, 48],
                    popupAnchor: [0, -48],
                    shadowUrl: markerShadow,
                    shadowSize: [41, 41],
                    shadowAnchor: [13, 41],
                  })}
                >
                  <Popup>
                    <b>{pt.STREET}</b><br />
                    {pt.LOCATION}<br />
                    <b>Survey Date:</b> {pt.SURVEY_DATE}<br />
                    <b>Survey VPD:</b> {pt.VPD}<br />
                    <b>Estimated VPD:</b> {adjustedVPD} <span style={{ fontSize: 12, color: '#888' }}>({goldCoastGrowth}% growth)</span><br />
                    <b>Suburb:</b> {pt.SUBURB}
                  </Popup>
                </Marker>
              );
            })}
            {showCrashStats && crashStats.map((crash, i) => (
              <Marker
                key={crash.Crash_Ref_Number || i}
                position={[crash.Crash_Latitude, crash.Crash_Longitude]}
                icon={new L.Icon({
                  iconUrl: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='48' viewBox='0 0 32 48'><circle cx='16' cy='24' r='14' fill='%23c0392b' stroke='black' stroke-width='2'/></svg>` ,
                  iconSize: [32, 48],
                  iconAnchor: [16, 48],
                  popupAnchor: [0, -48],
                  shadowUrl: markerShadow,
                  shadowSize: [41, 41],
                  shadowAnchor: [13, 41],
                })}
              >
                <Popup>
                  <b>Crash Severity:</b> {crash.Crash_Severity}<br />
                  <b>Nature:</b> {crash.Crash_Nature}<br />
                  <b>Type:</b> {crash.Crash_Type}<br />
                  <b>Speed Limit:</b> {crash.Crash_Speed_Limit}<br />
                  <b>Hour:</b> {crash.Crash_Hour}<br />
                  <b>Atmospheric:</b> {crash.Crash_Atmospheric_Condition}<br />
                  <b>Lighting:</b> {crash.Crash_Lighting_Condition}<br />
                  <b>Year:</b> {crash.Crash_Year}
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
    </div>
  );
}

export default MapView;