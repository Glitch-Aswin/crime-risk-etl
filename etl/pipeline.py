"""Single entrypoint: extract -> transform -> feature -> infer -> load.

Run with: python -m etl.pipeline
"""

from pathlib import Path
from typing import Callable

import pandas as pd
import yaml

from etl.extract import load_population, load_women_datasets, load_ipc_datasets
from etl.load import load_to_warehouse
from etl.transform import (
    combine_datasets,
    join_population,
    load_crime_category_map,
    load_district_crosswalk,
    normalize_crime_categories,
    normalize_districts,
    reshape_to_long,
)
from features.build_features import build_features
from inference.clustering import assign_kmeans_tier
from inference.rule_based import assign_quantile_tier

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SETTINGS_PATH = PROJECT_ROOT / "config" / "settings.yaml"

# The features k-means clusters on. rate_per_100k must be first: both
# tiering methods rank/score off it (see inference/rule_based.py and
# inference/clustering.py) so their outputs stay comparable.
KMEANS_FEATURES = ["rate_per_100k", "yoy_change_pct", "rolling_3yr_avg"]


def load_settings(path: Path = SETTINGS_PATH) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def build_tidy_table(
    loader_fn: Callable[[], list[pd.DataFrame]],
    crosswalk: pd.DataFrame,
    category_map: pd.DataFrame,
    population: pd.DataFrame,
) -> pd.DataFrame:
    """Extract + transform one dataset (women or ipc) end to end: load its
    per-era wide frames, reshape each to long, concat, normalize districts
    and crime categories, join population. Kept dataset-agnostic so it
    works for both loaders unchanged (see instructions.md Phase 1(b))."""
    wide_dfs = loader_fn()
    long_df = pd.concat([reshape_to_long(df) for df in wide_dfs], ignore_index=True)
    long_df = normalize_districts(long_df, crosswalk)
    tidy = normalize_crime_categories(long_df, category_map)
    tidy = join_population(tidy, population)
    return tidy


def run() -> None:
    settings = load_settings()
    paths = settings["paths"]
    tiering_cfg = settings["tiering"]
    min_population = tiering_cfg["min_population"]

    crosswalk = load_district_crosswalk(PROJECT_ROOT / paths["district_crosswalk"])
    category_map = load_crime_category_map(PROJECT_ROOT / paths["crime_category_map"])
    population = load_population(PROJECT_ROOT / paths["district_population"])

    women_tidy = build_tidy_table(load_women_datasets, crosswalk, category_map, population)
    ipc_tidy = build_tidy_table(load_ipc_datasets, crosswalk, category_map, population)
    combined = combine_datasets(women_tidy, ipc_tidy)

    featured = build_features(combined)

    # Rate-based tiering is unreliable for very small population denominators
    # (see config/settings.yaml tiering.min_population); rows below the
    # threshold, or with no population match at all, are left untiered.
    tierable = featured[featured["population_2011"] >= min_population].copy()

    quantile_risk = assign_quantile_tier(tierable)
    kmeans_risk = assign_kmeans_tier(tierable, features=KMEANS_FEATURES)

    risk_cols = [
        "district_code",
        "state_name",
        "year",
        "dataset",
        "crime_category",
        "method",
        "tier",
        "score",
    ]
    combined_risk = pd.concat(
        [quantile_risk[risk_cols], kmeans_risk[risk_cols]], ignore_index=True
    )

    db_path = str(PROJECT_ROOT / paths["warehouse_db"])
    load_to_warehouse(featured, "fact_crime", db_path)
    load_to_warehouse(combined_risk, "fact_crime_risk", db_path)


if __name__ == "__main__":
    run()
