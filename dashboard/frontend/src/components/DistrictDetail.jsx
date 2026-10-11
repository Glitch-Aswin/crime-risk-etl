import { useMemo, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getDistrict } from "../api";
import { useFetch, useChartColors } from "../lib/hooks";
import { fmt, label } from "../lib/format";
import { Loading, ErrorMsg } from "./Loading";
import Kpi from "./Kpi";
import TierBadge from "./TierBadge";

export default function DistrictDetail() {
  const { code } = useParams();
  const { search } = useLocation();
  const c = useChartColors();
  const { data, error } = useFetch(() => getDistrict(code), [code]);
  // null = "not chosen yet": fall back to the first available series.
  const [chosenDataset, setChosenDataset] = useState(null);
  const [chosenCategory, setChosenCategory] = useState(null);

  const dataset = useMemo(() => {
    if (chosenDataset) return chosenDataset;
    if (!data) return "women";
    return (data.crime.find((r) => r.dataset === "women") ?? data.crime[0])?.dataset ?? "women";
  }, [data, chosenDataset]);

  const categories = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.crime.filter((r) => r.dataset === dataset).map((r) => r.crime_category))].sort();
  }, [data, dataset]);

  const category = categories.includes(chosenCategory) ? chosenCategory : categories[0] ?? null;

  const series = useMemo(() => {
    if (!data || !category) return [];
    return data.crime
      .filter((r) => r.dataset === dataset && r.crime_category === category)
      .sort((a, b) => a.year - b.year);
  }, [data, dataset, category]);

  const latest = series[series.length - 1];

  const tierHistory = useMemo(() => {
    if (!data || !category) return [];
    const byYear = new Map();
    for (const r of data.risk) {
      if (r.dataset !== dataset || r.crime_category !== category) continue;
      if (!byYear.has(r.year)) byYear.set(r.year, { year: r.year });
      byYear.get(r.year)[r.method] = r.tier;
    }
    return [...byYear.values()].sort((a, b) => b.year - a.year);
  }, [data, dataset, category]);

  const latestYear = useMemo(() => (data ? Math.max(...data.crime.map((r) => r.year)) : null), [data]);

  const currentTiers = useMemo(() => {
    if (!data || !latestYear) return [];
    const byKey = new Map();
    for (const r of data.risk.filter((x) => x.year === latestYear)) {
      const key = `${r.dataset}::${r.crime_category}`;
      if (!byKey.has(key)) byKey.set(key, { dataset: r.dataset, crime_category: r.crime_category });
      byKey.get(key)[r.method] = r.tier;
      byKey.get(key).score = r.score;
    }
    return [...byKey.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [data, latestYear]);

  if (error) return <ErrorMsg error={error} />;
  if (!data) return <Loading rows={3} />;

  const latestTier = tierHistory.find((t) => t.year === latest?.year) ?? {};
  const axis = { stroke: c.muted, fontSize: 12, tickLine: false };
  const tooltip = {
    contentStyle: { fontSize: 13, borderRadius: 6, background: c.surface, border: `1px solid ${c.border}`, color: c.text },
  };

  return (
    <div className="stack">
      <p style={{ margin: 0 }}><Link to={{ pathname: "/", search }}>← Back to rankings</Link></p>
      <div>
        <h2 style={{ marginBottom: 0 }}>{data.canonical_district_name}</h2>
        <p className="muted" style={{ margin: "4px 0 0" }}>{data.state_name} · district code {code}</p>
      </div>

      <div className="filters" style={{ marginBottom: 0 }}>
        <label>
          <div>Dataset</div>
          <select
            value={dataset}
            onChange={(e) => {
              setChosenDataset(e.target.value);
              setChosenCategory(null);
            }}
          >
            <option value="women">Crimes against women</option>
            <option value="ipc">General IPC crimes</option>
          </select>
        </label>
        <label>
          <div>Crime category</div>
          <select value={category ?? ""} onChange={(e) => setChosenCategory(e.target.value)}>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{label(cat)}</option>
            ))}
          </select>
        </label>
      </div>

      {latest && (
        <div className="grid kpis">
          <Kpi label={`Rate /100k (${latest.year})`} value={fmt(latest.rate_per_100k, 2)} sub={`${fmt(latest.count, 0)} cases`} />
          <Kpi
            label="YoY change"
            value={latest.yoy_change_pct === null ? "—" : `${latest.yoy_change_pct > 0 ? "+" : ""}${fmt(latest.yoy_change_pct)}%`}
            sub="vs previous year"
          />
          <Kpi label="3-year average" value={fmt(latest.rolling_3yr_avg, 2)} sub="rate /100k" />
          <Kpi label="Rank in state" value={fmt(latest.in_state_rank, 0)} sub="1 = highest rate" />
          <div className="card kpi">
            <div className="label">Tier ({latest.year})</div>
            <div className="value" style={{ fontSize: 16, lineHeight: 1.8 }}>
              <div><span className="muted" style={{ fontSize: 12 }}>Quantile </span><TierBadge tier={latestTier.quantile} /></div>
              <div><span className="muted" style={{ fontSize: 12 }}>K-means </span><TierBadge tier={latestTier.kmeans} /></div>
            </div>
          </div>
        </div>
      )}

      <div className="grid two">
        <div className="card">
          <h3>Rate per 100k over time <span className="muted">· {label(category)}</span></h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="year" {...axis} />
              <YAxis {...axis} width={50} />
              <Tooltip {...tooltip} formatter={(v, name) => [fmt(v, 2), name]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line isAnimationActive={false} type="monotone" name="Rate /100k" dataKey="rate_per_100k" stroke={c.blue} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line isAnimationActive={false} type="monotone" name="3-yr average" dataKey="rolling_3yr_avg" stroke={c.orange} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Reported cases <span className="muted">· {label(category)}</span></h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="year" {...axis} />
              <YAxis {...axis} width={50} allowDecimals={false} />
              <Tooltip {...tooltip} cursor={{ fill: c.grid, opacity: 0.4 }} formatter={(v) => [fmt(v, 0), "cases"]} />
              <Bar isAnimationActive={false} dataKey="count" fill={c.blue} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Tier history <span className="muted">· {label(category)}</span></h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Year</th><th>Quantile</th><th>K-means</th></tr>
              </thead>
              <tbody>
                {tierHistory.map((t) => (
                  <tr key={t.year}>
                    <td>{t.year}</td>
                    <td><TierBadge tier={t.quantile} /></td>
                    <td><TierBadge tier={t.kmeans} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>All categories, {latestYear} (most recent year)</h3>
          <div className="table-wrap" style={{ maxHeight: 380, overflowY: "auto" }}>
            <table>
              <thead>
                <tr><th>Dataset</th><th>Category</th><th>Quantile</th><th>K-means</th></tr>
              </thead>
              <tbody>
                {currentTiers.map((row) => (
                  <tr key={`${row.dataset}::${row.crime_category}`}>
                    <td className="muted">{row.dataset}</td>
                    <td>{label(row.crime_category)}</td>
                    <td><TierBadge tier={row.quantile} /></td>
                    <td><TierBadge tier={row.kmeans} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
