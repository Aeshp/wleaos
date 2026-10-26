# UK Wind Generation Forecast vs. Actual Dashboard

A full-stack data engineering tool for UK energy market analysis. Ingests raw
wind generation data directly from the **Elexon BMRS API**, resolves a
structural temporal mismatch between two datasets, and delivers an interactive
time-series dashboard with quantified forecast accuracy metrics.

---

**Live Frontend (Vercel):** [https://aerogrid-frontend.vercel.app/](https://aerogrid-frontend.vercel.app/)  
**Live Backend API (Vercel):** [https://aerogrid-backend.vercel.app/](https://aerogrid-backend.vercel.app/) — Interactive Swagger docs: [/docs](https://aerogrid-backend.vercel.app/docs)

---

## Project Overview & Business Value

UK grid operators and energy traders rely on day-ahead **WINDFOR** forecasts
published by National Grid ESO to schedule dispatch, arrange balancing
contracts, and manage financial exposure to imbalance charges. When those
forecasts deviate materially from the **FUELHH** actual outturn recorded by
Elexon, the financial consequences are significant.

This dashboard provides a structured, quantitative view of that forecast
accuracy for the full month of January 2026. It:

- Fetches both the **WINDFOR** (day-ahead wind forecast) and **FUELHH**
  (half-hourly fuel mix actuals) datasets directly from the Elexon BMRS API.
- Resolves a fundamental temporal resolution mismatch between the two datasets
  (explained below) to produce a clean, aligned time-series.
- Calculates **Mean Absolute Error (MAE)** and **Root Mean Squared Error
  (RMSE)** in MW across the entire month and per individual settlement day.
- Presents the results as an interactive chart, filterable by day, with a
  precise Elexon-aligned tooltip locked to the `Europe/London` timezone.

The result is a tool that helps utilities quantify how much financial risk
their forecasting model is generating, down to the 30-minute settlement
period level.

---

## Key Engineering Implementations & Problems Solved

### 1. Elexon API Request Chunking

**Problem:** The Elexon BMRS `/stream` endpoints enforce a hard maximum date
range per request (approximately 7 days). A single request covering all of
January 2026 returns `400 Bad Request` with no data.

**Solution:** The `get_date_chunks()` generator in `elexon_client.py`
transparently partitions any target date range into sequential 7-day windows.
Both `get_january_2026_forecasts()` and `get_january_2026_actuals()` loop over
these chunks and accumulate a single unified list, making the API limit
invisible to the rest of the pipeline.

```python
# Yields ("2026-01-01", "2026-01-07"), ("2026-01-08", "2026-01-14"), ...
for start, end in get_date_chunks("2026-01-01", "2026-01-31"):
    all_data.extend(fetch_elexon_data(URL, params))
```

---

### 2. Temporal Resolution Alignment via `merge_asof`

**Problem:** The two core datasets have incompatible native resolutions:

| Dataset | Source   | Resolution        |
|---------|----------|-------------------|
| WINDFOR | Forecast | 1-hour periods    |
| FUELHH  | Actuals  | 30-minute periods |

A standard inner join on `startTime` would silently discard 50% of the actual
data — every odd half-hour period (e.g., `00:30`, `01:30`) has no matching
forecast row and would be dropped.

**Solution:** `data_processor.py` uses `pd.merge_asof(direction="backward")`,
which maps each actual timestamp to the most recent *preceding* forecast
timestamp. The `00:30` actual is correctly matched to the `00:00` forecast;
the `01:30` actual maps to `01:00`, and so on. All 30-minute actuals are
preserved without fabricating forecast data.

```python
merged_df = pd.merge_asof(
    df_actual[['startTime', 'generation']],
    df_forecast[['startTime', 'generation']],
    on='startTime',
    direction='backward',   # 00:30 actual -> 00:00 forecast
    suffixes=('_actual', '_forecast'),
)
```

Additionally, because Elexon occasionally publishes multiple revisions of the
same forecast period, the pipeline retains only the **latest `publishTime`
revision** per `startTime`, ensuring the most current D-1 forecast is used in
all error calculations.

---

### 3. Timezone Enforcement (`Europe/London`)

**Problem:** UK grid settlement periods are defined in `Europe/London` local
time, which includes GMT/BST transitions. Rendering timestamps using the
viewer's browser locale would misalign chart labels with actual settlement
period boundaries, particularly during daylight saving changeovers.

**Solution:** The React dashboard explicitly passes `timeZone: 'Europe/London'`
to every `toLocaleString` / `toLocaleDateString` / `toLocaleTimeString` call
in both the `formatTime` X-axis formatter and the Recharts `<Tooltip>`
`labelFormatter`. The browser's local offset is intentionally never applied.

---

## Directory Structure

```
Gridbriks/
│
├── backend/                         # FastAPI data pipeline
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI app, CORS config, /api/wind-analysis endpoint
│   │   ├── elexon_client.py         # Elexon BMRS API client with chunked date-range fetching
│   │   └── data_processor.py        # Pandas pipeline: filter, align, merge_asof, MAE/RMSE
│   ├── .env                         # Local environment variables (git-ignored)
│   ├── .env.example                 # Committed variable template for new contributors
│   ├── Dockerfile                   # Python 3.12-slim image; dynamic $PORT for cloud platforms
│   ├── docker-compose.yml           # Local container orchestration for the API service
│   └── requirements.txt             # Pinned Python dependencies
│
├── frontend/                        # React 19 + Vite dashboard
│   ├── src/
│   │   ├── components/
│   │   │   └── Dashboard.jsx        # Main dashboard: fetch, filter, chart, MAE/RMSE display
│   │   ├── App.jsx                  # Root component
│   │   ├── App.css                  # Design system: tokens, layout, components, dark/light theme
│   │   ├── index.css                # Global CSS resets and font imports
│   │   └── main.jsx                 # React DOM entry point
│   ├── .env                         # Local environment variables (git-ignored)
│   ├── .env.example                 # Committed variable template for new contributors
│   ├── .gitignore
│   ├── index.html                   # Vite HTML shell with SEO meta tags
│   ├── package.json
│   └── vite.config.js               # Vite build configuration
│
├── .gitignore                       # Monorepo root: Python, Node, .env, OS, and IDE files
└── README.md
```

---

## Local Setup & Execution

### Prerequisites

- **Python** >= 3.12
- **Node.js** >= 20 and **npm** >= 10
- **Docker** (optional, for containerised backend)

---

### Backend (FastAPI + Uvicorn)

#### macOS / Linux

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Create and activate a Python virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install pinned dependencies
pip install -r requirements.txt

# 4. Configure environment variables
cp .env.example .env
# Edit .env if your frontend runs on a port other than 5173

# 5. Start the development server
uvicorn app.main:app --reload --port 8000
```

#### Windows

```powershell
# 1. Navigate to the backend directory
cd backend

# 2. Create and activate a Python virtual environment
python -m venv venv
venv\Scripts\activate

# 3. Install pinned dependencies
pip install -r requirements.txt

# 4. Configure environment variables
copy .env.example .env
# Edit .env if your frontend runs on a port other than 5173

# 5. Start the development server
uvicorn app.main:app --reload --port 8000
```

The API is now available at `http://localhost:8000`.  
Interactive Swagger docs: `http://localhost:8000/docs`

**Alternatively, run the containerised backend (see Docker section below).**

---

### Frontend (React + Vite)

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Install Node dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Ensure VITE_API_URL points to your running backend instance

# 4. Start the Vite development server
npm run dev
```

The dashboard is now available at `http://localhost:5173`.

---

## Docker Setup

A `docker-compose.yml` is included in the `backend/` directory for running the
API in a containerised environment. The universal command is the same across all
platforms:

```bash
cd backend
docker compose up --build
```

### macOS

**Prerequisite:** [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) must be installed and running.

```bash
cd backend
docker compose up --build
```

### Linux

**Prerequisite:** [Docker Engine](https://docs.docker.com/engine/install/) (and optionally Docker Compose plugin) must be installed. No Docker Desktop required.

```bash
cd backend
docker compose up --build
```

### Windows

**Prerequisite:** [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) must be installed and running (WSL 2 backend recommended).

```powershell
cd backend
docker compose up --build
```

---

## Tech Stack

| Layer      | Technology                                     |
|------------|------------------------------------------------|
| Frontend   | React 19, Vite 8, Recharts 3, Vanilla CSS      |
| Backend    | Python 3.12, FastAPI 0.162, Uvicorn 0.54       |
| Data       | Pandas 3.1, NumPy 2.5                          |
| API Source | Elexon BMRS REST API (`/stream` endpoints)     |
| Deployment | Vercel (Frontend & Backend Serverless), Docker supported |

---

## API Reference

| Method | Endpoint             | Description                                                              |
|--------|----------------------|--------------------------------------------------------------------------|
| `GET`  | `/`                  | Liveness probe — returns `{"status": "ok"}`                              |
| `GET`  | `/api/wind-analysis` | Full pipeline: fetch -> align -> merge -> returns timeseries and metrics  |

### Sample Response — `/api/wind-analysis`

```json
{
  "metrics": {
    "mean_absolute_error_mw": 412.87,
    "rmse_mw": 598.31,
    "total_data_points": 1488
  },
  "timeseries": [
    {
      "startTime": "2026-01-01T00:00:00Z",
      "generation_actual": 5120.0,
      "generation_forecast": 5480.0,
      "error_mw": 360.0,
      "absolute_error_mw": 360.0
    }
  ]
}
```

---

## AI Assistance Disclosure

AI tools were utilized for bug patching, UI refinement, and diagnosing the raw
data structures of the Elexon BMRS API. The core frontend dashboard logic,
backend data processing architecture, and Elexon client integration were
manually planned and written.
