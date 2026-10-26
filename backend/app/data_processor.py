import pandas as pd
import math


def process_wind_data(forecasts: list, actuals: list) -> dict:
    """
    Merges raw Elexon WINDFOR forecast data with FUELHH actual outturn data,
    calculates forecast error metrics, and returns a chart-ready payload.

    The two datasets have incompatible native resolutions:
      - WINDFOR (day-ahead forecast): 1-hour settlement periods.
      - FUELHH  (actual outturn):     30-minute settlement periods.

    A standard inner/outer join on exact timestamps would drop half the actual
    data points (e.g. the 00:30 actual has no matching 00:30 forecast row).
    pd.merge_asof with direction="backward" resolves this by mapping each
    actual timestamp to the most recent preceding forecast timestamp,
    preserving all 30-minute actuals while assigning the correct hourly
    forecast value to each.
    """
    df_forecast = pd.DataFrame(forecasts)
    df_actual = pd.DataFrame(actuals)

    if df_forecast.empty or df_actual.empty:
        return {"timeseries": [], "metrics": {}}

    # 1. Isolate wind generation rows from the multi-fuel FUELHH dataset.
    if 'fuelType' in df_actual.columns:
        df_actual = df_actual[df_actual['fuelType'].str.upper() == 'WIND']

    # 2. Normalise timestamps to UTC-aware datetime objects for safe comparison.
    df_forecast['startTime'] = pd.to_datetime(df_forecast['startTime'])
    df_actual['startTime'] = pd.to_datetime(df_actual['startTime'])

    # 3. Sort and deduplicate — both are mandatory preconditions for merge_asof.
    #    For forecasts, keep the latest publishTime revision per startTime so
    #    the most up-to-date D-1 forecast is used rather than an earlier draft.
    df_actual = df_actual.sort_values('startTime').drop_duplicates(subset=['startTime'])

    if 'publishTime' in df_forecast.columns:
        df_forecast['publishTime'] = pd.to_datetime(df_forecast['publishTime'])
        # Prevent look-ahead data leakage by ensuring only D-1 (day-ahead) forecasts published before delivery day are evaluated
        df_forecast = df_forecast[df_forecast['publishTime'] < df_forecast['startTime'].dt.floor('D')]
        df_forecast = (
            df_forecast
            .sort_values(by=['startTime', 'publishTime'])
            .drop_duplicates(subset=['startTime'], keep='last')
        )
    else:
        df_forecast = df_forecast.sort_values('startTime').drop_duplicates(subset=['startTime'])

    # 4. As-of merge: align each 30-min actual to the closest preceding forecast.
    #    direction="backward" ensures, for example, that the 00:30 actual is
    #    matched to the 00:00 forecast rather than being dropped or misaligned.
    merged_df = pd.merge_asof(
        df_actual[['startTime', 'generation']],
        df_forecast[['startTime', 'generation']],
        on='startTime',
        direction='backward',
        suffixes=('_actual', '_forecast'),
    )

    # Drop any rows where the merge found no matching forecast (e.g. boundary
    # periods outside the WINDFOR publish window).
    merged_df = merged_df.dropna()

    # 5. Calculate forecast error metrics.
    #    error_mw is signed (positive = over-forecast, negative = under-forecast).
    #    absolute_error_mw is used for MAE; squared error_mw is used for RMSE.
    merged_df['error_mw'] = merged_df['generation_forecast'] - merged_df['generation_actual']
    merged_df['absolute_error_mw'] = merged_df['error_mw'].abs()

    mean_absolute_error = merged_df['absolute_error_mw'].mean()
    root_mean_squared_error = math.sqrt((merged_df['error_mw'] ** 2).mean())

    # 6. Serialise timestamps to ISO 8601 strings for JSON transport.
    merged_df['startTime'] = merged_df['startTime'].dt.strftime('%Y-%m-%dT%H:%M:%SZ')

    return {
        "metrics": {
            "mean_absolute_error_mw": round(mean_absolute_error, 2),
            "rmse_mw": round(root_mean_squared_error, 2),
            "total_data_points": len(merged_df),
        },
        "timeseries": merged_df.to_dict(orient='records'),
    }