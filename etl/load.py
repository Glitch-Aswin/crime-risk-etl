"""Load stage: write tidy tables into the DuckDB warehouse."""

from pathlib import Path

import duckdb
import pandas as pd

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "warehouse" / "schema.sql"


def load_to_warehouse(df: pd.DataFrame, table_name: str, db_path: str) -> None:
    """Replace `table_name` in the DuckDB warehouse at db_path with `df`.
    Ensures the warehouse schema (warehouse/schema.sql) exists first, so
    this is safe to call against a fresh or missing .duckdb file."""
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(db_path)
    try:
        con.execute(SCHEMA_PATH.read_text())
        con.register("df_view", df)
        con.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM df_view")
        con.unregister("df_view")
    finally:
        con.close()
