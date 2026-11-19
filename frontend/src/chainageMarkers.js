import L from "leaflet";
import {
  chainageLabelTiersForZoom,
  formatChainageTickLabel,
  isExclusiveChainageTick
} from "./map/mapUtils";

export function chainagePointKey(p) {
  return `${p.Road_Section_Id}|${p.Carriageway_Code}|${p.Tdist_Start}`;
}

function iterChainageTicks(minT, maxT, stepKm) {
  const ticks = [];
  const start = Math.floor(minT / stepKm) * stepKm;
  const steps = Math.ceil((maxT - start) / stepKm) + 1;
  for (let i = 0; i <= steps; i += 1) {
    const tick = Math.round((start + i * stepKm) * 1000) / 1000;
    if (tick > maxT + stepKm * 0.01) break;
    if (tick >= minT - stepKm * 0.01) ticks.push(tick);
  }
  return ticks;
}

/**
 * Labelled markers at fixed chainage intervals; coarser tiers claim ticks first.
 */
export function pickChainageIntervalMarkers(points, zoom) {
  const groups = new Map();
  for (const p of points) {
    const key = `${p.Road_Section_Id}|${p.Carriageway_Code}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const tiers = chainageLabelTiersForZoom(zoom);
  const usedPointKeys = new Set();
  const markers = [];

  for (const tier of tiers) {
    const coarserSteps = tiers
      .filter(t => t.stepKm > tier.stepKm)
      .map(t => t.stepKm);

    for (const group of groups.values()) {
      const tdists = group
        .map(p => Number(p.Tdist_Start))
        .filter(t => Number.isFinite(t));
      if (!tdists.length) continue;

      const minT = Math.min(...tdists);
      const maxT = Math.max(...tdists);

      for (const tick of iterChainageTicks(minT, maxT, tier.stepKm)) {
        if (!isExclusiveChainageTick(tick, tier.stepKm, coarserSteps)) continue;

        let best = null;
        let bestDist = Infinity;
        for (const p of group) {
          const key = chainagePointKey(p);
          if (usedPointKeys.has(key)) continue;
          const t = Number(p.Tdist_Start);
          if (!Number.isFinite(t)) continue;
          const dist = Math.abs(t - tick);
          if (dist < bestDist) {
            bestDist = dist;
            best = p;
          }
        }
        if (best) {
          usedPointKeys.add(chainagePointKey(best));
          markers.push({
            point: best,
            tickKm: tick,
            tierId: tier.id,
            label: formatChainageTickLabel(tick, tier.id)
          });
        }
      }
    }
  }

  return { markers, labeledPointKeys: usedPointKeys };
}

const TIER_STYLES = {
  "1km": {
    dotClass: "chainage-interval-dot--1km",
    labelColor: { light: "#991b1b", dark: "#fecaca" },
    iconSize: [64, 20],
    iconAnchor: [5, 10],
    zIndex: 500,
    showLabel: true
  },
  "500m": {
    dotClass: "chainage-interval-dot--500m",
    iconSize: [10, 10],
    iconAnchor: [5, 5],
    zIndex: 450,
    showLabel: false
  },
  "100m": {
    dotClass: "chainage-interval-dot--100m",
    iconSize: [8, 8],
    iconAnchor: [4, 4],
    zIndex: 350,
    showLabel: false
  }
};

export function chainageIntervalIcon(label, tierId, darkMode) {
  const style = TIER_STYLES[tierId] || TIER_STYLES["1km"];
  const dotHtml = `<div class="chainage-interval-dot ${style.dotClass}"></div>`;

  if (!style.showLabel) {
    return L.divIcon({
      className: "chainage-interval-marker-leaflet",
      html: `<div class="chainage-interval-marker chainage-interval-marker--dot-only">${dotHtml}</div>`,
      iconSize: style.iconSize,
      iconAnchor: style.iconAnchor
    });
  }

  const labelBg = darkMode ? "#1e293b" : "#ffffff";
  const labelColor = darkMode ? style.labelColor.dark : style.labelColor.light;
  const labelBorder = darkMode ? "#475569" : "#cbd5e1";

  return L.divIcon({
    className: "chainage-interval-marker-leaflet",
    html: `<div class="chainage-interval-marker">
      ${dotHtml}
      <span class="chainage-interval-label" style="background:${labelBg};color:${labelColor};border-color:${labelBorder}">${label}</span>
    </div>`,
    iconSize: style.iconSize,
    iconAnchor: style.iconAnchor
  });
}

export function chainageIntervalZIndex(tierId) {
  return TIER_STYLES[tierId]?.zIndex ?? 400;
}
