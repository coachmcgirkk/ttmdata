export const PLANNING_VERSION = 1;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asText(value) {
  if (value == null) return "";
  return String(value);
}

function asDate(value) {
  const text = asText(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function asNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function createSite(partial = {}) {
  return {
    id: partial.id || newId(),
    name: partial.name || "",
    details: partial.details || "",
    roadSectionId: partial.roadSectionId || "",
    carriageway: partial.carriageway || "",
    roadDescription: partial.roadDescription || "",
    chainageFrom: partial.chainageFrom ?? "",
    chainageTo: partial.chainageTo ?? "",
    approachKm: partial.approachKm ?? "0.3",
    departureKm: partial.departureKm ?? "0.3",
    startDate: partial.startDate || "",
    endDate: partial.endDate || ""
  };
}

export function createProject(partial = {}) {
  const sites = Array.isArray(partial.sites) && partial.sites.length
    ? partial.sites.map(site => createSite(site))
    : [createSite()];
  return {
    id: partial.id || newId(),
    name: partial.name || "New project",
    sites
  };
}

export function createInitialPlanning() {
  const project = createProject({ name: "Project 1" });
  return {
    showOnMap: false,
    projects: [project],
    activeProjectId: project.id,
    pick: null,
    editorOpen: true,
    timelineDate: ""
  };
}

const PICK_FIELDS = new Set(["chainageFrom", "chainageTo"]);

export function isPicking(state) {
  const pick = state && state.pick;
  return Boolean(pick && pick.projectId && pick.siteId && PICK_FIELDS.has(pick.field));
}

export function planningModalVisible(state) {
  if (!state || isPicking(state)) return false;
  return state.editorOpen !== false;
}

export function beginChainagePick(state, request) {
  if (!state || isPicking(state)) return state;
  const field = request && request.field;
  const projectId = request && request.projectId;
  const siteId = request && request.siteId;
  if (!PICK_FIELDS.has(field) || !projectId || !siteId) return state;
  const project = (state.projects || []).find(item => item.id === projectId);
  const site = project && (project.sites || []).find(item => item.id === siteId);
  if (!site) return state;
  return {
    ...state,
    editorOpen: true,
    showOnMap: true,
    pick: { projectId, siteId, field }
  };
}

export function cancelChainagePick(state) {
  if (!isPicking(state)) return state;
  return { ...state, pick: null, editorOpen: true };
}

export function setPlanningEditor(state, open) {
  if (!state || isPicking(state)) return state;
  const next = Boolean(open);
  if (state.editorOpen === next) return state;
  return { ...state, editorOpen: next };
}

export function selectPlanningProject(state, projectId) {
  if (!state || isPicking(state) || !projectId) return state;
  if (state.activeProjectId === projectId) return state;
  return { ...state, activeProjectId: projectId, pick: null };
}


export function siteLabel(site) {
  const name = asText(site && site.name).trim();
  return name || "Untitled site";
}

export function projectLabel(project) {
  const name = asText(project && project.name).trim();
  return name || "Untitled project";
}

export function siteWorkRange(site) {
  const from = asNumber(site.chainageFrom);
  const to = asNumber(site.chainageTo);
  if (from == null || to == null) return null;
  return { start: Math.min(from, to), end: Math.max(from, to) };
}

export function siteSignageRange(site) {
  const work = siteWorkRange(site);
  if (!work) return null;
  const approachKm = Math.max(0, asNumber(site.approachKm) ?? 0);
  const departureKm = Math.max(0, asNumber(site.departureKm) ?? 0);
  const start = Math.max(0, work.start - approachKm);
  const end = work.end + departureKm;
  return {
    work,
    approach: { start, end: work.start },
    departure: { start: work.end, end },
    combined: { start, end },
    approachKm,
    departureKm
  };
}

function orderedDates(site) {
  let start = site.startDate || "";
  let end = site.endDate || "";
  if (start && end && end < start) {
    const swap = start;
    start = end;
    end = swap;
  }
  return { start, end };
}

export function siteActiveOnDate(site, isoDate) {
  if (!isoDate) return true;
  const { start, end } = orderedDates(site);
  if (!start && !end) return true;
  if (start && isoDate < start) return false;
  if (end && isoDate > end) return false;
  return true;
}

export function datesOverlap(left, right) {
  const a = orderedDates(left);
  const b = orderedDates(right);
  const aStart = a.start || "0000-01-01";
  const aEnd = a.end || "9999-12-31";
  const bStart = b.start || "0000-01-01";
  const bEnd = b.end || "9999-12-31";
  return aStart <= bEnd && bStart <= aEnd;
}

export function listSites(projects) {
  const rows = [];
  (projects || []).forEach(project => {
    (project.sites || []).forEach(site => {
      rows.push({ project, site, zone: siteSignageRange(site) });
    });
  });
  return rows;
}

function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

export function findOverlaps(projects, timelineDate) {
  const rows = listSites(projects).filter(row => (
    row.zone && row.site.roadSectionId && row.site.carriageway
    && siteActiveOnDate(row.site, timelineDate)
  ));
  const hits = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const left = rows[i];
      const right = rows[j];
      if (left.site.roadSectionId !== right.site.roadSectionId) continue;
      if (String(left.site.carriageway) !== String(right.site.carriageway)) continue;
      if (!rangesOverlap(left.zone.combined, right.zone.combined)) continue;
      const start = Math.max(left.zone.combined.start, right.zone.combined.start);
      const end = Math.min(left.zone.combined.end, right.zone.combined.end);
      hits.push({
        left,
        right,
        km: end - start,
        range: { start, end },
        sameTime: timelineDate ? true : datesOverlap(left.site, right.site)
      });
    }
  }
  hits.sort((a, b) => b.km - a.km);
  return hits;
}

