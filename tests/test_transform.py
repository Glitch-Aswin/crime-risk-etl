import pandas as pd
import pytest

from etl.transform import (
    normalize_crime_categories,
    normalize_districts,
    reshape_to_long,
)


def test_reshape_to_long_melts_crime_columns_only():
    df = pd.DataFrame(
        {
            "year": [2016],
            "state_name": ["Kerala"],
            "state_code": ["32"],
            "district_name": ["Kollam"],
            "district_code": ["1"],
            "registration_circles": ["Kollam"],
            "era": ["women_2016"],
            "rape": [5],
            "dowry_deaths": [2],
        }
    )
    long_df = reshape_to_long(df)
    assert set(long_df["source_column"]) == {"rape", "dowry_deaths"}
    assert long_df.loc[long_df["source_column"] == "rape", "count"].iloc[0] == 5


def test_normalize_districts_uses_crosswalk_canonical_name():
    df = pd.DataFrame({"district_code": ["376"], "district_name": ["Dantewada"]})
    crosswalk = pd.DataFrame(
        {
            "district_code": ["376"],
            "canonical_name": ["Dakshin Bastar Dantewada"],
        }
    )
    out = normalize_districts(df, crosswalk)
    assert out["canonical_district_name"].iloc[0] == "Dakshin Bastar Dantewada"


def test_normalize_districts_falls_back_to_raw_name_when_code_missing_from_crosswalk():
    df = pd.DataFrame({"district_code": ["999"], "district_name": ["Unknown District"]})
    crosswalk = pd.DataFrame({"district_code": [], "canonical_name": []})
    out = normalize_districts(df, crosswalk)
    assert out["canonical_district_name"].iloc[0] == "Unknown District"


def test_normalize_crime_categories_sums_subcategories_split_across_eras():
    df = pd.DataFrame(
        {
            "district_code": ["502", "502"],
            "canonical_district_name": ["Ananthapuramu", "Ananthapuramu"],
            "state_name": ["Andhra Pradesh", "Andhra Pradesh"],
            "year": [2017, 2017],
            "era": ["women_2017_onwards", "women_2017_onwards"],
            "source_column": ["rape_women_above_18", "rape_girls_below_18"],
            "count": [20, 23],
        }
    )
    category_map = pd.DataFrame(
        {
            "source_column": ["rape_women_above_18", "rape_girls_below_18"],
            "era": ["women_2017_onwards", "women_2017_onwards"],
            "canonical_category": ["rape", "rape"],
        }
    )
    out = normalize_crime_categories(df, category_map)
    assert out["count"].iloc[0] == 43
    assert out["crime_category"].iloc[0] == "rape"


def test_normalize_crime_categories_raises_on_unmapped_column():
    df = pd.DataFrame(
        {
            "district_code": ["1"],
            "canonical_district_name": ["X"],
            "state_name": ["Y"],
            "year": [2016],
            "era": ["women_2016"],
            "source_column": ["totally_unmapped_column"],
            "count": [1],
        }
    )
    category_map = pd.DataFrame(
        {"source_column": [], "era": [], "canonical_category": []}
    )
    with pytest.raises(ValueError, match="no entry in crime_category_map"):
        normalize_crime_categories(df, category_map)
