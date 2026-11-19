/**
 * Categorical colors tuned for distinguishability (Paul Tol / Okabe–Ito style).
 * Avoids similar adjacent hues (e.g. purple–magenta–pink gradients).
 */

export const SPEED_BIN_LIMITS = [40, 50, 60, 70, 80, 90, 100, 110];

const SPEED_BIN_COLORS = {
  40: "#0072B2",
  50: "#009E73",
  60: "#56B4E9",
  70: "#F0E442",
  80: "#E69F00",
  90: "#D55E00",
  100: "#CC79A7",
  110: "#7B2D8E"
};

/** Discrete speed-limit colour for map markers (km/h buckets). */
export function speedToColor(speed) {
  const s = Number(speed);
  const value = Number.isFinite(s) ? s : 40;
  let bucket = SPEED_BIN_LIMITS[0];
  for (const limit of SPEED_BIN_LIMITS) {
    if (value >= limit) bucket = limit;
  }
  return SPEED_BIN_COLORS[bucket];
}

export const CRASH_SEVERITY_COLORS = {
  Fatal: "#7B2D8E",
  Hospitalisation: "#D55E00",
  "Medical treatment": "#0072B2",
  "Minor injury": "#009E73",
  "Property damage only": "#999999"
};

export function crashSeverityColor(severity) {
  return CRASH_SEVERITY_COLORS[severity] || "#CC3311";
}

export const DIRECTION_COLORS = {
  "BOTH DIRECTIONS": "#4477AA",
  "WITH GAZETTAL": "#228833",
  "AGAINST GAZETTAL": "#CC3311"
};

export const DIRECTION_BAR_COLORS = {
  "BOTH DIRECTIONS": "rgba(68, 119, 170, 0.5)",
  "WITH GAZETTAL": "rgba(34, 136, 51, 0.5)",
  "AGAINST GAZETTAL": "rgba(204, 51, 17, 0.5)"
};

export const HOURLY_DAY_COLORS = {
  MON: "#4477AA",
  TUE: "#EE6677",
  WED: "#228833",
  THU: "#CCBB44",
  FRI: "#66CCEE",
  SAT: "#AA3377",
  SUN: "#BBBB00",
  WEEKDAY_AVERAGE: "#004488",
  WEEKEND_AVERAGE: "#BB5566"
};

/** Gold Coast count markers — distinct from speed-limit oranges. */
export const GOLD_COAST_MARKER_COLOR = "#AA3377";

/** Hourly volume site markers on the map. */
export const HOURLY_MAP_MARKER_COLOR = "#4477AA";
