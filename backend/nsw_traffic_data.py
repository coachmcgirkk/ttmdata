"""Load TfNSW road traffic counts (station reference, yearly summary, hourly sample)."""
import os
from functools import lru_cache

import numpy as np
import pandas as pd

NSW_DIR = os.path.join(os.path.dirname(__file__), "data", "nsw")
STATION_PATH = os.path.join(NSW_DIR, "road_traffic_counts_station_reference.csv")
YEARLY_PATH = os.path.join(NSW_DIR, "road_traffic_counts_yearly_summary.csv")
HOURLY_PATH = os.path.join(NSW_DIR, "road_traffic_counts_hourly_sample_0.csv")

HOUR_COLS = [f"hour_{h:02d}" for h in range(24)]

CLASSIFICATION_LABELS = {
    0: "UNCLASSIFIED",
    1: "ALL VEHICLES",
    2: "LIGHT VEHICLES",
    3: "HEAVY VEHICLES",
    -9: "MISSING",
}

DAY_LABELS = {
    1: "MON",
    2: "TUE",
    3: "WED",
    4: "THU",
    5: "FRI",
    6: "SAT",
    7: "SUN",
}

CARDINAL_SEQ_LABELS = {
    1: "NORTH",
    3: "EAST",
    5: "SOUTH",
    7: "WEST",
    9: "NORTHBOUND AND SOUTHBOUND",
    10: "EASTBOUND AND WESTBOUND",
}

TRAFFIC_DIR_SEQ_LABELS = {
    0: "COUNTER",
    1: "PRESCRIBED",
    2: "PRESCRIBED AND COUNTER",
}


def _clean_nan(obj):
    if isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    if isinstance(obj, float) and (np.isnan(obj) or np.isinf(obj)):
        return None
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        val = float(obj)
        return None if np.isnan(val) or np.isinf(val) else val
    return obj


@lru_cache(maxsize=1)
def load_stations() -> pd.DataFrame:
    if not os.path.exists(STATION_PATH):
        raise FileNotFoundError(f"NSW station reference not found: {STATION_PATH}")
    df = pd.read_csv(
        STATION_PATH,
        encoding="utf-8-sig",
        usecols=[
            "station_key",
            "station_id",
            "name",
            "road_name",
            "full_name",
            "suburb",
            "lga",
            "rms_region",
            "post_code",
            "device_type",
            "permanent_station",
            "vehicle_classifier",
            "wgs84_latitude",
            "wgs84_longitude",
            "road_functional_hierarchy",
            "quality_rating",
        ],
        low_memory=False,
    )
    df["station_key"] = pd.to_numeric(df["station_key"], errors="coerce")
    df["wgs84_latitude"] = pd.to_numeric(df["wgs84_latitude"], errors="coerce")
    df["wgs84_longitude"] = pd.to_numeric(df["wgs84_longitude"], errors="coerce")
    df["permanent_station"] = pd.to_numeric(df["permanent_station"], errors="coerce").fillna(0).astype(int)
    return df.dropna(subset=["station_key", "wgs84_latitude", "wgs84_longitude"])


@lru_cache(maxsize=1)
def load_yearly() -> pd.DataFrame:
    if not os.path.exists(YEARLY_PATH):
        raise FileNotFoundError(f"NSW yearly summary not found: {YEARLY_PATH}")
    df = pd.read_csv(
        YEARLY_PATH,
        encoding="utf-8-sig",
        usecols=[
            "station_key",
            "station_id",
            "traffic_direction_seq",
            "traffic_direction_name",
            "cardinal_direction_seq",
            "cardinal_direction_name",
            "classification_seq",
            "classification_type",
            "year",
            "period",
            "partial_year",
            "traffic_count",
            "data_quality_indicator",
        ],
        low_memory=False,
    )
    df["station_key"] = pd.to_numeric(df["station_key"], errors="coerce")
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df["traffic_count"] = pd.to_numeric(df["traffic_count"], errors="coerce")
    df["classification_seq"] = pd.to_numeric(df["classification_seq"], errors="coerce")
    return df.dropna(subset=["station_key", "year"])


