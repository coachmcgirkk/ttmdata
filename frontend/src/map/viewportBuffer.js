export function expandBbox(bbox, padRatio = 0.75) {
  if (!bbox) return null;
  const latPad = Math.max(bbox.max_lat - bbox.min_lat, 1e-6) * padRatio;
  const lonPad = Math.max(bbox.max_lon - bbox.min_lon, 1e-6) * padRatio;
  return {
    min_lat: bbox.min_lat - latPad,
    max_lat: bbox.max_lat + latPad,
    min_lon: bbox.min_lon - lonPad,
    max_lon: bbox.max_lon + lonPad,
    zoom: bbox.zoom
  };
}

export function bboxContains(outer, inner, edge = 0) {
  if (!outer || !inner) return false;
  const latPad = Math.max(outer.max_lat - outer.min_lat, 0) * edge;
  const lonPad = Math.max(outer.max_lon - outer.min_lon, 0) * edge;
  return (
    inner.min_lat >= outer.min_lat + latPad &&
    inner.max_lat <= outer.max_lat - latPad &&
    inner.min_lon >= outer.min_lon + lonPad &&
    inner.max_lon <= outer.max_lon - lonPad
  );
}
