from flask import Flask, jsonify, send_file, request
from collections import OrderedDict
import pandas as pd
from publish_notes import notes_for
import io
import os
import json
import numpy as np
import datetime

from hourly_volumes_data import get_meta as get_hourly_meta
from hourly_volumes_data import get_site_profile as get_hourly_site_profile
from hourly_volumes_data import get_sites as get_hourly_sites

from nsw_traffic_data import get_meta as get_nsw_meta
from nsw_traffic_data import get_stations as get_nsw_stations
from nsw_traffic_data import get_station as get_nsw_station
from nsw_traffic_data import get_yearly_profile as get_nsw_yearly_profile
from nsw_traffic_data import get_hourly_profile as get_nsw_hourly_profile

app = Flask(__name__)

# Log user IP before every request
def log_user_ip():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_line = f"{now} {ip} {request.path}\n"
    log_path = os.path.join(os.path.dirname(__file__), 'user_ips.log')
    try:
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(log_line)
    except Exception:
        pass  # Don't break the app if logging fails

app.before_request(log_user_ip)

# TMR AADT export schema (64 columns); traffic_data.csv may omit the header row
TRAFFIC_DATA_COLUMNS = [
    'TRAFFIC_YEAR', 'COLLECTION_YEAR', 'ROAD_SECTION_ID', 'ROAD_NAME', 'SITE_ID',
    'SITE_TYPE', 'DESCRIPTION', 'SITE_THROUGH_DISTANCE', 'SEG_START_THROUGH_DISTANCE',
    'SEG_END_THROUGH_DISTANCE', 'SPEED_LIMIT', 'SITE_LATITUDE', 'SITE_LONGITUDE',
    'SEG_LONGITUDE_START', 'SEG_LATITUDE_START', 'SEG_LONGITUDE_END', 'SEG_LATITUDE_END',
    'DISTRICT_ID', 'DISTRICT_NAME', 'REGION_ID', 'REGION_NAME', 'LGA_ID', 'LGA_NAME',
    'TRAVEL_DIRECTION', 'AADT', 'AADT_CLASS_0A', 'AADT_CLASS_0B', 'AADT_CLASS_1A',
    'AADT_CLASS_1B', 'AADT_CLASS_1C', 'AADT_CLASS_1D', 'AADT_CLASS_2A', 'AADT_CLASS_2B',
    'AADT_CLASS_2C', 'AADT_CLASS_2D', 'AADT_CLASS_2E', 'AADT_CLASS_2F', 'AADT_CLASS_2G',
    'AADT_CLASS_2H', 'AADT_CLASS_2I', 'AADT_CLASS_2J', 'AADT_CLASS_2K', 'AADT_CLASS_2L',
    'PC_CLASS_0A', 'PC_CLASS_0B', 'PC_CLASS_1A', 'PC_CLASS_1B', 'PC_CLASS_1C', 'PC_CLASS_1D',
    'PC_CLASS_2A', 'PC_CLASS_2B', 'PC_CLASS_2C', 'PC_CLASS_2D', 'PC_CLASS_2E', 'PC_CLASS_2F',
    'PC_CLASS_2G', 'PC_CLASS_2H', 'PC_CLASS_2I', 'PC_CLASS_2J', 'PC_CLASS_2K', 'PC_CLASS_2L',
    'GROWTH_PC_1YR', 'GROWTH_PC_5YR', 'GROWTH_PC_10YR',
]


def load_traffic_data(path):
    peek = pd.read_csv(path, nrows=1, encoding='utf-8-sig')
    first_col = str(peek.columns[0])
    if first_col == 'TRAFFIC_YEAR' or first_col.endswith('TRAFFIC_YEAR'):
        return pd.read_csv(path, encoding='utf-8-sig')
    return pd.read_csv(
        path, names=TRAFFIC_DATA_COLUMNS, header=None, encoding='utf-8-sig'
    )


# Load the data
DATA_PATH = os.path.join(os.path.dirname(__file__), 'data', 'traffic_data.csv')
df = load_traffic_data(DATA_PATH)

