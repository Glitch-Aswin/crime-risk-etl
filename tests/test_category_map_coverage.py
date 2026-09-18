"""Regression test: every crime column in every raw dataset must have an
entry in reference/crime_category_map.csv. This is what
normalize_crime_categories() enforces at runtime (it raises on any
unmapped column) -- this test catches it at CI time instead of only when
someone happens to run the pipeline on that era."""

from etl.extract import DATASETS, ID_COLUMNS, load_dataset
from etl.transform import load_crime_category_map


def test_every_raw_crime_column_has_a_category_map_entry():
    category_map = load_crime_category_map()
    mapped = set(zip(category_map["source_column"], category_map["era"]))

    missing = []
    for era in DATASETS:
        df = load_dataset(era)
        crime_columns = [c for c in df.columns if c not in ID_COLUMNS + ["era"]]
        for col in crime_columns:
            if (col, era) not in mapped:
                missing.append((col, era))

    assert not missing, f"{len(missing)} raw columns missing from crime_category_map.csv: {missing}"
