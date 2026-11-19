import React from "react";
import { crashSeverityColor as severityColor } from "../colorPalette";

function CrashSidebar({ meta, filters, onChange, loading, resultInfo }) {
  if (!meta) {
    return <div className="nav-section-body nav-muted">Loading crash data options…</div>;
  }
  if (meta.ready === false) {
    return (
      <div className="nav-section-body nav-muted">
        {meta.error || "Crash data is not indexed yet."}
      </div>
    );
  }

  const toggleList = (key, value) => {
    const list = filters[key];
    const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value];
    onChange({ ...filters, [key]: next });
  };

  const setYearPreset = years => {
    const maxYear = meta.yearMax;
    onChange({
      ...filters,
      minYear: Math.max(meta.yearMin, maxYear - years + 1),
      maxYear
    });
  };

  return (
    <div className="nav-section-body">
      <div className="nav-block">
        <label className="nav-check">
          <input
            type="checkbox"
            checked={filters.showOnMap}
            onChange={e => onChange({ ...filters, showOnMap: e.target.checked })}
          />
          Show crashes on map
        </label>
        {loading && <div className="nav-muted">Loading points…</div>}
        {resultInfo?.message ? (
          <div className="nav-muted">{resultInfo.message}</div>
        ) : resultInfo ? (
          <div className="nav-result-info">
            Showing {resultInfo.returned.toLocaleString()}
            {resultInfo.truncated
              ? ` of ${resultInfo.count.toLocaleString()} in view (zoom or filter for more)`
              : ` crash${resultInfo.returned === 1 ? "" : "es"} in view`}
          </div>
        ) : null}
      </div>

      <div className="nav-block">
        <div className="nav-block-title">Year range</div>
        <div className="nav-year-row">
          <label>
            From
            <input
              type="number"
              className="nav-input nav-input-small"
              min={meta.yearMin}
              max={filters.maxYear}
              value={filters.minYear}
              onChange={e =>
                onChange({ ...filters, minYear: Number(e.target.value) || meta.yearMin })
              }
            />
          </label>
          <label>
            To
            <input
              type="number"
              className="nav-input nav-input-small"
              min={filters.minYear}
              max={meta.yearMax}
              value={filters.maxYear}
              onChange={e =>
                onChange({ ...filters, maxYear: Number(e.target.value) || meta.yearMax })
              }
            />
          </label>
        </div>
        <div className="nav-preset-row">
          <button type="button" className="nav-btn nav-btn-small" onClick={() => setYearPreset(5)}>
            Last 5 years
          </button>
          <button type="button" className="nav-btn nav-btn-small" onClick={() => setYearPreset(10)}>
            Last 10 years
          </button>
          <button
            type="button"
            className="nav-btn nav-btn-small"
            onClick={() => onChange({ ...filters, minYear: meta.yearMin, maxYear: meta.yearMax })}
          >
            All years
          </button>
        </div>
      </div>

      <div className="nav-block">
        <div className="nav-block-title">Severity</div>
        {meta.severities.map(severity => (
          <label key={severity} className="nav-check">
            <input
              type="checkbox"
              checked={filters.severities.includes(severity)}
              onChange={() => toggleList("severities", severity)}
            />
            <span
              className="severity-swatch"
              style={{ background: severityColor(severity) }}
            />
            {severity}
          </label>
        ))}
      </div>

      <div className="nav-block">
        <div className="nav-block-title">Transport region</div>
        {meta.regions.map(region => (
          <label key={region} className="nav-check">
            <input
              type="checkbox"
              checked={filters.regions.includes(region)}
              onChange={() => toggleList("regions", region)}
            />
            {region}
          </label>
        ))}
      </div>

      <div className="nav-block">
        <label className="nav-check">
          <input
            type="checkbox"
            checked={filters.fatalOnly}
            onChange={e => onChange({ ...filters, fatalOnly: e.target.checked })}
          />
          Fatal crashes only
        </label>
      </div>

      <div className="nav-disclaimer">
        Source: Queensland crash locations ({meta.totalRecords.toLocaleString()} records).
      </div>
    </div>
  );
}

export default CrashSidebar;
