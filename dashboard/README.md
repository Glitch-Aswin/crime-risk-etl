# Dashboard

A read-only web UI over the `warehouse/crime_risk.duckdb` output of
`etl.pipeline` — three views: district rankings (filterable/sortable),
a per-district drill-down with a rate-over-time trend chart, and a
quantile-vs-k-means method comparison.

Run `uv run python -m etl.pipeline` from the repo root first so the
warehouse file exists.

## Backend (FastAPI, reads DuckDB directly)

```bash
cd .. # repo root, if not already there
uv run uvicorn dashboard.backend.main:app --reload --port 8000
```

Endpoints: `/api/meta`, `/api/rankings`, `/api/districts/{district_code}`,
`/api/compare`. See `dashboard/backend/main.py` docstrings for params.

## Frontend (React + Vite)

```bash
cd dashboard/frontend
npm install   # first time only
npm run dev
```

Opens on `http://localhost:5173`, expects the backend on
`http://localhost:8000` (see `src/api.js`).

## Status

v1: rankings, district drill-down, method comparison. No map yet — that
needs district-level GeoJSON boundaries matched to `district_code`,
which is a separate sourcing problem not yet solved (tracked as v2).
