import numpy as np
import pandas as pd

from features.build_features import (
    build_features,
    compute_in_state_rank,
    compute_rolling_average,
    compute_yoy_change,
)


def _toy_df():
    return pd.DataFrame(
        {
            "district_code": ["1", "1", "1", "2", "2"],
            "state_name": ["Kerala"] * 5,
            "crime_category": ["rape"] * 5,
            "year": [2016, 2017, 2018, 2016, 2017],
            "rate_per_100k": [10.0, 20.0, 15.0, 5.0, 5.0],
        }
    )


def test_yoy_change_first_year_is_nan_and_rest_computed():
    out = compute_yoy_change(_toy_df())
    district1 = out[out["district_code"] == "1"].sort_values("year")
    assert pd.isna(district1["yoy_change_pct"].iloc[0])
    assert district1["yoy_change_pct"].iloc[1] == 100.0  # 10 -> 20
    assert district1["yoy_change_pct"].iloc[2] == -25.0  # 20 -> 15


def test_rolling_average_uses_trailing_window_with_min_periods_1():
    out = compute_rolling_average(_toy_df(), window=3)
    district1 = out[out["district_code"] == "1"].sort_values("year")
    assert district1["rolling_3yr_avg"].iloc[0] == 10.0
    assert district1["rolling_3yr_avg"].iloc[1] == 15.0  # mean(10, 20)
    assert district1["rolling_3yr_avg"].iloc[2] == 15.0  # mean(10, 20, 15)


def test_in_state_rank_ranks_within_state_year_category():
    out = compute_in_state_rank(_toy_df())
    year_2016 = out[out["year"] == 2016]
    # district 1 has rate 10 > district 2's rate 5 -> district 1 ranks 1st
    assert year_2016.set_index("district_code")["in_state_rank"]["1"] == 1.0
    assert year_2016.set_index("district_code")["in_state_rank"]["2"] == 2.0


def test_null_rate_propagates_as_null_through_all_features_without_crashing():
    df = _toy_df()
    df.loc[df["district_code"] == "2", "rate_per_100k"] = np.nan
    out = build_features(df)
    district2 = out[out["district_code"] == "2"]
    assert district2["rate_per_100k"].isna().all()
    assert district2["in_state_rank"].isna().all()
