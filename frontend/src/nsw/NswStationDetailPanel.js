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
import { HOURLY_DAY_COLORS } from "../colorPalette";
import { HOURLY_DAY_SHORT } from "../hourlyVolumeConstants";
import { downloadCsv, rowsToCsv, safeFilenamePart } from "../csvExport";
import ExportCsvButton from "../components/ExportCsvButton";
import HourlyDirectionToggle from "../components/HourlyDirectionToggle";
import HourlyDirectionStrokeLegend from "../components/HourlyDirectionStrokeLegend";
import {
  HOURLY_DIR_AGAINST,
  HOURLY_DIR_BOTH,
  HOURLY_DIR_WITH,
  HOURLY_DIRECTION_VALUES,
  buildHourlyChartSeries,
  groupNswHourlyProfiles,
  mergeHourlyDirectionSeries,
  nswDirectionCaption
} from "../hourlyDirection";
import {
  NSW_CARDINAL_COLORS,
  NSW_HOURLY_DAY_KEYS,
  NSW_HOURLY_DAY_LABELS,
  DEFAULT_NSW_HOURLY_DAYS
} from "./nswConstants";

function formatCount(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Math.round(Number(value)).toLocaleString();
}

function nswProfileDirectionLabel(profile) {
  return [profile?.cardinalDirection, profile?.trafficDirection].filter(Boolean).join(" / ") || "direction n/a";
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

const NswHourlyChart = memo(function NswHourlyChart({
  chartData,
  series,
  darkMode,
  onHoverChange
}) {
  const textPrimary = darkMode ? "#f1f5f9" : "#181a1b";
  const gridStroke = darkMode ? "#334155" : "#e2e8f0";
  const onUpdate = useCallback(data => onHoverChange(data), [onHoverChange]);
  const onClear = useCallback(() => onHoverChange(null), [onHoverChange]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData}
        margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
        style={{ background: darkMode ? "#23272f" : "#fff" }}
      >
        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
        <XAxis
          dataKey="hour"
          stroke={textPrimary}
          tick={{ fill: textPrimary, fontSize: 10 }}
          interval={2}
          isAnimationActive={false}
        />
        <YAxis
          stroke={textPrimary}
          tick={{ fill: textPrimary, fontSize: 11 }}
          tickFormatter={v => formatCount(v)}
          isAnimationActive={false}
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
          formatter={value =>
            series.find(item => item.key === value)?.legendLabel ||
            NSW_HOURLY_DAY_LABELS[value] ||
            value
          }
          wrapperStyle={{ color: textPrimary, fontSize: 10 }}
        />
        {series.map(item => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.key}
            stroke={HOURLY_DAY_COLORS[item.day] || "#64748b"}
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

function NswStationDetailPanel({
  stationKey,
  period,
  classification,
  hourlyClassification,
  darkMode
}) {
  const [tab, setTab] = useState("yearly");
  const [yearly, setYearly] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [yearlyLoading, setYearlyLoading] = useState(false);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [yearlyError, setYearlyError] = useState("");
  const [hourlyError, setHourlyError] = useState("");
  const [enabledDays, setEnabledDays] = useState([...DEFAULT_NSW_HOURLY_DAYS]);
  const [hourlyProfileIndex, setHourlyProfileIndex] = useState(0);
  const [hourlyDirection, setHourlyDirection] = useState(HOURLY_DIR_WITH);
  const [chartHover, setChartHover] = useState(null);
  const [exportBothDirections, setExportBothDirections] = useState(false);

  useEffect(() => {
    if (!stationKey) {
      setYearly(null);
      setHourly(null);
      setYearlyError("");
      setHourlyError("");
      return;
    }
    const controller = new AbortController();
    setYearlyLoading(true);
    setYearlyError("");
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (classification) params.set("classification", classification);
    fetch(`/api/nsw/station/${stationKey}/yearly?${params}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(res.status === 404 ? "No yearly data" : `HTTP ${res.status}`);
        return res.json();
      })
      .then(setYearly)
      .catch(err => {
        if (err.name !== "AbortError") {
          setYearly(null);
          setYearlyError(err.message || "Could not load yearly data.");
        }
      })
      .finally(() => setYearlyLoading(false));
    return () => controller.abort();
  }, [stationKey, period, classification]);

  useEffect(() => {
    if (!stationKey) {
      setHourly(null);
      setHourlyError("");
      return;
    }
    const controller = new AbortController();
    setHourlyLoading(true);
    setHourlyError("");
    setHourlyProfileIndex(0);
    setHourlyDirection(HOURLY_DIR_WITH);
    const params = new URLSearchParams();
    if (hourlyClassification != null && hourlyClassification !== "") {
      params.set("classification", String(hourlyClassification));
    }
    fetch(`/api/nsw/station/${stationKey}/hourly?${params}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(res.status === 404 ? "No hourly sample" : `HTTP ${res.status}`);
        return res.json();
      })
      .then(setHourly)
      .catch(err => {
        if (err.name !== "AbortError") {
          setHourly(null);
          setHourlyError(err.message || "Could not load hourly sample.");
        }
      })
      .finally(() => setHourlyLoading(false));
    return () => controller.abort();
  }, [stationKey, hourlyClassification]);

  const toggleDay = useCallback(day => {
    setEnabledDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }, []);

  const setPreset = useCallback(days => setEnabledDays(days), []);
  const presetClass = keys =>
    keys.length === enabledDays.length && keys.every(key => enabledDays.includes(key))
      ? "hourly-seg-btn is-on"
      : "hourly-seg-btn";
  const updateChartHover = useCallback(data => setChartHover(data), []);

  useEffect(() => {
    setChartHover(null);
  }, [stationKey, hourlyClassification, hourlyProfileIndex, hourlyDirection, enabledDays, tab]);

  const textPrimary = darkMode ? "#f1f5f9" : "#181a1b";
  const gridStroke = darkMode ? "#334155" : "#e2e8f0";
  const textMuted = darkMode ? "#94a3b8" : "#64748b";

  const nswHourlyGroups = useMemo(
    () => groupNswHourlyProfiles(hourly?.profiles || []),
    [hourly]
  );
  const nswDirectionOptions = useMemo(() => {
    const { withProfiles, againstProfiles, bothProfiles } = nswHourlyGroups;
    const canBoth =
      bothProfiles.length > 0 || (withProfiles.length > 0 && againstProfiles.length > 0);
    return HOURLY_DIRECTION_VALUES.filter(value => {
      if (value === HOURLY_DIR_WITH) return withProfiles.length > 0;
      if (value === HOURLY_DIR_AGAINST) return againstProfiles.length > 0;
      return canBoth;
    }).map(value => ({
      value,
      label: value === HOURLY_DIR_BOTH ? "Both" : value === HOURLY_DIR_WITH ? "With" : "Against"
    }));
  }, [nswHourlyGroups, hourly]);

  useEffect(() => {
    if (!nswDirectionOptions.length) return;
    if (!nswDirectionOptions.some(option => option.value === hourlyDirection)) {
      setHourlyDirection(nswDirectionOptions[0].value);
    }
  }, [nswDirectionOptions, hourlyDirection]);

  const activeHourlyProfiles = useMemo(() => {
    const { withProfiles, againstProfiles, bothProfiles } = nswHourlyGroups;
    if (hourlyDirection === HOURLY_DIR_BOTH) {
      if (withProfiles.length || againstProfiles.length) {
        return [...withProfiles, ...againstProfiles];
      }
      return bothProfiles.length ? bothProfiles : hourly?.profiles || [];
    }
    if (hourlyDirection === HOURLY_DIR_AGAINST) return againstProfiles;
    if (hourlyDirection === HOURLY_DIR_WITH) return withProfiles;
    const fallback = hourly?.profiles?.[hourlyProfileIndex] || hourly?.profiles?.[0];
    return fallback ? [fallback] : [];
  }, [nswHourlyGroups, hourlyDirection, hourly, hourlyProfileIndex]);

  const activeHourlyProfile = activeHourlyProfiles[0];

  const hourlyChartGroups = useMemo(() => {
    const { withProfiles, againstProfiles, bothProfiles } = nswHourlyGroups;
    if (hourlyDirection === HOURLY_DIR_BOTH) {
      const groups = [];
      withProfiles.forEach((profile, index) => {
        groups.push({
          id: `with-${index}`,
          label: nswDirectionCaption(HOURLY_DIR_WITH, [profile]),
          hours: profile.hours || [],
          dashed: false
        });
      });
      againstProfiles.forEach((profile, index) => {
        groups.push({
          id: `against-${index}`,
          label: nswDirectionCaption(HOURLY_DIR_AGAINST, [profile]),
          hours: profile.hours || [],
          dashed: true
        });
      });
      if (groups.length > 1) return groups;
      if (groups.length === 1 && !bothProfiles.length) return groups;
      const fallback = bothProfiles.length ? bothProfiles : hourly?.profiles || [];
      return fallback.map((profile, index) => ({
        id: `profile-${index}`,
        label: nswProfileDirectionLabel(profile),
        hours: profile.hours || [],
        dashed: index > 0
      }));
    }
    if (activeHourlyProfiles.length <= 1) {
      return [
        {
          id: hourlyDirection,
          label: nswDirectionCaption(hourlyDirection, hourly?.profiles || []),
          hours: activeHourlyProfiles[0]?.hours || []
        }
      ];
    }
    return activeHourlyProfiles.map((profile, index) => ({
      id: `${hourlyDirection}-${index}`,
      label: nswProfileDirectionLabel(profile),
      hours: profile.hours || []
    }));
  }, [nswHourlyGroups, hourlyDirection, hourly, activeHourlyProfiles]);

  const hourlyChartData = useMemo(
    () => mergeHourlyDirectionSeries(hourlyChartGroups, NSW_HOURLY_DAY_KEYS),
    [hourlyChartGroups]
  );
  const hourlyChartSeries = useMemo(
    () => buildHourlyChartSeries(enabledDays, hourlyChartGroups, NSW_HOURLY_DAY_LABELS),
    [enabledDays, hourlyChartGroups]
  );

  const handleExportCsv = useCallback(() => {
    const source = tab === "yearly" ? yearly : hourly;
    const safeName = safeFilenamePart(source?.name || source?.roadName || stationKey);
    if (tab === "yearly") {
      if (!yearly?.chart?.length) return;
      const directions = yearly.directions || [];
      const rows = [
        ["Station key", "Name", "Road", "Period", "Classification", "Year", ...directions],
        ...yearly.chart.map(point => [
          stationKey,
          yearly.name,
          yearly.roadName,
          yearly.period,
          yearly.classification,
          point.year,
          ...directions.map(dir => point[dir] ?? "")
        ])
      ];
      downloadCsv(`nsw_station_${stationKey}_${safeName || "yearly"}.csv`, rowsToCsv(rows));
      return;
    }
    if (!enabledDays.length) return;
    const profiles =
      (exportBothDirections || hourlyDirection === HOURLY_DIR_BOTH) && hourly?.profiles?.length
        ? hourly.profiles
        : activeHourlyProfiles;
    if (!profiles.length) return;
    const rows = [
      [
        "Station key",
        "Name",
        "Road",
        "Classification",
        "Direction",
        "Hour",
        ...enabledDays.map(day => NSW_HOURLY_DAY_LABELS[day] || day)
      ]
    ];
    profiles.forEach(profile => {
      (profile.hours || []).forEach(point => {
        rows.push([
          stationKey,
          hourly?.name,
          hourly?.roadName,
          hourly?.classification,
          nswProfileDirectionLabel(profile),
          point.hour,
          ...enabledDays.map(day => point[day] ?? "")
        ]);
      });
    });
    downloadCsv(
      `nsw_station_${stationKey}_${safeName || "hourly"}${profiles.length > 1 ? "_both_directions" : ""}.csv`,
      rowsToCsv(rows)
    );
  }, [
    tab,
    yearly,
    hourly,
    stationKey,
    enabledDays,
    activeHourlyProfile,
    exportBothDirections,
    hourlyDirection,
    activeHourlyProfiles
  ]);

  const exportDisabled =
    tab === "yearly"
      ? !yearly?.chart?.length
      : enabledDays.length === 0 ||
        !(exportBothDirections || hourlyDirection === HOURLY_DIR_BOTH
          ? hourly?.profiles?.some(p => p.hours?.length)
          : hourlyChartData.length);

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

  if (!stationKey) {
    return (
      <div className="chart-empty-state" style={{ ...shellStyle, padding: "14px 8px" }}>
        <p className="chart-empty-label">(no site selected)</p>
      </div>
    );
  }

  const header = yearly || hourly;
  const bodyBusy = tab === "yearly" ? yearlyLoading : hourlyLoading;
  const bodyError = tab === "yearly" ? yearlyError : hourlyError;

  return (
    <div style={shellStyle}>
      <div className="chart-overlay-body" style={{ padding: "1rem", boxSizing: "border-box" }}>
        <div className="chart-panel-header" style={{ marginBottom: 8 }}>
          <div className="chart-panel-header-text">
            <h3 style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.3 }}>
              {header?.name || `Station ${stationKey}`}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.78rem", opacity: 0.85 }}>
              {[header?.roadName, header?.suburb, header?.lga].filter(Boolean).join(" · ")}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: textMuted }}>
              Key {stationKey}
              {header?.stationId != null ? ` · ID ${header.stationId}` : ""}
              {header?.permanent ? " · permanent" : " · sample"}
              {header?.deviceType ? ` · ${header.deviceType}` : ""}
            </p>
          </div>
          <ExportCsvButton
            onClick={handleExportCsv}
            disabled={exportDisabled}
            darkMode={darkMode}
            showBothDirections={
              tab === "hourly" &&
              hourlyDirection !== HOURLY_DIR_BOTH &&
              (hourly?.profiles?.length || 0) > 1
            }
            bothDirections={exportBothDirections}
            onBothDirectionsChange={setExportBothDirections}
          />
        </div>

        <div className="nsw-tabs" role="tablist" style={{ marginBottom: 8, flexShrink: 0 }}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "yearly"}
            className={tab === "yearly" ? "nsw-tab nsw-tab-active" : "nsw-tab"}
            onClick={() => setTab("yearly")}
          >
            Yearly AADT
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "hourly"}
            className={tab === "hourly" ? "nsw-tab nsw-tab-active" : "nsw-tab"}
            onClick={() => setTab("hourly")}
          >
            Hourly sample
          </button>
        </div>

        <div
          className="nsw-tab-panel"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}
        >
          {bodyBusy && (
            <p style={{ opacity: 0.8, margin: "auto 0" }}>
              {tab === "yearly" ? "Loading yearly series…" : "Loading hourly sample…"}
            </p>
          )}
          {bodyError && <p className="site-info-error">{bodyError}</p>}

          {tab === "yearly" && !yearlyLoading && yearly && (
            <>
              <p className="nsw-meta-line">
                {yearly.period} · {yearly.classification}
                {yearly.years?.length
                  ? ` · ${yearly.years[0]}–${yearly.years[yearly.years.length - 1]}`
                  : ""}
                {yearly.latestAadt != null
                  ? ` · latest ${formatCount(yearly.latestAadt)}${yearly.latestYear ? ` (${yearly.latestYear})` : ""}`
                  : ""}
              </p>
              {yearly.chart?.length ? (
                <div style={{ flex: 1, minHeight: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={yearly.chart} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                      <XAxis dataKey="year" stroke={textPrimary} tick={{ fill: textPrimary, fontSize: 11 }} />
                      <YAxis
                        stroke={textPrimary}
                        tick={{ fill: textPrimary, fontSize: 11 }}
                        tickFormatter={v => formatCount(v)}
                      />
                      <Tooltip
                        formatter={(value, name) => [formatCount(value), name]}
                        labelFormatter={label => `Year ${label}`}
                      />
                      <Legend />
                      {(yearly.directions || []).map(direction => (
                        <Line
                          key={direction}
                          type="monotone"
                          dataKey={direction}
                          name={direction}
                          stroke={NSW_CARDINAL_COLORS[direction] || "#64748b"}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p>No chartable yearly counts for this filter.</p>
              )}
            </>
          )}

          {tab === "hourly" && !hourlyLoading && hourly && (
            <>
              <p className="nsw-meta-line">
                {hourly.classification}
                {` · ${nswDirectionCaption(hourlyDirection, hourly.profiles || [])}`}
                {activeHourlyProfile?.sampleDays
                  ? ` · ${activeHourlyProfile.sampleDays} sample day${activeHourlyProfile.sampleDays === 1 ? "" : "s"}`
                  : ""}
                {activeHourlyProfile?.dateMin
                  ? ` · ${activeHourlyProfile.dateMin} → ${activeHourlyProfile.dateMax}`
                  : ""}
              </p>
              {nswDirectionOptions.length > 1 ? (
                <HourlyDirectionToggle
                  name="nsw-hourly-travel-direction"
                  options={nswDirectionOptions}
                  value={hourlyDirection}
                  onChange={setHourlyDirection}
                />
              ) : hourly.profiles?.length > 1 ? (
                <label className="nsw-filter-label" style={{ marginBottom: 6 }}>
                  Direction profile
                  <select
                    value={hourlyProfileIndex}
                    onChange={e => setHourlyProfileIndex(Number(e.target.value))}
                  >
                    {hourly.profiles.map((profile, idx) => (
                      <option key={idx} value={idx}>
                        {[profile.cardinalDirection, profile.trafficDirection]
                          .filter(Boolean)
                          .join(" · ") || `Profile ${idx + 1}`}
                        {profile.sampleDays ? ` (${profile.sampleDays} days)` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="hourly-toolbar">
                <div className="hourly-seg" role="group" aria-label="Which days">
                  <button type="button" className={presetClass(["MON", "TUE", "WED", "THU", "FRI"])} onClick={() => setPreset(["MON", "TUE", "WED", "THU", "FRI"])}>Weekdays</button>
                  <button type="button" className={presetClass(["SAT", "SUN"])} onClick={() => setPreset(["SAT", "SUN"])}>Weekend</button>
                  <button type="button" className={presetClass(["WEEKDAY_AVERAGE", "WEEKEND_AVERAGE"])} onClick={() => setPreset(["WEEKDAY_AVERAGE", "WEEKEND_AVERAGE"])}>Averages</button>
                </div>
                <div className="hourly-days" role="group" aria-label="Days">
                  {NSW_HOURLY_DAY_KEYS.map(day => {
                    const on = enabledDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        className={`hourly-day${on ? " is-on" : ""}`}
                        aria-pressed={on}
                        onClick={() => toggleDay(day)}
                      >
                        <span className="hourly-day-mark" style={{ background: HOURLY_DAY_COLORS[day] }} />
                        {HOURLY_DAY_SHORT[day]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <HourlyDirectionStrokeLegend groups={hourlyChartGroups} darkMode={darkMode} />
              {hourlyChartData.length && enabledDays.length ? (
                <div style={{ flex: 1, minHeight: 160 }}>
                  <NswHourlyChart
                    chartData={hourlyChartData}
                    series={hourlyChartSeries}
                    darkMode={darkMode}
                    onHoverChange={updateChartHover}
                  />
                </div>
              ) : hourlyChartData.length ? (
                <div
                  style={{
                    flex: 1,
                    minHeight: 160,
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
                <p>No hourly profile for this station.</p>
              )}
            </>
          )}
        </div>
      </div>
      {tab === "hourly" && !hourlyLoading && hourly && hourlyChartData.length ? (
        <div className="chart-hover-extend">
          <div className="hourly-hover" aria-live="polite">
            {chartHover?.entries?.length ? (
              <>
                <span className="hourly-hover-hour">Hour {chartHover.label}</span>
                {chartHover.entries.map((entry, idx) => (
                  <span key={idx} className="hourly-hover-item">
                    <span className="hourly-day-mark" style={{ background: entry.color }} />
                    {entry.label} {Number(entry.value).toLocaleString()}
                  </span>
                ))}
              </>
            ) : (
              <span className="hourly-hover-empty">Hover the chart for values</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default NswStationDetailPanel;
