from etl.extract import ID_COLUMNS, load_dataset, load_ipc_datasets, load_women_datasets


def test_load_dataset_tags_era_and_drops_id_column():
    df = load_dataset("women_2016")
    assert "id" not in df.columns
    assert (df["era"] == "women_2016").all()
    for col in ID_COLUMNS:
        assert col in df.columns


def test_load_women_datasets_returns_both_eras_separately():
    frames = load_women_datasets()
    assert len(frames) == 2
    eras = {frame["era"].iloc[0] for frame in frames}
    assert eras == {"women_2016", "women_2017_onwards"}


def test_load_ipc_datasets_returns_both_eras_separately():
    frames = load_ipc_datasets()
    assert len(frames) == 2
    eras = {frame["era"].iloc[0] for frame in frames}
    assert eras == {"ipc_2016", "ipc_2017_onwards"}
    # 2017+ IPC has far more columns than 2016 -- confirms the schema-drift
    # case is really present in what we loaded, not just assumed
    assert frames[1].shape[1] > frames[0].shape[1]
