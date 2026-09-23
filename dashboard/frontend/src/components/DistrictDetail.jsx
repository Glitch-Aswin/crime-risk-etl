import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getDistrict } from "../api";
import TierBadge from "./TierBadge";

// Hex mirrors of the CSS custom properties in index.css -- Recharts renders
// raw SVG and is more reliable with literal hex than var() resolution here.
const COLOR_LINE = "#2a78d6";
const COLOR_GRID = "#e1e0d9";
const COLOR_MUTED = "#898781";

function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function DistrictDetail() {
  const { code } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dataset, setDataset] = useState("women");
  const [category, setCategory] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    getDistrict(code)
      .then((d) => {
        setData(d);
        const first = d.crime.find((r) => r.dataset === "women") ?? d.crime[0];
        if (first) {
          setDataset(first.dataset);
          setCategory(first.crime_category);
        }
      })
      .catch((e) => setError(e.message));
  }, [code]);

  const categories = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.crime.filter((r) => r.dataset === dataset).map((r) => r.crime_category))].sort();
  }, [data, dataset]);

  const trend = useMemo(() => {
    if (!data || !category) return [];
    return data.crime
      .filter((r) => r.dataset === dataset && r.crime_category === category)
      .sort((a, b) => a.year - b.year)
      .map((r) => ({ year: r.year, rate_per_100k: r.rate_per_100k }));
  }, [data, dataset, category]);

  const latestYear = useMemo(() => {
    if (!data) return null;
    return Math.max(...data.crime.map((r) => r.year));
  }, [data]);

  const currentTiers = useMemo(() => {
    if (!data || !latestYear) return [];
    const rows = data.risk.filter((r) => r.year === latestYear);
    const byKey = new Map();
    for (const r of rows) {
      const key = `${r.dataset}::${r.crime_category}`;
      if (!byKey.has(key)) byKey.set(key, { dataset: r.dataset, crime_category: r.crime_category });
      byKey.get(key)[r.method] = r.tier;
      byKey.get(key).score = r.score;
    }
    return [...byKey.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [data, latestYear]);

  if (error) return <p style={{ color: "var(--status-critical)" }}>Failed to load: {error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div>
      <p><Link to="/">← Back to rankings</Link></p>
      <h2 style={{ marginBottom: 0 }}>{data.canonical_district_name}</h2>
      <p className="muted" style={{ marginTop: 4 }}>{data.state_name} · district code {code}</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Dataset</div>
            <select
              value={dataset}
              onChange={(e) => {
                setDataset(e.target.value);
                setCategory(null);
              }}
            >
              <option value="women">Crimes against women</option>
              <option value="ipc">General IPC crimes</option>
            </select>
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Crime category</div>
            <select value={category ?? ""} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
        </div>

        <h3 style={{ marginBottom: 4 }}>
          Rate per 100k over time — <span className="muted">{category?.replaceAll("_", " ")}</span>
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLOR_GRID} vertical={false} />
            <XAxis dataKey="year" stroke={COLOR_MUTED} fontSize={12} tickLine={false} />
            <YAxis stroke={COLOR_MUTED} fontSize={12} tickLine={false} width={50} />
            <Tooltip
              formatter={(v) => [fmt(v, 2), "rate /100k"]}
              contentStyle={{ fontSize: 13, borderRadius: 6 }}
            />
            <Line
              type="monotone"
              dataKey="rate_per_100k"
              stroke={COLOR_LINE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>All categories, {latestYear} (most recent year)</h3>
        <table>
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Category</th>
              <th>Quantile tier</th>
              <th>K-means tier</th>
            </tr>
          </thead>
          <tbody>
            {currentTiers.map((row) => (
              <tr key={`${row.dataset}::${row.crime_category}`}>
                <td className="muted">{row.dataset}</td>
                <td>{row.crime_category.replaceAll("_", " ")}</td>
                <td><TierBadge tier={row.quantile} /></td>
                <td><TierBadge tier={row.kmeans} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