CRASH_DIR = os.path.join(os.path.dirname(__file__), 'data', 'crash')
CRASH_INDEX_PATH = os.path.join(CRASH_DIR, 'chunks', 'index.json')

CRASH_MAP_COLUMNS = [
    'Crash_Ref_Number', 'Crash_Severity', 'Crash_Year', 'Crash_Month', 'Crash_Day_Of_Week',
    'Crash_Hour', 'Crash_Nature', 'Crash_Type', 'Crash_Longitude', 'Crash_Latitude',
    'Crash_Street', 'Crash_Street_Intersecting', 'State_Road_Name', 'Loc_Suburb',
    'Loc_Local_Government_Area', 'Loc_Queensland_Transport_Region', 'Crash_Speed_Limit',
    'Crash_Atmospheric_Condition', 'Crash_Lighting_Condition', 'Count_Casualty_Fatality',
    'Count_Casualty_Hospitalised', 'Count_Casualty_Total',
]

CHAINAGE_DIR = os.path.join(os.path.dirname(__file__), 'data', 'chainage')
CHAINAGE_SOURCE_PATH = os.path.join(CHAINAGE_DIR, 'road-location-and-traffic-data_20261026.csv')
CHAINAGE_INDEX_PATH = os.path.join(CHAINAGE_DIR, 'chunks', 'index.json')
CHAINAGE_COLUMNS = [
    'Road_Section_Id', 'Carriageway_Code', 'Tdist_Start',
    'Latitude', 'Longitude', 'Description', 'AADT', 'AADT_Intervention_Category'
]
_chainage_index = None
_crash_index = None


class _ChunkFrameCache:
    """LRU of parsed CSV chunks so pan/zoom does not re-read disk every time."""

    def __init__(self, max_items):
        self.max_items = max_items
        self._data = OrderedDict()

    def get(self, key, loader):
        cached = self._data.get(key)
        if cached is not None:
            self._data.move_to_end(key)
            return cached
        frame = loader()
        self._data[key] = frame
        if len(self._data) > self.max_items:
            self._data.popitem(last=False)
        return frame


_crash_chunk_frames = _ChunkFrameCache(200)
_chainage_chunk_frames = _ChunkFrameCache(48)


def load_crash_index():
    global _crash_index
    if _crash_index is None and os.path.exists(CRASH_INDEX_PATH):
        with open(CRASH_INDEX_PATH, 'r', encoding='utf-8') as f:
            _crash_index = json.load(f)
    return _crash_index


def load_chainage_index():
    global _chainage_index
    if _chainage_index is None and os.path.exists(CHAINAGE_INDEX_PATH):
        with open(CHAINAGE_INDEX_PATH, 'r', encoding='utf-8') as f:
            _chainage_index = json.load(f)
    return _chainage_index


def _bbox_intersects(a, b):
    return not (
        a['max_lat'] < b['min_lat']
        or a['min_lat'] > b['max_lat']
        or a['max_lon'] < b['min_lon']
        or a['min_lon'] > b['max_lon']
    )


def _load_crash_chunk_frame(chunk_file):
    path = os.path.join(CRASH_DIR, 'chunks', chunk_file)

    def _read():
        if not os.path.exists(path):
            return None
        chunk_df = pd.read_csv(path, usecols=lambda c: c in CRASH_MAP_COLUMNS)
        chunk_df['Crash_Year'] = pd.to_numeric(chunk_df['Crash_Year'], errors='coerce')
        chunk_df['Crash_Latitude'] = pd.to_numeric(chunk_df['Crash_Latitude'], errors='coerce')
        chunk_df['Crash_Longitude'] = pd.to_numeric(chunk_df['Crash_Longitude'], errors='coerce')
        if 'Count_Casualty_Fatality' in chunk_df.columns:
            chunk_df['Count_Casualty_Fatality'] = pd.to_numeric(
                chunk_df['Count_Casualty_Fatality'], errors='coerce'
            )
        return chunk_df

    return _crash_chunk_frames.get(chunk_file, _read)


