import React from "react";

function ChainageSidebar({ meta, state, onStateChange, resultInfo, loading }) {
  return (
    <div className="nav-section-body">
      <div className="nav-block">
        <label className="nav-check">
          <input
            type="checkbox"
            checked={state.showOnMap}
            onChange={e => onStateChange({ ...state, showOnMap: e.target.checked })}
          />
          Show chainage points
        </label>
        <div className="nav-muted">
          Points load from zoom <b>{meta?.minZoom ?? 13}</b>. <b>1 km</b> red with text from z13,
          <b>500 m</b> green dots from z14, <b>100 m</b> and detail points blue from z15/z16.
        </div>
      </div>

      <div className="nav-block">
        <div className="nav-block-title">Display</div>
        <label className="nav-check nav-check-small">
          Marker size
          <input
            type="range"
            min={2}
            max={8}
            step={1}
            value={state.markerSize}
            onChange={e => onStateChange({ ...state, markerSize: Number(e.target.value) })}
          />
          <b>{state.markerSize}px</b>
        </label>
      </div>

      <div className="nav-block">
        {loading ? (
          <div className="nav-muted">Loading chainage points…</div>
        ) : (
          <div className="nav-result-info">
            {resultInfo?.message ? (
              resultInfo.message
            ) : (
              <>
                Showing {(resultInfo?.returned ?? 0).toLocaleString()} point
                {(resultInfo?.returned ?? 0) === 1 ? "" : "s"}
                {resultInfo?.sampleStepKm != null && resultInfo.sampleStepKm > 0.02
                  ? ` (~${resultInfo.sampleStepKm} km spacing)`
                  : ""}
                {resultInfo?.labelTiers?.length
                  ? ` — labels: ${resultInfo.labelTiers.join(", ")}`
                  : ""}
                {!resultInfo?.showIntervalPoints ? " — zoom in for blue points" : ""}
                {resultInfo?.truncated ? " (truncated, zoom further in)" : ""}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChainageSidebar;
