import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PublishNotes from "./PublishNotes";
import {
  ComposedChart,
  Area,
  Bar,
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
  HOURLY_DAY_COLORS,
  HOURLY_DAY_SHORT
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
  qldDirectionCaption,
  hourlySegmentLabel
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

function applyYearlyGrowth(vph, growthPercent, years) {
  const value = Number(vph);
  if (!Number.isFinite(value)) return null;
  const rate = Math.min(100, Math.max(-100, Number(growthPercent) || 0));
  const span = Number(years) || 0;
  return value * Math.pow(1 + rate / 100, span);
}

function formatGrowthVolume(value) {
  if (!Number.isFinite(value)) return "";
  const n = Math.round(value * 10) / 10;
  return Number.isInteger(n) ? n : n.toFixed(1);
}

function exportHourLabel(hour) {
  return String(hour ?? "").replace(/\d+/g, part => (part.length === 1 ? "0" + part : part));
}

function seriesVolume(point, day) {
  const value = Number(point[day]);
  return Number.isFinite(value) ? value : null;
}

function buildHourlyExportCsv(profile, directions, enabledDays, calc) {
  const exportDays = enabledDays.filter(day => HOURLY_DAY_KEYS.includes(day));
  const showLanes = Boolean(calc && calc.showLanes);
  const showQueue = Boolean(calc && calc.showQueue);
  const header = ["Site ID", "Road name", "Description", "Direction", "Hour", "Day", "Volume"];
  if (showLanes) header.push("Within 200 m lanes", "Mid-block lanes");
  if (showQueue) {
    header.push(
      "Growth %",
      "Growth years",
      "Recorded year",
      "Forecast year",
      "Grown volume (veh/h)",
      "Hold (min)",
      "HV %",
      "LV vehicles",
      "LV length (m)",
      "HV vehicles",
      "HV length (m)",
      "End of queue (m)"
    );
  }
  const rows = [header];
  directions.forEach(dir => {
    const match = (profile.profiles || []).find(p => p.direction === dir);
    if (!match) return;
    chartDataFromHours(match.hours).forEach(point => {
      exportDays.forEach(day => {
        const volume = seriesVolume(point, day);
        const extra = [];
        if (showLanes) {
          extra.push(
            volume == null ? "" : desirableLanes(volume, 500),
            volume == null ? "" : desirableLanes(volume, 1000)
          );
        }
        if (showQueue) {
          if (volume == null) {
            extra.push("", "", "", "", "", "", "", "", "", "", "", "");
          } else {
            const grown = applyYearlyGrowth(volume, calc.growthPercent, calc.years);
            const queue = queueParts(grown, calc.hvPercent, calc.holdMinutes);
            extra.push(
              calc.growthPercent,
              calc.years,
              calc.recordedYear,
              calc.forecastYear,
              formatGrowthVolume(grown),
              calc.holdMinutes,
              calc.hvPercent,
              queue.lvCount,
              formatQueueLength(queue.lvMetres),
              queue.hvCount,
              formatQueueLength(queue.hvMetres),
              formatQueueLength(queue.lvMetres + queue.hvMetres)
            );
          }
        }
        rows.push([
          profile.siteId,
          profile.roadName,
          profile.description,
          hourlyDirectionLabel(dir, profile.gazettalBearing),
          exportHourLabel(point.hour),
          HOURLY_DAY_LABELS[day] || day,
          volume == null ? "" : volume,
          ...extra
        ]);
      });
    });
  });
  return rows.map(row => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function desirableLanes(vph, vehiclesPerLane) {
  const value = Number(vph);
  if (!Number.isFinite(value)) return null;
  return Math.max(1, Math.ceil(value / vehiclesPerLane));
}

// QGTTM Part 3 Table 4.3 / AGTTM Part 3 Table 4.3.
// 5-minute stop uses 6 m (average) and 20 m (heavy). Other times scale from that.
const QUEUE_STOP_MINUTES = [2, 5, 10, 15, 30];

function queueMultipliers(minutes) {
  const t = Number(minutes);
  if (!Number.isFinite(t) || t <= 0) return { ma: 6, mo: 20 };
  return { ma: 1.2 * t, mo: 4 * t };
}

function formatQueueLength(metres) {
  const n = Math.round(Number(metres) * 10) / 10;
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function queueParts(vph, hvPercent, minutes) {
  const { ma, mo } = queueMultipliers(minutes);
  const value = Number(vph);
  if (!Number.isFinite(value) || value <= 0) {
    return { lvCount: 0, hvCount: 0, ma, mo, lvMetres: 0, hvMetres: 0 };
  }
  const share = Math.min(100, Math.max(0, Number(hvPercent) || 0)) / 100;
  const fiveMin = value / 12;
  const lvCount = Math.max(1, Math.ceil(fiveMin * (1 - share) - 1e-9));
  const hvCount = share > 0 ? Math.max(1, Math.ceil(fiveMin * share - 1e-9)) : 0;
  return { lvCount, hvCount, ma, mo, lvMetres: lvCount * ma, hvMetres: hvCount * mo };
}

function buildHoverEntries(payload, series) {
  if (!payload?.length) return [];
  const entries = series
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
  const near = payload.find(row => row.dataKey === "lanesNear");
  const mid = payload.find(row => row.dataKey === "lanesMid");
  if (near?.value != null) {
    entries.push({ label: "Within 200 m", value: near.value, color: "#0c6e78" });
  }
  if (mid?.value != null) {
    entries.push({ label: "Mid-block", value: mid.value, color: "#c4a15a" });
  }
  const queueRow = payload.find(row => row.dataKey === "queueLv" || row.dataKey === "queueHv")?.payload;
  if (queueRow && (queueRow.queueLv != null || queueRow.queueHv != null)) {
    const total = (Number(queueRow.queueLv) || 0) + (Number(queueRow.queueHv) || 0);
    entries.push({
      label: "End of queue",
      value: total,
      color: "#64748b",
      suffix: " m",
      detail:
        "(" +
        queueRow.queueLvCount +
        " LV × " +
        formatQueueLength(queueRow.queueMa) +
        " m = " +
        formatQueueLength(queueRow.queueLv) +
        " m, " +
        queueRow.queueHvCount +
        " HV × " +
        formatQueueLength(queueRow.queueMo) +
        " m = " +
        formatQueueLength(queueRow.queueHv) +
        " m)"
    });
  }
  return entries;
}

function withOverlays(chartData, series, hvPercent, holdMinutes, growthPercent, growthYears) {
  return (chartData || []).map(row => {
    let busiest = null;
    series.forEach(item => {
      const value = Number(row[item.key]);
      if (!Number.isFinite(value)) return;
      busiest = busiest == null ? value : Math.max(busiest, value);
    });
    const grown = applyYearlyGrowth(busiest, growthPercent, growthYears);
    const queue = queueParts(grown, hvPercent, holdMinutes);
    return {
      ...row,
      lanesNear: desirableLanes(busiest, 500),
      lanesMid: desirableLanes(busiest, 1000),
      queueLv: queue.lvMetres,
      queueHv: queue.hvMetres,
      queueLvCount: queue.lvCount,
      queueHvCount: queue.hvCount,
      queueMa: queue.ma,
      queueMo: queue.mo
    };
  });
}

function ChartHoverBridge({ active, payload, label, series, onUpdate, onClear }) {
  const lastKeyRef = useRef("");

  useEffect(() => {
    if (active && payload?.length) {
      const entries = buildHoverEntries(payload, series);
      const key = `${label}|${entries.map(e => `${e.label}:${e.value}:${e.detail || ""}`).join(";")}`;
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
  showLanes,
  showQueue,
  holdMinutes,
  hvPercent,
  growthPercent,
  growthYears,
  onHoverChange
}) {
  const textPrimary = darkMode ? "#f1f5f9" : "#181a1b";
  const axisMuted = darkMode ? "#94a3b8" : "#64748b";
  const onUpdate = useCallback(data => onHoverChange(data), [onHoverChange]);
  const onClear = useCallback(() => onHoverChange(null), [onHoverChange]);
  const plotted = useMemo(() => withOverlays(chartData, series, hvPercent, holdMinutes, growthPercent, growthYears), [chartData, series, hvPercent, holdMinutes, growthPercent, growthYears]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={plotted}
        margin={{ top: 4, right: showQueue ? 48 : showLanes ? 36 : 8, left: 0, bottom: 22 }}
        barCategoryGap={0}
        barGap={0}
        style={{ background: darkMode ? "#23272f" : "#fff" }}
      >
        <defs>
          <pattern id="qgttm-near" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <rect width="8" height="8" fill={darkMode ? "rgba(12,110,120,0.28)" : "rgba(12,110,120,0.14)"} />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#0c6e78" strokeWidth="2" />
          </pattern>
          <pattern id="qgttm-mid" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)">
            <rect width="8" height="8" fill={darkMode ? "rgba(196,161,90,0.22)" : "rgba(196,161,90,0.16)"} />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#c4a15a" strokeWidth="2" />
          </pattern>
          <pattern id="qgttm-queue-lv" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <rect width="8" height="8" fill={darkMode ? "rgba(125,143,163,0.34)" : "rgba(125,143,163,0.2)"} />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#7d8fa3" strokeWidth="2" />
          </pattern>
          <pattern id="qgttm-queue-hv" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)">
            <rect width="8" height="8" fill={darkMode ? "rgba(138,98,50,0.45)" : "rgba(138,98,50,0.28)"} />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#8a6232" strokeWidth="2" />
          </pattern>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#444" : "#ccc"} />
        <XAxis
          dataKey="hour"
          stroke={textPrimary}
          tick={{ fill: textPrimary, fontSize: 10 }}
          interval={1}
          isAnimationActive={false}
        />
        <YAxis
          stroke={textPrimary}
          tick={{ fill: textPrimary, fontSize: 10 }}
          isAnimationActive={false}
          label={{
            value: "Avg volume",
            angle: -90,
            position: "insideLeft",
            fill: textPrimary,
            style: { fontWeight: 600, fontSize: 11 }
          }}
        />
        <Tooltip
          shared
          cursor={{ stroke: darkMode ? "#64748b" : "#94a3b8", strokeWidth: 1 }}
          wrapperStyle={{ display: "none", width: 0, height: 0 }}
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
        {showQueue ? (
          <>
            <YAxis
              yAxisId="queue"
              orientation="right"
              domain={[0, () => {
                const max = plotted.reduce(
                  (m, row) => Math.max(m, (Number(row.queueLv) || 0) + (Number(row.queueHv) || 0)),
                  0
                );
                return Math.max(26, Math.ceil(max));
              }]}
              allowDecimals={false}
              width={40}
              stroke={axisMuted}
              tick={{ fill: axisMuted, fontSize: 10 }}
              isAnimationActive={false}
              label={{
                value: "Queue (m)",
                angle: 90,
                position: "insideRight",
                fill: axisMuted,
                style: { fontSize: 10 }
              }}
            />
            <Bar
              yAxisId="queue"
              stackId="queue"
              dataKey="queueHv"
              name="HV"
              fill="url(#qgttm-queue-hv)"
              stroke="#8a6232"
              isAnimationActive={false}
            />
            <Bar
              yAxisId="queue"
              stackId="queue"
              dataKey="queueLv"
              name="LV"
              fill="url(#qgttm-queue-lv)"
              stroke="#5b6e80"
              isAnimationActive={false}
            />
          </>
        ) : showLanes ? (
          <>
            <YAxis
              yAxisId="lanes"
              orientation="right"
              domain={[0, dataMax => Math.max(4, Math.ceil(Number(dataMax) || 0))]}
              allowDecimals={false}
              width={32}
              stroke={axisMuted}
              tick={{ fill: axisMuted, fontSize: 10 }}
              isAnimationActive={false}
              label={{
                value: "Lanes",
                angle: 90,
                position: "insideRight",
                fill: axisMuted,
                style: { fontSize: 10 }
              }}
            />
            <Area
              yAxisId="lanes"
              type="step"
              dataKey="lanesNear"
              name="Within 200 m"
              stroke="#0c6e78"
              strokeWidth={1.25}
              strokeDasharray="3 2"
              fill="url(#qgttm-near)"
              fillOpacity={1}
              isAnimationActive={false}
              activeDot={false}
              dot={false}
              connectNulls
            />
            <Area
              yAxisId="lanes"
              type="step"
              dataKey="lanesMid"
              name="Mid-block"
              stroke="#c4a15a"
              strokeWidth={1.25}
              strokeDasharray="3 2"
              fill="url(#qgttm-mid)"
              fillOpacity={1}
              isAnimationActive={false}
              activeDot={false}
              dot={false}
              connectNulls
            />
          </>
        ) : null}
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
      </ComposedChart>
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
  darkMode,
  recordYear
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tableOpen, setTableOpen] = useState(false);
  const [chartHover, setChartHover] = useState(null);
  const [exportBothDirections, setExportBothDirections] = useState(false);
  const [showLanes, setShowLanes] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [holdMinutes, setHoldMinutes] = useState(5);
  const [hvPercent, setHvPercent] = useState(10);
  const [growthPercent, setGrowthPercent] = useState(3);

  const toggleDay = useCallback(
    day => {
      const on = enabledDays.includes(day);
      const next = on ? enabledDays.filter(d => d !== day) : [...enabledDays, day];
      onEnabledDaysChange(next);
    },
    [enabledDays, onEnabledDaysChange]
  );

  const setPreset = useCallback(keys => onEnabledDaysChange(keys), [onEnabledDaysChange]);
  const presetClass = keys =>
    keys.length === enabledDays.length && keys.every(key => enabledDays.includes(key))
      ? "hourly-seg-btn is-on"
      : "hourly-seg-btn";

  useEffect(() => {
    if (!siteId) {
      setProfile(null);
      setError("");
      onGazettalBearingChange?.(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
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
        if (!active) return;
        setProfile(data);
        onGazettalBearingChange?.(data?.gazettalBearing ?? null);
      })
      .catch(err => {
        if (!active || err?.name === "AbortError") return;
        setProfile(null);
        setError("Could not load hourly profile for this site.");
        onGazettalBearingChange?.(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [siteId, onGazettalBearingChange]);

  useEffect(() => {
    setChartHover(null);
  }, [siteId, direction, enabledDays]);

  const availableDirections = useMemo(
    () => (profile?.profiles || []).map(item => item.direction).filter(Boolean),
    [profile]
  );
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

  const activeDays = useMemo(
    () => enabledDays.filter(d => HOURLY_DAY_KEYS.includes(d)),
    [enabledDays]
  );
  const chartSeries = useMemo(
    () => buildHourlyChartSeries(activeDays, chartGroups, HOURLY_DAY_LABELS),
    [activeDays, chartGroups]
  );
  const updateChartHover = useCallback(data => setChartHover(data), []);

  const growthHorizon = useMemo(() => {
    const forecastYear = new Date().getFullYear();
    const recorded = Number(recordYear);
    const recordedYear = Number.isFinite(recorded) ? recorded : "";
    const years = recordedYear === "" ? 0 : Math.max(0, forecastYear - recordedYear);
    return { recordedYear, forecastYear, years };
  }, [recordYear]);

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
    label: hourlySegmentLabel(value, profile?.gazettalBearing)
  }));

  const handleExportCsv = useCallback(() => {
    if (!profile || activeDays.length === 0 || !exportDirections.length) return;
    const csv = buildHourlyExportCsv(profile, exportDirections, activeDays, {
      showLanes,
      showQueue,
      holdMinutes,
      hvPercent,
      growthPercent,
      years: growthHorizon.years,
      recordedYear: growthHorizon.recordedYear,
      forecastYear: growthHorizon.forecastYear
    });
    if (!csv.includes("\r\n")) return;
    const safeName = safeFilenamePart(profile.roadName || profile.siteId);
    const dirSlug =
      exportDirections.length > 1
        ? "both_directions"
        : exportDirections[0] === HOURLY_DIR_WITH
          ? "with_gazettal"
          : "against_gazettal";
    downloadCsv(`hourly_site_${profile.siteId}_${safeName || "volumes"}_${dirSlug}.csv`, csv);
  }, [profile, exportDirections, activeDays, showLanes, showQueue, holdMinutes, hvPercent, growthPercent, growthHorizon]);

  const textPrimary = darkMode ? "#f1f5f9" : "#181a1b";
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
  const thStyle = {
    ...thtdStyle,
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: darkMode ? "#23272f" : "#fff"
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
            <h3 style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.3 }}>
              {profile.roadName}
              {recordYear ? <span className="hourly-record-year"> · {recordYear}</span> : null}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.78rem", opacity: 0.85 }}>
              Site {profile.siteId} · {profile.description}
              {" · "}
              {qldDirectionCaption(direction, profile.gazettalBearing)}
            </p>
            <PublishNotes notes={profile.publishNotes} />
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
          <div className="hourly-toolbar">
          <div className="hourly-seg" role="group" aria-label="Which days">
            <button type="button" className={presetClass(["MON", "TUE", "WED", "THU", "FRI"])} onClick={() => setPreset(["MON", "TUE", "WED", "THU", "FRI"])}>Weekdays</button>
            <button type="button" className={presetClass(["SAT", "SUN"])} onClick={() => setPreset(["SAT", "SUN"])}>Weekend</button>
            <button type="button" className={presetClass(["WEEKDAY_AVERAGE", "WEEKEND_AVERAGE"])} onClick={() => setPreset(["WEEKDAY_AVERAGE", "WEEKEND_AVERAGE"])}>Averages</button>
          </div>
          <div className="hourly-switches" role="group" aria-label="Chart overlays">
            <span className="hourly-switch-wrap">
              <button
                type="button"
                className={`hourly-switch${showLanes ? " is-on" : ""}`}
                aria-pressed={showLanes}
                onClick={() => {
                  setShowLanes(on => {
                    if (!on) setShowQueue(false);
                    return !on;
                  });
                }}
              >
                Min. lanes
              </button>
              <span className="hourly-switch-tip" role="tooltip">
                <strong>Desirable lanes open</strong>
                <span>QGTTM Part 3 s2.5.7 replaces AGTTM Part 3 Table 2.4. The same bands are AGTTM Part 2 Table 3.1.</span>
                <span>One direction, from the busiest line shown that hour.</span>
                <span>Within 200 m of a controlled intersection (signals, roundabout, stop or give way): lanes = ceil(volume / 500). Up to 500 veh/h is 1 lane, then 2, 3 and 4 at 1,000, 1,500 and 2,000.</span>
                <span>Mid-block, outside 200 m: lanes = ceil(volume / 1,000). Up to 1,000 veh/h is 1 lane, then 2, 3 and 4 at 2,000, 3,000 and 4,000.</span>
                <span>Above those bands the same step continues. Heavy-vehicle, pavement and geometry reductions are not applied.</span>
              </span>
            </span>
            <span className="hourly-switch-wrap">
              <button
                type="button"
                className={`hourly-switch${showQueue ? " is-on" : ""}`}
                aria-pressed={showQueue}
                onClick={() => {
                  setShowQueue(on => {
                    if (!on) setShowLanes(false);
                    return !on;
                  });
                }}
              >
                Queue
              </button>
              <span className="hourly-switch-tip" role="tooltip">
                <strong>End of queue, single-lane reversible flow</strong>
                <span>QGTTM Part 3 Table 4.3. The count method is AGTTM Part 3 s4.8.1 Table 4.3, which QGTTM Part 3 s4.8 step 4 points to. Shuttle flow is QGTTM Part 3 s5.4.4, replacing AGTTM Part 3 s5.4.4.</span>
                <span>The hold time is the maximum stopping time in that table: from when this approach is stopped until it is released. For shuttle flow that includes the opposing queue travelling the closure, any period with nothing moving, and a margin for slower travel.</span>
                <span>Each hour uses the busiest line shown, one direction. Yearly growth compounds from the recorded year to the current year: volume x (1 + growth%) ^ years. Five-minute volume uses that grown volume. Growth starts at 3%.</span>
                <span>Average vehicles = (100 − HV%) of that count, rounded up. Heavy vehicles = HV%, rounded up. QGTTM counts a heavy vehicle with the oversized multiplier. HV starts at 10%.</span>
                <span>Queue (m) = average × Ma + heavy × Mo. Ma is 1.2 × minutes and Mo is 4 × minutes, so a 5-minute stop is 6 m and 20 m. The table rows are 2 min (2.4 and 8), 5 (6 and 20), 10 (12 and 40), 15 (18 and 60) and 30 (36 and 120).</span>
                <span>With traffic present the estimate is at least one average vehicle, plus one heavy vehicle when HV% is above 0. The right axis is metres back from the stop. The band for each hour is centred on that hour. Only one of Min. lanes and Queue can be on.</span>
              </span>
            </span>
            {showQueue ? (
              <>
                <label className="hourly-field">
                  Hold
                  <select
                    aria-label="Hold time"
                    value={holdMinutes}
                    onChange={event => setHoldMinutes(Number(event.target.value))}
                  >
                    {QUEUE_STOP_MINUTES.map(minutes => (
                      <option key={minutes} value={minutes}>{minutes} min</option>
                    ))}
                  </select>
                </label>
                <label className="hourly-field">
                  HV
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    aria-label="Heavy vehicle percentage"
                    value={hvPercent}
                    onChange={event => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next)) return;
                      setHvPercent(Math.min(100, Math.max(0, next)));
                    }}
                  />
                  %
                </label>
                <label className="hourly-field">
                  Growth
                  <input
                    type="number"
                    min={-100}
                    max={100}
                    step={0.1}
                    aria-label="Yearly traffic growth percentage"
                    value={growthPercent}
                    onChange={event => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next)) return;
                      setGrowthPercent(Math.min(100, Math.max(-100, next)));
                    }}
                  />
                  %
                  <span className="hourly-field-note">
                    {growthHorizon.years === 0
                      ? "recorded this year"
                      : `${growthHorizon.years} yr to ${growthHorizon.forecastYear}`}
                  </span>
                </label>
              </>
            ) : null}
          </div>
          <div className="hourly-days" role="group" aria-label="Days">
            {HOURLY_DAY_KEYS.map(day => {
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
                showLanes={showLanes}
                showQueue={showQueue}
                holdMinutes={holdMinutes}
                hvPercent={hvPercent}
                growthPercent={growthPercent}
                growthYears={growthHorizon.years}
                onHoverChange={updateChartHover}
              />
            )}
          </div>
        </div>
      </div>

      <div className="chart-hover-extend">
        {showLanes || showQueue ? (
          <p className="hourly-calc-warning" role="note">
            Users shall review current standards and these calculated values against official road authority data. This is an initial calculation only and should be validated by an appropriately trained person before use on site. The length of the work area, travel speed, and topography should all be assessed by subject matter experts to advise of appropriate hold times used in queue length assessments.
          </p>
        ) : null}
        <div className="hourly-hover" aria-live="polite">
            {chartHover?.entries?.length ? (
              <>
                <span className="hourly-hover-hour">Hour {chartHover.label}</span>
                {chartHover.entries.map((entry, idx) => (
                  <span key={idx} className="hourly-hover-item">
                    <span className="hourly-day-mark" style={{ background: entry.color }} />
                    {entry.label} {Number(entry.value).toLocaleString()}{entry.suffix || ""}
                  </span>
                ))}
                {chartHover.entries.filter(entry => entry.detail).map((entry, idx) => (
                  <span key={`detail-${idx}`} className="hourly-hover-detail">{entry.detail}</span>
                ))}
              </>
            ) : (
              <span className="hourly-hover-empty">Hover the chart for values</span>
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
            <div className="hourly-table-scroll">
              <table
                className="hourly-volume-table"
                style={{
                  background: darkMode ? "#23272f" : "#fff",
                  color: textPrimary
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>Hour</th>
                    {chartGroups.length > 1 ? <th style={thStyle}>Direction</th> : null}
                    {HOURLY_DAY_KEYS.map(day => (
                      <th key={day} style={thStyle}>
                        {HOURLY_DAY_SHORT[day] || HOURLY_DAY_LABELS[day]}
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