def _load_chainage_chunk_frame(chunk_file):
    path = os.path.join(CHAINAGE_DIR, 'chunks', chunk_file)

    def _read():
        if not os.path.exists(path):
            return None
        chunk_df = pd.read_csv(path, usecols=lambda c: c in CHAINAGE_COLUMNS)
        chunk_df['Latitude'] = pd.to_numeric(chunk_df['Latitude'], errors='coerce')
        chunk_df['Longitude'] = pd.to_numeric(chunk_df['Longitude'], errors='coerce')
        chunk_df['Tdist_Start'] = pd.to_numeric(chunk_df['Tdist_Start'], errors='coerce')
        return chunk_df

    return _chainage_chunk_frames.get(chunk_file, _read)


def _parse_bbox_from_request():
    try:
        min_lat = float(request.args.get('min_lat'))
        max_lat = float(request.args.get('max_lat'))
        min_lon = float(request.args.get('min_lon'))
        max_lon = float(request.args.get('max_lon'))
        if min_lat > max_lat or min_lon > max_lon:
            return None
        return {
            'min_lat': min_lat, 'max_lat': max_lat,
            'min_lon': min_lon, 'max_lon': max_lon
        }
    except (TypeError, ValueError):
        return None


def _filter_crash_df(crash_df, min_year, max_year, severities, regions, fatal_only):
    filtered = crash_df[
        crash_df['Crash_Latitude'].notna() & crash_df['Crash_Longitude'].notna()
    ]
    if min_year is not None:
        filtered = filtered[filtered['Crash_Year'] >= min_year]
    if max_year is not None:
        filtered = filtered[filtered['Crash_Year'] <= max_year]
    if severities:
        filtered = filtered[filtered['Crash_Severity'].isin(severities)]
    if regions:
        filtered = filtered[filtered['Loc_Queensland_Transport_Region'].isin(regions)]
    if fatal_only:
        filtered = filtered[
            (filtered['Crash_Severity'] == 'Fatal')
            | (filtered['Count_Casualty_Fatality'].fillna(0) > 0)
        ]
    return filtered


def get_site_points():
    # Get unique site points (first occurrence per SITE_ID)
    site_points = df.groupby('SITE_ID').first().reset_index()
    # Only return relevant columns for the map, including SPEED_LIMIT
    return site_points[['SITE_ID', 'SITE_LATITUDE', 'SITE_LONGITUDE', 'ROAD_NAME', 'DESCRIPTION', 'SPEED_LIMIT']]

@app.route('/api/sites')
def api_sites():
    site_points = get_site_points().replace({np.nan: None})
    districts = df.groupby('SITE_ID')['DISTRICT_ID'].first()
    records = site_points.to_dict(orient='records')
    for record in records:
        record['publishNotes'] = notes_for(record.get('SITE_ID'), districts.get(record.get('SITE_ID')))
    return jsonify(records)

@app.route('/api/site/<int:site_id>')
def api_site(site_id):
    site_data = df[df['SITE_ID'] == site_id].replace({np.nan: None})
    if site_data.empty:
        return jsonify({'error': 'Site not found'}), 404
    records = site_data.to_dict(orient='records')
    district = records[0].get('DISTRICT_ID') if records else None
    notes = notes_for(site_id, district)
    for record in records:
        record['publishNotes'] = notes
    return jsonify(records)

@app.route('/api/site/<int:site_id>/csv')
def api_site_csv(site_id):
    site_data = df[df['SITE_ID'] == site_id]
    if site_data.empty:
        return jsonify({'error': 'Site not found'}), 404
    csv_buffer = io.StringIO()
    site_data.to_csv(csv_buffer, index=False)
    csv_buffer.seek(0)
    return send_file(
        io.BytesIO(csv_buffer.getvalue().encode()),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f'site_{site_id}_data.csv'
    )

