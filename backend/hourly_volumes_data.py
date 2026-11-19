"""Load Queensland average hourly traffic volumes (by day of week)."""
import math
import os
from functools import lru_cache

import pandas as pd

AADT_DIR = os.path.join(os.path.dirname(__file__), "data", "AADT")
HOURLY_SOURCE = os.path.join(AADT_DIR, "qld-traffic-data-average-by-hour-by-day-2024.xlsx")
HOURLY_CACHE_CSV = os.path.join(AADT_DIR, "qld-traffic-data-average-by-hour-by-day-2024.csv")
HOURLY_SHEET = "2024 Avg Volumes"
TRAFFIC_DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "traffic_data.csv")

SEGMENT_BEARING_COLUMNS = {
    "SITE_ID": 4,
    "SEG_START_THROUGH_DISTANCE": 8,
    "SEG_END_THROUGH_DISTANCE": 9,
    "SEG_LONGITUDE_START": 13,
    "SEG_LATITUDE_START": 14,
    "SEG_LONGITUDE_END": 15,
    "SEG_LATITUDE_END": 16,
}

DAY_COLUMNS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "WEEKDAY_AVERAGE", "WEEKEND_AVERAGE"]
DIRECTIONS = ["GAZETTAL", "AGAINST GAZETTAL"]


def hour_sort_key(hours_label: str) -> int:
    try:
        return int(str(hours_label).split()[0])
    except (ValueError, IndexError):
        return 0


def compute_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_r, lon1_r, lat2_r, lon2_r = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2_r - lon1_r
    x = math.sin(dlon) * math.cos(lat2_r)
    y = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(dlon)
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360


def _segment_gazettal_bearing(row):
    lat_s = row.get("SEG_LATITUDE_START")
    lon_s = row.get("SEG_LONGITUDE_START")
    lat_e = row.get("SEG_LATITUDE_END")
    lon_e = row.get("SEG_LONGITUDE_END")
    if pd.isna(lat_s) or pd.isna(lon_s) or pd.isna(lat_e) or pd.isna(lon_e):
        return None
    t_start = row.get("SEG_START_THROUGH_DISTANCE")
    t_end = row.get("SEG_END_THROUGH_DISTANCE")
    if pd.isna(t_start) or pd.isna(t_end) or float(t_start) <= float(t_end):
        return compute_bearing(float(lat_s), float(lon_s), float(lat_e), float(lon_e))
    return compute_bearing(float(lat_e), float(lon_e), float(lat_s), float(lon_s))


@lru_cache(maxsize=1)
def load_site_gazettal_bearings():
    if not os.path.exists(TRAFFIC_DATA_PATH):
        return {}
    peek = pd.read_csv(TRAFFIC_DATA_PATH, nrows=2)
    first_col = str(peek.columns[0])
    if first_col == "TRAFFIC_YEAR" or first_col.endswith("TRAFFIC_YEAR"):
        traffic = pd.read_csv(
            TRAFFIC_DATA_PATH,
            encoding="utf-8-sig",
            usecols=list(SEGMENT_BEARING_COLUMNS.keys()),
        )
    else:
        traffic = pd.read_csv(
            TRAFFIC_DATA_PATH,
            header=None,
            encoding="utf-8-sig",
            usecols=list(SEGMENT_BEARING_COLUMNS.values()),
            names=list(SEGMENT_BEARING_COLUMNS.keys()),
        )
    bearings = {}
    for site_id, group in traffic.groupby("SITE_ID"):
        for _, row in group.iterrows():
            bearing = _segment_gazettal_bearing(row)
            if bearing is not None:
                bearings[int(site_id)] = bearing
                break
    return bearings


def get_gazettal_bearing(site_id):
    return load_site_gazettal_bearings().get(int(site_id))


@lru_cache(maxsize=1)
def load_hourly_dataframe() -> pd.DataFrame:
    if not os.path.exists(HOURLY_SOURCE):
        raise FileNotFoundError(f"Hourly volumes file not found: {HOURLY_SOURCE}")
    use_cache = (
        os.path.exists(HOURLY_CACHE_CSV)
        and os.path.getmtime(HOURLY_CACHE_CSV) >= os.path.getmtime(HOURLY_SOURCE)
    )
    if use_cache:
        df = pd.read_csv(HOURLY_CACHE_CSV)
    else:
        df = pd.read_excel(HOURLY_SOURCE, sheet_name=HOURLY_SHEET)
        df.to_csv(HOURLY_CACHE_CSV, index=False)
    df["LATITUDE"] = pd.to_numeric(df["LATITUDE"], errors="coerce")
    df["LONGITUDE"] = pd.to_numeric(df["LONGITUDE"], errors="coerce")
    df["SITE_ID"] = pd.to_numeric(df["SITE_ID"], errors="coerce")
    df["_hour_order"] = df["HOURS"].map(hour_sort_key)
    return df


def get_meta():
    df = load_hourly_dataframe()
    return {
        "ready": True,
        "sourceFile": os.path.basename(HOURLY_SOURCE),
        "year": 2024,
        "siteCount": int(df["SITE_ID"].nunique()),
        "directions": DIRECTIONS,
        "days": DAY_COLUMNS,
        "hours": sorted(df["HOURS"].dropna().unique().tolist(), key=hour_sort_key),
    }


def get_sites():
    df = load_hourly_dataframe()
    sites = (
        df.groupby("SITE_ID", as_index=False)
        .agg(
            {
                "DESCRIPTION": "first",
                "ROAD_NAME": "first",
                "LATITUDE": "first",
                "LONGITUDE": "first",
                "RSECT_ID": "first",
            }
        )
        .dropna(subset=["LATITUDE", "LONGITUDE"])
    )
    records = sites.rename(
        columns={
            "SITE_ID": "siteId",
            "DESCRIPTION": "description",
            "ROAD_NAME": "roadName",
            "LATITUDE": "latitude",
            "LONGITUDE": "longitude",
            "RSECT_ID": "roadSectionId",
        }
    ).to_dict(orient="records")
    bearings = load_site_gazettal_bearings()
    for record in records:
        bearing = bearings.get(int(record["siteId"]))
        if bearing is not None:
            record["gazettalBearing"] = round(bearing, 2)
    return records


def get_site_profile(site_id: int, direction=None):
    df = load_hourly_dataframe()
    site_df = df[df["SITE_ID"] == site_id]
    if site_df.empty:
        return None

    if direction:
        site_df = site_df[site_df["GAZETTAL_DIRECTION"] == direction]
    if site_df.empty:
        return None

    info = site_df.iloc[0]
    profiles = []
    for dir_name, dir_df in site_df.groupby("GAZETTAL_DIRECTION"):
        hours = (
            dir_df.sort_values("_hour_order")
            .apply(
                lambda row: {
                    "hours": row["HOURS"],
                    "hourOrder": int(row["_hour_order"]),
                    **{day: row[day] for day in DAY_COLUMNS},
                },
                axis=1,
            )
            .tolist()
        )
        profiles.append({"direction": dir_name, "hours": hours})

    return {
        "siteId": int(site_id),
        "description": info["DESCRIPTION"],
        "roadName": info["ROAD_NAME"],
        "latitude": float(info["LATITUDE"]) if pd.notna(info["LATITUDE"]) else None,
        "longitude": float(info["LONGITUDE"]) if pd.notna(info["LONGITUDE"]) else None,
        "roadSectionId": info.get("RSECT_ID"),
        "gazettalBearing": get_gazettal_bearing(site_id),
        "profiles": profiles,
    }
