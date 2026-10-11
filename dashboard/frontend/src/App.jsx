import { useCallback, useEffect, useMemo, useState } from "react";
import { Routes, Route, NavLink, useLocation, useSearchParams } from "react-router-dom";
import { getMeta } from "./api";
import FilterBar from "./components/FilterBar";
import RankingsPage from "./components/RankingsPage";
import DistrictDetail from "./components/DistrictDetail";
import CompareView from "./components/CompareView";
import { Loading, ErrorMsg } from "./components/Loading";

// Filters live in the URL query string so a view can be bookmarked/shared
// and survives navigating into a district and back. Unknown or missing
// values fall back to defaults once /api/meta has loaded.
function useFilters(meta) {
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    if (!meta) return null;
    const cats = meta.crime_categories;
    const cat = params.get("crime_category");
    const year = Number(params.get("year"));
    const state = params.get("state");
    return {
      dataset: params.get("dataset") === "ipc" ? "ipc" : "women",
      crime_category: cats.includes(cat) ? cat : cats.includes("rape") ? "rape" : cats[0],
      year: meta.years.includes(year) ? year : meta.years[meta.years.length - 1],
      method: params.get("method") === "kmeans" ? "kmeans" : "quantile",
      state: meta.states.includes(state) ? state : "",
    };
  }, [meta, params]);

  const setFilters = useCallback(
    (next) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(next)) {
            if (v === "" || v === null || v === undefined) p.delete(k);
            else p.set(k, String(v));
          }
          return p;
        },
        { replace: true }
      ),
    [setParams]
  );

  return [filters, setFilters];
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useFilters(meta);
  const { search } = useLocation();

  useEffect(() => {
    getMeta().then(setMeta).catch((e) => setError(e.message));
  }, []);

  const tab = ({ isActive }) => (isActive ? "active" : undefined);

  return (
    <div>
      <header className="app-header">
        <h1>District Crime Risk</h1>
        <p className="muted">
          NCRB district-wise crime data, tiered Low / Medium / High by two independent methods.
        </p>
        <nav className="tabs">
          <NavLink to={{ pathname: "/", search }} end className={tab}>Rankings</NavLink>
          <NavLink to={{ pathname: "/compare", search }} className={tab}>Method comparison</NavLink>
        </nav>
      </header>

      {error && <ErrorMsg error={error} />}
      {!meta && !error && <Loading />}

      {meta && (
        <Routes>
          <Route
            path="/"
            element={
              <>
                <FilterBar meta={meta} filters={filters} onChange={setFilters} />
                <RankingsPage filters={filters} />
              </>
            }
          />
          <Route path="/district/:code" element={<DistrictDetail />} />
          <Route
            path="/compare"
            element={
              <>
                <FilterBar meta={meta} filters={filters} onChange={setFilters} showMethod={false} />
                <CompareView filters={filters} />
              </>
            }
          />
        </Routes>
      )}
    </div>
  );
}