@app.route('/api/goldcoast-traffic-counts-csv')
def goldcoast_traffic_counts_csv():
    file_path = os.path.join(os.path.dirname(__file__), 'data', 'Traffic_Count_-2577026452597601357_Goldcoast_20250702.csv')
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    return send_file(file_path, mimetype='text/csv', as_attachment=False)

@app.route('/api/crash-locations/meta')
def api_crash_locations_meta():
    min_zoom = int(request.args.get('min_zoom', 12))
    index_data = load_crash_index()
    if index_data:
        return jsonify({
            'ready': True,
            'source': 'chunks',
            'minZoom': min_zoom,
            'yearMin': index_data['yearMin'],
            'yearMax': index_data['yearMax'],
            'severities': index_data['severities'],
            'regions': index_data['regions'],
            'totalRecords': index_data.get('row_count', 0),
            'chunkCount': len(index_data.get('chunks', [])),
        })
    return jsonify({
        'ready': False,
        'error': 'Crash chunk index missing. Run: python split_crash_locations.py',
        'minZoom': min_zoom,
    }), 503


@app.route('/api/crash-locations')
def api_crash_locations():
    min_zoom = int(request.args.get('min_zoom', 12))
    zoom = float(request.args.get('zoom', 0))
    limit = min(max(int(request.args.get('limit', 30000)), 1000), 50000)
    bbox = _parse_bbox_from_request()
    if bbox is None:
        return jsonify({'error': 'Invalid bbox params.'}), 400

    if zoom < min_zoom:
        return jsonify({
            'points': [],
            'count': 0,
            'returned': 0,
            'truncated': False,
            'requiredZoom': min_zoom,
            'message': f'Zoom in to at least {min_zoom} to load crashes.',
        })

    index_data = load_crash_index()
    if not index_data:
        return jsonify({
            'error': 'Crash chunk index missing. Run: python split_crash_locations.py',
        }), 503

    min_year = request.args.get('min_year', type=int)
    max_year = request.args.get('max_year', type=int)
    severities = [s.strip() for s in request.args.get('severities', '').split(',') if s.strip()]
    regions = [r.strip() for r in request.args.get('regions', '').split(',') if r.strip()]
    fatal_only = request.args.get('fatal_only', 'false').lower() == 'true'

    rows = []
    matching = [c for c in index_data.get('chunks', []) if _bbox_intersects(c['bbox'], bbox)]
    for chunk in matching:
        chunk_df = _load_crash_chunk_frame(chunk['file'])
        if chunk_df is None or chunk_df.empty:
            continue
        in_view = chunk_df[
            (chunk_df['Crash_Latitude'] >= bbox['min_lat']) &
            (chunk_df['Crash_Latitude'] <= bbox['max_lat']) &
            (chunk_df['Crash_Longitude'] >= bbox['min_lon']) &
            (chunk_df['Crash_Longitude'] <= bbox['max_lon'])
        ]
        in_view = _filter_crash_df(
            in_view, min_year, max_year, severities, regions, fatal_only
        )
        if not in_view.empty:
            rows.append(in_view)

    if not rows:
        return jsonify({
            'points': [],
            'count': 0,
            'returned': 0,
            'truncated': False,
            'requiredZoom': min_zoom,
        })

    filtered = pd.concat(rows, ignore_index=True)
    total_matching = len(filtered)
    truncated = total_matching > limit
    if truncated:
        filtered = filtered.head(limit)

    cols = [c for c in CRASH_MAP_COLUMNS if c in filtered.columns]
    points = filtered[cols].replace({np.nan: None}).to_dict(orient='records')
    return jsonify({
        'points': points,
        'count': total_matching,
        'returned': len(points),
        'truncated': truncated,
        'requiredZoom': min_zoom,
    })


