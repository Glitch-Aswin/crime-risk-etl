"""Load stage: write tidy tables into the DuckDB warehouse, and optionally
as Delta tables when running on Databricks."""

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


def load_to_delta(df: pd.DataFrame, table_name: str, target: str, spark=None) -> None:
    """Overwrite Delta table `<target>.<table_name>` with `df`, where target
    is "catalog.schema" (e.g. "workspace.default"). Needs a Spark session,
    so it only works inside a Databricks notebook/job process; pyspark is
    imported lazily so local runs never need it. Pass `spark` explicitly
    to override session lookup (used by tests)."""
    if spark is None:
        from pyspark.sql import SparkSession

        spark = SparkSession.getActiveSession() or SparkSession.builder.getOrCreate()
    (
        spark.createDataFrame(df)
        .write.format("delta")
        .mode("overwrite")
        .option("overwriteSchema", "true")
        .saveAsTable(f"{target}.{table_name}")
    )
