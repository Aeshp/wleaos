import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.elexon_client import get_january_2026_forecasts, get_january_2026_actuals
from app.data_processor import process_wind_data

app = FastAPI(
    title="UK Wind Forecast API",
    description="Elexon BMRS data pipeline — WINDFOR forecast vs FUELHH actual outturn.",
)

# Allowed CORS origins are driven by the FRONTEND_URL environment variable so
# that the same image can serve both local development and production without
# rebuilding. When FRONTEND_URL is unset (local dev), all origins are permitted.
# In production, only the deployed frontend origin should be set.
frontend_url = os.getenv("FRONTEND_URL", "*")
origins = [frontend_url] if frontend_url != "*" else ["*"]
if frontend_url != "*" and "http://localhost:5173" not in origins:
    origins.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    """Liveness probe — confirms the API process started successfully."""
    return {"status": "ok", "message": "Elexon Dashboard API is running."}


@app.get("/api/wind-analysis")
def get_wind_analysis():
    """
    Primary endpoint consumed by the React dashboard.

    Orchestrates the full data pipeline:
      1. Fetch raw WINDFOR forecast and FUELHH actual records from Elexon BMRS.
      2. Clean, align, and merge the two datasets via as-of join.
      3. Compute MAE and RMSE error metrics.
      4. Return a chart-ready JSON payload (timeseries + metrics).
    """
    raw_forecasts = get_january_2026_forecasts()
    raw_actuals = get_january_2026_actuals()
    return process_wind_data(raw_forecasts, raw_actuals)