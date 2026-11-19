import os
import math
import pandas as pd
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)

# Apply ProxyFix if behind a reverse proxy (like nginx)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Grid and file config
LAT_GRID_SIZE = 0.05
LON_GRID_SIZE = 0.05
GRID_FOLDER = "grids"
EARTH_RADIUS_KM = 6371  # Earth's radius in kilometers

# --- Logging Configuration ---

# Create logs directory if it doesn't exist
if not os.path.exists('logs'):
    os.makedirs('logs')

# Configure access logging
access_logger = logging.getLogger('access')
access_logger.setLevel(logging.INFO)

# Create file handler for access logs
access_handler = logging.FileHandler('logs/access.log')
access_handler.setLevel(logging.INFO)

# Create formatter for access logs
access_formatter = logging.Formatter(
    '%(asctime)s - %(remote_addr)s - %(method)s %(url)s - %(status_code)s - %(user_agent)s - %(response_time)s ms'
)
access_handler.setFormatter(access_formatter)
access_logger.addHandler(access_handler)

# Configure application logging
app_logger = logging.getLogger('app')
app_logger.setLevel(logging.INFO)

# Create file handler for application logs
app_handler = logging.FileHandler('logs/app.log')
app_handler.setLevel(logging.INFO)

# Create formatter for application logs
app_formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
app_handler.setFormatter(app_formatter)
app_logger.addHandler(app_handler)

# --- Logging Middleware ---

@app.before_request
def log_request_info():
    request.start_time = datetime.now()

@app.after_request
def log_response_info(response):
    # Calculate response time
    if hasattr(request, 'start_time'):
        response_time = (datetime.now() - request.start_time).total_seconds() * 1000
    else:
        response_time = 0
    
    # Get client IP (handles proxies)
    client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
    if client_ip and ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    # Log access information
    access_logger.info('', extra={
        'remote_addr': client_ip,
        'method': request.method,
        'url': request.url,
        'status_code': response.status_code,
        'user_agent': request.headers.get('User-Agent', 'Unknown'),
        'response_time': f"{response_time:.2f}"
    })
    
    return response

# --- Utility Functions ---

def get_grid_index(lat, lon):
    lat_index = math.floor(lat / LAT_GRID_SIZE)
    lon_index = math.floor(lon / LON_GRID_SIZE)
    return lat_index, lon_index

def get_adjacent_keys(lat, lon):
    """Returns grid keys for center + 8 adjacent grid cells"""
    lat_idx, lon_idx = get_grid_index(lat, lon)
    keys = []
    for di in [-1, 0, 1]:
        for dj in [-1, 0, 1]:
            key = f"{lat_idx + di}_{lon_idx + dj}"
            keys.append(key)
    print("Grid keys to check:", keys)
    return keys

def haversine(lat1, lon1, lat2, lon2):
    """Calculate great-circle distance in km between two lat/lon points"""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + \
        math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c

# --- Routes ---

@app.route('/get_nearby_roads', methods=['GET'])
def get_nearby_roads():
    client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
    if client_ip and ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    try:
        user_lat = float(request.args.get('lat'))
        user_lon = float(request.args.get('lon'))
        count = int(request.args.get('count', 1))  # Default to 1 if not provided
        
        # Log the API request with location
        app_logger.info(f"API request from {client_ip} for location: lat={user_lat}, lon={user_lon}, count={count}")
        
    except (TypeError, ValueError):
        app_logger.warning(f"Invalid lat/lon/count parameters from {client_ip}: lat={request.args.get('lat')}, lon={request.args.get('lon')}, count={request.args.get('count')}")
        return jsonify({'error': 'Invalid or missing lat/lon/count'}), 400

    grid_keys = get_adjacent_keys(user_lat, user_lon)

    all_rows = []
    for key in grid_keys:
        grid_file = os.path.join(GRID_FOLDER, f"{key}.csv")
        if os.path.exists(grid_file):
            df = pd.read_csv(grid_file)
            all_rows.append(df)

    if not all_rows:
        app_logger.info(f"No data found for location lat={user_lat}, lon={user_lon} from {client_ip}")
        return jsonify([])

    full_df = pd.concat(all_rows, ignore_index=True)

    # Calculate distance to user location (in kilometers)
    full_df['distance'] = full_df.apply(
        lambda row: haversine(user_lat, user_lon, row['Latitude'], row['Longitude']),
        axis=1
    )

    # Filter points within 100 km
    nearby = full_df[full_df['distance'] <= 100].copy()

    if nearby.empty:
        app_logger.info(f"No nearby roads found within 100km for lat={user_lat}, lon={user_lon} from {client_ip}")
        return jsonify([])

    # Sort by distance ascending
    nearby = nearby.sort_values('distance')

    # Take the requested number of closest points (or all if count is larger than available)
    closest_points = nearby.head(count)

    # Prepare output list
    results = []
    for _, row in closest_points.iterrows():
        item = row.to_dict()
        item['geometry'] = {
            'latitude': item.get('Latitude'),
            'longitude': item.get('Longitude')
        }
        # Replace NaNs with None for JSON compatibility
        for key, value in item.items():
            if pd.isna(value):
                item[key] = None
        results.append(item)

    app_logger.info(f"Returned {len(results)} results for location lat={user_lat}, lon={user_lon} from {client_ip}")
    return jsonify(results)

@app.route('/')
def index():
    client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
    if client_ip and ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    app_logger.info(f"Homepage accessed from {client_ip}")
    return app.send_static_file('index.html')

# --- Error Handlers ---

@app.errorhandler(404)
def not_found(error):
    client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
    if client_ip and ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    app_logger.warning(f"404 error from {client_ip} for URL: {request.url}")
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
    if client_ip and ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    app_logger.error(f"500 error from {client_ip} for URL: {request.url} - Error: {str(error)}")
    return jsonify({'error': 'Internal server error'}), 500

# --- Main Entry Point ---

if __name__ == '__main__':
    app_logger.info("Starting Flask application")
    app.run(host='0.0.0.0', port=8001, debug=True)