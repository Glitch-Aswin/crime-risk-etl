"""One-off build script: matches NCRB district_crosswalk.csv districts to
Census 2011 population figures and writes reference/district_population_2011.csv.

Census 2011 predates many NCRB district codes (districts get split/renamed
over time), so this can't be a simple key join -- it's matched by
normalized (state, district) name in three passes:

  1. exact match on normalized state + district name
  2. state-alias match (handles renamed/merged states/UTs: Odisha/Orissa,
     Telangana/undivided Andhra Pradesh in 2011, Puducherry/Pondicherry,
     Delhi/NCT of Delhi, the merged Dadra & Nagar Haveli + Daman & Diu UT)
  3. fuzzy name match within the resolved state candidates (difflib,
     cutoff=0.72), for spelling variants pass 1/2 don't catch

Districts still unmatched after all three passes are genuinely districts
created after the 2011 census (carved out of a parent district) -- no 2011
population figure exists for them. They're written out with population_2011
left null rather than guessed, so downstream code must explicitly decide
how to handle them (e.g. exclude from rate-based tiering, or later add a
manual parent-district mapping as an approximation).

Run with: uv run python -m reference.build_population_reference
"""

import difflib
import re
from pathlib import Path

import pandas as pd

REFERENCE_DIR = Path(__file__).resolve().parent
RAW_DIR = REFERENCE_DIR.parent / "data" / "raw"

CROSSWALK_PATH = REFERENCE_DIR / "district_crosswalk.csv"
CENSUS_PATH = RAW_DIR / "india-districts-census-2011.csv"
OUTPUT_PATH = REFERENCE_DIR / "district_population_2011.csv"

STATE_ALIASES = {
    "ODISHA": "ORISSA",
    "DELHI": "NCTOFDELHI",
    "PUDUCHERRY": "PONDICHERRY",
    "TELANGANA": "ANDHRAPRADESH",  # Telangana didn't exist as a state in Census 2011
}
MULTI_STATE_ALIASES = {
    "THEDADRAANDNAGARHAVELIANDDAMANANDDIU": ["DADRAANDNAGARHAVELI", "DAMANANDDIU"],
}


def norm(value) -> str | None:
    if pd.isna(value):
        return None
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())


def resolve_state_candidates(state_norm: str) -> list[str]:
    if state_norm in MULTI_STATE_ALIASES:
        return MULTI_STATE_ALIASES[state_norm]
    if state_norm in STATE_ALIASES:
        return [STATE_ALIASES[state_norm]]
    return [state_norm]


def build() -> pd.DataFrame:
    cross = pd.read_csv(CROSSWALK_PATH, dtype={"district_code": str})
    census = pd.read_csv(CENSUS_PATH)

    cross = pd.concat(
        [
            cross,
            cross["state_name"].map(norm).rename("state_norm"),
            cross["canonical_name"].map(norm).rename("name_norm"),
        ],
        axis=1,
    )
    census = pd.concat(
        [
            census,
            census["State name"].map(norm).rename("state_norm"),
            census["District name"].map(norm).rename("name_norm"),
        ],
        axis=1,
    )

    # pass 1: exact state + exact name
    merged = cross.merge(
        census[["state_norm", "name_norm", "Population"]],
        on=["state_norm", "name_norm"],
        how="left",
    )
    matched = merged[merged["Population"].notna()].copy()
    matched["match_method"] = "exact"
    unmatched = merged[merged["Population"].isna()].drop(columns="Population")

    # pass 2: state-alias + exact name
    pass2_rows, still_unmatched = [], []
    for _, row in unmatched.iterrows():
        candidates = resolve_state_candidates(row["state_norm"])
        hit = census[
            census["state_norm"].isin(candidates) & (census["name_norm"] == row["name_norm"])
        ]
        if len(hit):
            r = row.to_dict()
            r["Population"] = hit.iloc[0]["Population"]
            r["match_method"] = "state_alias"
            pass2_rows.append(r)
        else:
            still_unmatched.append(row)
    pass2 = pd.DataFrame(pass2_rows)
    unmatched = pd.DataFrame(still_unmatched)

    # pass 3: fuzzy name match within resolved state candidates
    pass3_rows, final_unmatched = [], []
    for _, row in unmatched.iterrows():
        candidates = resolve_state_candidates(row["state_norm"])
        pool = census[census["state_norm"].isin(candidates)]
        best = (
            difflib.get_close_matches(row["name_norm"], pool["name_norm"].tolist(), n=1, cutoff=0.72)
            if not pool.empty
            else []
        )
        if best:
            hit = pool[pool["name_norm"] == best[0]].iloc[0]
            r = row.to_dict()
            r["Population"] = hit["Population"]
            r["match_method"] = "fuzzy"
            pass3_rows.append(r)
        else:
            final_unmatched.append(row)
    pass3 = pd.DataFrame(pass3_rows)
    final_unmatched = pd.DataFrame(final_unmatched)
    if not final_unmatched.empty:
        final_unmatched = final_unmatched.copy()
        final_unmatched["Population"] = pd.NA
        final_unmatched["match_method"] = "unmatched_likely_post_2011_district"

    result = pd.concat([matched, pass2, pass3, final_unmatched], ignore_index=True)
    result = result.rename(columns={"Population": "population_2011"})
    result = result[
        ["district_code", "state_name", "canonical_name", "population_2011", "match_method"]
    ].sort_values("district_code")
    return result


if __name__ == "__main__":
    out = build()
    out.to_csv(OUTPUT_PATH, index=False)
    print(f"wrote {len(out)} rows to {OUTPUT_PATH}")
    print(out["match_method"].value_counts())
