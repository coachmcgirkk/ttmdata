"""Shared geographic tiling helpers for chunked point datasets."""

LAT_STEP = 0.3
LON_STEP = 0.3


def tile_key(lat: float, lon: float):
    lat_bin = int((lat + 90.0) // LAT_STEP)
    lon_bin = int((lon + 180.0) // LON_STEP)
    return lat_bin, lon_bin


def tile_bounds(lat_bin: int, lon_bin: int):
    min_lat = -90.0 + lat_bin * LAT_STEP
    min_lon = -180.0 + lon_bin * LON_STEP
    return {
        "min_lat": min_lat,
        "max_lat": min_lat + LAT_STEP,
        "min_lon": min_lon,
        "max_lon": min_lon + LON_STEP,
    }


def bbox_intersects(a, b):
    return not (
        a["max_lat"] < b["min_lat"]
        or a["min_lat"] > b["max_lat"]
        or a["max_lon"] < b["min_lon"]
        or a["min_lon"] > b["max_lon"]
    )
