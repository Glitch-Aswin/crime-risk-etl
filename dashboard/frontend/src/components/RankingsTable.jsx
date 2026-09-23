import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getRankings } from "../api";
import TierBadge from "./TierBadge";

function fmt(n, digits = 1) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function RankingsTable({ filters }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState("rate_per_100k");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    getRankings(filters)
      .then((data) => !cancelled && setRows(data))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [filters.dataset, filters.crime_category, filters.year, filters.method, filters.state]);

  if (error) return <p style={{ color: "var(--status-critical)" }}>Failed to load: {error}</p>;
  if (!rows) return <p className="muted">Loading…</p>;
  if (rows.length === 0) return <p className="muted">No data for this selection.</p>;

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const sortBy = (key) => () => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const arrow = (key) => (key === sortKey ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="card">
      <p className="muted" style={{ marginTop: 0 }}>{sorted.length} districts</p>
      <table>
        <thead>
          <tr>
            <th onClick={sortBy("canonical_district_name")} style={{ cursor: "pointer" }}>
              District{arrow("canonical_district_name")}
            </th>
            <th onClick={sortBy("state_name")} style={{ cursor: "pointer" }}>
              State{arrow("state_name")}
            </th>
            <th onClick={sortBy("tier")} style={{ cursor: "pointer" }}>Tier{arrow("tier")}</th>
            <th className="numeric" onClick={sortBy("rate_per_100k")} style={{ cursor: "pointer" }}>
              Rate /100k{arrow("rate_per_100k")}
            </th>
            <th className="numeric" onClick={sortBy("count")} style={{ cursor: "pointer" }}>
              Count{arrow("count")}
            </th>
            <th className="numeric" onClick={sortBy("yoy_change_pct")} style={{ cursor: "pointer" }}>
              YoY %{arrow("yoy_change_pct")}
            </th>
            <th className="numeric" onClick={sortBy("in_state_rank")} style={{ cursor: "pointer" }}>
              State rank{arrow("in_state_rank")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.district_code}>
              <td>
                <Link to={`/district/${r.district_code}`}>{r.canonical_district_name}</Link>
              </td>
              <td>{r.state_name}</td>
              <td><TierBadge tier={r.tier} /></td>
              <td className="numeric">{fmt(r.rate_per_100k, 2)}</td>
              <td className="numeric">{fmt(r.count, 0)}</td>
              <td className="numeric">{r.yoy_change_pct === null ? "—" : `${fmt(r.yoy_change_pct)}%`}</td>
              <td className="numeric">{fmt(r.in_state_rank, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
