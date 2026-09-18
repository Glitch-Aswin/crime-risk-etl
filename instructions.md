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

- **uv** for dependency/env management, not pip — `pyproject.toml` + `uv.lock`
  are the source of truth; use `uv add <pkg>` to add dependencies and
  `uv run <cmd>` to execute within the project's environment.
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
- [x] **Phase 1 — Reference data** (women dataset only): read both women
      codebooks (2016, 2017-onwards) and built out
      `reference/crime_category_map.csv` in full — 19 canonical categories
      for 2016, mapped alongside the finer 2017+ split (e.g.
      `rape_women_above_18` + `rape_girls_below_18` -> `rape`). Built
      `reference/district_crosswalk.csv` programmatically from the raw data
      (754 districts): 70 codes new post-2017, 24 spelling changes across
      eras, 3 codes with >1 name even within the 2017+ era alone, 3 codes
      only in 2016. `district_code` confirmed as the stable join key.
      Population sourced separately (see below) since it's a bigger job
      than a simple crosswalk edit. Still open: equivalent reference data
      for IPC crimes (larger schema-drift problem, 130+ columns in 2017+).

      **Population (Census 2011)**: pulled `india-districts-census-2011.csv`
      (640 districts) from a mirrored GitHub copy of the census dataset,
      saved to `data/raw/`. Its district codes do **not** match NCRB's
      `district_code` scheme at all (verified: Anantapur is `502` in NCRB,
      `553` in this census file) -- population had to be joined by
      normalized (state, district) *name* instead, a separate matching
      problem from the NCRB-to-NCRB crosswalk. Built
      `reference/build_population_reference.py`, a three-pass matcher:
      (1) exact normalized name match, (2) state-alias match (handles
      Odisha/Orissa, Puducherry/Pondicherry, Delhi/NCT of Delhi, and
      Telangana -- which didn't exist as a separate state in the 2011
      census, matched against undivided Andhra Pradesh), (3) fuzzy name
      match (difflib, cutoff 0.72) within the resolved state. Result:
      509 exact + 49 state-alias + 57 fuzzy = 615/754 districts matched
      (81.6%). The 139 unmatched are districts created *after* 2011 (no
      population figure can legitimately exist for them yet) -- left as
      null rather than guessed; `join_population()` in `etl/transform.py`
      produces a null `rate_per_100k` for these rather than silently
      dropping or estimating them. Output written to
      `reference/district_population_2011.csv`.
      Caveat to remember for Phase 5 (tiering): rate-based tiers will
      simply exclude the ~18% of districts with no population figure --
      worth calling out explicitly in any write-up, not hidden.
- [x] **Phase 2 — Extract**: `etl/extract.py` implemented — loads the two
      women-crimes CSVs, drops the row-id column, tags each with an `era`.
      Kept as separate wide dataframes per era (not concatenated) since
      concatenating before reshaping would fabricate
      (source_column, era) pairs via NaN-filling — reshape happens
      per-era in transform.py instead. Still using static local CSVs, not
      yet pulling live from the data.gov.in API.
- [x] **Phase 3 — Transform** (women dataset only): `etl/transform.py`
      implemented — `reshape_to_long`, `normalize_districts` (crosswalk
      join on district_code, falls back to raw name if code unmatched),
      `normalize_crime_categories` (maps + sums subcategories to canonical
      categories, raises loudly on any unmapped source_column/era pair).
      Verified against raw data: district 502 (Ananthapuramu) 2017 rape =
      43, correctly summed across *two* registration_circles rows plus the
      age-split rape columns — confirms aggregation handles the
      multi-row-per-district-year case, not just the multi-column case.
      `join_population()` added and verified: district 502/2017/rape =
      43 count, population 4,081,148 -> rate_per_100k ≈ 1.05.
      9 unit tests passing (`tests/test_extract.py`, `tests/test_transform.py`).
      Still open: the state-wise reconciliation QA check (Phase 4/5), and
      YoY/rolling-average feature engineering (Phase 4).
- [x] **Phase 4 — Feature engineering**: implemented `features/build_features.py`
      on top of the population-joined tidy table from Phase 3 —
      `compute_yoy_change` (% change per district-crime_category, first
      year NaN), `compute_rolling_average` (trailing window, min_periods=1
      so early years still get a value), `compute_in_state_rank` (rank
      within state+year+crime_category, 1 = highest rate = riskiest —
      state-relative per the Decisions log, not national). `build_features()`
      composes all three. Verified nulls propagate correctly end-to-end:
      the ~18% of districts with no population match (Phase 3) get NaN for
      rate/YoY/rolling/rank rather than a crash or a fabricated value.
      4 unit tests added (`tests/test_build_features.py`), 13 total passing.
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