@app.route('/api/crash-points')
def api_crash_points():
    import datetime
    years = int(request.args.get('years', 5))
    now = datetime.datetime.now()
    latest_year = now.year if now.month > 6 else now.year - 1  # Assume data up to last full year
    min_year = latest_year - years + 1
    dfs = []
    for y in range(min_year, latest_year + 1):
        file_path = os.path.join(os.path.dirname(__file__), 'data', f'crash_{y}.csv')
        if os.path.exists(file_path):
            df = pd.read_csv(file_path)
            df['Crash_Year'] = y
            dfs.append(df)
    if not dfs:
        return jsonify([])
    df = pd.concat(dfs, ignore_index=True)
    # Only return relevant columns
    cols = [
        'Crash_Ref_Number', 'Crash_Severity', 'Crash_Nature', 'Crash_Type',
        'Crash_Speed_Limit', 'Crash_Hour', 'Crash_Atmospheric_Condition',
        'Crash_Lighting_Condition', 'Crash_Year', 'Crash_Latitude', 'Crash_Longitude'
    ]
    filtered = df[cols]
    filtered = filtered.replace({np.nan: None})
    return jsonify(filtered.to_dict(orient='records'))


@app.route('/api/hourly-volumes/meta')
def api_hourly_volumes_meta():
    try:
        return jsonify(get_hourly_meta())
    except FileNotFoundError as exc:
        return jsonify({'ready': False, 'error': str(exc)}), 404
    except Exception as exc:
        return jsonify({'ready': False, 'error': str(exc)}), 500


@app.route('/api/hourly-volumes/sites')
def api_hourly_volumes_sites():
    try:
        return jsonify(get_hourly_sites())
    except FileNotFoundError as exc:
        return jsonify({'error': str(exc)}), 404
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@app.route('/api/hourly-volumes/site/<int:site_id>')
def api_hourly_volumes_site(site_id):
    direction = request.args.get('direction')
    try:
        profile = get_hourly_site_profile(site_id, direction or None)
    except FileNotFoundError as exc:
        return jsonify({'error': str(exc)}), 404
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500
    if profile is None:
        return jsonify({'error': 'Site not found'}), 404
    return jsonify(profile)


@app.route('/api/chainage/meta')
def api_chainage_meta():
    min_zoom = int(request.args.get('min_zoom', 13))
    index_data = load_chainage_index()
    if index_data:
        return jsonify({
            'ready': True,
            'source': 'chunks',
            'minZoom': min_zoom,
            'chunkCount': len(index_data.get('chunks', [])),
            'totalRows': index_data.get('row_count', 0),
        })

    if not os.path.exists(CHAINAGE_SOURCE_PATH):
        return jsonify({
            'ready': False,
            'error': 'Chainage source CSV not found.',
            'minZoom': min_zoom,
        }), 404

    # Fallback mode is available but not recommended at full state scale.
    row_count = sum(1 for _ in open(CHAINAGE_SOURCE_PATH, encoding='utf-8')) - 1
    return jsonify({
        'ready': True,
        'source': 'single_csv',
        'minZoom': min_zoom,
        'totalRows': max(0, row_count),
        'warning': 'Chunk index missing. Run split_chainage.py for best performance.'
    })


def _chainage_sample_step_km(zoom: float) -> float:
    """Chainage spacing (km) between returned points; coarser when zoomed out."""
    if zoom >= 17:
        return 0.02
    if zoom >= 16:
        return 0.05
    if zoom >= 15:
        return 0.1
    if zoom >= 14:
        return 0.25
    return 0.5


def _chainage_point_limit(zoom: float) -> int:
    if zoom >= 17:
        return 25000
    if zoom >= 16:
        return 15000
    if zoom >= 15:
        return 8000
    if zoom >= 14:
        return 4000
    return 2000


def _thin_chainage_by_zoom(df, zoom: float):
    step = _chainage_sample_step_km(zoom)
    if step <= 0.02:
        return df, step
    tdist = pd.to_numeric(df['Tdist_Start'], errors='coerce')
    bucket = np.round(tdist / step)
    thinned = df.assign(_bucket=bucket)
    thinned = thinned.sort_values(['Road_Section_Id', 'Carriageway_Code', 'Tdist_Start'])
    thinned = thinned.drop_duplicates(
        subset=['Road_Section_Id', 'Carriageway_Code', '_bucket'],
        keep='first'
    )
    return thinned.drop(columns=['_bucket']), step


