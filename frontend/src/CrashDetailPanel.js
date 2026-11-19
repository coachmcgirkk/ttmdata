import React, { useCallback, useMemo } from "react";
import { downloadCsv, rowsToCsv, safeFilenamePart } from "./csvExport";
import ExportCsvButton from "./components/ExportCsvButton";

function CrashDetailPanel({ crash, darkMode }) {
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

  const rows = useMemo(() => {
    if (!crash) return [];
    return [
      ["Reference", crash.Crash_Ref_Number],
      ["Severity", crash.Crash_Severity],
      ["Year", crash.Crash_Year],
      ["Month", crash.Crash_Month],
      ["Day", crash.Crash_Day_Of_Week],
      ["Hour", crash.Crash_Hour],
      ["Nature", crash.Crash_Nature],
      ["Type", crash.Crash_Type],
      ["Street", crash.Crash_Street],
      ["Intersecting", crash.Crash_Street_Intersecting],
      ["State road", crash.State_Road_Name],
      ["Suburb", crash.Loc_Suburb],
      ["LGA", crash.Loc_Local_Government_Area],
      ["Region", crash.Loc_Queensland_Transport_Region],
      ["Speed limit", crash.Crash_Speed_Limit],
      ["Weather", crash.Crash_Atmospheric_Condition],
      ["Lighting", crash.Crash_Lighting_Condition],
      ["Fatalities", crash.Count_Casualty_Fatality],
      ["Hospitalised", crash.Count_Casualty_Hospitalised],
      ["Total casualties", crash.Count_Casualty_Total],
      ["Latitude", crash.Crash_Latitude],
      ["Longitude", crash.Crash_Longitude]
    ];
  }, [crash]);

  const handleExportCsv = useCallback(() => {
    if (!crash || !rows.length) return;
    const csv = rowsToCsv([["Field", "Value"], ...rows]);
    const safeRef = safeFilenamePart(crash.Crash_Ref_Number || "crash");
    downloadCsv(`crash_${safeRef}.csv`, csv);
  }, [crash, rows]);

  if (!crash) {
    return (
      <div style={{ ...shellStyle, justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center", opacity: 0.75, padding: "1.5rem 1rem" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>🚗</div>
          <p style={{ margin: 0, fontWeight: 600 }}>No crash selected</p>
          <p style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>
            Click a crash marker to view details
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div className="chart-panel-header" style={{ marginBottom: 12 }}>
        <div className="chart-panel-header-text">
          <h3 style={{ margin: "0 0 4px", fontSize: "0.95rem" }}>Crash {crash.Crash_Ref_Number}</h3>
          <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.85 }}>
            {crash.Crash_Severity} · {crash.Crash_Year}
          </p>
        </div>
        <ExportCsvButton onClick={handleExportCsv} darkMode={darkMode} />
      </div>
      <div style={{ flex: 1, overflow: "auto", fontSize: "0.8rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {rows.map(([label, value]) =>
              value != null && value !== "" ? (
                <tr key={label}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "4px 8px 4px 0",
                      fontWeight: 600,
                      verticalAlign: "top",
                      whiteSpace: "nowrap",
                      color: darkMode ? "#94a3b8" : "#64748b"
                    }}
                  >
                    {label}
                  </th>
                  <td style={{ padding: "4px 0", wordBreak: "break-word" }}>{value}</td>
                </tr>
              ) : null
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CrashDetailPanel;
