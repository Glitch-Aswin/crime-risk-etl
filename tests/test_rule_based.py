import numpy as np
import pandas as pd

from inference.rule_based import assign_quantile_tier


def _toy_df():
    # 6 districts in one state+year+category+dataset group -> clean tertiles
    return pd.DataFrame(
        {
            "district_code": ["1", "2", "3", "4", "5", "6"],
            "state_name": ["Kerala"] * 6,
            "year": [2020] * 6,
            "crime_category": ["rape"] * 6,
            "dataset": ["women"] * 6,
            "rate_per_100k": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
        }
    )


def test_assigns_low_medium_high_within_group():
    out = assign_quantile_tier(_toy_df())
    tiers = out.sort_values("rate_per_100k")["tier"].tolist()
    assert tiers == ["Low", "Low", "Medium", "Medium", "High", "High"]


def test_method_and_score_columns_set():
    out = assign_quantile_tier(_toy_df())
    assert (out["method"] == "quantile").all()
    assert (out["score"] == out["rate_per_100k"]).all()


def test_null_rate_gets_null_tier():
    df = _toy_df()
    df.loc[df["district_code"] == "1", "rate_per_100k"] = np.nan
    out = assign_quantile_tier(df)
    row = out[out["district_code"] == "1"].iloc[0]
    assert pd.isna(row["tier"])


def test_separate_groups_tiered_independently():
    df = _toy_df()
    other_state = _toy_df()
    other_state["state_name"] = "Tamil Nadu"
    other_state["rate_per_100k"] = [100.0, 200.0, 300.0, 400.0, 500.0, 600.0]
    combined = pd.concat([df, other_state], ignore_index=True)
    out = assign_quantile_tier(combined)
    # lowest rate in each state should be tiered "Low" independently of the
    # other state's absolute scale
    kerala_low = out[(out["state_name"] == "Kerala") & (out["rate_per_100k"] == 1.0)]
    tn_low = out[(out["state_name"] == "Tamil Nadu") & (out["rate_per_100k"] == 100.0)]
    assert kerala_low["tier"].iloc[0] == "Low"
    assert tn_low["tier"].iloc[0] == "Low"
