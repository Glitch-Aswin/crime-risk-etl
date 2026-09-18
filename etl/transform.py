"""Transform stage: reshape wide->long, normalize districts and crime
categories using reference/ crosswalks, join population, compute rates."""


def reshape_to_long(df):
    raise NotImplementedError


def normalize_districts(df, crosswalk_path: str):
    raise NotImplementedError


def normalize_crime_categories(df, category_map_path: str):
    raise NotImplementedError