@lru_cache(maxsize=1)
def load_hourly() -> pd.DataFrame:
    if not os.path.exists(HOURLY_PATH):
        raise FileNotFoundError(f"NSW hourly sample not found: {HOURLY_PATH}")
    usecols = [
        "station_key",
        "traffic_direction_seq",
        "cardinal_direction_seq",
        "classification_seq",
        "date",
        "year",
        "day_of_week",
        "daily_total",
        *HOUR_COLS,
    ]
    df = pd.read_csv(HOURLY_PATH, encoding="utf-8-sig", usecols=usecols, low_memory=False)
    df["station_key"] = pd.to_numeric(df["station_key"], errors="coerce")
    df["traffic_direction_seq"] = pd.to_numeric(df["traffic_direction_seq"], errors="coerce")
    df["cardinal_direction_seq"] = pd.to_numeric(df["cardinal_direction_seq"], errors="coerce")
    df["classification_seq"] = pd.to_numeric(df["classification_seq"], errors="coerce")
    df["day_of_week"] = pd.to_numeric(df["day_of_week"], errors="coerce")
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    for col in HOUR_COLS + ["daily_total"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df.dropna(subset=["station_key", "day_of_week"])


@lru_cache(maxsize=1)
def _hourly_station_keys():
    return set(load_hourly()["station_key"].dropna().astype(int).unique().tolist())


@lru_cache(maxsize=1)
def _yearly_station_keys():
    return set(load_yearly()["station_key"].dropna().astype(int).unique().tolist())


@lru_cache(maxsize=1)
def _latest_aadt_by_station():
    """Latest ALL DAYS AADT preferring ALL VEHICLES, else UNCLASSIFIED, BOTH-like directions first."""
    df = load_yearly()
    all_days = df[df["period"] == "ALL DAYS"].copy()
    if all_days.empty:
        return {}

    class_rank = {"ALL VEHICLES": 0, "UNCLASSIFIED": 1, "LIGHT VEHICLES": 2, "HEAVY VEHICLES": 3}
    all_days["_class_rank"] = all_days["classification_type"].map(class_rank).fillna(9)

    both_like = {
        "BOTH",
        "NORTHBOUND AND SOUTHBOUND",
        "EASTBOUND AND WESTBOUND",
        "PRESCRIBED AND COUNTER",
    }
    all_days["_dir_rank"] = all_days["cardinal_direction_name"].isin(both_like).astype(int)
    # Prefer combined directions (rank 1) then single
    all_days = all_days.sort_values(
        ["station_key", "year", "_class_rank", "_dir_rank"],
        ascending=[True, False, True, False],
    )
    latest = all_days.groupby("station_key", as_index=False).first()
    out = {}
    for _, row in latest.iterrows():
        key = int(row["station_key"])
        out[key] = {
            "latestAadt": float(row["traffic_count"]) if pd.notna(row["traffic_count"]) else None,
            "latestYear": int(row["year"]) if pd.notna(row["year"]) else None,
            "latestDirection": row.get("cardinal_direction_name"),
            "latestClassification": row.get("classification_type"),
        }
    return out


def data_ready():
    missing = []
    for path, label in (
        (STATION_PATH, "station reference"),
        (YEARLY_PATH, "yearly summary"),
        (HOURLY_PATH, "hourly sample"),
    ):
        if not os.path.exists(path):
            missing.append(label)
    return missing


def get_meta():
    missing = data_ready()
    if missing:
        return {
            "ready": False,
            "error": f"Missing NSW data files: {', '.join(missing)}",
        }
    stations = load_stations()
    yearly = load_yearly()
    hourly = load_hourly()
    periods = sorted(yearly["period"].dropna().unique().tolist())
    classifications = sorted(yearly["classification_type"].dropna().unique().tolist())
    hourly_classes = sorted(
        int(x) for x in hourly["classification_seq"].dropna().unique().tolist()
    )
    return {
        "ready": True,
        "stationCount": int(len(stations)),
        "yearlyStationCount": int(yearly["station_key"].nunique()),
        "hourlyStationCount": int(hourly["station_key"].nunique()),
        "yearMin": int(yearly["year"].min()),
        "yearMax": int(yearly["year"].max()),
        "periods": periods,
        "classifications": classifications,
        "hourlyClassifications": [
            {"seq": seq, "label": CLASSIFICATION_LABELS.get(seq, str(seq))}
            for seq in hourly_classes
        ],
        "defaultPeriod": "ALL DAYS" if "ALL DAYS" in periods else (periods[0] if periods else None),
        "defaultClassification": (
            "ALL VEHICLES"
            if "ALL VEHICLES" in classifications
            else ("UNCLASSIFIED" if "UNCLASSIFIED" in classifications else None)
        ),
        "defaultHourlyClassification": 0 if 0 in hourly_classes else (hourly_classes[0] if hourly_classes else None),
        "mapCenter": [-33.87, 151.21],
        "mapZoom": 7,
        "sourceFiles": [
            os.path.basename(STATION_PATH),
            os.path.basename(YEARLY_PATH),
            os.path.basename(HOURLY_PATH),
        ],
    }


def get_stations():
    stations = load_stations()
    hourly_keys = _hourly_station_keys()
    yearly_keys = _yearly_station_keys()
    latest = _latest_aadt_by_station()
    records = []
    for _, row in stations.iterrows():
        key = int(row["station_key"])
        latest_info = latest.get(key, {})
        records.append(
            {
                "stationKey": key,
                "stationId": row.get("station_id"),
                "name": row.get("name") or row.get("road_name"),
                "roadName": row.get("road_name"),
                "fullName": row.get("full_name"),
                "suburb": row.get("suburb"),
                "lga": row.get("lga"),
                "region": row.get("rms_region"),
                "postCode": row.get("post_code"),
                "deviceType": row.get("device_type"),
                "permanent": bool(row.get("permanent_station")),
                "vehicleClassifier": bool(row.get("vehicle_classifier")),
                "roadHierarchy": row.get("road_functional_hierarchy"),
                "qualityRating": row.get("quality_rating"),
                "latitude": float(row["wgs84_latitude"]),
                "longitude": float(row["wgs84_longitude"]),
                "hasYearly": key in yearly_keys,
                "hasHourly": key in hourly_keys,
                "latestAadt": latest_info.get("latestAadt"),
                "latestYear": latest_info.get("latestYear"),
            }
        )
    return _clean_nan(records)


def get_station(station_key: int):
    stations = load_stations()
    match = stations[stations["station_key"] == station_key]
    if match.empty:
        return None
    row = match.iloc[0]
    latest = _latest_aadt_by_station().get(int(station_key), {})
    return _clean_nan(
        {
            "stationKey": int(station_key),
            "stationId": row.get("station_id"),
            "name": row.get("name") or row.get("road_name"),
            "roadName": row.get("road_name"),
            "fullName": row.get("full_name"),
            "suburb": row.get("suburb"),
            "lga": row.get("lga"),
            "region": row.get("rms_region"),
            "postCode": row.get("post_code"),
            "deviceType": row.get("device_type"),
            "permanent": bool(row.get("permanent_station")),
            "vehicleClassifier": bool(row.get("vehicle_classifier")),
            "roadHierarchy": row.get("road_functional_hierarchy"),
            "qualityRating": row.get("quality_rating"),
            "latitude": float(row["wgs84_latitude"]),
            "longitude": float(row["wgs84_longitude"]),
            "hasYearly": int(station_key) in _yearly_station_keys(),
            "hasHourly": int(station_key) in _hourly_station_keys(),
            "latestAadt": latest.get("latestAadt"),
            "latestYear": latest.get("latestYear"),
            "latestDirection": latest.get("latestDirection"),
            "latestClassification": latest.get("latestClassification"),
        }
    )


def _pick_classification(available, requested):
    if requested and requested in available:
        return requested
    for preferred in ("ALL VEHICLES", "UNCLASSIFIED"):
        if preferred in available:
            return preferred
    return available[0] if available else None


def get_yearly_profile(station_key: int, period=None, classification=None):
    df = load_yearly()
    site = df[df["station_key"] == station_key].copy()
    if site.empty:
        return None

    periods = sorted(site["period"].dropna().unique().tolist())
    use_period = period if period in periods else ("ALL DAYS" if "ALL DAYS" in periods else periods[0])
    site = site[site["period"] == use_period]
    if site.empty:
        return None

    class_options = sorted(site["classification_type"].dropna().unique().tolist())
    use_class = _pick_classification(class_options, classification)
    site = site[site["classification_type"] == use_class]
    if site.empty:
        return None

    # Prefer PRESCRIBED over COUNTER when both exist for same year+cardinal; keep BOTH.
    site = site.sort_values(["year", "cardinal_direction_name", "traffic_direction_seq"])
    site = site.drop_duplicates(
        subset=["year", "cardinal_direction_name", "classification_type"],
        keep="last",
    )

    directions = sorted(site["cardinal_direction_name"].dropna().unique().tolist())
    years = sorted(int(y) for y in site["year"].dropna().unique().tolist())
    chart = []
    for year in years:
        point = {"year": year}
        year_df = site[site["year"] == year]
        for _, row in year_df.iterrows():
            direction = row["cardinal_direction_name"]
            if pd.isna(direction):
                continue
            count = row["traffic_count"]
            point[direction] = None if pd.isna(count) else float(count)
            point[f"{direction}_partial"] = bool(row.get("partial_year"))
        chart.append(point)

    station = get_station(station_key) or {"stationKey": int(station_key)}
    return _clean_nan(
        {
            **station,
            "period": use_period,
            "classification": use_class,
            "availablePeriods": periods,
            "availableClassifications": class_options,
            "directions": directions,
            "years": years,
            "chart": chart,
            "rows": [
                {
                    "year": int(row["year"]),
                    "trafficDirection": row.get("traffic_direction_name"),
                    "cardinalDirection": row.get("cardinal_direction_name"),
                    "trafficCount": None if pd.isna(row["traffic_count"]) else float(row["traffic_count"]),
                    "partialYear": bool(row.get("partial_year")),
                    "quality": row.get("data_quality_indicator"),
                }
                for _, row in site.sort_values(["year", "cardinal_direction_name"]).iterrows()
            ],
        }
    )


def get_hourly_profile(station_key: int, classification_seq=None, traffic_direction_seq=None):
    df = load_hourly()
    site = df[df["station_key"] == station_key].copy()
    if site.empty:
        return None

    class_options = sorted(int(x) for x in site["classification_seq"].dropna().unique().tolist())
    if classification_seq is None:
        use_class = 0 if 0 in class_options else (class_options[0] if class_options else None)
    else:
        use_class = int(classification_seq)
        if use_class not in class_options and class_options:
            use_class = class_options[0]
    site = site[site["classification_seq"] == use_class]
    if site.empty:
        return None

    dir_options = sorted(int(x) for x in site["traffic_direction_seq"].dropna().unique().tolist())
    if traffic_direction_seq is not None:
        wanted = int(traffic_direction_seq)
        if wanted in dir_options:
            site = site[site["traffic_direction_seq"] == wanted]

    profiles = []
    for (tdir, cdir), group in site.groupby(["traffic_direction_seq", "cardinal_direction_seq"]):
        hours = []
        for hour_idx, col in enumerate(HOUR_COLS):
            point = {"hour": f"{hour_idx:02d}:00", "hourOrder": hour_idx}
            for dow, day_label in DAY_LABELS.items():
                day_vals = group.loc[group["day_of_week"] == dow, col]
                point[day_label] = None if day_vals.empty else float(day_vals.mean())
            weekday = group.loc[group["day_of_week"].isin([1, 2, 3, 4, 5]), col]
            weekend = group.loc[group["day_of_week"].isin([6, 7]), col]
            point["WEEKDAY_AVERAGE"] = None if weekday.empty else float(weekday.mean())
            point["WEEKEND_AVERAGE"] = None if weekend.empty else float(weekend.mean())
            hours.append(point)

        sample_dates = (
            group["date"]
            .dropna()
            .astype(str)
            .str.slice(0, 10)
            .drop_duplicates()
            .sort_values()
            .tolist()
        )
        profiles.append(
            {
                "trafficDirectionSeq": int(tdir) if pd.notna(tdir) else None,
                "trafficDirection": TRAFFIC_DIR_SEQ_LABELS.get(int(tdir), str(tdir))
                if pd.notna(tdir)
                else None,
                "cardinalDirectionSeq": int(cdir) if pd.notna(cdir) else None,
                "cardinalDirection": CARDINAL_SEQ_LABELS.get(int(cdir), str(cdir))
                if pd.notna(cdir)
                else None,
                "sampleDays": len(sample_dates),
                "dateMin": sample_dates[0] if sample_dates else None,
                "dateMax": sample_dates[-1] if sample_dates else None,
                "hours": hours,
            }
        )

    station = get_station(station_key) or {"stationKey": int(station_key)}
    return _clean_nan(
        {
            **station,
            "classificationSeq": use_class,
            "classification": CLASSIFICATION_LABELS.get(use_class, str(use_class)),
            "availableClassifications": [
                {"seq": seq, "label": CLASSIFICATION_LABELS.get(seq, str(seq))}
                for seq in class_options
            ],
            "availableTrafficDirections": [
                {"seq": seq, "label": TRAFFIC_DIR_SEQ_LABELS.get(seq, str(seq))}
                for seq in dir_options
            ],
            "profiles": profiles,
        }
    )