export function timelineExtent(projects) {
  const dates = [];
  (projects || []).forEach(project => {
    (project.sites || []).forEach(site => {
      if (site.startDate) dates.push(site.startDate);
      if (site.endDate) dates.push(site.endDate);
    });
  });
  if (!dates.length) return null;
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

function isoFromDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function timelineRuler(start, end) {
  const span = daysBetween(start, end);
  if (span <= 0) return { breaks: [], months: [] };
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const breaks = [];
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  if (cursor <= startDate) cursor = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
  while (cursor < endDate) {
    const day = daysBetween(start, isoFromDate(cursor));
    if (day > 0 && day < span) {
      breaks.push({ key: isoFromDate(cursor), percent: (day / span) * 100 });
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  const months = [];
  let monthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (monthStart <= endDate) {
    const next = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    const from = monthStart < startDate ? startDate : monthStart;
    const to = next > endDate ? endDate : next;
    const fromDay = daysBetween(start, isoFromDate(from));
    const toDay = daysBetween(start, isoFromDate(to));
    const mid = fromDay + Math.max(0, toDay - fromDay) / 2;
    months.push({
      key: isoFromDate(monthStart),
      label: MONTHS[monthStart.getMonth()],
      year: String(monthStart.getFullYear()).slice(-2),
      showYear: monthStart.getMonth() === 0 || months.length === 0,
      percent: (mid / span) * 100
    });
    monthStart = next;
  }

  const minGap = months.length > 14 ? 100 / 12 : 0;
  let last = -100;
  const labeled = months.map(month => {
    if (month.percent - last < minGap) return { ...month, label: "" };
    last = month.percent;
    return month;
  });
  return { breaks, months: labeled };
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function daysBetween(start, end) {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function formatDate(iso) {
  if (!iso) return "All dates";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1] || match[2];
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export function formatLength(km) {
  if (!Number.isFinite(km) || km <= 0) return "0 m";
  if (km < 0.1) return `${Math.max(1, Math.round(km * 1000))} m`;
  return `${km.toFixed(2)} km`;
}

export function formatChainage(value) {
  const number = asNumber(value);
  if (number == null) return "";
  return number.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function updateProject(state, projectId, patch) {
  return {
    ...state,
    projects: state.projects.map(project => (
      project.id === projectId ? { ...project, ...patch } : project
    ))
  };
}

export function updateSite(state, projectId, siteId, patch) {
  return {
    ...state,
    projects: state.projects.map(project => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        sites: project.sites.map(site => (site.id === siteId ? { ...site, ...patch } : site))
      };
    })
  };
}

export function applyChainagePick(state, point) {
  if (!isPicking(state) || !point || point.Tdist_Start == null || point.Tdist_Start === "") return state;
  const project = state.projects.find(item => item.id === state.pick.projectId);
  const site = project && project.sites.find(item => item.id === state.pick.siteId);
  if (!site || !PICK_FIELDS.has(state.pick.field)) return state;
  const next = updateSite(state, state.pick.projectId, state.pick.siteId, {
    [state.pick.field]: String(point.Tdist_Start),
    roadSectionId: point.Road_Section_Id == null ? site.roadSectionId : String(point.Road_Section_Id),
    carriageway: point.Carriageway_Code == null ? site.carriageway : String(point.Carriageway_Code),
    roadDescription: point.Description || site.roadDescription
  });
  return {
    ...next,
    pick: null,
    editorOpen: true
  };
}

function cleanSite(raw, seen) {
  if (!raw || typeof raw !== "object") return null;
  let id = typeof raw.id === "string" && raw.id ? raw.id : newId();
  while (seen.has(id)) id = newId();
  seen.add(id);
  return createSite({
    id,
    name: asText(raw.name),
    details: asText(raw.details),
    roadSectionId: asText(raw.roadSectionId),
    carriageway: asText(raw.carriageway),
    roadDescription: asText(raw.roadDescription),
    chainageFrom: asText(raw.chainageFrom),
    chainageTo: asText(raw.chainageTo),
    approachKm: asText(raw.approachKm) || "0",
    departureKm: asText(raw.departureKm) || "0",
    startDate: asDate(raw.startDate),
    endDate: asDate(raw.endDate)
  });
}

export function exportPlanning(state) {
  return {
    version: PLANNING_VERSION,
    projects: (state.projects || []).map(project => ({
      id: project.id,
      name: project.name,
      sites: (project.sites || []).map(site => ({
        id: site.id,
        name: site.name,
        details: site.details,
        roadSectionId: site.roadSectionId,
        carriageway: site.carriageway,
        roadDescription: site.roadDescription,
        chainageFrom: site.chainageFrom,
        chainageTo: site.chainageTo,
        approachKm: site.approachKm,
        departureKm: site.departureKm,
        startDate: site.startDate,
        endDate: site.endDate
      }))
    }))
  };
}

export function importPlanning(raw, current) {
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    throw new Error("That file is not valid JSON.");
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.projects)) {
    throw new Error("This file does not contain planning projects.");
  }
  if (data.version != null && Number(data.version) !== PLANNING_VERSION) {
    throw new Error("This planning file is a different version.");
  }
  const seen = new Set();
  const projects = data.projects.map(project => {
    if (!project || typeof project !== "object") {
      throw new Error("A project in this file is not valid.");
    }
    let id = typeof project.id === "string" && project.id ? project.id : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    const sites = Array.isArray(project.sites)
      ? project.sites.map(site => cleanSite(site, seen)).filter(Boolean)
      : [];
    return {
      id,
      name: asText(project.name) || "Untitled project",
      sites
    };
  });
  if (!projects.length) throw new Error("This file has no projects.");
  return {
    ...current,
    projects,
    activeProjectId: projects[0].id,
    pick: null,
    editorOpen: true,
    timelineDate: ""
  };
}

export function lineForRange(points, start, end) {
  if (!Array.isArray(points) || !(end > start)) return null;
  const sorted = points
    .map(point => ({
      chainage: Number(point.Tdist_Start),
      lat: Number(point.Latitude),
      lon: Number(point.Longitude)
    }))
    .filter(point => Number.isFinite(point.chainage) && Number.isFinite(point.lat) && Number.isFinite(point.lon))
    .sort((a, b) => a.chainage - b.chainage);
  if (!sorted.length) return null;
  const inside = sorted.filter(point => point.chainage >= start && point.chainage <= end);
  const before = [...sorted].reverse().find(point => point.chainage < start);
  const after = sorted.find(point => point.chainage > end);
  const chosen = [];
  if (before) chosen.push(before);
  inside.forEach(point => chosen.push(point));
  if (after) chosen.push(after);
  if (chosen.length < 2) return null;
  return chosen.map(point => [point.lat, point.lon]);
}

export function pointNearChainage(points, chainage) {
  if (!Array.isArray(points)) return null;
  let best = null;
  let bestDistance = Infinity;
  points.forEach(point => {
    const value = Number(point.Tdist_Start);
    const lat = Number(point.Latitude);
    const lon = Number(point.Longitude);
    if (!Number.isFinite(value) || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const distance = Math.abs(value - chainage);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [lat, lon];
    }
  });
  if (!best || bestDistance > 0.2) return null;
  return best;
}
