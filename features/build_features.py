"""Feature engineering: YoY change, rolling average, in-state rank, computed
per (district, crime_category), on top of the tidy table produced by
etl/transform.py (which already has rate_per_100k from join_population()).

Expects a dataframe with at least:
  district_code, canonical_district_name, state_name, year,
  crime_category, count, rate_per_100k
"""

import pandas as pd

GROUP_KEY = ["district_code", "crime_category"]


def compute_yoy_change(df: pd.DataFrame, value_col: str = "rate_per_100k") -> pd.DataFrame:
    """Year-over-year % change in value_col, per district-crime_category.
    First year for each group is NaN (no prior year to compare against).
    Districts with a null value_col (no population match) stay null."""
    out = df.sort_values(GROUP_KEY + ["year"]).copy()
    out["yoy_change_pct"] = out.groupby(GROUP_KEY)[value_col].pct_change() * 100
    return out


def compute_rolling_average(
    df: pd.DataFrame, value_col: str = "rate_per_100k", window: int = 3
) -> pd.DataFrame:
    """Rolling mean of value_col over the trailing `window` years (inclusive
    of the current year), per district-crime_category. Uses min_periods=1
    so early years (fewer than `window` prior years available) still get a
    value instead of NaN -- callers relying on a "full window" guarantee
    should filter on year separately."""
    out = df.sort_values(GROUP_KEY + ["year"]).copy()
    out[f"rolling_{window}yr_avg"] = out.groupby(GROUP_KEY)[value_col].transform(
        lambda s: s.rolling(window=window, min_periods=1).mean()
    )
    return out


def compute_in_state_rank(df: pd.DataFrame, value_col: str = "rate_per_100k") -> pd.DataFrame:
    """Rank each district within its own state, per year-crime_category,
    by value_col (1 = highest rate = riskiest). Computed state-relative,
    not nationally, per the project's tiering decision (see
    instructions.md Decisions log). Districts with a null value_col are
    left unranked (NaN) rather than assigned a rank."""
    out = df.copy()
    out["in_state_rank"] = out.groupby(["state_name", "year", "crime_category"])[
        value_col
    ].rank(method="min", ascending=False)
    return out


def build_features(df: pd.DataFrame, window: int = 3) -> pd.DataFrame:
    """Run the full feature set in one call: YoY change -> rolling average
    -> in-state rank."""
    out = compute_yoy_change(df)
    out = compute_rolling_average(out, window=window)
    out = compute_in_state_rank(out)
    return out
