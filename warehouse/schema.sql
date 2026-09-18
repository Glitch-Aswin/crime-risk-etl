-- DuckDB warehouse schema for the district crime risk tiering project
--
-- Uses natural keys (district_code, crime_category, dataset) rather than
-- surrogate dimension IDs: the source data is small (~12K rows) and
-- district_code/crime_category/dataset are already the stable join keys
-- threaded through the whole pipeline (etl/transform.py, features/), so a
-- separate ID-generation step would add bookkeeping without buying
-- anything at this scale. Revisit if this ever needs to join against a
-- system that expects surrogate keys.

CREATE TABLE IF NOT EXISTS fact_crime (
    district_code           VARCHAR,
    canonical_district_name VARCHAR,
    state_name              VARCHAR,
    year                    INTEGER,
    dataset                 VARCHAR,  -- 'women' | 'ipc'
    crime_category          VARCHAR,  -- canonical_category after crime_category_map normalization
    count                   BIGINT,
    population_2011         BIGINT,
    rate_per_100k           DOUBLE,
    yoy_change_pct          DOUBLE,
    rolling_3yr_avg         DOUBLE,
    in_state_rank           DOUBLE
);

CREATE TABLE IF NOT EXISTS fact_crime_risk (
    district_code   VARCHAR,
    state_name      VARCHAR,
    year            INTEGER,
    dataset         VARCHAR,  -- 'women' | 'ipc'
    crime_category  VARCHAR,
    method          VARCHAR,  -- 'quantile' | 'kmeans'
    tier            VARCHAR,  -- 'Low' | 'Medium' | 'High'
    score           DOUBLE    -- rate_per_100k (quantile), or the primary
                               -- clustering feature's value (kmeans)
);
