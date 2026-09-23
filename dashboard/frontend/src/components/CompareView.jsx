import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { compareMethod } from "../api";
import TierBadge from "./TierBadge";

function fmt(n, digits = 2) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function CompareView({ filters }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [onlyDisagreements, setOnlyDisagreements] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    compareMethod(filters)
      .then((data) => !cancelled && setRows(data))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [filters.dataset, filters.crime_category, filters.year, filters.state]);

  if (error) return <p style={{ color: "var(--status-critical)" }}>Failed to load: {error}</p>;
  if (!rows) return <p className="muted">Loading…</p>;

  const agreeCount = rows.filter((r) => r.quantile_tier === r.kmeans_tier).length;
  const shown = onlyDisagreements ? rows.filter((r) => r.quantile_tier !== r.kmeans_tier) : rows;

  return (
    <div className="card">
      <p className="muted" style={{ marginTop: 0 }}>
        {agreeCount} / {rows.length} districts agree between methods ({rows.length ? fmt((agreeCount / rows.length) * 100, 0) : 0}%)
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: 14 }}>
        <input
          type="checkbox"
          checked={onlyDisagreements}
          onChange={(e) => setOnlyDisagreements(e.target.checked)}
        />
        Show only disagreements
      </label>
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
          {shown.map((r) => (
            <tr
              key={r.district_code}
              style={r.quantile_tier !== r.kmeans_tier ? { background: "rgba(250, 178, 25, 0.08)" } : undefined}
            >
              <td><Link to={`/district/${r.district_code}`}>{r.canonical_district_name}</Link></td>
              <td>{r.state_name}</td>
              <td><TierBadge tier={r.quantile_tier} /></td>
              <td><TierBadge tier={r.kmeans_tier} /></td>
              <td className="numeric">{fmt(r.rate_per_100k)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