@app.route('/api/chainage/points')
def api_chainage_points():
    min_zoom = int(request.args.get('min_zoom', 13))
    zoom = float(request.args.get('zoom', 0))
    default_limit = _chainage_point_limit(zoom)
    limit = min(max(int(request.args.get('limit', default_limit)), 500), 60000)
    bbox = _parse_bbox_from_request()
    if bbox is None:
        return jsonify({'error': 'Invalid bbox params.'}), 400

    if zoom < min_zoom:
        return jsonify({
            'points': [],
            'returned': 0,
            'truncated': False,
            'requiredZoom': min_zoom,
            'message': f'Zoom in to at least {min_zoom} to load chainage.'
        })

    rows = []
    index_data = load_chainage_index()
    if index_data:
        chunks = index_data.get('chunks', [])
        matching = [c for c in chunks if _bbox_intersects(c['bbox'], bbox)]
        for chunk in matching:
            chunk_df = _load_chainage_chunk_frame(chunk['file'])
            if chunk_df is None or chunk_df.empty:
                continue
            in_view = chunk_df[
                (chunk_df['Latitude'] >= bbox['min_lat']) &
                (chunk_df['Latitude'] <= bbox['max_lat']) &
                (chunk_df['Longitude'] >= bbox['min_lon']) &
                (chunk_df['Longitude'] <= bbox['max_lon'])
            ]
            if not in_view.empty:
                rows.append(in_view)
    else:
        if not os.path.exists(CHAINAGE_SOURCE_PATH):
            return jsonify({'error': 'Chainage source CSV not found.'}), 404
        full_df = pd.read_csv(CHAINAGE_SOURCE_PATH, usecols=lambda c: c in CHAINAGE_COLUMNS)
        full_df['Latitude'] = pd.to_numeric(full_df['Latitude'], errors='coerce')
        full_df['Longitude'] = pd.to_numeric(full_df['Longitude'], errors='coerce')
        full_df = full_df[
            (full_df['Latitude'] >= bbox['min_lat']) &
            (full_df['Latitude'] <= bbox['max_lat']) &
            (full_df['Longitude'] >= bbox['min_lon']) &
            (full_df['Longitude'] <= bbox['max_lon'])
        ]
        rows.append(full_df)

    if not rows:
        return jsonify({'points': [], 'returned': 0, 'truncated': False, 'requiredZoom': min_zoom})

    df_points = pd.concat(rows, ignore_index=True)
    df_points = df_points.dropna(subset=['Latitude', 'Longitude'])
    total_in_view = len(df_points)
    df_points, sample_step_km = _thin_chainage_by_zoom(df_points, zoom)
    total_after_thin = len(df_points)
    truncated = total_after_thin > limit
    if truncated:
        df_points = df_points.head(limit)

    points = df_points.replace({np.nan: None}).to_dict(orient='records')
    return jsonify({
        'points': points,
        'returned': len(points),
        'totalMatching': total_in_view,
        'totalAfterThin': total_after_thin,
        'truncated': truncated,
        'requiredZoom': min_zoom,
        'sampleStepKm': sample_step_km,
    })


_chainage_sections_cache = None


def _load_chainage_chunks():
    index_data = load_chainage_index()
    if index_data:
        chunks = index_data.get('chunks', [])
        for chunk in chunks:
            chunk_df = _load_chainage_chunk_frame(chunk['file'])
            if chunk_df is not None:
                yield chunk_df
        return
    if os.path.exists(CHAINAGE_SOURCE_PATH):
        yield pd.read_csv(CHAINAGE_SOURCE_PATH, usecols=lambda c: c in CHAINAGE_COLUMNS)


