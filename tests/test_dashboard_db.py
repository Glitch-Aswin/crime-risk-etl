from dashboard.backend import main


class _FakeCursor:
    description = [("district_code",), ("rate_per_100k",)]

    def __init__(self):
        self.executed = None

    def execute(self, query, params=None):
        self.executed = (query, params)

    def fetchall(self):
        return [("1", 0.5), ("2", None)]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class _FakeRaw:
    def __init__(self):
        self.cursor_obj = _FakeCursor()
        self.closed = False

    def cursor(self):
        return self.cursor_obj

    def close(self):
        self.closed = True


def test_get_con_passes_params_and_returns_dataframe(monkeypatch):
    raw = _FakeRaw()
    seen = {}

    def fake_connect(**kwargs):
        seen.update(kwargs)
        return raw

    monkeypatch.setattr(main.sql, "connect", fake_connect)
    monkeypatch.setenv("DATABRICKS_SERVER_HOSTNAME", "host")
    monkeypatch.setenv("DATABRICKS_HTTP_PATH", "/sql/1.0/warehouses/x")
    monkeypatch.setenv("DATABRICKS_TOKEN", "tok")

    with main.get_con() as con:
        df = con.execute("SELECT * FROM fact_crime WHERE year = ?", [2020]).df()

    assert raw.cursor_obj.executed == ("SELECT * FROM fact_crime WHERE year = ?", [2020])
    assert list(df.columns) == ["district_code", "rate_per_100k"]
    assert len(df) == 2
    assert seen["catalog"] == "workspace" and seen["schema"] == "default"
    assert raw.closed
