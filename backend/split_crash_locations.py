#!/usr/bin/env python3
"""Split Queensland crash locations CSV into spatial chunks for bbox queries."""
import json
from pathlib import Path

import pandas as pd

from geo_tiles import LAT_STEP, LON_STEP, tile_bounds, tile_key

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
CRASH_DIR = DATA_DIR / "crash"
CHUNKS_DIR = CRASH_DIR / "chunks"
INDEX_PATH = CHUNKS_DIR / "index.json"

SOURCE_CANDIDATES = [
    DATA_DIR / "_1_crash_locations.csv",
    DATA_DIR / "_1_crash_locations123123.csv",
]

CRASH_MAP_COLUMNS = [
    "Crash_Ref_Number", "Crash_Severity", "Crash_Year", "Crash_Month", "Crash_Day_Of_Week",
    "Crash_Hour", "Crash_Nature", "Crash_Type", "Crash_Longitude", "Crash_Latitude",
    "Crash_Street", "Crash_Street_Intersecting", "State_Road_Name", "Loc_Suburb",
    "Loc_Local_Government_Area", "Loc_Queensland_Transport_Region", "Crash_Speed_Limit",
    "Crash_Atmospheric_Condition", "Crash_Lighting_Condition", "Count_Casualty_Fatality",
    "Count_Casualty_Hospitalised", "Count_Casualty_Total",
]


def resolve_source_path():
    for path in SOURCE_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError(
        "No crash source CSV found. Expected one of: "
        + ", ".join(p.name for p in SOURCE_CANDIDATES)
    )


def main():
    source = resolve_source_path()
    CHUNKS_DIR.mkdir(parents=True, exist_ok=True)
    for old in CHUNKS_DIR.glob("crash_chunk_*.csv"):
        old.unlink()

    df = pd.read_csv(source, usecols=lambda c: c in CRASH_MAP_COLUMNS, low_memory=False)
    df["Crash_Year"] = pd.to_numeric(df["Crash_Year"], errors="coerce")
    df["Crash_Latitude"] = pd.to_numeric(df["Crash_Latitude"], errors="coerce")
    df["Crash_Longitude"] = pd.to_numeric(df["Crash_Longitude"], errors="coerce")
    df = df.dropna(subset=["Crash_Latitude", "Crash_Longitude"]).reset_index(drop=True)

    valid_years = df["Crash_Year"].dropna()
    severities = sorted(df["Crash_Severity"].dropna().unique().tolist())
    regions = sorted(df["Loc_Queensland_Transport_Region"].dropna().unique().tolist())

    df["lat_bin"], df["lon_bin"] = zip(
        *df.apply(lambda r: tile_key(r["Crash_Latitude"], r["Crash_Longitude"]), axis=1)
    )

    chunks = []
    for i, ((lat_bin, lon_bin), g) in enumerate(df.groupby(["lat_bin", "lon_bin"], sort=True), start=1):
        file_name = f"crash_chunk_{i:05d}.csv"
        out_path = CHUNKS_DIR / file_name
        g.drop(columns=["lat_bin", "lon_bin"]).to_csv(out_path, index=False)
        bounds = tile_bounds(int(lat_bin), int(lon_bin))
        chunks.append({"file": file_name, "row_count": int(len(g)), "bbox": bounds})

    index = {
        "source_file": source.name,
        "row_count": int(len(df)),
        "yearMin": int(valid_years.min()),
        "yearMax": int(valid_years.max()),
        "severities": severities,
        "regions": regions,
        "lat_step": LAT_STEP,
        "lon_step": LON_STEP,
        "chunks": chunks,
    }
    with INDEX_PATH.open("w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)

    print(f"Source: {source}")
    print(f"Created {len(chunks)} chunks in {CHUNKS_DIR}")
    print(f"Indexed rows: {len(df)}")
    print(f"Index path: {INDEX_PATH}")


if __name__ == "__main__":
    main()
