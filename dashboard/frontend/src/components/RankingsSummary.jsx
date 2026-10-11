import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useChartColors } from "../lib/hooks";
import { fmt, finite, median, quantile } from "../lib/format";
import Kpi from "./Kpi";

const MIN_COUNT_FOR_MOVERS = 10; // % change on tiny counts is mostly noise
const BINS = 10;

function histogram(rates) {
  const vals = finite(rates);
  if (vals.length === 0) return [];
  // Clip at the 95th percentile: a handful of extreme districts would
  // otherwise squash everyone else into the first bin.
  const top = quantile(vals, 0.95);
  if (!top || top <= 0) return [];
  const width = top / BINS;
  const bins = Array.from({ length: BINS }, (_, i) => ({
    range: i === BINS - 1 ? `${fmt(i * width, 1)}+` : `${fmt(i * width, 1)}–${fmt((i + 1) * width, 1)}`,
    districts: 0,
  }));
  for (const v of vals) bins[Math.min(BINS - 1, Math.floor(v / width))].districts += 1;
  return bins;
}

export default function RankingsSummary({ rows, filters }) {
  const c = useChartColors();
  const { search } = useLocation();

  const s = useMemo(() => {
    const tiers = { Low: 0, Medium: 0, High: 0, none: 0 };
    for (const r of rows) tiers[r.tier ?? "none"] += 1;

    const byState = new Map();
    for (const r of rows) {
      if (!byState.has(r.state_name)) byState.set(r.state_name, []);
      byState.get(r.state_name).push(r.rate_per_100k);
    }
    const topStates = [...byState]
      .map(([state, rates]) => ({ state, rate: median(rates), districts: rates.length }))
      .filter((x) => x.rate !== null)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10);

    const movers = rows.filter(
      (r) => Number.isFinite(r.yoy_change_pct) && r.count >= MIN_COUNT_FOR_MOVERS
    );
    const byYoy = [...movers].sort((a, b) => b.yoy_change_pct - a.yoy_change_pct);

    return {
      tiers,
      medianRate: median(rows.map((r) => r.rate_per_100k)),
      medianYoy: median(rows.map((r) => r.yoy_change_pct)),
      total: rows.reduce((sum, r) => sum + (r.count ?? 0), 0),
      hist: histogram(rows.map((r) => r.rate_per_100k)),
      topStates,
      risers: byYoy.slice(0, 5),
      fallers: byYoy.slice(-5).reverse(),
    };
  }, [rows]);

  const tiered = s.tiers.Low + s.tiers.Medium + s.tiers.High;
  const pct = (n) => (tiered ? `${fmt((n / tiered) * 100, 0)}%` : "—");
  const axis = { stroke: c.muted, fontSize: 12, tickLine: false };
  const tooltip = {
    contentStyle: { fontSize: 13, borderRadius: 6, background: c.surface, border: `1px solid ${c.border}`, color: c.text },
    cursor: { fill: c.grid, opacity: 0.4 },
  };

  const moverList = (list) => (
    <ul className="movers">
      {list.map((r) => (
        <li key={r.district_code}>
          <Link to={{ pathname: `/district/${r.district_code}`, search }}>
            {r.canonical_district_name}
            <span className="muted"> · {r.state_name}</span>
          </Link>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {r.yoy_change_pct > 0 ? "+" : ""}{fmt(r.yoy_change_pct)}%
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="stack">
      <div className="grid kpis">
        <Kpi label="Districts ranked" value={fmt(rows.length, 0)} sub={`${fmt(s.total, 0)} recorded cases`} />
        <Kpi
          label="High tier"
          value={fmt(s.tiers.High, 0)}
          sub={`${pct(s.tiers.High)} of ${fmt(tiered, 0)} tiered districts`}
        />
        <Kpi label="Median rate /100k" value={fmt(s.medianRate, 2)} sub="across districts" />
        <Kpi
          label="Median YoY change"
          value={s.medianYoy === null ? "—" : `${s.medianYoy > 0 ? "+" : ""}${fmt(s.medianYoy)}%`}
          sub="vs previous year"
        />
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Tier mix ({filters.method === "kmeans" ? "k-means" : "quantile"})</h3>
          <div className="tierbar" role="img" aria-label="Tier distribution">
            <span style={{ width: pct(s.tiers.Low), background: c.good }} />
            <span style={{ width: pct(s.tiers.Medium), background: c.warning }} />
            <span style={{ width: pct(s.tiers.High), background: c.critical }} />
          </div>
          <div className="legend">
            <span><b style={{ color: c.good }}>●</b> Low {s.tiers.Low} ({pct(s.tiers.Low)})</span>
            <span><b style={{ color: c.warning }}>▲</b> Medium {s.tiers.Medium} ({pct(s.tiers.Medium)})</span>
            <span><b style={{ color: c.critical }}>■</b> High {s.tiers.High} ({pct(s.tiers.High)})</span>
          </div>
          {s.tiers.none > 0 && (
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              {s.tiers.none} district(s) untiered (population below the reliability threshold).
            </p>
          )}

          <h3 style={{ marginTop: 20 }}>Rate distribution</h3>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={s.hist} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="range" {...axis} interval="preserveStartEnd" />
              <YAxis {...axis} width={40} allowDecimals={false} />
              <Tooltip {...tooltip} formatter={(v) => [v, "districts"]} labelFormatter={(l) => `${l} per 100k`} />
              <Bar isAnimationActive={false} dataKey="districts" fill={c.blue} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Bins span 0 to the 95th percentile; the last bin includes outliers.</p>
        </div>

        {!filters.state ? (
          <div className="card">
            <h3>Highest-rate states</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>Median district rate per 100k</p>
            <ResponsiveContainer width="100%" height={Math.max(180, s.topStates.length * 28)}>
              <BarChart data={s.topStates} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={c.grid} horizontal={false} />
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="state" {...axis} width={120} />
                <Tooltip {...tooltip} formatter={(v) => [fmt(v, 2), "median rate /100k"]} />
                <Bar isAnimationActive={false} dataKey="rate" fill={c.blue} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="card">
            <h3>Top movers in {filters.state}</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              Pick "All states" in the filter to compare states.
            </p>
          </div>
        )}
      </div>

      {s.risers.length > 0 && (
        <div className="grid two">
          <div className="card">
            <h3>Biggest increases</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              YoY % change, districts with at least {MIN_COUNT_FOR_MOVERS} cases
            </p>
            {moverList(s.risers)}
          </div>
          <div className="card">
            <h3>Biggest decreases</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              YoY % change, districts with at least {MIN_COUNT_FOR_MOVERS} cases
            </p>
            {moverList(s.fallers)}
          </div>
        </div>
      )}
    </div>
  );
}
