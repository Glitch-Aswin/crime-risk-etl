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
**General IPC crimes has since also been extended through Phase 4**
(reference data, extract, transform, features — not inference/load,
see Phase 1(b) and "Not yet done" below) — both datasets run through the
same pipeline, tagged by a `dataset` column (`women` | `ipc`) so
overlapping crime categories (e.g. `rape`, `dowry_deaths`, which exist in
both source tables) don't get double-counted when combined later.

**Split of work**: Phases 1-4 (reference data, extract, transform,
features) for both datasets were built first. Phase 5 (inference) and
Phase 6 (load) were originally left for a teammate to build, but that
plan changed — **Phases 5 and 6 are now also implemented** (see Phase
plan below), so the whole pipeline (`uv run python -m etl.pipeline`)
runs end to end.

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

Entry point: `uv run python -m etl.pipeline` — runs all five steps and
writes `fact_crime` + `fact_crime_risk` to `warehouse/crime_risk.duckdb`.

## Repo layout

```
config/       settings.yaml — paths, API resource IDs, tiering config
data/raw/     source CSVs + NCRB codebooks (tracked in git)
data/interim/ partially cleaned/reshaped (gitignored)
data/processed/ final tidy tables (gitignored)
etl/          extract.py, transform.py, load.py, pipeline.py (orchestrator)
features/     build_features.py — rate, YoY change, rolling avg
inference/    rule_based.py (quantile tiers), clustering.py (k-means tiers)
reference/    district_crosswalk.csv, crime_category_map.csv,
              district_population_2011.csv (hand-maintained/generated),
              build_population_reference.py (regenerates the population file)
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

Population/census data has since been sourced and joined — see Phase 1
below (Census 2011, matched via a separate name-based crosswalk since its
district codes don't align with NCRB's).

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
- Tiers computed **state-relative**, not on a national scale, for the
  quantile method — baseline crime rates vary structurally by state, so
  comparing a district only against others in its own state is more
  defensible. The k-means method is the deliberate exception: it clusters
  nationally per dataset+crime_category+year, since most individual
  states don't have enough districts in a single year to fit 3 clusters
  meaningfully. The two methods being differently scoped (state-relative
  vs. national) is intentional, not an inconsistency to fix.
- **Natural keys over surrogate IDs** in the warehouse
  (`warehouse/schema.sql`): `district_code`/`crime_category`/`dataset`
  directly on `fact_crime`/`fact_crime_risk`, no `dim_district`/
  `dim_crime_type` tables. Dropped the original Phase 0 surrogate-ID
  design once Phase 5/6 were actually built — at ~12K source rows /
  ~310K post-feature rows, ID-generation bookkeeping didn't earn its
  keep, and those columns are already the stable join keys everywhere
  else in the pipeline.

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
      Still open: the state-wise reconciliation QA check (blocked — see
      below, deferred rather than solved).
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
- [x] **Phase 1(b)/2/3/4 for IPC crimes**: extended the whole pipeline
      (not just reference data) from women-only to also cover general IPC
      crimes, since IPC has the worst schema drift in the project (34
      columns in 2016 vs. 117 in 2017+, e.g. `riots` splits into 15+
      `rioting_*` subtypes) and was worth proving the pattern generalizes.
      Read both IPC codebooks, built 151 category-map rows consolidating
      2017+'s granularity down to canonical categories matching 2016's
      level where the columns are genuinely the same offense (e.g. all
      `rioting_*` subtypes -> `rioting`), while letting categories that
      only exist in one era stay their own canonical bucket rather than
      being force-merged into something legally different (e.g.
      `criminal_misappropriation`, `sexual_harassment`, `affray` have no
      2016 IPC equivalent — 2016 rows for those categories are simply 0/null,
      which is honest, not a bug). Result: 46 canonical IPC categories.
      `etl/extract.py::load_ipc_datasets()` mirrors `load_women_datasets()`.
      Everything else (`reshape_to_long`, `normalize_districts`,
      `normalize_crime_categories`, `join_population`, `build_features`)
      is dataset-agnostic and needed zero changes to work on IPC — good
      sign the Phase 1-4 abstractions were the right shape.
      Added `tests/test_category_map_coverage.py`: a regression test that
      loads every raw column from all 4 datasets and asserts each has a
      category_map entry, so future NCRB schema changes fail loudly in
      tests instead of only at pipeline runtime.

      **Design decision this forced**: several canonical categories exist
      in BOTH the women and IPC tables (`rape`, `dowry_deaths`,
      `human_trafficking`, `assault_on_women`, `cruelty_by_husband_relatives`,
      `insult_to_modesty`) — these are genuinely overlapping-but-not-identical
      NCRB statistics (women-specific breakout vs. broader IPC classification),
      not duplicates to dedupe. Whoever builds Phase 5/6 needs a `dataset`
      column (`women` | `ipc`) in any combined table so these don't get
      silently summed together — tag it when concatenating the two
      datasets' tidy frames, same as `etl/extract.py`'s loaders already
      tag each raw frame by `era`.

- [x] **Phase 5 — Inference**: `etl/transform.py::combine_datasets()`
      concats the women and IPC tidy tables and tags each row `dataset`
      ('women' | 'ipc') *before* concatenation, so the categories that
      genuinely overlap between the two source tables (confirmed via the
      category map: `rape`, `attempt_to_commit_rape`,
      `kidnapping_and_abduction`, `dowry_deaths`, `human_trafficking`,
      `assault_on_women`, `cruelty_by_husband_relatives`,
      `insult_to_modesty`, `abetment_of_suicide`, `acid_attack`,
      `attempt_acid_attack`, `unnatural_offences` — 12 categories, more
      than the original estimate in the Phase 1(b) note above) never get
      silently summed together. Verified: district 502/2017/rape = 43 in
      both `women` and `ipc` rows independently, not 86.

      `inference/rule_based.py::assign_quantile_tier()` — tertile split
      via percentile rank (not `pd.qcut`, which raises on duplicate bin
      edges — common in small or homogeneous state+year+category groups)
      within state+year+crime_category+dataset, state-relative per the
      Decisions log. `inference/clustering.py::assign_kmeans_tier()` —
      k-means (k=3, scaled features) fit per dataset+crime_category+year
      (not state-relative like quantile — most states don't have enough
      districts in a single year to fit 3 meaningful clusters; comparing
      a national clustering method against a state-relative rule-based
      one is itself part of the point of keeping both). Centroids ranked
      by the primary feature (`rate_per_100k`) and mapped to
      Low/Medium/High so labels stay comparable across groups. Both
      methods null out `tier` rather than guess: quantile for missing
      `rate_per_100k`, kmeans for any non-finite feature value (notably
      `yoy_change_pct` is `+inf` when the prior year's rate was exactly
      0) or a group too small to form k clusters.
      `config/settings.yaml`'s `tiering.min_population` (100,000) is now
      applied in `etl/pipeline.py` before either method runs — rows for
      districts below that population are left untiered, since a small
      denominator makes `rate_per_100k` too volatile to tier meaningfully.
      Tests: `tests/test_rule_based.py`, `tests/test_clustering.py`.
- [x] **Phase 6 — Load**: `etl/load.py::load_to_warehouse()` writes a
      dataframe into DuckDB (`CREATE OR REPLACE TABLE ... AS SELECT`),
      applying `warehouse/schema.sql` first so it's safe against a
      missing/fresh `.duckdb` file. **`warehouse/schema.sql` was
      rewritten**: dropped the original `dim_district`/`dim_crime_type`
      surrogate-ID dimension tables in favor of natural keys
      (`district_code`, `crime_category`, `dataset`) directly on
      `fact_crime` and `fact_crime_risk` — the dataset is small (~12K
      rows pre-features, ~310K post-melt across both crime tables) and
      those columns are already the stable keys threaded through the
      whole pipeline, so surrogate-ID generation would add bookkeeping
      without buying anything at this scale. `fact_crime_risk` now also
      carries a `dataset` column. `etl/pipeline.py::run()` is the actual
      entrypoint: builds the women and IPC tidy tables independently,
      combines + tags them, runs `build_features`, filters by
      `min_population`, runs both tiering methods, and writes
      `fact_crime` + `fact_crime_risk`. Verified end to end against the
      real raw data: 311,891 `fact_crime` rows (93,974 women + 217,917
      IPC), 512,650 `fact_crime_risk` rows (256,325 per method). Tests:
      `tests/test_load.py`, plus `tests/test_transform.py`'s new
      `combine_datasets` coverage. 26 tests passing total.

      Note: `uv` wasn't on PATH in the environment this was built in, and
      the system Python was 3.9 (project requires >=3.12) — installed
      `uv` via `brew install uv`, then `uv sync` (which also pulled a
      managed Python 3.12) to actually run the pipeline and test suite
      rather than just eyeballing the code.

- [ ] **Phase 8 — Extend to Crimes Against Children**: not started, not
      currently planned — reassess after Phase 5/6 are done.

- [ ] **Phase 9 — Optional cloud detour**: Databricks/Azure deployment for
      resume purposes per the target JD — do last, only if time allows.

- [ ] **State-wise reconciliation QA check** (originally slotted into
      Phase 4/5, pulled out as its own item): deliberately not done.
      Needs an *independent* state-level totals dataset to check the
      district-level rollup against (data.gov.in's own catalog or
      dataful.in both have the right dataset, but both gate the actual
      download behind client-side JS with no accessible static URL or
      open API found — data.gov.in's own UI says "Catalog API is not
      available" for this resource). Not worth more scraping effort.
      Path forward: either download the state-wise women-crimes CSV
      manually via browser and drop it in `data/raw/`, or get a
      `data.gov.in` API key + the specific resource ID from a logged-in
      dashboard and pull it via `api.data.gov.in/resource/<id>` properly.
      Either unblocks wiring up the actual reconciliation check.

## How to resume work

1. Read this file top to bottom.
2. Check the Phase plan above for the next unchecked item.
3. Check `git log --oneline` for anything done since this file was last updated.
4. Update this file's checkboxes and Decisions log as work progresses —
   keep it current, not just written once.