def _build_chainage_sections_cache():
    global _chainage_sections_cache
    if _chainage_sections_cache is not None:
        return _chainage_sections_cache

    sections = {}
    for chunk_df in _load_chainage_chunks():
        if not pd.api.types.is_numeric_dtype(chunk_df['Tdist_Start']):
            chunk_df = chunk_df.assign(Tdist_Start=pd.to_numeric(chunk_df['Tdist_Start'], errors='coerce'))
        grouped = chunk_df.groupby(['Road_Section_Id', 'Carriageway_Code'], dropna=False)
        for (road_id, carriageway), group in grouped:
            key = (str(road_id), str(carriageway))
            desc = str(group['Description'].iloc[0]) if len(group) else ''
            road_name = desc.split('|', 1)[-1].strip() if '|' in desc else desc
            chain_min = float(group['Tdist_Start'].min())
            chain_max = float(group['Tdist_Start'].max())
            if key in sections:
                entry = sections[key]
                entry['chainageMin'] = min(entry['chainageMin'], chain_min)
                entry['chainageMax'] = max(entry['chainageMax'], chain_max)
            else:
                sections[key] = {
                    'roadSectionId': str(road_id),
                    'carriageway': str(carriageway),
                    'description': desc,
                    'roadName': road_name,
                    'chainageMin': chain_min,
                    'chainageMax': chain_max,
                }

    _chainage_sections_cache = list(sections.values())
    return _chainage_sections_cache


def _load_chainage_section_points(road_section_id, carriageway, chainage_min, chainage_max):
    road_section_id = str(road_section_id)
    carriageway = str(carriageway)
    rows = []
    for chunk_df in _load_chainage_chunks():
        road_ids = chunk_df['Road_Section_Id'].astype(str)
        carriageways = chunk_df['Carriageway_Code'].astype(str)
        tdist = chunk_df['Tdist_Start']
        if not pd.api.types.is_numeric_dtype(tdist):
            tdist = pd.to_numeric(tdist, errors='coerce')
        filtered = chunk_df[
            (road_ids == road_section_id) &
            (carriageways == carriageway) &
            (tdist >= chainage_min) &
            (tdist <= chainage_max)
        ]
        if not filtered.empty:
            rows.append(filtered)

    if not rows:
        return pd.DataFrame(columns=CHAINAGE_COLUMNS)

    df_section = pd.concat(rows, ignore_index=True)
    df_section['Latitude'] = pd.to_numeric(df_section['Latitude'], errors='coerce')
    df_section['Longitude'] = pd.to_numeric(df_section['Longitude'], errors='coerce')
    df_section = df_section.dropna(subset=['Latitude', 'Longitude', 'Tdist_Start'])
    return df_section.sort_values('Tdist_Start')


@app.route('/api/chainage/sections/search')
def api_chainage_sections_search():
    query = request.args.get('q', '').strip().lower()
    limit = min(max(int(request.args.get('limit', 20)), 1), 100)
    if len(query) < 2:
        return jsonify({'sections': [], 'message': 'Enter at least 2 characters to search.'})

    sections = _build_chainage_sections_cache()
    matches = []
    for section in sections:
        haystack = ' '.join([
            section['roadSectionId'],
            section['carriageway'],
            section['description'],
            section['roadName'],
        ]).lower()
        if query in haystack:
            matches.append(section)
        if len(matches) >= limit:
            break

    return jsonify({'sections': matches[:limit], 'returned': len(matches[:limit])})


