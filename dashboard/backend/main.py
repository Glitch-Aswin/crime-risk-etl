"""FastAPI backend for the crime-risk dashboard.

Reads directly from the DuckDB warehouse produced by `etl.pipeline`
(warehouse/crime_risk.duckdb) -- no separate copy of the data, this is a
thin read layer over fact_crime / fact_crime_risk. A fresh read-only
connection is opened per request rather than shared, since DuckDB
connections aren't meant to be used concurrently across threads and
uvicorn's threadpool can call sync handlers from multiple threads.
"""

from contextlib import contextmanager
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

DB_PATH = Path(__file__).resolve().parent.parent.parent / "warehouse" / "crime_risk.duckdb"


def records(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> JSON-safe list of dicts. NaN/+-inf (both real
    possibilities here -- e.g. yoy_change_pct is +inf when a district's
    prior-year rate was 0, tier/rate can be NaN for unmatched population)
    aren't valid JSON and must become null, not crash the response. The
    notnull mask must be computed *after* the inf->NaN replacement (an
    inf cell reads as "not null" before that swap), otherwise those cells
    survive as bare NaN instead of becoming None."""
    clean = df.replace([np.inf, -np.inf], np.nan)
    return clean.astype(object).where(pd.notnull(clean), None).to_dict(orient="records")

app = FastAPI(title="Crime Risk Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # vite dev server
    allow_methods=["GET"],
    allow_headers=["*"],
)


@contextmanager
def get_con():
    con = duckdb.connect(str(DB_PATH), read_only=True)
    try:
        yield con
    finally:
        con.close()


@app.get("/api/meta")
def get_meta():
    """Filter options for the frontend: crime categories, years, states,
    datasets, methods."""
    with get_con() as con:
        crime_categories = [
            r[0]
            for r in con.execute(
                "SELECT DISTINCT crime_category FROM fact_crime ORDER BY 1"
            ).fetchall()
        ]
        years = [
            r[0] for r in con.execute("SELECT DISTINCT year FROM fact_crime ORDER BY 1").fetchall()
        ]
        states = [
            r[0]
            for r in con.execute(
                "SELECT DISTINCT state_name FROM fact_crime ORDER BY 1"
            ).fetchall()
        ]
    return {
        "crime_categories": crime_categories,
        "years": years,
        "states": states,
        "datasets": ["women", "ipc"],
        "methods": ["quantile", "kmeans"],
    }


@app.get("/api/rankings")
def get_rankings(
    crime_category: str,
    year: int,
    dataset: str,
    method: str = "quantile",
    state: str | None = None,
):
    """Districts ranked by rate_per_100k for one crime_category/year/
    dataset, with their assigned tier from the given method."""
    query = """
        SELECT
            r.district_code,
            c.canonical_district_name,
            r.state_name,
            r.tier,
            c.rate_per_100k,
            c.count,
            c.yoy_change_pct,
            c.in_state_rank
        FROM fact_crime_risk r
        JOIN fact_crime c
            ON r.district_code = c.district_code
            AND r.year = c.year
            AND r.dataset = c.dataset
            AND r.crime_category = c.crime_category
        WHERE r.crime_category = ?
            AND r.year = ?
            AND r.dataset = ?
            AND r.method = ?
    """
    params = [crime_category, year, dataset, method]
    if state:
        query += " AND r.state_name = ?"
        params.append(state)
    query += " ORDER BY c.rate_per_100k DESC NULLS LAST"

    with get_con() as con:
        df = con.execute(query, params).df()
    return records(df)


@app.get("/api/districts/{district_code}")
def get_district(district_code: str):
    """Full profile for one district: every crime_category/year/dataset
    row from fact_crime (for trend charts) plus every tier assignment
    from fact_crime_risk (for the current-tier summary)."""
    with get_con() as con:
        crime = con.execute(
            "SELECT * FROM fact_crime WHERE district_code = ? ORDER BY dataset, crime_category, year",
            [district_code],
        ).df()
        risk = con.execute(
            "SELECT * FROM fact_crime_risk WHERE district_code = ? ORDER BY dataset, crime_category, year, method",
            [district_code],
        ).df()

    if crime.empty:
        raise HTTPException(status_code=404, detail=f"No data for district_code {district_code!r}")

    return {
        "canonical_district_name": crime["canonical_district_name"].iloc[0],
        "state_name": crime["state_name"].iloc[0],
        "crime": records(crime),
        "risk": records(risk),
    }


@app.get("/api/compare")
def compare_methods(
    crime_category: str,
    year: int,
    dataset: str,
    state: str | None = None,
):
    """Quantile vs k-means tier for the same district/crime/year/dataset,
    side by side, so agreement/disagreement between the two methods is
    visible directly."""
    query = """
        SELECT
            q.district_code,
            c.canonical_district_name,
            q.state_name,
            q.tier AS quantile_tier,
            k.tier AS kmeans_tier,
            c.rate_per_100k
        FROM
            (SELECT * FROM fact_crime_risk
             WHERE method = 'quantile' AND crime_category = ? AND year = ? AND dataset = ?) q
        JOIN
            (SELECT * FROM fact_crime_risk
             WHERE method = 'kmeans' AND crime_category = ? AND year = ? AND dataset = ?) k
            ON q.district_code = k.district_code
        JOIN fact_crime c
            ON c.district_code = q.district_code
            AND c.year = q.year AND c.dataset = q.dataset AND c.crime_category = q.crime_category
    """
    params = [crime_category, year, dataset, crime_category, year, dataset]
    if state:
        query += " WHERE q.state_name = ?"
        params.append(state)
    query += " ORDER BY c.rate_per_100k DESC NULLS LAST"

    with get_con() as con:
        df = con.execute(query, params).df()
    return records(df)
