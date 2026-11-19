import React from "react";
import { HOURLY_DIRECTION_VALUES, qldDirectionCaption } from "../hourlyDirection";

function HourlyVolumesSidebar({ meta, state, onStateChange, gazettalBearing }) {
  if (!meta) {
    return <div className="nav-section-body nav-muted">Loading hourly volume options…</div>;
  }
  if (meta.ready === false) {
    return (
      <div className="nav-section-body nav-muted">
        {meta.error || "Hourly volume data is not available."}
      </div>
    );
  }

  return (
    <div className="nav-section-body">
      <div className="nav-block">
        <label className="nav-check">
          <input
            type="checkbox"
            checked={state.showOnMap}
            onChange={e => onStateChange({ ...state, showOnMap: e.target.checked })}
          />
          Show sites on map
        </label>
      </div>

      <div className="nav-block">
        <div className="nav-block-title">Travel direction</div>
        {HOURLY_DIRECTION_VALUES.map(direction => (
          <label key={direction} className="nav-check">
            <input
              type="radio"
              name="hourly-direction"
              checked={state.direction === direction}
              onChange={() => onStateChange({ ...state, direction })}
            />
            {qldDirectionCaption(direction, gazettalBearing)}
          </label>
        ))}
      </div>

      <div className="nav-disclaimer">
        {meta.year} average hourly volumes ({meta.siteCount?.toLocaleString()} sites). Source:{" "}
        {meta.sourceFile}
      </div>
    </div>
  );
}

export default HourlyVolumesSidebar;
