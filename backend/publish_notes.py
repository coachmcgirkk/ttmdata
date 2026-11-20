"""Publishing notes from the hourly workbook's audit sheet."""
import math
import os
from functools import lru_cache

import pandas as pd

NOTES_SOURCE = os.path.join(
    os.path.dirname(__file__),
    "data",
    "AADT",
    "qld-traffic-data-average-by-hour-by-day-2025.xlsx",
)
NOTES_SHEET = "audit_2025"


def _key(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    if not text or text.lower() == "none":
        return None
    try:
        return str(int(float(text)))
    except (TypeError, ValueError):
        return text


@lru_cache(maxsize=1)
def _load_note_maps():
    site_notes = {}
    district_notes = {}
    if not os.path.exists(NOTES_SOURCE):
        return site_notes, district_notes
    frame = pd.read_excel(NOTES_SOURCE, sheet_name=NOTES_SHEET)
    for row in frame.itertuples(index=False):
        note = "" if row[4] is None else str(row[4]).strip()
        if not note or note.lower() == "nan":
            continue
        site_id = _key(row[2])
        district_id = _key(row[0])
        if site_id:
            site_notes.setdefault(site_id, [])
            if note not in site_notes[site_id]:
                site_notes[site_id].append(note)
        elif district_id:
            district_notes.setdefault(district_id, [])
            if note not in district_notes[district_id]:
                district_notes[district_id].append(note)
    return site_notes, district_notes


def notes_for(site_id=None, district_id=None):
    site_notes, district_notes = _load_note_maps()
    found = []
    site_key = _key(site_id)
    district_key = _key(district_id)
    if site_key:
        found.extend(site_notes.get(site_key, []))
    if district_key:
        for note in district_notes.get(district_key, []):
            if note not in found:
                found.append(note)
    return found
