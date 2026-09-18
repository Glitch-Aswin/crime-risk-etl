"""Transform stage: reshape wide->long, normalize districts and crime
categories using reference/ crosswalks, join population, compute rates."""

from pathlib import Path

import pandas as pd

from etl.extract import ID_COLUMNS

REFERENCE_DIR = Path(__file__).resolve().parent.parent / "reference"
DISTRICT_CROSSWALK_PATH = REFERENCE_DIR / "district_crosswalk.csv"
CRIME_CATEGORY_MAP_PATH = REFERENCE_DIR / "crime_category_map.csv"


def reshape_to_long(df: pd.DataFrame) -> pd.DataFrame:
    """Melt a wide raw dataframe (one column per crime type, plus id/era
    columns) into long tidy form: one row per
    (district_code, year, era, source_column, count)."""
    id_vars = [c for c in ID_COLUMNS + ["era"] if c in df.columns]
    value_vars = [c for c in df.columns if c not in id_vars]
    long_df = df.melt(
        id_vars=id_vars,
        value_vars=value_vars,
        var_name="source_column",
        value_name="count",
    )
    long_df["count"] = pd.to_numeric(long_df["count"], errors="coerce").fillna(0)
    return long_df


def load_district_crosswalk(path: Path = DISTRICT_CROSSWALK_PATH) -> pd.DataFrame:
    return pd.read_csv(path, dtype={"district_code": str})


def normalize_districts(
    df: pd.DataFrame, crosswalk: pd.DataFrame | None = None
) -> pd.DataFrame:
    """Join in the canonical district name via district_code (the stable
    key across eras -- see reference/district_crosswalk.csv). Rows whose
    district_code has no crosswalk entry are kept but flagged."""
    if crosswalk is None:
        crosswalk = load_district_crosswalk()

    out = df.copy()
    out["district_code"] = out["district_code"].astype(str)

    out = out.merge(
        crosswalk[["district_code", "canonical_name"]],
        on="district_code",
        how="left",
    )
    out["canonical_district_name"] = out["canonical_name"].fillna(
        out["district_name"]
    )
    out = out.drop(columns=["canonical_name"])
    return out


def load_crime_category_map(path: Path = CRIME_CATEGORY_MAP_PATH) -> pd.DataFrame:
    return pd.read_csv(path)


def normalize_crime_categories(
    df: pd.DataFrame, category_map: pd.DataFrame | None = None
) -> pd.DataFrame:
    """Map each (era, source_column) onto a canonical_category using
    reference/crime_category_map.csv, then aggregate counts so that
    subcategories split differently across eras (e.g. rape vs.
    rape_women_above_18 / rape_girls_below_18) become one comparable
    category-count per district-year."""
    if category_map is None:
        category_map = load_crime_category_map()

    merged = df.merge(category_map, on=["source_column", "era"], how="left")

    unmapped = merged[merged["canonical_category"].isna()]
    if not unmapped.empty:
        missing = sorted(
            unmapped[["source_column", "era"]]
            .drop_duplicates()
            .itertuples(index=False, name=None)
        )
        raise ValueError(
            f"{len(missing)} (source_column, era) pairs have no entry in "
            f"crime_category_map.csv: {missing[:10]}"
            + (" ..." if len(missing) > 10 else "")
        )

    group_cols = [
        "district_code",
        "canonical_district_name",
        "state_name",
        "year",
        "canonical_category",
    ]
    group_cols = [c for c in group_cols if c in merged.columns]

    return (
        merged.groupby(group_cols, as_index=False)["count"]
        .sum()
        .rename(columns={"canonical_category": "crime_category"})
    )
