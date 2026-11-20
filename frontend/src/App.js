import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppNav from "./components/AppNav";
import MapSearchBar from "./components/MapSearchBar";
import { AadtMapProvider } from "./context/AadtMapContext";
import AadtMap from "./AadtMap";
import SiteInfo from "./SiteInfo";
import CrashHistoryView from "./CrashHistoryView";
import CrashDetailPanel from "./CrashDetailPanel";
import ChainageView from "./ChainageView";
import ChainageDetailPanel from "./ChainageDetailPanel";
import PlanningView from "./PlanningView";
import { createInitialPlanning } from "./planningModel";
import HourlyVolumesView from "./HourlyVolumesView";
import HourlyVolumesDetailPanel from "./HourlyVolumesDetailPanel";
import MapLoadingOverlay from "./components/MapLoadingOverlay";
import { DEFAULT_ENABLED_HOURLY_DAYS } from "./hourlyVolumeConstants";
import "./App.css";

const defaultHourlyState = {
  showOnMap: false,
  direction: "GAZETTAL",
  enabledDays: [...DEFAULT_ENABLED_HOURLY_DAYS]
};

const currentYear = new Date().getFullYear();

function defaultCrashFilters(meta) {
  const maxYear = meta?.yearMax ?? currentYear - 1;
  const minYear = meta ? Math.max(meta.yearMin, maxYear - 4) : maxYear - 4;
  return {
    showOnMap: false,
    minYear,
    maxYear,
    severities: meta?.severities ? [...meta.severities] : [],
    regions: meta?.regions ? [...meta.regions] : [],
    fatalOnly: false
  };
}

