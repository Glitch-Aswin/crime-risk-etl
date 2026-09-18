# Phase 5/6 Build Log — Inference & Load

Record of what came up while implementing Phase 5 (inference) and Phase 6
(load), completing the pipeline that `instructions.md` had left at Phase 4.
Each entry: the problem hit, the action taken, and why.

## 1. instructions.md said this work belonged to a teammate

**Problem**: `instructions.md` explicitly stated Phase 5/6 were
intentionally left unimplemented for a teammate to build, with a direct
instruction: "do not extend past Phase 4 in this part of the repo without
checking first."

**Action**: Paused before writing any Phase 5/6 code and asked the user
to confirm whether that split still applied.

**Reason**: A durable, explicit instruction file overriding a task
request is exactly the kind of thing that should be confirmed rather than
silently overridden or silently obeyed — the file could reflect a real
team arrangement that a one-off request shouldn't unilaterally change.
The user confirmed the split no longer applied and to build it all.

## 2. Women and IPC datasets share crime categories — double-count risk

**Problem**: The Crimes Against Women and IPC Crimes source tables both
report several of the *same* offenses (`rape`, `attempt_to_commit_rape`,
`kidnapping_and_abduction`, `dowry_deaths`, `human_trafficking`,
`assault_on_women`, `cruelty_by_husband_relatives`, `insult_to_modesty`,
`abetment_of_suicide`, `acid_attack`, `attempt_acid_attack`,
`unnatural_offences` — 12 categories, confirmed by cross-referencing
`reference/crime_category_map.csv`). Naively concatenating both tidy
tables and grouping by `(district, year, crime_category)` would silently
sum these into a doubled count (e.g. district 502/2017/rape: 43 + 43 = 86
instead of two distinct 43s).

**Action**: Added `etl/transform.py::combine_datasets()`, which tags each
dataset's rows with a `dataset` column (`women` | `ipc`) *before*
concatenating, so the two datasets' rows for the same category never land
in the same downstream group.

