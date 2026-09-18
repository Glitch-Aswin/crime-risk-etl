-- DuckDB warehouse schema for the district crime risk tiering project

CREATE TABLE IF NOT EXISTS dim_district (
    district_id   INTEGER PRIMARY KEY,
    district_name VARCHAR,
    state_id      INTEGER,
    district_code VARCHAR  -- stable NCRB code, used as crosswalk join key
);

CREATE TABLE IF NOT EXISTS dim_crime_type (
    crime_type_id INTEGER PRIMARY KEY,
    category      VARCHAR,  -- e.g. 'crimes_against_women'
    subcategory   VARCHAR   -- canonical label after category_map normalization
);

CREATE TABLE IF NOT EXISTS fact_crime (
    district_id    INTEGER,
    year           INTEGER,
    crime_type_id  INTEGER,
    count          INTEGER,
    population     BIGINT,
    rate_per_100k  DOUBLE
);

CREATE TABLE IF NOT EXISTS fact_crime_risk (
    district_id    INTEGER,
    year           INTEGER,
    crime_type_id  INTEGER,
    method         VARCHAR,  -- 'quantile' | 'kmeans'
    tier           VARCHAR,  -- 'Low' | 'Medium' | 'High'
    score          DOUBLE    -- rate (quantile) or distance-to-centroid (kmeans)
);
