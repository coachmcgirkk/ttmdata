import React from "react";

function MapLoadingOverlay({ show, label = "Loading map data…" }) {
  if (!show) return null;

  return (
    <div className="map-loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="map-loading-card">
        <div className="map-loading-spinner" aria-hidden="true" />
        <div className="map-loading-label">{label}</div>
      </div>
    </div>
  );
}

export default MapLoadingOverlay;
