import React, { useMemo } from "react";
import {
  analyzeWorkAreas,
  formatChainageKm,
  validateWorkArea,
  workAreaDisplayName,
  workAreaZones
} from "./planningUtils";

function panelShell(darkMode) {
  return {
    background: darkMode ? "#23272f" : "#fff",
    color: darkMode ? "#f1f5f9" : "#181a1b",
    borderRadius: 2,
    padding: "1rem",
    margin: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    boxShadow: darkMode ? "0 2px 10px rgba(0,0,0,0.35)" : "0 1px 6px rgba(15,23,42,0.08)",
    border: `1px solid ${darkMode ? "#3a3f4b" : "#e2e8f0"}`,
    width: "100%",
    boxSizing: "border-box"
  };
}

function sectionTitle(darkMode) {
  return {
    margin: "0 0 8px",
    fontSize: "0.8rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: darkMode ? "#94a3b8" : "#64748b"
  };
}

function PlanningDetailPanel({ state, darkMode }) {
  const analysis = useMemo(() => analyzeWorkAreas(state.workAreas), [state.workAreas]);
  const shellStyle = panelShell(darkMode);

  const hasRoad = Boolean(state.roadSectionId?.trim() && state.carriageway?.trim());

  if (!hasRoad) {
    return (
      <div style={{ ...shellStyle, justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center", opacity: 0.75 }}>
          <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>📋</div>
          <p style={{ margin: 0, fontWeight: 600 }}>Work area planning</p>
          <p style={{ marginTop: 6, fontSize: "0.85rem" }}>
            Select a road section and enter work areas to analyse overlaps and signage spacing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={{ overflowY: "auto", minHeight: 0, flex: 1 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>
          {state.roadDescription || `Section ${state.roadSectionId}`}
        </h3>
        <p style={{ margin: "0 0 12px", fontSize: "0.85rem", opacity: 0.8 }}>
          Road section {state.roadSectionId} · Carriageway {state.carriageway}
        </p>

        <h4 style={sectionTitle(darkMode)}>Work areas</h4>
        <div className="planning-detail-list">
          {state.workAreas.map((wa, idx) => {
            const zones = workAreaZones(wa);
            const error = validateWorkArea(wa);
            return (
              <div key={wa.id} className="planning-detail-card">
                <strong>{workAreaDisplayName(wa, idx)}</strong>
                {error ? (
                  <div className="planning-detail-error">{error}</div>
                ) : (
                  <table className="planning-detail-table">
                    <tbody>
                      <tr>
                        <th>Work area</th>
                        <td>
                          {formatChainageKm(zones.work.start)} – {formatChainageKm(zones.work.end)}
                        </td>
                      </tr>
                      <tr>
                        <th>Start signage</th>
                        <td>
                          {formatChainageKm(zones.signageStart.start)} –{" "}
                          {formatChainageKm(zones.signageStart.end)} (
                          {formatChainageKm(zones.signageLengthKm)})
                        </td>
                      </tr>
                      <tr>
                        <th>End signage</th>
                        <td>
                          {formatChainageKm(zones.signageEnd.start)} –{" "}
                          {formatChainageKm(zones.signageEnd.end)} (
                          {formatChainageKm(zones.signageLengthKm)})
                        </td>
                      </tr>
                      <tr>
                        <th>Total extent</th>
                        <td>
                          {formatChainageKm(zones.combined.start)} – {formatChainageKm(zones.combined.end)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>

        <h4 style={{ ...sectionTitle(darkMode), marginTop: 16 }}>Overlap analysis</h4>
        {analysis.overlaps.length === 0 && analysis.signageOverlaps.length === 0 ? (
          <p className="planning-detail-ok">No overlapping work areas or approach signage zones.</p>
        ) : (
          <ul className="planning-detail-issues">
            {analysis.overlaps.map(o => (
              <li key={`c-${o.leftIndex}-${o.rightIndex}`} className="planning-detail-warning">
                Combined zone overlap between {workAreaDisplayName(state.workAreas[o.leftIndex], o.leftIndex)} and{" "}
                {workAreaDisplayName(state.workAreas[o.rightIndex], o.rightIndex)}:{" "}
                <strong>{formatChainageKm(o.lengthKm)}</strong>
              </li>
            ))}
            {analysis.signageOverlaps.map(o => (
              <li key={`s-${o.leftIndex}-${o.rightIndex}-${o.leftType}-${o.rightType}`} className="planning-detail-warning">
                Approach signage overlap ({workAreaDisplayName(state.workAreas[o.leftIndex], o.leftIndex)} {o.leftType} ↔{" "}
                {workAreaDisplayName(state.workAreas[o.rightIndex], o.rightIndex)} {o.rightType}):{" "}
                <strong>{formatChainageKm(o.lengthKm)}</strong>
              </li>
            ))}
          </ul>
        )}

        <h4 style={{ ...sectionTitle(darkMode), marginTop: 16 }}>Signage spacing</h4>
        {analysis.signageGaps.length === 0 ? (
          <p className="planning-detail-muted">Add at least two valid work areas to compare spacing.</p>
        ) : (
          <ul className="planning-detail-issues">
            {analysis.signageGaps.map(gap => (
              <li
                key={`${gap.fromIndex}-${gap.toIndex}`}
                className={gap.overlapping ? "planning-detail-warning" : "planning-detail-ok-item"}
              >
                {workAreaDisplayName(state.workAreas[gap.fromIndex], gap.fromIndex)} →{" "}
                {workAreaDisplayName(state.workAreas[gap.toIndex], gap.toIndex)}:{" "}
                {gap.overlapping ? (
                  <>
                    signage zones overlap by <strong>{formatChainageKm(gap.overlapKm)}</strong>
                  </>
                ) : (
                  <>
                    clearance between end signage of {workAreaDisplayName(state.workAreas[gap.fromIndex], gap.fromIndex)}{" "}
                    and start signage of {workAreaDisplayName(state.workAreas[gap.toIndex], gap.toIndex)}:{" "}
                    <strong>{formatChainageKm(gap.gapKm)}</strong>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="planning-map-legend" style={{ marginTop: 16 }}>
          <h4 style={sectionTitle(darkMode)}>Map legend</h4>
          <div className="planning-legend-row">
            <span className="planning-legend-line planning-legend-road" /> Road centreline (TMR)
          </div>
          <div className="planning-legend-row">
            <span className="planning-legend-line planning-legend-signage" /> Approach signage — blue dashed
          </div>
          <div className="planning-legend-row">
            <span className="planning-legend-line planning-legend-work" /> Work area (solid)
          </div>
          <div className="planning-legend-row">
            <span className="planning-legend-line planning-legend-overlap" /> Overlapping section only (purple)
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlanningDetailPanel;
