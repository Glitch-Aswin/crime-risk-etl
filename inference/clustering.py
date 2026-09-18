"""Model-based tiering: k-means (k=3) per crime category, with cluster
centroids sorted by mean rate and mapped to Low/Medium/High post-hoc.

Clustering is fit per (dataset, crime_category, year) group rather than
per (state, year, crime_category) like the quantile method: k-means needs
enough points to find 3 meaningful clusters, and most individual states
don't have enough districts in a single year to support that. Comparing
the two methods' outputs (national clusters vs. state-relative quantiles)
side by side is itself useful signal -- see instructions.md Decisions log.
"""

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

DEFAULT_GROUP_COLS = ["dataset", "crime_category", "year"]
TIER_NAMES = ["Low", "Medium", "High"]


def assign_kmeans_tier(
    df: pd.DataFrame,
    features: list[str],
    group_cols: list[str] | None = None,
    k: int = 3,
    random_state: int = 42,
) -> pd.DataFrame:
    """Assign a Low/Medium/High tier to each row via k-means (k=3) on
    `features`, fit separately within each group_cols group. Centroids are
    ranked by their value on features[0] (ascending) and mapped to
    Low/Medium/High so tier labels stay comparable across groups. Rows
    with any null or non-finite feature value (e.g. yoy_change_pct is
    +inf when the prior year's rate was exactly 0), or belonging to a
    group too small to form k clusters, get a null tier rather than a
    guessed one."""
    if group_cols is None:
        group_cols = [c for c in DEFAULT_GROUP_COLS if c in df.columns]

    out = df.copy()
    out["tier"] = pd.NA
    out["score"] = float("nan")
    out["method"] = "kmeans"

    primary_feature = features[0]

    for _, group_idx in out.groupby(group_cols, dropna=False).groups.items():
        group = out.loc[group_idx]
        finite_mask = np.isfinite(group[features].to_numpy(dtype=float)).all(axis=1)
        valid_idx = group.index[finite_mask]
        if len(valid_idx) < k:
            continue  # not enough points in this group to fit k clusters

        X = out.loc[valid_idx, features].to_numpy()
        X_scaled = StandardScaler().fit_transform(X)
        model = KMeans(n_clusters=k, random_state=random_state, n_init=10)
        labels = model.fit_predict(X_scaled)

        primary_col = features.index(primary_feature)
        centroid_ranks = (
            pd.Series(model.cluster_centers_[:, primary_col])
            .rank(method="first")
            .astype(int)
        )
        label_to_tier = {
            cluster: TIER_NAMES[rank - 1] for cluster, rank in centroid_ranks.items()
        }

        out.loc[valid_idx, "tier"] = [label_to_tier[label] for label in labels]
        out.loc[valid_idx, "score"] = out.loc[valid_idx, primary_feature]

    return out
