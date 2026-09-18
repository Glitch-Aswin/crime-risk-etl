import numpy as np
import pandas as pd

from inference.clustering import assign_kmeans_tier


def _toy_df():
    # Three well-separated clusters of rate_per_100k within one
    # dataset+crime_category+year group, 3 points each.
    rates = [1.0, 1.1, 0.9, 50.0, 51.0, 49.0, 200.0, 201.0, 199.0]
    return pd.DataFrame(
        {
            "district_code": [str(i) for i in range(len(rates))],
            "dataset": ["women"] * len(rates),
            "crime_category": ["rape"] * len(rates),
            "year": [2020] * len(rates),
            "rate_per_100k": rates,
        }
    )


def test_clusters_ordered_low_medium_high_by_primary_feature():
    out = assign_kmeans_tier(_toy_df(), features=["rate_per_100k"])
    low = out[out["rate_per_100k"] < 10]
    mid = out[(out["rate_per_100k"] >= 10) & (out["rate_per_100k"] < 100)]
    high = out[out["rate_per_100k"] >= 100]
    assert (low["tier"] == "Low").all()
    assert (mid["tier"] == "Medium").all()
    assert (high["tier"] == "High").all()


def test_method_and_score_columns_set():
    out = assign_kmeans_tier(_toy_df(), features=["rate_per_100k"])
    assert (out["method"] == "kmeans").all()
    assert (out["score"] == out["rate_per_100k"]).all()


def test_group_too_small_for_k_gets_null_tier():
    df = _toy_df().iloc[:2].copy()  # only 2 points, k=3 can't be fit
    out = assign_kmeans_tier(df, features=["rate_per_100k"])
    assert out["tier"].isna().all()


def test_non_finite_feature_value_excluded_not_crashing():
    df = _toy_df()
    df["yoy_change_pct"] = 0.0
    df.loc[df.index[0], "yoy_change_pct"] = np.inf
    out = assign_kmeans_tier(df, features=["rate_per_100k", "yoy_change_pct"])
    assert pd.isna(out.loc[out.index[0], "tier"])
    assert out["tier"].notna().sum() == len(df) - 1
