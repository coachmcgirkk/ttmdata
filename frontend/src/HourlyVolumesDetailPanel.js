import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import {
  HOURLY_DAY_KEYS,
  HOURLY_DAY_LABELS,
  HOURLY_DAY_COLORS
} from "./hourlyVolumeConstants";
import { downloadCsv, escapeCsvCell, safeFilenamePart } from "./csvExport";
import ExportCsvButton from "./components/ExportCsvButton";
import HourlyDirectionToggle from "./components/HourlyDirectionToggle";
import HourlyDirectionStrokeLegend from "./components/HourlyDirectionStrokeLegend";
import {
  HOURLY_DIR_AGAINST,
  HOURLY_DIR_BOTH,
  HOURLY_DIR_WITH,
  HOURLY_DIRECTION_VALUES,
  buildHourlyChartSeries,
  hourlySeriesKey,
  mergeHourlyDirectionSeries,
  qldDirectionCaption
} from "./hourlyDirection";

function hourlyDirectionLabel(direction, bearing) {
  return qldDirectionCaption(direction, bearing);
}

function chartDataFromHours(hours) {
  return (hours || []).map(row => {
    const point = { hour: row.hours };
    HOURLY_DAY_KEYS.forEach(day => {
      point[day] = row[day] ?? null;
    });
    return point;
  });
}

