import React from "react";
import MapOptionsPanel, { DisclaimerPanel } from "../components/MapOptionsPanel";

function NswSidebar({
  meta,
  filters,
  onFiltersChange,
  darkMode,
  onDarkModeChange,
  showAerial,
  onShowAerialChange,
  stationCount,
  selectedSummary
}) {
  return (
    <nav className="app-nav" aria-label="NSW traffic filters">
      <div className="nav-section nav-section-active">
        <div className="nav-section-header">
          <span className="nav-section-title">NSW Stations</span>
        </div>
        <div className="nav-section-content">
          <div className="nav-section-body">
            <p className="nsw-meta-line">
              {meta?.stationCount?.toLocaleString?.() ?? "—"} stations · years{" "}
              {meta?.yearMin ?? "—"}–{meta?.yearMax ?? "—"}
            </p>
            <p className="nsw-meta-line">
              Showing {stationCount.toLocaleString()} on map
              {meta?.hourlyStationCount != null
                ? ` · ${meta.hourlyStationCount.toLocaleString()} with hourly sample`
                : ""}
            </p>

            <label className="nsw-filter-label">
              Yearly period
              <select
                value={filters.period || ""}
                onChange={e => onFiltersChange({ ...filters, period: e.target.value })}
              >
                {(meta?.periods || []).map(period => (
                  <option key={period} value={period}>
                    {period}
                  </option>
                ))}
              </select>
            </label>

            <label className="nsw-filter-label">
              Yearly classification
              <select
                value={filters.classification || ""}
                onChange={e => onFiltersChange({ ...filters, classification: e.target.value })}
              >
                {(meta?.classifications || []).map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="nsw-filter-label">
              Hourly classification
              <select
                value={filters.hourlyClassification ?? ""}
                onChange={e =>
                  onFiltersChange({
                    ...filters,
                    hourlyClassification: e.target.value === "" ? null : Number(e.target.value)
                  })
                }
              >
                {(meta?.hourlyClassifications || []).map(c => (
                  <option key={c.seq} value={c.seq}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="nsw-check">
              <input
                type="checkbox"
                checked={Boolean(filters.permanentOnly)}
                onChange={e => onFiltersChange({ ...filters, permanentOnly: e.target.checked })}
              />
              Permanent stations only
            </label>

            <label className="nsw-check">
              <input
                type="checkbox"
                checked={Boolean(filters.hasHourlyOnly)}
                onChange={e => onFiltersChange({ ...filters, hasHourlyOnly: e.target.checked })}
              />
              Hourly sample available
            </label>

            {selectedSummary && (
              <div className="nsw-selected-box">
                <div className="nsw-selected-title">{selectedSummary.name}</div>
                <div>
                  {selectedSummary.suburb}
                  {selectedSummary.lga ? `, ${selectedSummary.lga}` : ""}
                </div>
                <div className="nsw-selected-meta">
                  Key {selectedSummary.stationKey}
                  {selectedSummary.permanent ? " · permanent" : " · sample"}
                  {selectedSummary.hasHourly ? " · hourly" : ""}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-section-header">
          <span className="nav-section-title">Map Options</span>
        </div>
        <div className="nav-section-content">
          <div className="nav-section-body">
            <MapOptionsPanel
              darkMode={darkMode}
              onDarkModeChange={onDarkModeChange}
              showAerial={showAerial}
              onShowAerialChange={onShowAerialChange}
            />
          </div>
        </div>
      </div>

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

      <div className="nav-section">
        <div className="nav-section-content">
          <div className="nav-section-body nsw-source-note">
            Source: TfNSW Open Data — Road Traffic Counts (station reference, yearly summary,
            hourly sample).
          </div>
        </div>
      </div>
    </nav>
  );
}

export default NswSidebar;
