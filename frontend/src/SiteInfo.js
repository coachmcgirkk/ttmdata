import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { DIRECTION_COLORS, DIRECTION_BAR_COLORS } from "./colorPalette";
import { downloadCsv, escapeCsvCell, safeFilenamePart } from "./csvExport";
import ExportCsvButton from "./components/ExportCsvButton";

const DIRECTION_LABELS = [
  "BOTH DIRECTIONS",
  "WITH GAZETTAL",
  "AGAINST GAZETTAL"
];

function buildHoverEntries(payload, directions) {
  if (!payload?.length) return [];
  const ordered = [];
  directions.forEach(direction => {
    const aadtActual = payload.find(e => e.dataKey === `${direction}_AADT`);
    const aadtForecast = payload.find(e => e.dataKey === `${direction}_AADT_FORECAST`);
    const heavyPct = payload.find(e => e.dataKey === `${direction}_HeavyPct`);
    if (aadtActual && aadtActual.value !== undefined) {
      ordered.push({
        label: `AADT (${direction})`,
        value: aadtActual.value,
        color: DIRECTION_COLORS[direction],
        isHeavy: false
      });
    }
    if (aadtForecast && aadtForecast.value !== undefined) {
      const growth = aadtForecast.payload[`${direction}_AADT_FORECAST_GROWTH`];
      ordered.push({
        label: `Forecast (${direction})`,
        value: aadtForecast.value,
        color: DIRECTION_COLORS[direction],
        growth,
        isHeavy: false
      });
    }
    if (heavyPct && heavyPct.value !== undefined) {
      ordered.push({
        label: `Heavy % (${direction})`,
        value: heavyPct.value,
        color: DIRECTION_COLORS[direction],
        isHeavy: true
      });
    }
  });
  return ordered;
}

/** Syncs Recharts 3 tooltip state into the panel below the chart without re-rendering the chart each move. */
function ChartHoverBridge({ active, payload, label, directions, onUpdate, onClear }) {
  const lastKeyRef = useRef("");

  useEffect(() => {
    if (active && payload?.length) {
      const entries = buildHoverEntries(payload, directions);
      const key = `${label}|${entries.map(e => `${e.label}:${e.value}:${e.growth ?? ""}`).join(";")}`;
      if (key !== lastKeyRef.current) {
        lastKeyRef.current = key;
        onUpdate({ label, entries });
      }
    } else if (lastKeyRef.current !== "") {
      lastKeyRef.current = "";
      onClear();
    }
  }, [active, payload, label, directions, onUpdate, onClear]);

  return null;
}

