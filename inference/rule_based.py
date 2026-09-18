"""Rule-based tiering: quantile split (tertiles) within state+year+category.

Tiers are computed state-relative, not on a national scale -- baseline
crime rates vary structurally by state, so comparing a district only
against others in its own state is more defensible (see instructions.md
Decisions log). Percentile rank is used instead of pd.qcut because many
state+year+category groups are small or have duplicate rate values, which
makes qcut raise on non-unique bin edges; rank-based percentiles handle
ties gracefully via averaging.
"""

import pandas as pd

DEFAULT_GROUP_COLS = ["state_name", "year", "crime_category", "dataset"]
TIER_NAMES = ["Low", "Medium", "High"]


def assign_quantile_tier(
    df: pd.DataFrame,
    value_col: str = "rate_per_100k",
    group_cols: list[str] | None = None,
) -> pd.DataFrame:
    """Assign a Low/Medium/High tier to each row by splitting value_col
    into tertiles within each group_cols group (default: state+year+
    crime_category+dataset). Rows with a null value_col (e.g. no
    population match) get a null tier rather than a guessed one."""
    if group_cols is None:
        group_cols = [c for c in DEFAULT_GROUP_COLS if c in df.columns]

    out = df.copy()
    valid = out[value_col].notna()

    pct_rank = out.loc[valid].groupby(group_cols)[value_col].rank(
        pct=True, method="average"
    )

    def tier_from_pct(p: float) -> str:
        if p <= 1 / 3:
            return TIER_NAMES[0]
        if p <= 2 / 3:
            return TIER_NAMES[1]
        return TIER_NAMES[2]

    out["tier"] = pd.NA
    out.loc[valid, "tier"] = pct_rank.map(tier_from_pct)
    out["method"] = "quantile"
    out["score"] = out[value_col]
    return out
