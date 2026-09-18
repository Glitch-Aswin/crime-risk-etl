"""Feature engineering: rate per 100k, YoY change, rolling averages,
in-state rank, computed per district-year-category."""


def compute_rate_per_100k(df, population_df):
    raise NotImplementedError


def compute_yoy_change(df):
    raise NotImplementedError


def compute_rolling_average(df, window: int = 3):
    raise NotImplementedError
