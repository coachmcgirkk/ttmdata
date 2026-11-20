export const HOURLY_DIR_WITH = "GAZETTAL";
export const HOURLY_DIR_AGAINST = "AGAINST GAZETTAL";
export const HOURLY_DIR_BOTH = "BOTH";

export const HOURLY_DIRECTION_VALUES = [HOURLY_DIR_WITH, HOURLY_DIR_AGAINST, HOURLY_DIR_BOTH];

const BOUND_LABELS_4 = ["Northbound", "Eastbound", "Southbound", "Westbound"];

export function bearingToBoundLabel(bearing) {
  if (bearing == null || !Number.isFinite(Number(bearing))) return null;
  const deg = ((Number(bearing) % 360) + 360) % 360;
  return BOUND_LABELS_4[Math.round(deg / 90) % 4];
}

export function qldDirectionCaption(direction, bearing) {
  if (direction === HOURLY_DIR_BOTH) return "Both directions";
  const isWith = direction === HOURLY_DIR_WITH || direction === "GAZETTAL";
  const bound = bearingToBoundLabel(
    isWith || bearing == null ? bearing : (Number(bearing) + 180) % 360
  );
  const base = isWith ? "With gazettal" : "Against gazettal";
  return bound ? `${base} (${bound})` : base;
}

export function hourlySegmentLabel(direction, bearing) {
  if (direction === HOURLY_DIR_BOTH) return "Both";
  const isWith = direction === HOURLY_DIR_WITH || direction === "GAZETTAL";
  const bound = bearingToBoundLabel(
    isWith || bearing == null ? bearing : (Number(bearing) + 180) % 360
  );
  const base = isWith ? "With" : "Against";
  return bound ? `${base} (${bound})` : base;
}

export function nswCardinalBoundLabel(cardinal) {
  const value = String(cardinal || "").toUpperCase();
  if (value === "NORTH") return "Northbound";
  if (value === "SOUTH") return "Southbound";
  if (value === "EAST") return "Eastbound";
  if (value === "WEST") return "Westbound";
  return null;
}

export function classifyNswHourlyProfile(profile) {
  const traffic = String(profile?.trafficDirection || "").toUpperCase();
  const cardinal = String(profile?.cardinalDirection || "").toUpperCase();
  if (traffic.includes(" AND ") || cardinal.includes(" AND ")) return HOURLY_DIR_BOTH;
  if (traffic === "PRESCRIBED") return HOURLY_DIR_WITH;
  if (traffic === "COUNTER") return HOURLY_DIR_AGAINST;
  if (cardinal === "NORTH" || cardinal === "EAST") return HOURLY_DIR_WITH;
  if (cardinal === "SOUTH" || cardinal === "WEST") return HOURLY_DIR_AGAINST;
  return null;
}

export function groupNswHourlyProfiles(profiles = []) {
  const withProfiles = [];
  const againstProfiles = [];
  const bothProfiles = [];
  profiles.forEach(profile => {
    const side = classifyNswHourlyProfile(profile);
    if (side === HOURLY_DIR_WITH) withProfiles.push(profile);
    else if (side === HOURLY_DIR_AGAINST) againstProfiles.push(profile);
    else if (side === HOURLY_DIR_BOTH) bothProfiles.push(profile);
  });
  return { withProfiles, againstProfiles, bothProfiles };
}

export function nswDirectionCaption(direction, profiles = []) {
  const { withProfiles, againstProfiles } = groupNswHourlyProfiles(profiles);
  const source = direction === HOURLY_DIR_AGAINST ? againstProfiles : withProfiles;
  const bound = nswCardinalBoundLabel(source[0]?.cardinalDirection);
  if (direction === HOURLY_DIR_BOTH) return "Both directions";
  const base = direction === HOURLY_DIR_AGAINST ? "Against gazettal" : "With gazettal";
  return bound ? `${base} (${bound})` : base;
}

function hourLabel(row) {
  return row.hours ?? row.hour;
}

export function hourlySeriesKey(day, seriesId) {
  return seriesId ? `${day}::${seriesId}` : day;
}

export function mergeHourlyDirectionSeries(groups, dayKeys) {
  const multi = groups.length > 1;
  const byHour = new Map();
  groups.forEach(group => {
    (group.hours || []).forEach(row => {
      const hour = hourLabel(row);
      if (hour == null) return;
      if (!byHour.has(hour)) byHour.set(hour, { hour });
      const point = byHour.get(hour);
      dayKeys.forEach(day => {
        const value = row[day];
        point[hourlySeriesKey(day, multi ? group.id : null)] =
          value == null || value === "" ? null : Number(value);
      });
    });
  });
  return Array.from(byHour.values());
}

export const HOURLY_AGAINST_DASHARRAY = "6 3";

export function hourlyGroupIsDashed(group) {
  if (group?.dashed != null) return Boolean(group.dashed);
  const id = String(group?.id || "").toUpperCase();
  const label = String(group?.label || "").toUpperCase();
  return (
    id === HOURLY_DIR_AGAINST ||
    id.startsWith("AGAINST") ||
    label.includes("AGAINST GAZETTAL")
  );
}

export function buildHourlyChartSeries(days, groups, dayLabels) {
  const multi = groups.length > 1;
  return groups.flatMap(group => {
    const dashed = multi && hourlyGroupIsDashed(group);
    return days.map(day => ({
      key: multi ? hourlySeriesKey(day, group.id) : day,
      day,
      seriesId: group.id,
      label: multi ? `${dayLabels[day] || day} · ${group.label}` : dayLabels[day] || day,
      legendLabel: dayLabels[day] || day,
      strokeDasharray: dashed ? HOURLY_AGAINST_DASHARRAY : undefined,
      dashed
    }));
  });
}

export function sumHourlyProfiles(profiles, dayKeys) {
  const byHour = new Map();
  profiles.forEach(profile => {
    (profile.hours || []).forEach(row => {
      const hour = hourLabel(row);
      if (hour == null) return;
      if (!byHour.has(hour)) {
        const point = { hour };
        dayKeys.forEach(day => {
          point[day] = null;
        });
        byHour.set(hour, point);
      }
      const point = byHour.get(hour);
      dayKeys.forEach(day => {
        const value = row[day];
        if (value == null || value === "") return;
        point[day] = (point[day] ?? 0) + Number(value);
      });
    });
  });
  return Array.from(byHour.values());
}
