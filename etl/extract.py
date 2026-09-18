"""Extract stage: load raw CSVs from data/raw into dataframes.

Only 'crimes against women' datasets are wired up so far (the primary
dataset per instructions.md). IPC crimes will be added the same way once
that phase starts.
"""

from pathlib import Path

import pandas as pd

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

DATASETS = {
    "women_2016": "districtwise-crime-against-women-2016.csv",
    "women_2017_onwards": "districtwise-crime-against-women-2017-onwards.csv",
    "ipc_2016": "districtwise-ipc-crimes-2016.csv",
    "ipc_2017_onwards": "districtwise-ipc-crimes-2017-onwards.csv",
}

# Identifier columns present in every raw file, as opposed to crime-count columns.
ID_COLUMNS = [
    "year",
    "state_name",
    "state_code",
    "district_name",
    "district_code",
    "registration_circles",
]


def load_raw_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path)


def load_dataset(name: str, raw_dir: Path = RAW_DIR) -> pd.DataFrame:
    """Load one raw dataset by its era key (see DATASETS) and tag it with
    an 'era' column so downstream steps know which crime_category_map /
    district_crosswalk rows apply."""
    if name not in DATASETS:
        raise ValueError(f"Unknown dataset '{name}'. Known: {list(DATASETS)}")
    df = load_raw_csv(raw_dir / DATASETS[name])
    df = df.drop(columns=["id"], errors="ignore")  # row identifier, not a crime column
    df["era"] = name
    return df


def load_women_datasets(raw_dir: Path = RAW_DIR) -> list[pd.DataFrame]:
    """Load both crimes-against-women eras (2016 + 2017-onwards) as
    separate wide dataframes. Kept separate (not concatenated) because the
    two eras have different column sets -- concatenating before reshaping
    would fabricate (source_column, era) pairs that never existed in the
    raw data via NaN-filling. Reshape each one with transform.reshape_to_long
    individually, then concat the resulting long frames."""
    return [
        load_dataset("women_2016", raw_dir),
        load_dataset("women_2017_onwards", raw_dir),
    ]