**Reason**: This was flagged as a known risk in `instructions.md` itself
("Whoever builds Phase 5/6 needs a `dataset` column... so these don't get
silently summed together") — the design decision was already made, this
just implements it. Verified directly: querying the loaded warehouse for
district 502/2017/rape returns two rows (43 count each, tagged `women`
and `ipc`), not one merged row.

## 3. `pd.qcut` raises on duplicate/small quantile groups

**Problem**: The initial approach for quantile tiering used
`pd.qcut(..., 3)` to split each state+year+crime_category group into
tertiles. Many real groups are small (a handful of districts) or have
duplicate rate values, which makes `qcut` raise `ValueError: Bin edges
must be unique` — this would have crashed the pipeline on real data.

**Action**: Switched to percentile-rank-based tiering: rank
`rate_per_100k` within each group as a percentile (0–1, ties averaged),
then bucket at the 1/3 and 2/3 thresholds.

**Reason**: Percentile rank handles ties and small groups gracefully
where `qcut`'s bin-edge approach doesn't, without changing the actual
tiering semantics (still a tertile split).

## 4. K-means needs more points than a single state+year group has

**Problem**: The original docstring/plan for `inference/clustering.py`
didn't specify a grouping. Fitting k-means (k=3) per
state+year+crime_category — matching the quantile method's grouping —
would fail or produce meaningless clusters for most states, since many
states don't have 3+ districts reporting a given crime in a given year.

**Action**: Grouped k-means fitting by `dataset + crime_category + year`
(national, not state-relative) instead of state-relative like the
quantile method.

**Reason**: K-means needs enough data points to find real structure;
national grouping gives it hundreds of districts to work with. This also
turns the two methods being differently scoped (state-relative vs.
national) into a deliberate point of comparison rather than an
inconsistency — documented as such in `instructions.md`'s Decisions log.

## 5. `+inf` values crashed `StandardScaler`/`KMeans`

**Problem**: Running the full pipeline threw
`ValueError: Input X contains infinity or a value too large for dtype('float64')`
inside `assign_kmeans_tier`. Cause: `yoy_change_pct` (year-over-year %
change) is `+inf` whenever a district's prior-year rate was exactly 0 and
the current year's rate is nonzero (`pct_change` from a 0 baseline).

**Action**: Replaced the `.notna()` validity check with `np.isfinite(...)`
across all clustering feature columns, so rows with `+inf` (or `-inf`,
`NaN`) get excluded from that group's clustering and receive a null tier,
rather than crashing the whole run.

**Reason**: A crash on real data (as opposed to synthetic test data) is
the actual failure mode this needed to survive — zero-baseline years are
common enough in a district/crime/year table this sparse that this had
to be handled, not special-cased away.

## 6. Import error: functions imported from the wrong module

**Problem**: `etl/pipeline.py` initially imported `load_crime_category_map`
and `load_district_crosswalk` from `etl.extract`, but both actually live
in `etl.transform`. First pipeline run failed immediately with
`ImportError: cannot import name 'load_crime_category_map' from
'etl.extract'`.

**Action**: Fixed the import statement to pull both from `etl.transform`.

**Reason**: Straightforward mistake caught immediately by actually running
the pipeline rather than only reading the code — reinforced the need to
execute end to end rather than trust that imports line up.

## 7. `warehouse/schema.sql` didn't match the pipeline's actual shape

**Problem**: The original Phase 0 schema used surrogate integer IDs
(`dim_district`, `dim_crime_type` lookup tables) and had no `dataset`
column — it assumed a women-only, ID-keyed design that never matched what
Phases 1–4 actually produced (natural keys like `district_code` and
`crime_category` throughout, no ID-generation step anywhere).

**Action**: Rewrote `warehouse/schema.sql` to drop the dimension tables
and put natural keys (`district_code`, `crime_category`, `dataset`)
directly on `fact_crime` and `fact_crime_risk`.

**Reason**: `instructions.md` explicitly flagged this as open ("worth
revisiting once the combined-table shape is decided, not necessarily
taking it as fixed"). At this data scale (~12K raw rows, ~310K after
melting into long format), generating and maintaining surrogate IDs would
add bookkeeping without a real benefit — matches the project's existing
stated preference (DuckDB + Python over Spark) for not over-engineering
past what the data size justifies.

## 8. `tiering.min_population` config existed but was never applied

**Problem**: `config/settings.yaml` had a `tiering.min_population: 100000`
setting (intended to exclude small-population districts from rate-based
tiering, since a small denominator makes `rate_per_100k` too volatile to
be meaningful), but nothing in the codebase read or applied it.

**Action**: Added a filter step in `etl/pipeline.py::run()` that excludes
rows below `min_population` (and rows with no population match at all)
before either tiering method runs.

**Reason**: The config value already existed and stated its own intent —
implementing it was completing a decision that had been made but not
wired up, not introducing a new one.

## 9. `uv` not installed, system Python too old to run the project

**Problem**: The project requires Python ≥3.12 and uses `uv` for
dependency management, but the environment had no `uv` on `PATH` and the
system Python was 3.9. Every verification attempt (`uv run pytest`,
`uv run python -m etl.pipeline`) failed at the shell level before any
project code even ran.

**Action**: Installed `uv` via `brew install uv`, then ran `uv sync`,
which pulled a managed Python 3.12.14 and created `.venv` automatically.

**Reason**: Without a working interpreter, the only option would have
been to hand back code that was never actually executed — reading code
doesn't catch things like the import error in #6 or the `+inf` crash in
#5. Installing the project's own already-declared tool (`uv`, per
`instructions.md`'s Decisions log) via a standard, reversible package
manager was the direct way to be able to verify rather than assume.

## 10. "Nothing came out" after running the pipeline

**Problem**: The user ran `uv run python -m etl.pipeline` and got no
visible output, which read as a failure.

**Action**: Confirmed this was expected — the pipeline has no `print`
statements by design, and its actual output is the `warehouse/crime_risk.duckdb`
file, not terminal text. Verified the file existed, was recently
modified, and queried it directly to show real row counts (311,891
`fact_crime` rows, 512,650 `fact_crime_risk` rows) and sample data.

**Reason**: A silent success and a silent failure look identical from the
terminal alone; querying the actual output was the only way to
distinguish them and reassure the user the run had, in fact, worked.

## Summary of what shipped

| Area | File | What changed |
|---|---|---|
| Combine + tag | `etl/transform.py` | `combine_datasets()` |
| Quantile tiering | `inference/rule_based.py` | `assign_quantile_tier()` |
| K-means tiering | `inference/clustering.py` | `assign_kmeans_tier()` |
| Warehouse write | `etl/load.py` | `load_to_warehouse()` |
| Schema | `warehouse/schema.sql` | Natural keys, `dataset` column |
| Orchestration | `etl/pipeline.py` | Real `run()`, config-driven |
| Tests | `tests/test_rule_based.py`, `tests/test_clustering.py`, `tests/test_load.py`, `tests/test_transform.py` | 13 new/updated tests, 26 total passing |

Verified end to end against the real raw data and pushed to
`origin/main` (commit `aa261a0`).
