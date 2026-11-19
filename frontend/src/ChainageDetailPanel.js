import React from "react";

function ChainageDetailPanel({ point, darkMode }) {
  const shellStyle = {
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

  if (!point) {
    return (
      <div style={{ ...shellStyle, justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center", opacity: 0.75 }}>
          <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>🛣️</div>
          <p style={{ margin: 0, fontWeight: 600 }}>No chainage point selected</p>
          <p style={{ marginTop: 6, fontSize: "0.85rem" }}>Click a point on the map</p>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>{point.Description}</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <tbody>
          {Object.entries({
            "Road Section": point.Road_Section_Id,
            Carriageway: point.Carriageway_Code,
            Chainage: point.Tdist_Start,
            Latitude: point.Latitude,
            Longitude: point.Longitude,
            AADT: point.AADT,
            Category: point.AADT_Intervention_Category
          }).map(([k, v]) => (
            <tr key={k}>
              <th style={{ textAlign: "left", padding: "4px 8px 4px 0", color: darkMode ? "#94a3b8" : "#64748b" }}>{k}</th>
              <td style={{ padding: "4px 0" }}>{v ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ChainageDetailPanel;
