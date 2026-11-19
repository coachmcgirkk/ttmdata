import React, { useMemo, useState } from "react";
import { Marker, Polyline, useMap, useMapEvent } from "react-leaflet";
import L from "leaflet";
import { DIRECTION_COLORS } from "../colorPalette";

const WITH_GAZETTAL_COLOR = DIRECTION_COLORS["WITH GAZETTAL"];
const AGAINST_GAZETTAL_COLOR = DIRECTION_COLORS["AGAINST GAZETTAL"];
const ARROW_SHAFT_PX = 44;
const ARROW_HEAD_PX = 16;

/** Web Mercator metres per pixel at latitude and zoom. */
export function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export function pixelLengthToMeters(lat, zoom, px) {
  return metersPerPixel(lat, zoom) * px;
}

function useMapZoom() {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvent("zoom", () => setZoom(map.getZoom()));
  return zoom;
}

/** Destination point given start lat/lon, bearing (deg from north), and distance in metres. */
export function destinationPoint(lat, lon, bearingDeg, distanceM) {
  const earthRadius = 6378137;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceM / earthRadius) +
      Math.cos(lat1) * Math.sin(distanceM / earthRadius) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(distanceM / earthRadius) * Math.cos(lat1),
      Math.cos(distanceM / earthRadius) - Math.sin(lat1) * Math.sin(lat2)
    );
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

/** Pixel offset for a Leaflet popup, placed opposite the with-gazettal arrow. */
export function popupOffsetForBearing(bearingDeg, distancePx = ARROW_SHAFT_PX + 12) {
  const rad = (Number(bearingDeg) * Math.PI) / 180;
  return [
    Math.round(-Math.sin(rad) * distancePx),
    Math.round(Math.cos(rad) * distancePx)
  ];
}

function arrowHeadIcon(bearingDeg, color) {
  return L.divIcon({
    className: "gazettal-arrow-head",
    html: `<div style="transform:rotate(${bearingDeg}deg);color:${color};font-size:${ARROW_HEAD_PX}px;line-height:1;text-shadow:0 0 2px #fff,0 0 4px rgba(255,255,255,.8);">▲</div>`,
    iconSize: [ARROW_HEAD_PX, ARROW_HEAD_PX],
    iconAnchor: [ARROW_HEAD_PX / 2, ARROW_HEAD_PX / 2]
  });
}

export function GazettalDirectionArrows({ lat, lon, bearing, lengthPx = ARROW_SHAFT_PX }) {
  const zoom = useMapZoom();
  const arrowLengthM = useMemo(
    () => pixelLengthToMeters(lat, zoom, lengthPx),
    [lat, zoom, lengthPx]
  );

  if (bearing == null || !isFinite(Number(bearing))) return null;

  const withBearing = Number(bearing);
  const againstBearing = (withBearing + 180) % 360;
  const withEnd = destinationPoint(lat, lon, withBearing, arrowLengthM);
  const againstEnd = destinationPoint(lat, lon, againstBearing, arrowLengthM);

  return (
    <>
      <Polyline
        positions={[[lat, lon], withEnd]}
        pathOptions={{ color: WITH_GAZETTAL_COLOR, weight: 4, opacity: 0.95 }}
      />
      <Polyline
        positions={[[lat, lon], againstEnd]}
        pathOptions={{ color: AGAINST_GAZETTAL_COLOR, weight: 4, opacity: 0.95 }}
      />
      <Marker
        position={withEnd}
        icon={arrowHeadIcon(withBearing, WITH_GAZETTAL_COLOR)}
        interactive={false}
        zIndexOffset={400}
      />
      <Marker
        position={againstEnd}
        icon={arrowHeadIcon(againstBearing, AGAINST_GAZETTAL_COLOR)}
        interactive={false}
        zIndexOffset={400}
      />
    </>
  );
}

export function GazettalDirectionLegend({ darkMode }) {
  return (
    <div className={`gazettal-direction-legend ${darkMode ? "gazettal-direction-legend-dark" : ""}`}>
      <div className="gazettal-direction-legend-title">Travel direction</div>
      <div className="gazettal-direction-legend-item">
        <span className="gazettal-direction-legend-arrow" style={{ color: WITH_GAZETTAL_COLOR }}>
          ▲
        </span>
        <span>With gazettal (chainage increases)</span>
      </div>
      <div className="gazettal-direction-legend-item">
        <span className="gazettal-direction-legend-arrow" style={{ color: AGAINST_GAZETTAL_COLOR }}>
          ▲
        </span>
        <span>Against gazettal (chainage decreases)</span>
      </div>
    </div>
  );
}