const SiteTrafficChart = memo(function SiteTrafficChart({
  chartData,
  directions,
  darkMode,
  embedded,
  chartHeight,
  onHoverChange
}) {
  const textPrimary = darkMode ? "#f1f5f9" : "#181a1b";
  const onUpdate = useCallback((data) => onHoverChange(data), [onHoverChange]);
  const onClear = useCallback(() => onHoverChange(null), [onHoverChange]);

  return (
    <ResponsiveContainer width="100%" height={embedded ? "100%" : chartHeight}>
      <ComposedChart
        data={chartData}
        margin={{ top: 4, right: embedded ? 4 : 24, left: embedded ? 0 : 12, bottom: embedded ? 22 : 28 }}
        style={{ background: darkMode ? "#23272f" : "#fff" }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#444" : "#ccc"} />
        <XAxis dataKey="year" stroke={textPrimary} tick={{ fill: textPrimary, fontSize: embedded ? 10 : 12 }} />
        <YAxis
          yAxisId="left"
          label={{ value: "AADT", angle: -90, position: "insideLeft", fill: textPrimary, style: { fontWeight: 600 } }}
          stroke={textPrimary}
          tick={{ fill: textPrimary, fontSize: embedded ? 10 : 12 }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          label={{ value: "Heavy %", angle: 90, position: "insideRight", fill: textPrimary, style: { fontWeight: 600 } }}
          stroke={textPrimary}
          tick={{ fill: textPrimary, fontSize: embedded ? 10 : 12 }}
        />
        <Tooltip
          shared
          cursor={{ stroke: darkMode ? "#64748b" : "#94a3b8", strokeWidth: 1 }}
          wrapperStyle={{ display: "none" }}
          isAnimationActive={false}
          content={(tooltipProps) => (
            <ChartHoverBridge
              {...tooltipProps}
              directions={directions}
              onUpdate={onUpdate}
              onClear={onClear}
            />
          )}
        />
        <Legend
          verticalAlign="bottom"
          wrapperStyle={{ color: textPrimary, fontSize: embedded ? 10 : 12, paddingTop: 4 }}
          formatter={(value) => <span style={{ color: textPrimary }}>{value}</span>}
          iconSize={embedded ? 8 : 14}
        />
        {directions.map(direction => (
          <Line
            key={direction}
            yAxisId="left"
            type="monotone"
            dataKey={`${direction}_AADT`}
            name={`AADT (${direction})`}
            stroke={DIRECTION_COLORS[direction]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
            animateNewValues={false}
          />
        ))}
        {directions.map(direction => (
          <Line
            key={direction + "_forecast"}
            yAxisId="left"
            type="monotone"
            dataKey={`${direction}_AADT_FORECAST`}
            name={`Forecast (${direction})`}
            stroke={DIRECTION_COLORS[direction]}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
            animateNewValues={false}
          />
        ))}
        {directions.map(direction => (
          <Line
            key={direction + "_connect"}
            yAxisId="left"
            type="linear"
            dataKey={`${direction}_CONNECT`}
            stroke={DIRECTION_COLORS[direction]}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
            animateNewValues={false}
            legendType="none"
          />
        ))}
        {directions.map(direction => (
          <Bar
            key={direction + "_bar"}
            yAxisId="right"
            dataKey={`${direction}_HeavyPct`}
            name={`Heavy % (${direction})`}
            fill={DIRECTION_BAR_COLORS[direction]}
            barSize={20}
            stroke={DIRECTION_COLORS[direction]}
            strokeWidth={1}
            opacity={0.85}
            legendType="rect"
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
});

const FORECAST_YEARS = 10;
const FIXED_GROWTH_PCT = 3;

function formatHeavyPct(aadt, heavy) {
  const n = Number(aadt);
  if (!n) return "";
  return ((Number(heavy) / n) * 100).toFixed(1);
}

function buildTrafficExportCsv(site, siteData, chartData, years, lastYear, useFixedGrowth) {
  const forecastMode = useFixedGrowth ? `Fixed ${FIXED_GROWTH_PCT}%` : "TMR rates";
  const header = [
    "Site ID",
    "Road name",
    "Description",
    "Forecast mode",
    "Year",
    "Record type",
    "Forecast growth %",
    "Both directions AADT",
    "Both directions heavy vehicles",
    "Both directions heavy %",
    "With gazettal AADT",
    "With gazettal heavy vehicles",
    "With gazettal heavy %",
    "Against gazettal AADT",
    "Against gazettal heavy vehicles",
    "Against gazettal heavy %"
  ];
  const rows = [header];

  const pushRow = (year, recordType, growthPct, rowByDir) => {
    rows.push([
      site.SITE_ID,
      site.ROAD_NAME,
      site.DESCRIPTION,
      forecastMode,
      year,
      recordType,
      growthPct ?? "",
      rowByDir["BOTH DIRECTIONS"].aadt ?? "",
      rowByDir["BOTH DIRECTIONS"].heavy ?? "",
      rowByDir["BOTH DIRECTIONS"].heavyPct ?? "",
      rowByDir["WITH GAZETTAL"].aadt ?? "",
      rowByDir["WITH GAZETTAL"].heavy ?? "",
      rowByDir["WITH GAZETTAL"].heavyPct ?? "",
      rowByDir["AGAINST GAZETTAL"].aadt ?? "",
      rowByDir["AGAINST GAZETTAL"].heavy ?? "",
      rowByDir["AGAINST GAZETTAL"].heavyPct ?? ""
    ]);
  };

  for (let i = FORECAST_YEARS; i >= 1; i--) {
    const forecastYear = lastYear + i;
    const forecastRowByDir = {};
    DIRECTION_LABELS.forEach(dir => {
      const forecastEntry = chartData.find(e => e.year === String(forecastYear));
      if (forecastEntry?.[`${dir}_AADT_FORECAST`] != null) {
        const forecastAADT = forecastEntry[`${dir}_AADT_FORECAST`];
        const growthRate = forecastEntry[`${dir}_AADT_FORECAST_GROWTH`];
        const lastRow = siteData.find(
          r => r.TRAFFIC_YEAR === lastYear && r.TRAVEL_DIRECTION === dir
        );
        const heavyPct =
          lastRow?.AADT
            ? (Number(lastRow.AADT_CLASS_0B || 0) / Number(lastRow.AADT)) * 100
            : 0;
        forecastRowByDir[dir] = {
          aadt: forecastAADT,
          heavy: Math.round(forecastAADT * heavyPct / 100),
          heavyPct: heavyPct.toFixed(1)
        };
        if (!forecastRowByDir._growth && growthRate !== undefined) {
          forecastRowByDir._growth = growthRate;
        }
      } else {
        forecastRowByDir[dir] = { aadt: "", heavy: "", heavyPct: "" };
      }
    });
    pushRow(forecastYear, "Projected", forecastRowByDir._growth ?? "", forecastRowByDir);
  }

  years.forEach(year => {
    const rowByDir = {};
    DIRECTION_LABELS.forEach(dir => {
      const row = siteData.find(r => r.TRAFFIC_YEAR === year && r.TRAVEL_DIRECTION === dir);
      if (row) {
        const aadt = Number(row.AADT) || 0;
        const heavy = Math.ceil(Number(row.AADT_CLASS_0B || 0));
        rowByDir[dir] = {
          aadt,
          heavy,
          heavyPct: formatHeavyPct(aadt, heavy)
        };
      } else {
        rowByDir[dir] = { aadt: "", heavy: "", heavyPct: "" };
      }
    });
    pushRow(year, "Historical", "", rowByDir);
  });

  return rows.map(row => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function getForecastGrowthRate(forecastYearIndex, lastRow, useFixedGrowth) {
  if (useFixedGrowth) return FIXED_GROWTH_PCT;
  const growth1 = Number(lastRow.GROWTH_PC_1YR) || 0;
  const growth5 = Number(lastRow.GROWTH_PC_5YR) || 0;
  const growth10 = Number(lastRow.GROWTH_PC_10YR) || 0;
  if (forecastYearIndex === 1) return growth1;
  if (forecastYearIndex >= 2 && forecastYearIndex <= 5) return growth5;
  if (forecastYearIndex >= 6 && forecastYearIndex <= 10) return growth10;
  return 0;
}

function SiteInfo({ siteId, darkMode, embedded = false }) {
  const [siteData, setSiteData] = useState([]);
  const [useFixedGrowth, setUseFixedGrowth] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [chartHover, setChartHover] = useState(null);

  useEffect(() => {
    if (siteId) {
      fetch(`/api/site/${siteId}`)
        .then(res => res.json())
        .then(setSiteData);
    } else {
      setSiteData([]);
    }
  }, [siteId]);

  useEffect(() => {
    setChartHover(null);
  }, [siteId, useFixedGrowth]);

  const updateChartHover = useCallback((data) => setChartHover(data), []);

  const {
    chartData,
    directions,
    years,
    lastYear,
    forecastGrowthRates,
    hasNegativeForecast,
    hasHighForecast
  } = useMemo(() => {
    if (!siteData.length) {
      return {
        chartData: [],
        directions: [],
        years: [],
        lastYear: 0,
        forecastGrowthRates: {},
        hasNegativeForecast: false,
        hasHighForecast: false
      };
    }
    const years = [...new Set(siteData.map(row => row.TRAFFIC_YEAR))].sort((a, b) => b - a);
    const directions = DIRECTION_LABELS.filter(dir =>
      siteData.some(row => row.TRAVEL_DIRECTION === dir)
    );

    const chartData = years.slice().reverse().map(year => {
      const entry = { year: String(year) };
      directions.forEach(direction => {
        const row = siteData.find(r => r.TRAFFIC_YEAR === year && r.TRAVEL_DIRECTION === direction);
        if (row) {
          const aadt = Number(row.AADT) || 0;
          const aadt_0b = Number(row.AADT_CLASS_0B) || 0;
          const heavyPct = aadt > 0 ? (aadt_0b / aadt) * 100 : 0;
          entry[`${direction}_AADT`] = aadt;
          entry[`${direction}_HeavyPct`] = heavyPct;
        } else {
          entry[`${direction}_AADT`] = null;
          entry[`${direction}_HeavyPct`] = null;
        }
      });
      return entry;
    });

    const lastYear = Math.max(...years);
    const forecastGrowthRates = {};

    for (const direction of directions) {
      const lastRow = siteData.find(r => r.TRAFFIC_YEAR === lastYear && r.TRAVEL_DIRECTION === direction);
      if (!lastRow) continue;
      let forecastAADT = Number(lastRow.AADT) || 0;

      for (let i = 1; i <= FORECAST_YEARS; ++i) {
        const growthRate = getForecastGrowthRate(i, lastRow, useFixedGrowth);
        forecastAADT = forecastAADT * (1 + growthRate / 100);
        const forecastYear = lastYear + i;
        let forecastEntry = chartData.find(e => e.year === String(forecastYear));
        if (!forecastEntry) {
          forecastEntry = { year: String(forecastYear) };
          chartData.push(forecastEntry);
        }
        forecastEntry[`${direction}_AADT_FORECAST`] = Math.round(forecastAADT);
        forecastEntry[`${direction}_AADT_FORECAST_GROWTH`] = growthRate;
        if (!forecastGrowthRates[direction]) forecastGrowthRates[direction] = {};
        forecastGrowthRates[direction][forecastYear] = growthRate;
      }
    }

    chartData.sort((a, b) => Number(a.year) - Number(b.year));

    const lastYearEntry = chartData.find(e => Number(e.year) === lastYear);
    const firstForecastYearEntry = chartData.find(e => Number(e.year) === lastYear + 1);
    if (lastYearEntry && firstForecastYearEntry) {
      directions.forEach(direction => {
        const actual = lastYearEntry[`${direction}_AADT`];
        const forecast = firstForecastYearEntry[`${direction}_AADT_FORECAST`];
        if (actual != null && forecast != null) {
          lastYearEntry[`${direction}_CONNECT`] = actual;
          firstForecastYearEntry[`${direction}_CONNECT`] = forecast;
        }
      });
    }

    if (chartData.length > 0) {
      const firstYear = Number(chartData[0].year);
      const blankEntry = { year: String(firstYear - 1) };
      directions.forEach(direction => {
        blankEntry[`${direction}_AADT`] = null;
        blankEntry[`${direction}_HeavyPct`] = null;
        blankEntry[`${direction}_AADT_FORECAST`] = null;
        blankEntry[`${direction}_AADT_FORECAST_GROWTH`] = null;
        blankEntry[`${direction}_CONNECT`] = null;
      });
      chartData.unshift(blankEntry);
    }

    const hasNegativeForecast = !useFixedGrowth && Object.values(forecastGrowthRates).some(dirRates =>
      Object.values(dirRates).some(rate => rate < 0)
    );
    const hasHighForecast = !useFixedGrowth && Object.values(forecastGrowthRates).some(dirRates =>
      Object.values(dirRates).some(rate => rate > 10)
    );

    return {
      chartData,
      directions,
      years,
      lastYear,
      forecastGrowthRates,
      hasNegativeForecast,
      hasHighForecast
    };
  }, [siteData, useFixedGrowth]);

  const handleExportCsv = useCallback(() => {
    if (!siteData.length) return;
    const site = siteData[0];
    const csv = buildTrafficExportCsv(
      site,
      siteData,
      chartData,
      years,
      lastYear,
      useFixedGrowth
    );
    const safeName = safeFilenamePart(site.ROAD_NAME || site.SITE_ID);
    downloadCsv(`site_${site.SITE_ID}_${safeName || "traffic"}.csv`, csv);
  }, [siteData, chartData, years, lastYear, useFixedGrowth]);

  const shellStyle = {
    background: darkMode ? "#23272f" : "#fff",
    color: darkMode ? "#f1f5f9" : "#181a1b",
    borderRadius: 2,
    padding: 0,
    margin: embedded ? 0 : "1.5rem 0",
    height: "auto",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "visible",
    boxShadow: darkMode
      ? "0 2px 10px rgba(0,0,0,0.35)"
      : "0 1px 6px rgba(15,23,42,0.08)",
    border: embedded ? `1px solid ${darkMode ? "#3a3f4b" : "#e2e8f0"}` : "none",
    width: embedded ? "100%" : undefined,
    boxSizing: "border-box"
  };
  const bodyPad = { padding: embedded ? "1rem" : "1.5rem", boxSizing: "border-box" };

  if (!siteId) {
    return (
      <div className="chart-empty-state" style={{ ...shellStyle, padding: "14px 8px" }}>
        <p className="chart-empty-label">(no site selected)</p>
      </div>
    );
  }

  if (!siteData.length) {
    return (
      <div style={shellStyle}>
        <div
          className="chart-overlay-body"
          style={{ ...bodyPad, justifyContent: "center", alignItems: "center" }}
        >
          <p style={{ opacity: 0.8 }}>Loading site data…</p>
        </div>
      </div>
    );
  }

  const site = siteData[0];
  const textPrimary = darkMode ? "#f1f5f9" : "#181a1b";
  const textMuted = darkMode ? "#94a3b8" : "#64748b";
  const chartHeight = embedded ? 240 : 350;
  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: "2rem",
    background: darkMode ? "#23272f" : "#fff",
    color: darkMode ? "#f1f5f9" : "#181a1b"
  };
  const thtdStyle = {
    borderBottom: `1px solid ${darkMode ? "#444" : "#ccc"}`,
    textAlign: "left",
    padding: embedded ? "0.35rem 0.4rem" : "0.5rem",
    fontSize: embedded ? "0.72rem" : "inherit"
  };
  const warningStyle = {
    color: "#f59e0b",
    fontSize: "0.75rem",
    lineHeight: 1.35,
    marginBottom: 8,
    padding: "6px 8px",
    borderRadius: 6,
    background: darkMode ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.1)"
  };

  return (
    <div style={shellStyle}>
      <div className="chart-overlay-body" style={bodyPad}>
      <div className="chart-panel-header" style={{ marginBottom: embedded ? 8 : 12 }}>
        <div className="chart-panel-header-text">
          <h3 style={{ margin: 0, fontSize: embedded ? "0.95rem" : "1.25rem", lineHeight: 1.3 }}>
            {site.ROAD_NAME}
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: embedded ? "0.78rem" : "0.9rem", opacity: 0.85 }}>
            Site {site.SITE_ID} · {site.DESCRIPTION}
          </p>
        </div>
        <ExportCsvButton onClick={handleExportCsv} darkMode={darkMode} />
      </div>

      <div
        style={{
          flex: embedded ? 1 : undefined,
          minHeight: embedded ? 0 : undefined,
          display: "flex",
          flexDirection: "column",
          overflow: embedded ? "hidden" : "visible"
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
          <span style={{ fontSize: embedded ? "0.8rem" : "0.9rem", fontWeight: 600 }}>
            Traffic trends
          </span>
          <div
            style={{
              display: "flex",
              flexDirection: embedded ? "column" : "row",
              gap: embedded ? 4 : 8,
              fontSize: "0.72rem"
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input
                type="radio"
                name="forecast-growth"
                checked={!useFixedGrowth}
                onChange={() => setUseFixedGrowth(false)}
              />
              TMR rates
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input
                type="radio"
                name="forecast-growth"
                checked={useFixedGrowth}
                onChange={() => setUseFixedGrowth(true)}
              />
              Fixed {FIXED_GROWTH_PCT}%
            </label>
          </div>
        </div>

        {hasNegativeForecast && (
          <div style={warningStyle}>
            Negative forecast growth — interpret with engineering judgement.
          </div>
        )}
        {hasHighForecast && (
          <div style={warningStyle}>
            Forecast growth &gt;10% — may overstate projected volumes.
          </div>
        )}

        <div style={{ flex: 1, minHeight: embedded ? 180 : chartHeight, height: embedded ? undefined : chartHeight }}>
          <SiteTrafficChart
            chartData={chartData}
            directions={directions}
            darkMode={darkMode}
            embedded={embedded}
            chartHeight={chartHeight}
            onHoverChange={updateChartHover}
          />
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
            fontSize: embedded ? "0.72rem" : "0.8rem",
            lineHeight: 1.45
          }}
        >
          {chartHover?.entries?.length ? (
            <>
              <div style={{ fontWeight: 700, color: textPrimary, marginBottom: 4 }}>
                Year {chartHover.label}
              </div>
              {chartHover.entries.map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: textPrimary,
                    fontWeight: entry.isHeavy ? 600 : 400
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
                    {entry.label}:{" "}
                    {entry.isHeavy
                      ? `${Number(entry.value).toFixed(1)}%`
                      : entry.value?.toLocaleString?.() ?? entry.value}
                    {entry.growth !== undefined ? (
                      <span style={{ color: textMuted }}> (growth {entry.growth}%)</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <span style={{ color: textMuted }}>Hover the chart to see values for each year</span>
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
          <span>Traffic data table</span>
          <span style={{ opacity: 0.7 }}>{tableOpen ? "▾" : "▸"}</span>
        </button>
        {tableOpen && (
          <div
            style={{
              marginTop: 8,
              overflow: "auto",
              maxHeight: embedded ? 160 : 320,
              borderRadius: 8,
              border: `1px solid ${darkMode ? "#3a3f4b" : "#e2e8f0"}`
            }}
          >
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thtdStyle}>Year</th>
            <th colSpan={3} style={thtdStyle}>Both Directions</th>
            <th colSpan={3} style={thtdStyle}>With Gazettal</th>
            <th colSpan={3} style={thtdStyle}>Against Gazettal</th>
          </tr>
          <tr>
            <th style={thtdStyle}></th>
            <th style={thtdStyle}>AADT</th>
            <th style={thtdStyle}>Heavy Vehicles</th>
            <th style={thtdStyle}>Heavy %</th>
            <th style={thtdStyle}>AADT</th>
            <th style={thtdStyle}>Heavy Vehicles</th>
            <th style={thtdStyle}>Heavy %</th>
            <th style={thtdStyle}>AADT</th>
            <th style={thtdStyle}>Heavy Vehicles</th>
            <th style={thtdStyle}>Heavy %</th>
          </tr>
        </thead>
        <tbody>
          {/* Forecast rows (newest first) */}
          {Array.from({ length: FORECAST_YEARS }, (_, i) => {
            const forecastYear = lastYear + FORECAST_YEARS - i; // Reverse order: newest first
            const forecastRowByDir = {};
            
            // Get forecast data for each direction
            DIRECTION_LABELS.forEach(dir => {
              const forecastEntry = chartData.find(e => e.year === String(forecastYear));
              if (forecastEntry && forecastEntry[`${dir}_AADT_FORECAST`]) {
                const forecastAADT = forecastEntry[`${dir}_AADT_FORECAST`];
                const growthRate = forecastEntry[`${dir}_AADT_FORECAST_GROWTH`];
                // Estimate heavy vehicles (assuming same percentage as last year)
                const lastRow = siteData.find(r => r.TRAFFIC_YEAR === lastYear && r.TRAVEL_DIRECTION === dir);
                const heavyPct = lastRow && lastRow.AADT ? (Number(lastRow.AADT_CLASS_0B || 0) / Number(lastRow.AADT)) * 100 : 0;
                const forecastHeavy = Math.round(forecastAADT * heavyPct / 100);
                
                forecastRowByDir[dir] = {
                  aadt: forecastAADT,
                  heavy: forecastHeavy,
                  heavyPct: heavyPct,
                  growthRate: growthRate
                };
              } else {
                forecastRowByDir[dir] = {};
              }
            });
            
            const forecastStyle = {
              ...thtdStyle,
              color: '#10b981',
              fontStyle: 'italic'
            };
            
            // Get the growth rate for the year label (use first available direction)
            const firstDir = DIRECTION_LABELS.find(dir => forecastRowByDir[dir].growthRate !== undefined);
            const growthRate = firstDir ? forecastRowByDir[firstDir].growthRate : 0;
            const growthLabel = useFixedGrowth
              ? `Fixed ${FIXED_GROWTH_PCT}%`
              : `applied ${growthRate}%`;

            return (
              <tr key={`forecast-${forecastYear}`}>
                <td style={forecastStyle}>{forecastYear} (Projected — {growthLabel})</td>
                <td style={forecastStyle}>{Number(forecastRowByDir["BOTH DIRECTIONS"].aadt || 0).toLocaleString()}</td>
                <td style={forecastStyle}>{Number(forecastRowByDir["BOTH DIRECTIONS"].heavy || 0).toLocaleString()}</td>
                <td style={forecastStyle}>{forecastRowByDir["BOTH DIRECTIONS"].heavyPct ? forecastRowByDir["BOTH DIRECTIONS"].heavyPct.toFixed(1) + "%" : ""}</td>
                <td style={forecastStyle}>{Number(forecastRowByDir["WITH GAZETTAL"].aadt || 0).toLocaleString()}</td>
                <td style={forecastStyle}>{Number(forecastRowByDir["WITH GAZETTAL"].heavy || 0).toLocaleString()}</td>
                <td style={forecastStyle}>{forecastRowByDir["WITH GAZETTAL"].heavyPct ? forecastRowByDir["WITH GAZETTAL"].heavyPct.toFixed(1) + "%" : ""}</td>
                <td style={forecastStyle}>{Number(forecastRowByDir["AGAINST GAZETTAL"].aadt || 0).toLocaleString()}</td>
                <td style={forecastStyle}>{Number(forecastRowByDir["AGAINST GAZETTAL"].heavy || 0).toLocaleString()}</td>
                <td style={forecastStyle}>{forecastRowByDir["AGAINST GAZETTAL"].heavyPct ? forecastRowByDir["AGAINST GAZETTAL"].heavyPct.toFixed(1) + "%" : ""}</td>
              </tr>
            );
          })}
          {/* Historical rows (newest first) */}
          {years.map(year => {
            const rowByDir = {};
            DIRECTION_LABELS.forEach(dir => {
              const row = siteData.find(r => r.TRAFFIC_YEAR === year && r.TRAVEL_DIRECTION === dir);
              rowByDir[dir] = row || {};
            });
            return (
              <tr key={year}>
                <td style={thtdStyle}>{year}</td>
                <td style={thtdStyle}>{Number(rowByDir["BOTH DIRECTIONS"].AADT || 0).toLocaleString()}</td>
                <td style={thtdStyle}>{Math.ceil(Number(rowByDir["BOTH DIRECTIONS"].AADT_CLASS_0B || 0)).toLocaleString()}</td>
                <td style={thtdStyle}>{rowByDir["BOTH DIRECTIONS"].AADT ? ((Number(rowByDir["BOTH DIRECTIONS"].AADT_CLASS_0B || 0) / Number(rowByDir["BOTH DIRECTIONS"].AADT)) * 100).toFixed(1) + "%" : ""}</td>
                <td style={thtdStyle}>{Number(rowByDir["WITH GAZETTAL"].AADT || 0).toLocaleString()}</td>
                <td style={thtdStyle}>{Math.ceil(Number(rowByDir["WITH GAZETTAL"].AADT_CLASS_0B || 0)).toLocaleString()}</td>
                <td style={thtdStyle}>{rowByDir["WITH GAZETTAL"].AADT ? ((Number(rowByDir["WITH GAZETTAL"].AADT_CLASS_0B || 0) / Number(rowByDir["WITH GAZETTAL"].AADT)) * 100).toFixed(1) + "%" : ""}</td>
                <td style={thtdStyle}>{Number(rowByDir["AGAINST GAZETTAL"].AADT || 0).toLocaleString()}</td>
                <td style={thtdStyle}>{Math.ceil(Number(rowByDir["AGAINST GAZETTAL"].AADT_CLASS_0B || 0)).toLocaleString()}</td>
                <td style={thtdStyle}>{rowByDir["AGAINST GAZETTAL"].AADT ? ((Number(rowByDir["AGAINST GAZETTAL"].AADT_CLASS_0B || 0) / Number(rowByDir["AGAINST GAZETTAL"].AADT)) * 100).toFixed(1) + "%" : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default SiteInfo;