@app.route('/api/chainage/section')
def api_chainage_section():
    road_section_id = request.args.get('road_section_id', '').strip()
    carriageway = request.args.get('carriageway', '').strip()
    if not road_section_id or not carriageway:
        return jsonify({'error': 'road_section_id and carriageway are required.'}), 400

    try:
        chainage_min = float(request.args.get('chainage_min', 0))
        chainage_max = float(request.args.get('chainage_max', 99999))
    except ValueError:
        return jsonify({'error': 'Invalid chainage range.'}), 400

    if chainage_max < chainage_min:
        chainage_min, chainage_max = chainage_max, chainage_min

    df_section = _load_chainage_section_points(
        road_section_id, carriageway, chainage_min, chainage_max
    )
    if df_section.empty:
        return jsonify({
            'points': [],
            'returned': 0,
            'message': 'No chainage points found for this road section and range.'
        })

    description = str(df_section['Description'].iloc[0])
    points = df_section.replace({np.nan: None}).to_dict(orient='records')
    return jsonify({
        'points': points,
        'returned': len(points),
        'roadSectionId': road_section_id,
        'carriageway': carriageway,
        'description': description,
        'chainageMin': float(df_section['Tdist_Start'].min()),
        'chainageMax': float(df_section['Tdist_Start'].max()),
    })


@app.route('/api/oversize-routes.kmz')
def oversize_routes_kmz():
    file_path = os.path.join(os.path.dirname(__file__), 'data', 'Heavy_Vehicle_Routes.kmz')
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    return send_file(file_path, mimetype='application/vnd.google-earth.kmz', as_attachment=False)

@app.route('/api/datasources')
def api_datasources():
    file_path = os.path.join(os.path.dirname(__file__), 'data', 'Datasources.txt')
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    return content, 200, {'Content-Type': 'text/plain; charset=utf-8'}

@app.route('/api/recommendation', methods=['POST'])
def api_recommendation():
    data = request.get_json()
    link = data.get('link', '').strip() if data else ''
    if not link:
        return jsonify({'success': False, 'error': 'No link provided'}), 400
    file_path = os.path.join(os.path.dirname(__file__), 'data', 'Recommendations.txt')
    try:
        with open(file_path, 'a', encoding='utf-8') as f:
            f.write(link + '\n')
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def _load_backend_env():
    """Load optional backend/.env without overwriting existing environment variables."""
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, encoding='utf-8') as env_file:
            for line in env_file:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, value = line.split('=', 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except OSError:
        pass


_load_backend_env()


@app.route('/api/config')
def api_config():
    return jsonify({
        'googleMapsApiKey': os.environ.get('GOOGLE_MAPS_API_KEY', ''),
    })


@app.route('/api/nsw/meta')
def api_nsw_meta():
    try:
        return jsonify(get_nsw_meta())
    except Exception as exc:
        return jsonify({'ready': False, 'error': str(exc)}), 503


@app.route('/api/nsw/stations')
def api_nsw_stations():
    try:
        return jsonify(get_nsw_stations())
    except FileNotFoundError as exc:
        return jsonify({'error': str(exc)}), 503
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@app.route('/api/nsw/station/<int:station_key>')
def api_nsw_station(station_key):
    try:
        station = get_nsw_station(station_key)
    except FileNotFoundError as exc:
        return jsonify({'error': str(exc)}), 503
    if not station:
        return jsonify({'error': 'Station not found'}), 404
    return jsonify(station)


@app.route('/api/nsw/station/<int:station_key>/yearly')
def api_nsw_station_yearly(station_key):
    period = request.args.get('period') or None
    classification = request.args.get('classification') or None
    try:
        profile = get_nsw_yearly_profile(station_key, period=period, classification=classification)
    except FileNotFoundError as exc:
        return jsonify({'error': str(exc)}), 503
    if not profile:
        return jsonify({'error': 'No yearly data for this station'}), 404
    return jsonify(profile)


@app.route('/api/nsw/station/<int:station_key>/hourly')
def api_nsw_station_hourly(station_key):
    classification = request.args.get('classification', type=int)
    traffic_direction = request.args.get('traffic_direction', type=int)
    try:
        profile = get_nsw_hourly_profile(
            station_key,
            classification_seq=classification,
            traffic_direction_seq=traffic_direction,
        )
    except FileNotFoundError as exc:
        return jsonify({'error': str(exc)}), 503
    if not profile:
        return jsonify({'error': 'No hourly sample data for this station'}), 404
    return jsonify(profile)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=1357, debug=True)
