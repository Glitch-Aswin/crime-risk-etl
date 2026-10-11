import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fmt } from "../lib/format";
import Pager from "./Pager";
import TierBadge from "./TierBadge";

const PAGE_SIZE = 25;
const TIER_ORDER = { Low: 1, Medium: 2, High: 3 };

const COLUMNS = [
  { key: "canonical_district_name", label: "District" },
  { key: "state_name", label: "State" },
  { key: "tier", label: "Tier" },
  { key: "rate_per_100k", label: "Rate /100k", numeric: true },
  { key: "count", label: "Count", numeric: true },
  { key: "yoy_change_pct", label: "YoY %", numeric: true },
  { key: "in_state_rank", label: "State rank", numeric: true },
];

function sortValue(row, key) {
  const v = row[key];
  return key === "tier" ? TIER_ORDER[v] ?? null : v;
}

function toCsv(rows) {
  const esc = (v) => (v === null || v === undefined ? "" : `"${String(v).replaceAll('"', '""')}"`);
  const head = COLUMNS.map((c) => esc(c.label)).join(",");
  const lines = rows.map((r) => COLUMNS.map((c) => esc(r[c.key])).join(","));
  return [head, ...lines].join("\n");
}

export default function RankingsTable({ rows, filters }) {
  const { search } = useLocation();
  const [sortKey, setSortKey] = useState("rate_per_100k");
  const [sortDir, setSortDir] = useState("desc");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (r) =>
            r.canonical_district_name.toLowerCase().includes(q) ||
            r.state_name.toLowerCase().includes(q)
        )
      : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    // Nulls always sort last, whichever direction is active.
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return dir * (typeof av === "string" ? av.localeCompare(bv) : av - bv);
    });
  }, [rows, query, sortKey, sortDir]);

  const maxRate = useMemo(() => Math.max(0, ...rows.map((r) => r.rate_per_100k ?? 0)), [rows]);
  const pageRows = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const sortBy = (key) => () => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "canonical_district_name" || key === "state_name" ? "asc" : "desc");
    }
    setPage(0);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(visible)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rankings_${filters.dataset}_${filters.crime_category}_${filters.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search district or state…"
          aria-label="Search districts"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <span className="muted">{visible.length} of {rows.length} districts</span>
        <span className="spacer" />
        <button onClick={download}>Download CSV</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={c.numeric ? "numeric" : undefined}
                  aria-sort={c.key === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button className="sort" onClick={sortBy(c.key)}>
                    {c.label}
                    {c.key === sortKey ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.district_code}>
                <td>
                  <Link to={{ pathname: `/district/${r.district_code}`, search }}>
                    {r.canonical_district_name}
                  </Link>
                </td>
                <td>{r.state_name}</td>
                <td><TierBadge tier={r.tier} /></td>
                <td className="numeric">
                  <span className="ratecell">
                    {fmt(r.rate_per_100k, 2)}
                    <span className="ratebar">
                      <span style={{ width: `${maxRate ? ((r.rate_per_100k ?? 0) / maxRate) * 100 : 0}%` }} />
                    </span>
                  </span>
                </td>
                <td className="numeric">{fmt(r.count, 0)}</td>
                <td className="numeric">
                  {r.yoy_change_pct === null ? "—" : `${r.yoy_change_pct > 0 ? "+" : ""}${fmt(r.yoy_change_pct)}%`}
                </td>
                <td className="numeric">{fmt(r.in_state_rank, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && <p className="muted">No districts match "{query}".</p>}
      <Pager page={page} pageSize={PAGE_SIZE} total={visible.length} onChange={setPage} />
    </div>
  );
}
