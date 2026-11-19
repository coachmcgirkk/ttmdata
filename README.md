# AADT Traffic Data Visualisation

React map frontend + Flask API backend.

## Prerequisites

- Node.js 18+ and npm
- Python 3.10+

## Data (required after server transfer)

Copy the `data` folder from the old server into `backend/data/`. At minimum you need:

- `traffic_data.csv` — required; backend will not start without it

Optional files for full map features:

- `Traffic_Count_-2577026452597601357_Goldcoast_20250702.csv`
- `crash_YYYY.csv` (one per year)
- `Heavy_Vehicle_Routes.kmz`
- `Datasources.txt`
- `Recommendations.txt` (created automatically when users submit links)

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

API runs at http://localhost:1357

## Frontend (development)

```bash
cd frontend
npm install --legacy-peer-deps
npm start
```

UI at http://localhost:3001 (proxies `/api` to port 1357). Port is set in `frontend/.env`.

NSW traffic page: http://localhost:3001/nsw — requires the TfNSW CSVs under `backend/data/nsw/` (see that folder’s README).

## Production build

```bash
cd frontend
npm run build
```

Serve `frontend/build` with a static server; proxy `/api` to the Flask app.
