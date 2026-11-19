#!/usr/bin/env python3
import json
import os
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parent
CHAINAGE_DIR = ROOT / "data" / "chainage"
SOURCE_CSV = CHAINAGE_DIR / "road-location-and-traffic-data_20260505.csv"
CHUNKS_DIR = CHAINAGE_DIR / "chunks"
INDEX_PATH = CHUNKS_DIR / "index.json"

# Approx 0.3 degree tiles are a practical tradeoff for QLD state-wide points.
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


def main():
    if not SOURCE_CSV.exists():
        raise FileNotFoundError(f"Missing source file: {SOURCE_CSV}")

    CHUNKS_DIR.mkdir(parents=True, exist_ok=True)
    for old in CHUNKS_DIR.glob("chainage_chunk_*.csv"):
        old.unlink()

    cols = [
        "Road_Section_Id",
        "Carriageway_Code",
        "Tdist_Start",
        "Latitude",
        "Longitude",
        "Description",
        "AADT",
        "AADT_Intervention_Category",
    ]
    df = pd.read_csv(SOURCE_CSV, usecols=lambda c: c in cols)
    df["Latitude"] = pd.to_numeric(df["Latitude"], errors="coerce")
    df["Longitude"] = pd.to_numeric(df["Longitude"], errors="coerce")
    df = df.dropna(subset=["Latitude", "Longitude"]).reset_index(drop=True)

    df["lat_bin"], df["lon_bin"] = zip(*df.apply(lambda r: tile_key(r["Latitude"], r["Longitude"]), axis=1))

    chunks = []
    for i, ((lat_bin, lon_bin), g) in enumerate(df.groupby(["lat_bin", "lon_bin"], sort=True), start=1):
        file_name = f"chainage_chunk_{i:05d}.csv"
        out_path = CHUNKS_DIR / file_name
        g.drop(columns=["lat_bin", "lon_bin"]).to_csv(out_path, index=False)
        bounds = tile_bounds(int(lat_bin), int(lon_bin))
        chunks.append(
            {
                "file": file_name,
                "row_count": int(len(g)),
                "bbox": bounds,
            }
        )

    index = {
        "source_file": SOURCE_CSV.name,
        "row_count": int(len(df)),
        "lat_step": LAT_STEP,
        "lon_step": LON_STEP,
        "chunks": chunks,
    }
    with INDEX_PATH.open("w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)

    print(f"Created {len(chunks)} chunks in {CHUNKS_DIR}")
    print(f"Indexed rows: {len(df)}")
    print(f"Index path: {INDEX_PATH}")


if __name__ == "__main__":
    main()