function buildHourlyExportCsv(profile, directions, enabledDays) {
  const exportDays = enabledDays.filter(day => HOURLY_DAY_KEYS.includes(day));
  const header = [
    "Site ID",
    "Road name",
    "Description",
    "Direction",
    "Hour",
    ...exportDays.map(day => HOURLY_DAY_LABELS[day] || day)
  ];
  const rows = [header];
  directions.forEach(dir => {
    const match = (profile.profiles || []).find(p => p.direction === dir);
    if (!match) return;
    chartDataFromHours(match.hours).forEach(point => {
      rows.push([
        profile.siteId,
        profile.roadName,
        profile.description,
        hourlyDirectionLabel(dir, profile.gazettalBearing),
        point.hour,
        ...exportDays.map(day => point[day] ?? "")
      ]);
    });
  });
  return rows.map(row => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function buildHoverEntries(payload, series) {
  if (!payload?.length) return [];
  return series
    .map(item => {
      const entry = payload.find(row => row.dataKey === item.key);
      if (!entry || entry.value === undefined || entry.value === null) return null;
      return {
        label: item.label,
        value: entry.value,
        color: HOURLY_DAY_COLORS[item.day]
      };
    })
    .filter(Boolean);
}

function ChartHoverBridge({ active, payload, label, series, onUpdate, onClear }) {
  const lastKeyRef = useRef("");

  useEffect(() => {
    if (active && payload?.length) {
      const entries = buildHoverEntries(payload, series);
      const key = `${label}|${entries.map(e => `${e.label}:${e.value}`).join(";")}`;
      if (key !== lastKeyRef.current) {
        lastKeyRef.current = key;
        onUpdate({ label, entries });
      }
    } else if (lastKeyRef.current !== "") {
      lastKeyRef.current = "";
      onClear();
    }
  }, [active, payload, label, series, onUpdate, onClear]);

  return null;
}

const HourlyTrafficChart = memo(function HourlyTrafficChart({
  chartData,
  series,
  darkMode,
  onHoverChange
}) {
  const textPrimary = darkMode ? "#f1f5f9" : "#181a1b";
  const onUpdate = useCallback(data => onHoverChange(data), [onHoverChange]);
  const onClear = useCallback(() => onHoverChange(null), [onHoverChange]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData}
        margin={{ top: 4, right: 8, left: 0, bottom: 22 }}
        style={{ background: darkMode ? "#23272f" : "#fff" }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#444" : "#ccc"} />
        <XAxis
          dataKey="hour"
          stroke={textPrimary}
          tick={{ fill: textPrimary, fontSize: 10 }}
          interval={1}
        />
        <YAxis
          label={{
            value: "Avg volume",
            angle: -90,
            position: "insideLeft",
            fill: textPrimary,
            style: { fontWeight: 600, fontSize: 11 }
          }}
          stroke={textPrimary}
          tick={{ fill: textPrimary, fontSize: 10 }}
        />
        <Tooltip
          shared
          cursor={{ stroke: darkMode ? "#64748b" : "#94a3b8", strokeWidth: 1 }}
          wrapperStyle={{ display: "none" }}
          isAnimationActive={false}
          content={tooltipProps => (
            <ChartHoverBridge
              {...tooltipProps}
              series={series}
              onUpdate={onUpdate}
              onClear={onClear}
            />
          )}
        />
        <Legend
          verticalAlign="bottom"
          wrapperStyle={{ color: textPrimary, fontSize: 10, paddingTop: 4 }}
          formatter={value => (
            <span style={{ color: textPrimary }}>
              {series.find(item => item.key === value)?.legendLabel ||
                HOURLY_DAY_LABELS[value] ||
                value}
            </span>
          )}
          iconSize={8}
        />
        {series.map(item => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.key}
            stroke={HOURLY_DAY_COLORS[item.day]}
            strokeWidth={2}
            strokeDasharray={item.strokeDasharray}
            legendType={item.dashed ? "none" : "line"}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
            animateNewValues={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
});

function HourlyVolumesDetailPanel({
  siteId,
  direction,
  onDirectionChange,
  enabledDays,
  onEnabledDaysChange,
  onGazettalBearingChange,
  darkMode
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tableOpen, setTableOpen] = useState(false);
  const [chartHover, setChartHover] = useState(null);
  const [exportBothDirections, setExportBothDirections] = useState(false);

  const toggleDay = useCallback(
    day => {
      const on = enabledDays.includes(day);
      const next = on ? enabledDays.filter(d => d !== day) : [...enabledDays, day];
      onEnabledDaysChange(next);
    },
    [enabledDays, onEnabledDaysChange]
  );

  const setPreset = useCallback(keys => onEnabledDaysChange(keys), [onEnabledDaysChange]);

  useEffect(() => {
    if (!siteId) {
      setProfile(null);
      setError("");
      onGazettalBearingChange?.(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/hourly-volumes/site/${siteId}`, {
      signal: controller.signal
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setProfile(data);
        onGazettalBearingChange?.(data?.gazettalBearing ?? null);
      })
      .catch(err => {
        if (err.name !== "AbortError") {
          setProfile(null);
          setError("Could not load hourly profile for this site.");
          onGazettalBearingChange?.(null);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [siteId, onGazettalBearingChange]);

  useEffect(() => {
    setChartHover(null);
  }, [siteId, direction, enabledDays]);

  const availableDirections = (profile?.profiles || []).map(p => p.direction).filter(Boolean);
  const chartGroups = useMemo(() => {
    if (!profile?.profiles?.length) return [];
    const dirs =
      direction === HOURLY_DIR_BOTH && availableDirections.length > 1
        ? [
            HOURLY_DIR_WITH,
            HOURLY_DIR_AGAINST,
            ...availableDirections.filter(
              dir => dir !== HOURLY_DIR_WITH && dir !== HOURLY_DIR_AGAINST
            )
          ].filter(dir => availableDirections.includes(dir))
        : availableDirections.includes(direction)
          ? [direction]
          : availableDirections.slice(0, 1);
    return dirs.map(dir => {
      const match = profile.profiles.find(p => p.direction === dir);
      return {
        id: dir,
        label: qldDirectionCaption(dir, profile.gazettalBearing),
        hours: match?.hours || [],
        dashed: dir === HOURLY_DIR_AGAINST
      };
    });
  }, [profile, direction, availableDirections]);

  const chartData = useMemo(
    () => mergeHourlyDirectionSeries(chartGroups, HOURLY_DAY_KEYS),
    [chartGroups]
  );

  const activeDays = enabledDays.filter(d => HOURLY_DAY_KEYS.includes(d));
  const chartSeries = useMemo(
    () => buildHourlyChartSeries(activeDays, chartGroups, HOURLY_DAY_LABELS),
    [activeDays, chartGroups]
  );
  const updateChartHover = useCallback(data => setChartHover(data), []);

  const exportDirections =
    (exportBothDirections || direction === HOURLY_DIR_BOTH) && availableDirections.length > 1
      ? availableDirections
      : availableDirections.includes(direction)
        ? [direction]
        : availableDirections.slice(0, 1);
  const directionOptions = HOURLY_DIRECTION_VALUES.filter(value => {
    if (value === HOURLY_DIR_BOTH) return availableDirections.length > 1;
    return availableDirections.includes(value);
  }).map(value => ({
    value,
    label: qldDirectionCaption(value, profile?.gazettalBearing)
  }));

  const handleExportCsv = useCallback(() => {
    if (!profile || activeDays.length === 0 || !exportDirections.length) return;
    const csv = buildHourlyExportCsv(profile, exportDirections, activeDays);
    if (!csv.includes("\r\n")) return;
    const safeName = safeFilenamePart(profile.roadName || profile.siteId);
    const dirSlug =
      exportDirections.length > 1
        ? "both_directions"
        : exportDirections[0] === HOURLY_DIR_WITH
          ? "with_gazettal"
          : "against_gazettal";
    downloadCsv(`hourly_site_${profile.siteId}_${safeName || "volumes"}_${dirSlug}.csv`, csv);
  }, [profile, exportDirections, activeDays]);

  const textPrimary = darkMode ? "#f1f5f9" : "#181a1b";
  const textMuted = darkMode ? "#94a3b8" : "#64748b";
  const shellStyle = {
    background: darkMode ? "#23272f" : "#fff",
    color: darkMode ? "#f1f5f9" : "#181a1b",
    borderRadius: 2,
    padding: 0,
    margin: 0,
    height: "auto",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "visible",
    boxShadow: darkMode ? "0 2px 10px rgba(0,0,0,0.35)" : "0 1px 6px rgba(15,23,42,0.08)",
    border: `1px solid ${darkMode ? "#3a3f4b" : "#e2e8f0"}`,
    width: "100%",
    boxSizing: "border-box"
  };
  const bodyPad = { padding: "1rem", boxSizing: "border-box" };
  const thtdStyle = {
    borderBottom: `1px solid ${darkMode ? "#444" : "#ccc"}`,
    textAlign: "left",
    padding: "0.35rem 0.4rem",
    fontSize: "0.72rem"
  };

  if (!siteId) {
    return (
      <div className="chart-empty-state" style={{ ...shellStyle }}>
        <p className="chart-empty-label">(no site selected)</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={shellStyle}>
        <div
          className="chart-overlay-body"
          style={{ ...bodyPad, justifyContent: "center", alignItems: "center" }}
        >
          <p style={{ opacity: 0.8 }}>Loading hourly profile…</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={shellStyle}>
        <div
          className="chart-overlay-body"
          style={{ ...bodyPad, justifyContent: "center", alignItems: "center" }}
        >
          <p style={{ margin: 0, color: "#dc2626" }}>{error || "No data"}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div className="chart-overlay-body" style={bodyPad}>
        <div className="chart-panel-header" style={{ marginBottom: 8 }}>
          <div className="chart-panel-header-text">
            <h3 style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.3 }}>{profile.roadName}</h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.78rem", opacity: 0.85 }}>
              Site {profile.siteId} · {profile.description}
              {" · "}
              {qldDirectionCaption(direction, profile.gazettalBearing)}
            </p>
          </div>
          <ExportCsvButton
            onClick={handleExportCsv}
            disabled={activeDays.length === 0 || !exportDirections.length}
            darkMode={darkMode}
            showBothDirections={availableDirections.length > 1 && direction !== HOURLY_DIR_BOTH}
            bothDirections={exportBothDirections}
            onBothDirectionsChange={setExportBothDirections}
          />
        </div>

        <HourlyDirectionToggle
          options={directionOptions}
          value={
            directionOptions.some(option => option.value === direction)
              ? direction
              : directionOptions[0]?.value
          }
          onChange={onDirectionChange}
        />

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 8,
              flexShrink: 0
            }}
          >
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Hourly volume trends</span>
            <div className="hourly-series-presets" style={{ marginBottom: 0 }}>
              <button type="button" className="nav-btn nav-btn-small" onClick={() => setPreset(["MON", "TUE", "WED", "THU", "FRI"])}>
                Weekdays
              </button>
              <button type="button" className="nav-btn nav-btn-small" onClick={() => setPreset(["SAT", "SUN"])}>
                Weekend
              </button>
              <button
                type="button"
                className="nav-btn nav-btn-small"
                onClick={() => setPreset(["WEEKDAY_AVERAGE", "WEEKEND_AVERAGE"])}
              >
                Averages
              </button>
              <button type="button" className="nav-btn nav-btn-small" onClick={() => setPreset([...HOURLY_DAY_KEYS])}>
                All
              </button>
              <button type="button" className="nav-btn nav-btn-small" onClick={() => setPreset([])}>
                None
              </button>
            </div>
          </div>

          <div className="hourly-series-toggles" style={{ maxHeight: 44, marginBottom: 8, flexShrink: 0 }}>
            {HOURLY_DAY_KEYS.map(day => (
              <label key={day} className="hourly-series-toggle">
                <input
                  type="checkbox"
                  checked={enabledDays.includes(day)}
                  onChange={() => toggleDay(day)}
                />
                <span className="hourly-series-swatch" style={{ background: HOURLY_DAY_COLORS[day] }} />
                {HOURLY_DAY_LABELS[day]}
              </label>
            ))}
          </div>

          <HourlyDirectionStrokeLegend groups={chartGroups} darkMode={darkMode} />
          <div style={{ flex: 1, minHeight: 180 }}>
            {activeDays.length === 0 ? (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.7,
                  fontSize: "0.9rem"
                }}
              >
                Turn on at least one series to display the chart.
              </div>
            ) : (
              <HourlyTrafficChart
                chartData={chartData}
                series={chartSeries}
                darkMode={darkMode}
                onHoverChange={updateChartHover}
              />
            )}
          </div>
        </div>
      </div>

      <div className="chart-hover-extend">
        <div
          style={{
            minHeight: 40,
            padding: "8px 10px",
            borderRadius: 8,
            background: darkMode ? "#1a1d23" : "#f8fafc",
            border: `1px solid ${darkMode ? "#3a3f4b" : "#e2e8f0"}`,
            fontSize: "0.72rem",
            lineHeight: 1.45
          }}
        >
          {chartHover?.entries?.length ? (
            <>
              <div style={{ fontWeight: 700, color: textPrimary, marginBottom: 4 }}>
                Hour {chartHover.label}
              </div>
              {chartHover.entries.map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: textPrimary
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      flexShrink: 0,
                      background: entry.color
                    }}
                  />
                  <span>
                    {entry.label}: {Number(entry.value).toLocaleString()}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <span style={{ color: textMuted }}>Hover the chart to see values for each hour</span>
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setTableOpen(o => !o)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 8px",
              fontSize: "0.8rem",
              fontWeight: 600,
              background: darkMode ? "#2d323c" : "#f8fafc",
              color: "inherit",
              border: `1px solid ${darkMode ? "#3a3f4b" : "#e2e8f0"}`,
              borderRadius: 8,
              cursor: "pointer"
            }}
          >
            <span>Hourly volume table</span>
            <span style={{ opacity: 0.7 }}>{tableOpen ? "▾" : "▸"}</span>
          </button>
          {tableOpen && (
            <div
              style={{
                marginTop: 8,
                overflow: "auto",
                maxHeight: 160,
                borderRadius: 8,
                border: `1px solid ${darkMode ? "#3a3f4b" : "#e2e8f0"}`
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  background: darkMode ? "#23272f" : "#fff",
                  color: textPrimary
                }}
              >
                <thead>
                  <tr>
                    <th style={thtdStyle}>Hour</th>
                    {chartGroups.length > 1 ? <th style={thtdStyle}>Direction</th> : null}
                    {HOURLY_DAY_KEYS.map(day => (
                      <th key={day} style={thtdStyle}>
                        {HOURLY_DAY_LABELS[day]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartGroups.flatMap(group =>
                    chartData.map(row => (
                      <tr key={`${group.id}-${row.hour}`}>
                        <td style={thtdStyle}>{row.hour}</td>
                        {chartGroups.length > 1 ? (
                          <td style={thtdStyle}>{group.label}</td>
                        ) : null}
                        {HOURLY_DAY_KEYS.map(day => {
                          const value =
                            row[hourlySeriesKey(day, chartGroups.length > 1 ? group.id : null)];
                          return (
                            <td key={day} style={thtdStyle}>
                              {value == null ? "" : Number(value).toLocaleString()}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HourlyVolumesDetailPanel;
