import requests
from fastapi import HTTPException
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# Elexon BMRS /stream endpoints return the full dataset as a flat JSON array,
# avoiding the pagination overhead of the standard endpoints.
WINDFOR_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream"
FUELHH_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream"


def fetch_elexon_data(url: str, params: dict) -> list:
    """
    Makes a single HTTP GET request to an Elexon BMRS /stream endpoint.
    Raises an HTTP 502 upstream error if the Elexon API is unreachable or
    returns a non-2xx status, preventing silent data gaps.
    """
    try:
        response = requests.get(url, params=params, timeout=20)
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, list) else data.get("data", [])
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch data from {url}: {str(e)}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Elexon error payload: {e.response.text}")
        raise HTTPException(status_code=502, detail=f"Elexon API error: {str(e)}")


def get_date_chunks(start_date: str, end_date: str, chunk_days: int = 7):
    """
    Yields (chunk_start, chunk_end) date string pairs covering the full
    [start_date, end_date] range in increments of `chunk_days`.

    Chunking is required because the Elexon BMRS API enforces a hard maximum
    date range per request (typically 7 days). Requesting January in a single
    call would result in a 400 Bad Request. This generator transparently
    partitions the range so callers can loop without knowing the API limit.
    """
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")

    current = start
    while current <= end:
        chunk_end = current + timedelta(days=chunk_days - 1)
        if chunk_end > end:
            chunk_end = end
        yield current.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d")
        current = chunk_end + timedelta(days=1)


def get_january_2026_forecasts() -> list:
    """
    Retrieves all WINDFOR (day-ahead wind generation forecast) records for
    January 2026. The fetch window starts on 2025-12-31 because WINDFOR
    records are keyed by publishDateTime — the D-1 forecast for 2026-01-01
    is published on 2025-12-31.
    """
    all_data = []
    for start, end in get_date_chunks("2025-12-31", "2026-01-31"):
        params = {
            "publishDateTimeFrom": f"{start}T00:00:00Z",
            "publishDateTimeTo": f"{end}T23:59:59Z",
        }
        all_data.extend(fetch_elexon_data(WINDFOR_URL, params))
    return all_data


def get_january_2026_actuals() -> list:
    """
    Retrieves all FUELHH (half-hourly fuel mix actuals) records for
    January 2026. FUELHH is keyed by settlementDate, so the window
    aligns exactly with the calendar month.
    """
    all_data = []
    for start, end in get_date_chunks("2026-01-01", "2026-01-31"):
        params = {
            "settlementDateFrom": start,
            "settlementDateTo": end,
        }
        all_data.extend(fetch_elexon_data(FUELHH_URL, params))
    return all_data