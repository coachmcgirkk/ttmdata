import React from "react";
import AadtSidebar from "./AadtSidebar";
import HourlyVolumesSidebar from "./HourlyVolumesSidebar";
import CrashSidebar from "./CrashSidebar";
import ChainageSidebar from "./ChainageSidebar";
import PlanningSidebar from "./PlanningSidebar";
import MapOptionsPanel, { DisclaimerPanel } from "./MapOptionsPanel";

function NavSection({ title, expanded, enabled, onToggleExpand, onToggleLayer, children }) {
  return (
    <div className={`nav-section ${enabled ? "nav-section-active" : ""}`}>
      <div className="nav-section-header">
        <button
          type="button"
          className={`nav-layer-btn ${enabled ? "nav-layer-btn-on" : ""}`}
          onClick={onToggleLayer}
          aria-pressed={enabled}
        >
          {title}
        </button>
        <button
          type="button"
          className="nav-chevron-btn"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${title} options`}
        >
          <span className={`nav-chevron ${expanded ? "nav-chevron-open" : ""}`}>▸</span>
        </button>
      </div>
      {expanded && <div className="nav-section-content">{children}</div>}
    </div>
  );
}

function NavPanelSection({ title, expanded, onToggle, children }) {
  return (
    <div className={`nav-section ${expanded ? "nav-section-expanded" : ""}`}>
      <div className="nav-section-header">
        <span className="nav-section-title">{title}</span>
        <button
          type="button"
          className="nav-chevron-btn"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
        >
          <span className={`nav-chevron ${expanded ? "nav-chevron-open" : ""}`}>▸</span>
        </button>
      </div>
      {expanded && <div className="nav-section-content">{children}</div>}
    </div>
  );
}

function AppNav({
  expandedMenus,
  onToggleMenu,
  layerEnabled,
  onToggleLayer,
  crashMeta,
  crashFilters,
  onCrashFiltersChange,
  crashLoading,
  crashResultInfo,
  chainageMeta,
  chainageState,
  onChainageStateChange,
  chainageLoading,
  chainageResultInfo,
  planningState,
  onPlanningStateChange,
  hourlyMeta,
  hourlyState,
  onHourlyStateChange,
  hourlyGazettalBearing,
  darkMode,
  showAerial,
  onShowAerialChange,
  onDarkModeChange
}) {
  return (
    <nav className="app-nav" aria-label="Main navigation">
      <NavSection
        title="AADT"
        expanded={expandedMenus.aadt}
        enabled={layerEnabled.aadt}
        onToggleExpand={() => onToggleMenu("aadt")}
        onToggleLayer={() => onToggleLayer("aadt")}
      >
        {expandedMenus.aadt && <AadtSidebar />}
      </NavSection>

      <NavSection
        title="Hourly Volumes"
        expanded={expandedMenus.hourly}
        enabled={layerEnabled.hourly}
        onToggleExpand={() => onToggleMenu("hourly")}
        onToggleLayer={() => onToggleLayer("hourly")}
      >
        {expandedMenus.hourly && (
          <HourlyVolumesSidebar
            meta={hourlyMeta}
            state={hourlyState}
            onStateChange={onHourlyStateChange}
            gazettalBearing={hourlyGazettalBearing}
          />
        )}
      </NavSection>

      <NavSection
        title="Crash History"
        expanded={expandedMenus.crash}
        enabled={layerEnabled.crash}
        onToggleExpand={() => onToggleMenu("crash")}
        onToggleLayer={() => onToggleLayer("crash")}
      >
        {expandedMenus.crash && (
          <CrashSidebar
            meta={crashMeta}
            filters={crashFilters}
            onChange={onCrashFiltersChange}
            loading={crashLoading}
            resultInfo={crashResultInfo}
          />
        )}
      </NavSection>

      <NavSection
        title="Chainage"
        expanded={expandedMenus.chainage}
        enabled={layerEnabled.chainage}
        onToggleExpand={() => onToggleMenu("chainage")}
        onToggleLayer={() => onToggleLayer("chainage")}
      >
        {expandedMenus.chainage && (
          <ChainageSidebar
            meta={chainageMeta}
            state={chainageState}
            onStateChange={onChainageStateChange}
            loading={chainageLoading}
            resultInfo={chainageResultInfo}
          />
        )}
      </NavSection>

      <NavSection
        title="Planning"
        expanded={expandedMenus.planning}
        enabled={layerEnabled.planning}
        onToggleExpand={() => onToggleMenu("planning")}
        onToggleLayer={() => onToggleLayer("planning")}
      >
        {expandedMenus.planning && (
          <PlanningSidebar
            state={planningState}
            onStateChange={onPlanningStateChange}
            darkMode={darkMode}
          />
        )}
      </NavSection>

      <NavPanelSection
        title="Map Options"
        expanded={expandedMenus.mapOptions}
        onToggle={() => onToggleMenu("mapOptions")}
      >
        <div className="nav-section-body">
          <MapOptionsPanel
            darkMode={darkMode}
            onDarkModeChange={onDarkModeChange}
            showAerial={showAerial}
            onShowAerialChange={onShowAerialChange}
          />
        </div>
      </NavPanelSection>

      <div className="nav-section">
        <div className="nav-section-header">
          <span className="nav-section-title">Disclaimer</span>
        </div>
        <div className="nav-section-content">
          <div className="nav-section-body">
            <DisclaimerPanel />
          </div>
        </div>
      </div>
    </nav>
  );
}

export default AppNav;
