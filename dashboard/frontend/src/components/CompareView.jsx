import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { compareMethod } from "../api";
import { useFetch } from "../lib/hooks";
import { fmt } from "../lib/format";
import { Loading, ErrorMsg } from "./Loading";
import Kpi from "./Kpi";
import Pager from "./Pager";
import TierBadge from "./TierBadge";

const TIERS = ["Low", "Medium", "High"];
const RANK = { Low: 0, Medium: 1, High: 2 };
const PAGE_SIZE = 25;

export default function CompareView({ filters }) {
  const { search } = useLocation();
  const [onlyDisagreements, setOnlyDisagreements] = useState(false);
  const [page, setPage] = useState(0);
  const { data: rows, error } = useFetch(
    () => compareMethod(filters),
    [filters.dataset, filters.crime_category, filters.year, filters.state]
  );

  const stats = useMemo(() => {
    if (!rows) return null;
    const matrix = Object.fromEntries(TIERS.map((q) => [q, Object.fromEntries(TIERS.map((k) => [k, 0]))]));
    let agree = 0;
    let kmeansHigher = 0;
    let kmeansLower = 0;
    for (const r of rows) {
      if (!(r.quantile_tier in RANK) || !(r.kmeans_tier in RANK)) continue;
      matrix[r.quantile_tier][r.kmeans_tier] += 1;
      const d = RANK[r.kmeans_tier] - RANK[r.quantile_tier];
      if (d === 0) agree += 1;
      else if (d > 0) kmeansHigher += 1;
      else kmeansLower += 1;
    }
    return { matrix, agree, kmeansHigher, kmeansLower, compared: agree + kmeansHigher + kmeansLower };
  }, [rows]);

  if (error) return <ErrorMsg error={error} />;
  if (!rows) return <Loading rows={3} />;
  if (rows.length === 0) return <p className="muted">No data for this selection.</p>;

  const shown = onlyDisagreements ? rows.filter((r) => r.quantile_tier !== r.kmeans_tier) : rows;
  const pageRows = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pct = (n) => (stats.compared ? `${fmt((n / stats.compared) * 100, 0)}%` : "—");
  const maxCell = Math.max(1, ...TIERS.flatMap((q) => TIERS.map((k) => stats.matrix[q][k])));

  return (
    <div className="stack">
      <div className="grid kpis">
        <Kpi label="Agreement" value={pct(stats.agree)} sub={`${stats.agree} of ${stats.compared} districts`} />
        <Kpi label="K-means rates higher" value={fmt(stats.kmeansHigher, 0)} sub="than quantile" />
        <Kpi label="K-means rates lower" value={fmt(stats.kmeansLower, 0)} sub="than quantile" />
      </div>

      <div className="card">
        <h3>Agreement matrix</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13, maxWidth: "70ch" }}>
          Quantile tiers are relative within each state; k-means clusters nationally on rate, YoY change and
          3-year average. Off-diagonal cells are districts where the two methods disagree.
        </p>
        <div className="table-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th />
                <th colSpan={3}>K-means tier</th>
              </tr>
              <tr>
                <th>Quantile tier</th>
                {TIERS.map((k) => <th key={k}>{k}</th>)}
              </tr>
            </thead>
            <tbody>
              {TIERS.map((q) => (
                <tr key={q}>
                  <th>{q}</th>
                  {TIERS.map((k) => {
                    const n = stats.matrix[q][k];
                    const diag = q === k;
                    const tint = diag ? "var(--series-blue)" : "var(--status-warning)";
                    return (
                      <td
                        key={k}
                        className="cell"
                        style={{ background: `color-mix(in srgb, ${tint} ${Math.round((n / maxCell) * 55)}%, var(--surface-2))` }}
                        title={`Quantile ${q}, k-means ${k}`}
                      >
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={onlyDisagreements}
              onChange={(e) => {
                setOnlyDisagreements(e.target.checked);
                setPage(0);
              }}
            />
            Show only disagreements
          </label>
          <span className="muted">{shown.length} districts</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>District</th>
                <th>State</th>
                <th>Quantile tier</th>
                <th>K-means tier</th>
                <th className="numeric">Rate /100k</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.district_code}>
                  <td>
                    <Link to={{ pathname: `/district/${r.district_code}`, search }}>{r.canonical_district_name}</Link>
                  </td>
                  <td>{r.state_name}</td>
                  <td><TierBadge tier={r.quantile_tier} /></td>
                  <td><TierBadge tier={r.kmeans_tier} /></td>
                  <td className="numeric">{fmt(r.rate_per_100k, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={shown.length} onChange={setPage} />
      </div>
    </div>
  );
}
