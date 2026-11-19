import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NswSidebar from "./NswSidebar";
import NswMapView from "./NswMapView";
import NswStationDetailPanel from "./NswStationDetailPanel";
import "../App.css";
import "./NswTrafficPage.css";

function NswTrafficPage() {
  const [meta, setMeta] = useState(null);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStationKey, setSelectedStationKey] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [showAerial, setShowAerial] = useState(false);
  const [greyScale, setGreyScale] = useState(false);
  const [center, setCenter] = useState([-33.87, 151.21]);
  const [zoom, setZoom] = useState(7);
  const [bounds, setBounds] = useState(null);
  const [filters, setFilters] = useState({
    period: "ALL DAYS",
    classification: "ALL VEHICLES",
    hourlyClassification: 0,
    permanentOnly: false,
    hasHourlyOnly: false
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/nsw/meta", { signal: controller.signal })
      .then(res => res.json().then(body => ({ ok: res.ok, body })))
      .then(({ body }) => {
        setMeta(body);
        if (body?.ready) {
          setFilters(prev => ({
            ...prev,
            period: body.defaultPeriod || prev.period,
            classification: body.defaultClassification || prev.classification,
            hourlyClassification:
              body.defaultHourlyClassification ?? prev.hourlyClassification
          }));
          if (body.mapCenter) setCenter(body.mapCenter);
          if (body.mapZoom) setZoom(body.mapZoom);
        } else {
          setError(body?.error || "NSW data is not ready.");
        }
      })
      .catch(err => {
        if (err.name !== "AbortError") setError("Failed to load NSW meta.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (meta && meta.ready === false) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    fetch("/api/nsw/stations", { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!cancelled) setStations(data);
      })
      .catch(err => {
        if (err.name !== "AbortError" && !cancelled) {
          setStations([]);
          setError(err.message || "Failed to load NSW stations.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [meta]);

  const setMapViewport = useCallback((nextCenter, nextZoom) => {
    setCenter(nextCenter);
    setZoom(nextZoom);
  }, []);

  const clearBounds = useCallback(() => setBounds(null), []);

  const selectedSummary = useMemo(
    () => stations.find(s => s.stationKey === selectedStationKey) || null,
    [stations, selectedStationKey]
  );

  const visibleCount = useMemo(() => {
    let list = stations;
    if (filters.permanentOnly) list = list.filter(s => s.permanent);
    if (filters.hasHourlyOnly) list = list.filter(s => s.hasHourly);
    return list.length;
  }, [stations, filters.permanentOnly, filters.hasHourlyOnly]);

  const appStyle = {
    background: darkMode ? "#111316" : "#f4f5f6",
    color: darkMode ? "#f1f5f9" : "#181a1b",
    transition: "background 0.3s, color 0.3s"
  };

  return (
    <div className={`app-shell ${darkMode ? "app-shell-dark" : ""}`} style={appStyle}>
      <header className="app-header nsw-header">
        <div className="nsw-header-titles">
          <h1>NSW Traffic Volumes</h1>
          <p className="nsw-header-sub">
            TfNSW yearly AADT summary and hourly sample counts
          </p>
        </div>
        <Link className="nsw-region-link" to="/">
          ← Queensland map
        </Link>
      </header>

      {error && meta?.ready === false ? (
        <div className="nsw-error-banner">{error}</div>
      ) : (
        <div className="workspace">
          <NswSidebar
            meta={meta}
            filters={filters}
            onFiltersChange={setFilters}
            darkMode={darkMode}
            onDarkModeChange={setDarkMode}
            showAerial={showAerial}
            onShowAerialChange={setShowAerial}
            greyScale={greyScale}
            onGreyScaleChange={setGreyScale}
            stationCount={visibleCount}
            selectedSummary={selectedSummary}
          />
          <div className="main-panel">
            <div className="map-area">
              <NswMapView
                stations={stations}
                loading={loading}
                darkMode={darkMode}
                showAerial={showAerial}
                greyScale={greyScale}
                center={center}
                zoom={zoom}
                bounds={bounds}
                onViewportChange={setMapViewport}
                onBoundsApplied={clearBounds}
                selectedStationKey={selectedStationKey}
                onSelectStation={setSelectedStationKey}
                filterPermanentOnly={filters.permanentOnly}
                filterHasHourly={filters.hasHourlyOnly}
              />
              <aside
                className={`chart-overlay-panel${selectedStationKey ? "" : " is-empty"}`}
                aria-label="NSW station details"
              >
                <NswStationDetailPanel
                  stationKey={selectedStationKey}
                  period={filters.period}
                  classification={filters.classification}
                  hourlyClassification={filters.hourlyClassification}
                  darkMode={darkMode}
                />
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NswTrafficPage;