function App() {
  const [activeView, setActiveView] = useState("aadt");
  const [aadtEnabled, setAadtEnabled] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({
    aadt: false,
    hourly: false,
    crash: false,
    chainage: false,
    planning: false,
    mapOptions: false
  });
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedHourlySiteId, setSelectedHourlySiteId] = useState(null);
  const [hourlyGazettalBearing, setHourlyGazettalBearing] = useState(null);
  const [selectedCrash, setSelectedCrash] = useState(null);
  const [selectedChainagePoint, setSelectedChainagePoint] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [showAerial, setShowAerial] = useState(false);

  const [crashMeta, setCrashMeta] = useState(null);
  const [crashFilters, setCrashFilters] = useState(null);
  const [crashLoading, setCrashLoading] = useState(false);
  const [crashResultInfo, setCrashResultInfo] = useState(null);
  const [chainageMeta, setChainageMeta] = useState(null);
  const [chainageState, setChainageState] = useState({ showOnMap: false, markerSize: 3 });
  const [planningState, setPlanningState] = useState(createInitialPlanning);
  const [chainageLoading, setChainageLoading] = useState(false);
  const [chainageResultInfo, setChainageResultInfo] = useState(null);
  const [hourlyMeta, setHourlyMeta] = useState(null);
  const [hourlyState, setHourlyState] = useState(defaultHourlyState);

  useEffect(() => {
    fetch("/api/hourly-volumes/meta")
      .then(res => res.json().then(meta => ({ ok: res.ok, meta })))
      .then(({ meta }) => setHourlyMeta(meta))
      .catch(err => console.error("Failed to load hourly meta:", err));
  }, []);

  useEffect(() => {
    fetch("/api/crash-locations/meta")
      .then(res => res.json().then(meta => ({ ok: res.ok, meta })))
      .then(({ ok, meta }) => {
        setCrashMeta(meta);
        if (ok && meta.ready !== false) {
          setCrashFilters(defaultCrashFilters(meta));
        }
      })
      .catch(err => console.error("Failed to load crash meta:", err));
  }, []);

  useEffect(() => {
    fetch("/api/chainage/meta")
      .then(res => res.json())
      .then(setChainageMeta)
      .catch(err => console.error("Failed to load chainage meta:", err));
  }, []);

  const handleToggleMenu = useCallback(key => {
    setExpandedMenus(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const applyLayerSelection = useCallback(
    key => {
      setAadtEnabled(key === "aadt");
      setHourlyState(prev => ({ ...prev, showOnMap: key === "hourly" }));
      setCrashFilters(prev => {
        const filters = prev || defaultCrashFilters(crashMeta);
        return { ...filters, showOnMap: key === "crash" };
      });
      setChainageState(prev => ({ ...prev, showOnMap: key === "chainage" }));
      setPlanningState(prev => ({
        ...prev,
        showOnMap: key === "planning",
        pick: key === "planning" ? prev.pick : null
      }));
      if (!key) return;

      setActiveView(key);
      if (key === "aadt") {
        setSelectedCrash(null);
        setSelectedChainagePoint(null);
        setSelectedHourlySiteId(null);
      } else if (key === "hourly") {
        setSelectedSite(null);
        setSelectedCrash(null);
        setSelectedChainagePoint(null);
      } else if (key === "crash") {
        setSelectedSite(null);
        setSelectedChainagePoint(null);
        setSelectedHourlySiteId(null);
      } else if (key === "chainage") {
        setSelectedSite(null);
        setSelectedCrash(null);
        setSelectedHourlySiteId(null);
      } else if (key === "planning") {
        setSelectedSite(null);
        setSelectedCrash(null);
        setSelectedChainagePoint(null);
        setSelectedHourlySiteId(null);
      }
    },
    [crashMeta]
  );

  const handleToggleLayer = useCallback(
    key => {
      const isEnabled = {
        aadt: aadtEnabled,
        hourly: hourlyState.showOnMap,
        crash: (crashFilters || defaultCrashFilters(crashMeta)).showOnMap,
        chainage: chainageState.showOnMap,
        planning: planningState.showOnMap
      }[key];

      if (isEnabled) {
        applyLayerSelection(null);
        return;
      }
      applyLayerSelection(key);
    },
    [
      aadtEnabled,
      hourlyState.showOnMap,
      crashFilters,
      crashMeta,
      chainageState.showOnMap,
      planningState.showOnMap,
      applyLayerSelection
    ]
  );

  const handleCrashFiltersChange = useCallback(
    next => {
      if (next.showOnMap) applyLayerSelection("crash");
      setCrashFilters(next);
    },
    [applyLayerSelection]
  );

  const handleHourlyStateChange = useCallback(
    next => {
      if (next.showOnMap) applyLayerSelection("hourly");
      setHourlyState(next);
    },
    [applyLayerSelection]
  );

  const handleChainageStateChange = useCallback(
    next => {
      if (next.showOnMap) applyLayerSelection("chainage");
      setChainageState(next);
    },
    [applyLayerSelection]
  );

  const handlePlanningStateChange = useCallback(
    next => {
      if (next.showOnMap) applyLayerSelection("planning");
      setPlanningState(next);
    },
    [applyLayerSelection]
  );

  const handleAadtEnabledChange = useCallback(
    enabled => {
      if (enabled) applyLayerSelection("aadt");
      else setAadtEnabled(false);
    },
    [applyLayerSelection]
  );

  const handleCrashLoadResult = useCallback(info => {
    if (!info) return;
    setCrashLoading(Boolean(info.loading));
    if (!info.loading) {
      setCrashResultInfo({
        count: info.count,
        returned: info.returned,
        truncated: info.truncated,
        message: info.message || ""
      });
    }
  }, []);

  const handleChainageResult = useCallback((info) => {
    setChainageLoading(Boolean(info?.loading));
    if (info && !info.loading) setChainageResultInfo(info);
  }, []);

  const appStyle = {
    background: darkMode ? "#111316" : "#f4f5f6",
    color: darkMode ? "#f1f5f9" : "#181a1b",
    transition: "background 0.3s, color 0.3s"
  };

  return (
    <div className={`app-shell ${darkMode ? "app-shell-dark" : ""}`} style={appStyle}>
      <AadtMapProvider
        darkMode={darkMode}
        onToggleDarkMode={setDarkMode}
        onSelectSite={setSelectedSite}
        showAerial={showAerial}
        onShowAerialChange={setShowAerial}
        greyScale={false}
        showMarkers={aadtEnabled}
        onShowMarkersChange={handleAadtEnabledChange}
      >
        <header className="app-header">
          <div className="brand">
            <img className="brand-mark" src="/freeflow-logo.svg" alt="" width="36" height="29" />
            <div className="brand-text">
              <h1>TTM Data</h1>
              <p className="brand-disclaimer">Data should be reviewed against the appropriate sources. Freeflow Consulting accepts no liability for its use.</p>
            </div>
          </div>
          <MapSearchBar />
          <Link className="nsw-region-link" to="/nsw">
            NSW traffic →
          </Link>
        </header>
        <div className="workspace">
          <AppNav
            expandedMenus={expandedMenus}
            onToggleMenu={handleToggleMenu}
            layerEnabled={{
              aadt: aadtEnabled,
              hourly: hourlyState.showOnMap,
              crash: (crashFilters || defaultCrashFilters(crashMeta)).showOnMap,
              chainage: chainageState.showOnMap,
              planning: planningState.showOnMap
            }}
            onToggleLayer={handleToggleLayer}
            crashMeta={crashMeta}
            crashFilters={crashFilters || defaultCrashFilters(crashMeta)}
            onCrashFiltersChange={handleCrashFiltersChange}
            crashLoading={crashLoading}
            crashResultInfo={crashResultInfo}
            chainageMeta={chainageMeta}
            chainageState={chainageState}
            onChainageStateChange={handleChainageStateChange}
            chainageLoading={chainageLoading}
            chainageResultInfo={chainageResultInfo}
            planningState={planningState}
            onPlanningStateChange={handlePlanningStateChange}
            hourlyMeta={hourlyMeta}
            hourlyState={hourlyState}
            onHourlyStateChange={handleHourlyStateChange}
            hourlyGazettalBearing={hourlyGazettalBearing}
            darkMode={darkMode}
            showAerial={showAerial}
            onShowAerialChange={setShowAerial}
            onDarkModeChange={setDarkMode}
          />

          <div className="main-panel">
            {activeView === "aadt" ? (
              <div className="map-area">
                <AadtMap />
                <aside
                  className={`chart-overlay-panel${selectedSite ? "" : " is-empty"}`}
                  aria-label="Site traffic details"
                >
                  <SiteInfo siteId={selectedSite} darkMode={darkMode} embedded />
                </aside>
              </div>
            ) : activeView === "hourly" ? (
              <div className="map-area">
                {hourlyMeta?.ready !== false ? (
                  <HourlyVolumesView
                    state={hourlyState}
                    darkMode={darkMode}
                    showAerial={showAerial}
                    greyScale={false}
                    selectedSiteId={selectedHourlySiteId}
                    onSelectSite={setSelectedHourlySiteId}
                    recordYear={hourlyMeta?.year}
                  />
                ) : hourlyMeta?.error ? (
                  <div className="map-placeholder">{hourlyMeta.error}</div>
                ) : (
                  <div className="map-view-root is-loading">
                    <MapLoadingOverlay show label="Loading hourly volumes…" />
                  </div>
                )}
                <aside
                  className={`chart-overlay-panel${selectedHourlySiteId ? "" : " is-empty"}`}
                  aria-label="Hourly volume details"
                >
                  <HourlyVolumesDetailPanel
                    siteId={selectedHourlySiteId}
                    direction={hourlyState.direction}
                    onDirectionChange={next =>
                      setHourlyState(prev => ({ ...prev, direction: next }))
                    }
                    enabledDays={hourlyState.enabledDays}
                    onEnabledDaysChange={days =>
                      setHourlyState(prev => ({ ...prev, enabledDays: days }))
                    }
                    onGazettalBearingChange={setHourlyGazettalBearing}
                    darkMode={darkMode}
                    recordYear={hourlyMeta?.year}
                  />
                </aside>
              </div>
            ) : activeView === "crash" ? (
              <>
                <div className="map-area">
                  {crashMeta?.ready && crashFilters && (
                    <CrashHistoryView
                      meta={crashMeta}
                      filters={crashFilters}
                      darkMode={darkMode}
                      showAerial={showAerial}
                      greyScale={false}
                      selectedCrash={selectedCrash}
                      onSelectCrash={setSelectedCrash}
                      onLoadResult={handleCrashLoadResult}
                    />
                  )}
                  {crashMeta && !crashMeta.ready && (
                    <div className="map-placeholder">{crashMeta.error}</div>
                  )}
                  {!crashMeta && (
                    <div className="map-view-root is-loading">
                      <MapLoadingOverlay show label="Loading crash history…" />
                    </div>
                  )}
                </div>
                <aside className="site-panel" aria-label="Crash details">
                  <CrashDetailPanel crash={selectedCrash} darkMode={darkMode} />
                </aside>
              </>
            ) : activeView === "chainage" ? (
              <>
                <div className="map-area">
                  {chainageMeta ? (
                    <ChainageView
                      darkMode={darkMode}
                      showAerial={showAerial}
                      greyScale={false}
                      state={chainageState}
                      meta={chainageMeta}
                      onResultChange={handleChainageResult}
                      onSelectPoint={setSelectedChainagePoint}
                    />
                  ) : (
                    <div className="map-view-root is-loading">
                      <MapLoadingOverlay show label="Loading chainage…" />
                    </div>
                  )}
                </div>
                <aside className="site-panel" aria-label="Chainage details">
                  <ChainageDetailPanel point={selectedChainagePoint} darkMode={darkMode} />
                </aside>
              </>
            ) : activeView === "planning" ? (
              <div className="map-area">
                <PlanningView
                  darkMode={darkMode}
                  showAerial={showAerial}
                  greyScale={false}
                  state={planningState}
                  meta={chainageMeta}
                  onStateChange={handlePlanningStateChange}
                />
              </div>
            ) : (
              <div className="map-placeholder">Select a view from the navigation panel.</div>
            )}
          </div>
        </div>
      </AadtMapProvider>
    </div>
  );
}

export default App;
