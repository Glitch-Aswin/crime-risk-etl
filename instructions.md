# crime_ranking — Project Instructions & Progress

Context file for this repo. Read this first when resuming work — it tracks
what we're building, why, the phase plan, and what's actually done vs. still
open, so work can pick up without re-deriving decisions already made.

## What we're building

An end-to-end ETL + inference pipeline over NCRB (National Crime Records
Bureau) district-wise crime data from data.gov.in. It ingests raw crime
CSVs, normalizes them into a clean warehouse, and classifies every
(district, year, crime category) into a risk tier — Low / Medium / High —
using both a rule-based method and a k-means model, stored side by side for
comparison.

Primary dataset: **Crimes Against Women**, district-wise (chosen over
general IPC crimes and Crimes Against Children — see Decisions Log).
General IPC crimes data is also in-repo and will be added as a later phase.

Full project brief (background/rationale): `docs/district_crime_risk_tiering.pdf`

## Architecture

```
1. Extract   -> read raw CSVs (data/raw), scripted so it's repeatable
2. Transform -> reshape wide -> tidy long format
                normalize district names (district_code as stable join key)
                normalize crime-type labels across the two schema eras
                join population data -> compute rate per 100k
3. Feature   -> YoY % change, 3-year rolling average, in-state rank
4. Classify  -> tier assignment: rule-based quantiles, then k-means
5. Load      -> DuckDB warehouse (star schema, see warehouse/schema.sql)
```

Entry point (once built): `python -m etl.pipeline`

## Repo layout

```
config/       settings.yaml — paths, API resource IDs, tiering config
data/raw/     source CSVs + NCRB codebooks (tracked in git)
data/interim/ partially cleaned/reshaped (gitignored)
data/processed/ final tidy tables (gitignored)
etl/          extract.py, transform.py, load.py, pipeline.py (orchestrator)
features/     build_features.py — rate, YoY change, rolling avg
inference/    rule_based.py (quantile tiers), clustering.py (k-means tiers)
reference/    district_crosswalk.csv, crime_category_map.csv (hand-maintained)
warehouse/    schema.sql (DDL), crime_risk.duckdb (gitignored, generated)
tests/        unit tests per module
notebooks/    exploration only — never authoritative pipeline logic
docs/         project brief PDF
```

## Data sources on hand

In `data/raw/`, already downloaded:
- `districtwise-crime-against-women-2016.csv` (818 rows, 1 year) + codebook
- `districtwise-crime-against-women-2017-onwards.csv` (5,323 rows, multi-year) + codebook
- `districtwise-ipc-crimes-2016.csv` (818 rows, 1 year) + codebook
- `districtwise-ipc-crimes-2017-onwards.csv` (5,323 rows, multi-year) + codebook

**Confirmed schema drift** (not hypothetical — verified in the raw files):
- Women crimes: 2016 has ~19 crime columns; 2017+ has ~38, split finer by
  victim age (e.g. `rape_women_above_18` / `rape_girls_below_18` where 2016
  had a single column for the concept).
- IPC crimes: 2016 has ~35 columns; 2017+ has 130+ (e.g. `rioting` splits
  into 15+ subtypes like `rioting_communal_religious`, `rioting_caste_conflict`).
- District names drift too: district_code `502` is `Anantapur` in the 2016
  file, `Ananthapuramu` in 2017+. Same code, different spelling — confirmed
  row 1 of both files. **`district_code` is the stable join key, not name.**

Still needed: population/census data (for rate-per-100k), not yet pulled.

## Decisions log

- **DuckDB + Python**, not Databricks/Spark — dataset is ~12K rows, fits
  comfortably in memory; Spark would hide the ETL mechanics we're trying to
  practice. May add a small Databricks Community Edition "cloud deployment"
  detour later since it's a listed plus for a target job description, but
  only after the core pipeline is solid.
- **District-wise**, not state-wise, as the primary grain — state-wise
  (~36 rows) is too coarse to tier meaningfully; district-wise (~700+ rows)
  gives real distributional spread. State-wise totals will be used only as
  a reconciliation/QA check against aggregated district counts.
- **Crimes Against Women** chosen as the first crime-type dataset — focused
  category count, high interpretability, stronger YoY signal than general
  IPC crimes, avoids the worst of the cross-category schema sprawl.
- **Two tiering methods stored side by side** (`method` column in
  `fact_crime_risk`: `quantile` vs `kmeans`) rather than picking one, so
  results can be compared rather than committing early.
- Tiers computed **state-relative**, not on a national scale — baseline
  crime rates vary structurally by state, so comparing a district only
  against others in its own state is more defensible.

## Phase plan

- [x] **Phase 0 — Setup**: repo created, raw data sourced and committed,
      folder scaffolding in place (this commit).
- [ ] **Phase 1 — Reference data**: read the 4 codebooks and build out
      `reference/crime_category_map.csv` in full (currently has only a
      handful of example rows). Build out `reference/district_crosswalk.csv`
      beyond the one confirmed example — verify whether `district_code` is
      reliably stable across *all* rows/years or if more exceptions exist.
      Source and add population/census data per district-year.
- [ ] **Phase 2 — Extract**: implement `etl/extract.py` to load raw CSVs
      (and later, pull live from the data.gov.in API instead of static files).
- [ ] **Phase 3 — Transform**: implement `etl/transform.py` — reshape to
      long format, apply category map and district crosswalk, join
      population, compute rate_per_100k. Validate: aggregated district
      counts should reconcile with any available state-wise totals.
- [ ] **Phase 4 — Feature engineering**: implement `features/build_features.py`
      — YoY change, 3-year rolling average, in-state rank.
- [ ] **Phase 5 — Inference**: implement `inference/rule_based.py` (quantile
      tiers) first, validate output, then `inference/clustering.py` (k-means),
      remembering to sort cluster centroids by mean rate before mapping to
      Low/Medium/High (cluster IDs are unordered by default).
- [ ] **Phase 6 — Load**: implement `etl/load.py`, wire up `etl/pipeline.py`
      as the single `python -m etl.pipeline` entrypoint, create
      `warehouse/crime_risk.duckdb` from `warehouse/schema.sql`.
- [ ] **Phase 7 — Tests**: unit tests per module in `tests/`.
- [ ] **Phase 8 — Extend**: repeat the pipeline for Crimes Against Children,
      then general IPC crimes (highest schema-drift pain, saved for last).
- [ ] **Phase 9 — Optional cloud detour**: port the load layer to Databricks
      Community Edition or Azure, for portfolio purposes.

## How to resume work

1. Read this file top to bottom.
2. Check the Phase plan above for the next unchecked item.
3. Check `git log --oneline` for anything done since this file was last updated.
4. Update this file's checkboxes and Decisions log as work progresses —
   keep it current, not just written once.
