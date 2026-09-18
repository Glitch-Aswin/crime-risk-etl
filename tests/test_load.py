import duckdb
import pandas as pd

from etl.load import load_to_warehouse


def test_load_to_warehouse_writes_fact_crime(tmp_path):
    df = pd.DataFrame(
        {
            "district_code": ["1"],
            "canonical_district_name": ["Anantnag"],
            "state_name": ["Jammu And Kashmir"],
            "year": [2020],
            "dataset": ["women"],
            "crime_category": ["rape"],
            "count": [5],
            "population_2011": [1_000_000],
            "rate_per_100k": [0.5],
            "yoy_change_pct": [None],
            "rolling_3yr_avg": [0.5],
            "in_state_rank": [1.0],
        }
    )
    db_path = str(tmp_path / "test.duckdb")
    load_to_warehouse(df, "fact_crime", db_path)

    con = duckdb.connect(db_path)
    result = con.execute("SELECT * FROM fact_crime").df()
    con.close()
    assert len(result) == 1
    assert result["crime_category"].iloc[0] == "rape"


def test_load_to_warehouse_replaces_existing_table(tmp_path):
    db_path = str(tmp_path / "test.duckdb")
    df1 = pd.DataFrame({"district_code": ["1"], "state_name": ["A"], "year": [2020],
                         "dataset": ["women"], "crime_category": ["rape"],
                         "method": ["quantile"], "tier": ["Low"], "score": [1.0]})
    df2 = pd.DataFrame({"district_code": ["2"], "state_name": ["B"], "year": [2021],
                         "dataset": ["ipc"], "crime_category": ["theft"],
                         "method": ["kmeans"], "tier": ["High"], "score": [9.0]})

    load_to_warehouse(df1, "fact_crime_risk", db_path)
    load_to_warehouse(df2, "fact_crime_risk", db_path)

    con = duckdb.connect(db_path)
    result = con.execute("SELECT * FROM fact_crime_risk").df()
    con.close()
    assert len(result) == 1
    assert result["district_code"].iloc[0] == "2"
