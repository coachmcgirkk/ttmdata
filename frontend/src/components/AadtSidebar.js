import React from "react";
import { useAadtMap } from "../context/AadtMapContext";

function AadtSidebar() {
  const {
    showMarkers,
    setShowMarkers,
    showGoldCoastCounts,
    setShowGoldCoastCounts,
    goldCoastGrowth,
    setGoldCoastGrowth,
    showOversizeRoutes,
    setShowOversizeRoutes
  } = useAadtMap();

  return (
    <div className="nav-section-body">
      <div className="nav-block">
        <div className="nav-block-title">Layers</div>
        <label className="nav-check">
          <input type="checkbox" checked={showMarkers} onChange={e => setShowMarkers(e.target.checked)} />
          TMR AADT counts
        </label>
        <label className="nav-check">
          <input
            type="checkbox"
            checked={showGoldCoastCounts}
            onChange={e => setShowGoldCoastCounts(e.target.checked)}
          />
          Gold Coast traffic counts
        </label>
        {showGoldCoastCounts && (
          <div className="nav-nested">
            <label className="nav-check nav-check-small">
              Growth: <b>{goldCoastGrowth}%</b>
              <input
                type="range"
                min={0}
                max={20}
                step={0.1}
                value={goldCoastGrowth}
                onChange={e => setGoldCoastGrowth(Number(e.target.value))}
              />
            </label>
          </div>
        )}
        <label className="nav-check nav-check-disabled">
          <input
            type="checkbox"
            checked={showOversizeRoutes}
            onChange={e => setShowOversizeRoutes(e.target.checked)}
          />
          Oversize routes
        </label>
      </div>

      <div className="nav-disclaimer">
        Data should be reviewed against the appropriate sources. Freeflow Consulting accepts no liability for its use.
      </div>
    </div>
  );
}

export default AadtSidebar;
