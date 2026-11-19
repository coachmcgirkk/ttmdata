/** @typedef {{ id: string, name: string, chainageFrom: number|string, chainageTo: number|string, approachSignageLength: number|string }} WorkArea */
/** @typedef {{ workAreaId: string, field: 'chainageFrom' | 'chainageTo' } | null} PickMode */

export function createWorkArea(overrides = {}) {
  return {
    id: `wa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    chainageFrom: "",
    chainageTo: "",
    approachSignageLength: "0.3",
    ...overrides
  };
}

export function workAreaDisplayName(workArea, index) {
  const trimmed = workArea.name?.trim();
  return trimmed || `Area ${index + 1}`;
}

export function parseChainage(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function workAreaZones(workArea) {
  const from = parseChainage(workArea.chainageFrom);
  const to = parseChainage(workArea.chainageTo);
  const signage = Math.max(0, parseChainage(workArea.approachSignageLength) ?? 0);

  if (from == null || to == null) {
    return null;
  }

  const workStart = Math.min(from, to);
  const workEnd = Math.max(from, to);

  const signageStart = { start: workStart - signage, end: workStart };
  const signageEnd = { start: workEnd, end: workEnd + signage };

  return {
    work: { start: workStart, end: workEnd },
    signageStart,
    signageEnd,
    signageZones: [signageStart, signageEnd],
    combined: { start: signageStart.start, end: signageEnd.end },
    signageLengthKm: signage
  };
}

export function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function overlapLength(a, b) {
  if (!rangesOverlap(a, b)) return 0;
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function rangeIntersection(a, b) {
  if (!rangesOverlap(a, b)) return null;
  return {
    start: Math.max(a.start, b.start),
    end: Math.min(a.end, b.end)
  };
}

export function mergeRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.start <= prev.end + 1e-9) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

export function getOverlapRangesForSegment(segmentStart, segmentEnd, currentIndex, validItems) {
  const segment = { start: segmentStart, end: segmentEnd };
  const overlaps = [];
  for (const item of validItems) {
    if (item.index === currentIndex) continue;
    const hit = rangeIntersection(segment, item.zones.combined);
    if (hit && hit.end > hit.start) overlaps.push(hit);
  }
  return mergeRanges(overlaps);
}

export function splitRangeIntoColoredParts(start, end, overlapRanges) {
  const clipped = mergeRanges(
    overlapRanges
      .map(o => ({
        start: Math.max(start, o.start),
        end: Math.min(end, o.end)
      }))
      .filter(o => o.end > o.start)
  );
  if (!clipped.length) return [{ start, end, isOverlap: false }];

  const parts = [];
  let cursor = start;
  for (const overlap of clipped) {
    if (overlap.start > cursor + 1e-9) {
      parts.push({ start: cursor, end: overlap.start, isOverlap: false });
    }
    parts.push({ start: overlap.start, end: overlap.end, isOverlap: true });
    cursor = overlap.end;
  }
  if (cursor < end - 1e-9) {
    parts.push({ start: cursor, end, isOverlap: false });
  }
  return parts.filter(p => p.end > p.start);
}

export function buildZoneMapSegments({
  overlayPoints,
  rangeStart,
  rangeEnd,
  item,
  validItems,
  colors,
  baseKey,
  segmentType,
  dashArray,
  opacity,
  workAreaLabel,
  showWorkAreaTooltip,
  midChainage
}) {
  const overlapRanges = getOverlapRangesForSegment(rangeStart, rangeEnd, item.index, validItems);
  const parts = splitRangeIntoColoredParts(rangeStart, rangeEnd, overlapRanges);
  const isWork = segmentType === "work";

  return parts.flatMap((part, i) => {
    const coords = sliceChainagePolyline(overlayPoints, part.start, part.end);
    if (coords.length < 2) return [];

    const containsMidpoint = midChainage >= part.start && midChainage <= part.end;
    return [
      {
        key: `${baseKey}-${i}`,
        coords,
        color: part.isOverlap ? colors.overlap : isWork ? colors.work : colors.signage,
        weight: part.isOverlap ? (isWork ? 9 : 8) : isWork ? 7 : 6,
        dashArray,
        opacity,
        showTooltip: isWork && showWorkAreaTooltip && containsMidpoint,
        tooltipLabel: workAreaLabel
      }
    ];
  });
}

export function formatChainageKm(km, decimals = 3) {
  if (!Number.isFinite(km)) return "—";
  const rounded = Number(km.toFixed(decimals));
  if (Math.abs(rounded) < 0.001) return "0 km";
  if (Math.abs(rounded) >= 1) return `${rounded} km`;
  return `${Math.round(rounded * 1000)} m`;
}

export function validateWorkArea(workArea) {
  const zones = workAreaZones(workArea);
  if (!zones) {
    return "Enter valid chainage from and to values.";
  }
  if (zones.work.end <= zones.work.start) {
    return "Work area end must be after start.";
  }
  if (zones.combined.start < 0) {
    return "Approach signage extends before chainage 0.";
  }
  return null;
}

function collectSignageZones(validItems) {
  const zones = [];
  validItems.forEach(item => {
    zones.push({
      workAreaIndex: item.index,
      type: "start",
      range: item.zones.signageStart
    });
    zones.push({
      workAreaIndex: item.index,
      type: "end",
      range: item.zones.signageEnd
    });
  });
  return zones;
}

export function analyzeWorkAreas(workAreas) {
  const items = workAreas.map((workArea, index) => ({
    index,
    workArea,
    zones: workAreaZones(workArea),
    error: validateWorkArea(workArea)
  }));

  const validItems = items.filter(item => item.zones && !item.error);
  const overlaps = [];
  const signageOverlaps = [];

  for (let i = 0; i < validItems.length; i += 1) {
    for (let j = i + 1; j < validItems.length; j += 1) {
      const left = validItems[i];
      const right = validItems[j];
      const combinedOverlap = overlapLength(left.zones.combined, right.zones.combined);
      if (combinedOverlap > 0) {
        overlaps.push({
          leftIndex: left.index,
          rightIndex: right.index,
          lengthKm: combinedOverlap,
          type: "combined"
        });
      }
    }
  }

  const allSignage = collectSignageZones(validItems);
  for (let i = 0; i < allSignage.length; i += 1) {
    for (let j = i + 1; j < allSignage.length; j += 1) {
      const left = allSignage[i];
      const right = allSignage[j];
      const lengthKm = overlapLength(left.range, right.range);
      if (lengthKm > 0) {
        signageOverlaps.push({
          leftIndex: left.workAreaIndex,
          rightIndex: right.workAreaIndex,
          leftType: left.type,
          rightType: right.type,
          lengthKm
        });
      }
    }
  }

  const sorted = [...validItems].sort((a, b) => a.zones.work.start - b.zones.work.start);
  const signageGaps = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const gapKm = next.zones.signageStart.start - current.zones.signageEnd.end;
    signageGaps.push({
      fromIndex: current.index,
      toIndex: next.index,
      gapKm,
      overlapping: gapKm < 0,
      overlapKm: gapKm < 0 ? Math.abs(gapKm) : 0
    });
  }

  return {
    items,
    validItems,
    overlaps,
    signageOverlaps,
    signageGaps,
    hasIssues: items.some(item => item.error) || overlaps.length > 0 || signageOverlaps.length > 0
  };
}

function interpolatePoint(sortedPoints, chainage) {
  if (!sortedPoints.length) return null;

  if (chainage <= sortedPoints[0].Tdist_Start) {
    return [sortedPoints[0].Latitude, sortedPoints[0].Longitude];
  }
  const last = sortedPoints[sortedPoints.length - 1];
  if (chainage >= last.Tdist_Start) {
    return [last.Latitude, last.Longitude];
  }

  for (let i = 0; i < sortedPoints.length - 1; i += 1) {
    const a = sortedPoints[i];
    const b = sortedPoints[i + 1];
    if (chainage >= a.Tdist_Start && chainage <= b.Tdist_Start) {
      const span = b.Tdist_Start - a.Tdist_Start;
      if (span <= 0) return [a.Latitude, a.Longitude];
      const t = (chainage - a.Tdist_Start) / span;
      return [
        a.Latitude + t * (b.Latitude - a.Latitude),
        a.Longitude + t * (b.Longitude - a.Longitude)
      ];
    }
  }
  return null;
}

export function sliceChainagePolyline(points, chainageStart, chainageEnd) {
  if (!points?.length) return [];

  const start = Math.min(chainageStart, chainageEnd);
  const end = Math.max(chainageStart, chainageEnd);
  const sorted = [...points]
    .map(p => ({ ...p, Tdist_Start: Number(p.Tdist_Start) }))
    .filter(p => Number.isFinite(p.Tdist_Start))
    .sort((a, b) => a.Tdist_Start - b.Tdist_Start);
  const inRange = sorted.filter(p => p.Tdist_Start >= start && p.Tdist_Start <= end);
  const coords = inRange.map(p => [p.Latitude, p.Longitude]);

  const startCoord = interpolatePoint(sorted, start);
  const endCoord = interpolatePoint(sorted, end);
  if (startCoord) coords.unshift(startCoord);
  if (endCoord) coords.push(endCoord);

  const deduped = [];
  for (const coord of coords) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev[0] !== coord[0] || prev[1] !== coord[1]) {
      deduped.push(coord);
    }
  }
  return deduped;
}

export function chainageBoundsForWorkAreas(workAreas, paddingKm = 0.5) {
  const zones = workAreas.map(workAreaZones).filter(Boolean);
  if (!zones.length) return null;

  const min = Math.min(...zones.map(z => z.combined.start));
  const max = Math.max(...zones.map(z => z.combined.end));
  return {
    min: Math.max(0, min - paddingKm),
    max: max + paddingKm
  };
}

export function chainageLoadRange(state) {
  const workBounds = chainageBoundsForWorkAreas(state.workAreas, 0.3);
  if (workBounds) return workBounds;

  if (state.sectionChainageMin != null && state.sectionChainageMax != null) {
    return {
      min: Math.max(0, state.sectionChainageMin - 0.3),
      max: state.sectionChainageMax + 0.3
    };
  }

  return { min: 0, max: 99999 };
}

export function applyChainagePick(state, point) {
  const pickMode = state.pickMode;
  if (!pickMode) return state;

  const chainage = String(point.Tdist_Start);
  const workAreas = state.workAreas.map(wa => {
    if (wa.id !== pickMode.workAreaId) return wa;
    return { ...wa, [pickMode.field]: chainage };
  });

  let nextPickMode = null;
  if (pickMode.field === "chainageFrom") {
    nextPickMode = { workAreaId: pickMode.workAreaId, field: "chainageTo" };
  }

  return {
    ...state,
    workAreas,
    pickMode: nextPickMode,
    roadSectionId: String(point.Road_Section_Id),
    carriageway: String(point.Carriageway_Code),
    roadDescription: point.Description || state.roadDescription
  };
}

export function pickModeLabel(pickMode, workAreas) {
  if (!pickMode) return null;
  const idx = workAreas.findIndex(wa => wa.id === pickMode.workAreaId);
  const areaLabel = idx >= 0 ? workAreaDisplayName(workAreas[idx], idx) : "Work area";
  return pickMode.field === "chainageFrom"
    ? `Click a chainage marker for ${areaLabel} start`
    : `Click a chainage marker for ${areaLabel} finish`;
}

export function approachSignageColor(darkMode) {
  return darkMode ? "#60a5fa" : "#2563eb";
}

export const APPROACH_SIGNAGE_DASH = "20 14";

export function workAreaColors(_index, darkMode) {
  return {
    work: darkMode ? "#f87171" : "#dc2626",
    signage: approachSignageColor(darkMode),
    overlap: darkMode ? "#e879f9" : "#a855f7"
  };
}

export function pointMatchesRoadSection(point, state) {
  if (!state.roadSectionId?.trim() || !state.carriageway?.trim()) return true;
  return (
    String(point.Road_Section_Id) === String(state.roadSectionId).trim() &&
    String(point.Carriageway_Code) === String(state.carriageway).trim()
  );
}

export const PLANNING_EXPORT_VERSION = 1;

export function exportPlanningPlan(state) {
  return {
    version: PLANNING_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    roadSectionId: state.roadSectionId ?? "",
    carriageway: state.carriageway ?? "",
    roadDescription: state.roadDescription ?? "",
    sectionChainageMin: state.sectionChainageMin ?? null,
    sectionChainageMax: state.sectionChainageMax ?? null,
    showOnMap: state.showOnMap !== false,
    showChainage: Boolean(state.showChainage),
    showWorkAreaTooltips: state.showWorkAreaTooltips !== false,
    workAreas: (state.workAreas ?? []).map(wa => ({
      name: wa.name ?? "",
      chainageFrom: wa.chainageFrom ?? "",
      chainageTo: wa.chainageTo ?? "",
      approachSignageLength: wa.approachSignageLength ?? "0.3"
    }))
  };
}

export function downloadPlanningPlan(state) {
  const payload = exportPlanningPlan(state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const roadPart = state.roadSectionId?.trim() || "work-areas";
  const datePart = new Date().toISOString().slice(0, 10);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `planning-${roadPart}-${datePart}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeImportedWorkArea(raw, index) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Work area ${index + 1} is invalid.`);
  }
  return createWorkArea({
    name: raw.name != null ? String(raw.name) : "",
    chainageFrom: raw.chainageFrom != null ? String(raw.chainageFrom) : "",
    chainageTo: raw.chainageTo != null ? String(raw.chainageTo) : "",
    approachSignageLength:
      raw.approachSignageLength != null ? String(raw.approachSignageLength) : "0.3"
  });
}

export function parseImportedPlanningPlan(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Planning file format is invalid.");
  }

  const workAreasSource = data.workAreas ?? data.work_areas;
  if (!Array.isArray(workAreasSource) || workAreasSource.length === 0) {
    throw new Error("Planning file must include at least one work area.");
  }

  const workAreas = workAreasSource.map((wa, index) => normalizeImportedWorkArea(wa, index));

  return {
    roadSectionId: data.roadSectionId != null ? String(data.roadSectionId) : "",
    carriageway: data.carriageway != null ? String(data.carriageway) : "1",
    roadDescription: data.roadDescription != null ? String(data.roadDescription) : "",
    sectionChainageMin:
      data.sectionChainageMin != null && Number.isFinite(Number(data.sectionChainageMin))
        ? Number(data.sectionChainageMin)
        : null,
    sectionChainageMax:
      data.sectionChainageMax != null && Number.isFinite(Number(data.sectionChainageMax))
        ? Number(data.sectionChainageMax)
        : null,
    showOnMap: data.showOnMap !== false,
    showChainage: Boolean(data.showChainage),
    showWorkAreaTooltips: data.showWorkAreaTooltips !== false,
    workAreas,
    pickMode: null
  };
}

export function applyImportedPlanningPlan(currentState, imported) {
  return {
    ...currentState,
    ...imported
  };
}
