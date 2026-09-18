"""Model-based tiering: k-means (k=3) per crime category, with cluster
centroids sorted by mean rate and mapped to Low/Medium/High post-hoc."""


def assign_kmeans_tier(df, features: list[str]):
    raise NotImplementedError
