import React from "react";

function ExportCsvButton({
  onClick,
  disabled = false,
  darkMode = false,
  showBothDirections = false,
  bothDirections = false,
  onBothDirectionsChange
}) {
  return (
    <div className="chart-export-cluster">
      <button
        type="button"
        className="chart-export-btn"
        onClick={onClick}
        disabled={disabled}
        title="Export CSV"
        style={{
          background: darkMode ? "#2d323c" : "#fff",
          color: "inherit",
          borderColor: darkMode ? "#3a3f4b" : "#e2e8f0"
        }}
      >
        Export CSV
      </button>
      {showBothDirections ? (
        <label className="chart-export-both">
          <input
            type="checkbox"
            checked={bothDirections}
            onChange={e => onBothDirectionsChange?.(e.target.checked)}
          />
          Export both directions
        </label>
      ) : null}
    </div>
  );
}

export default ExportCsvButton;
