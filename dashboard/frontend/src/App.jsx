import { useEffect, useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { getMeta } from "./api";
import FilterBar from "./components/FilterBar";
import RankingsTable from "./components/RankingsTable";
import DistrictDetail from "./components/DistrictDetail";
import CompareView from "./components/CompareView";

const navStyle = ({ isActive }) => ({
  padding: "8px 14px",
  borderRadius: 6,
  textDecoration: "none",
  color: isActive ? "white" : "var(--text-primary)",
  background: isActive ? "var(--series-blue)" : "transparent",
  fontWeight: 600,
  fontSize: 14,
});

export default function App() {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    dataset: "women",
    crime_category: "rape",
    year: 2022,
    method: "quantile",
    state: "",
  });

  useEffect(() => {
    getMeta()
      .then((m) => {
        setMeta(m);
        setFilters((f) => ({
          ...f,
          crime_category: m.crime_categories.includes(f.crime_category)
            ? f.crime_category
            : m.crime_categories[0],
          year: m.years.includes(f.year) ? f.year : m.years[m.years.length - 1],
        }));
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 4 }}>District Crime Risk</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
          NCRB district-wise crime data, tiered Low / Medium / High by two independent methods.
        </p>
        <nav style={{ display: "flex", gap: 8 }}>
          <NavLink to="/" end style={navStyle}>Rankings</NavLink>
          <NavLink to="/compare" style={navStyle}>Method comparison</NavLink>
        </nav>
      </header>

      {error && <p style={{ color: "var(--status-critical)" }}>Failed to load filters: {error}</p>}

      <Routes>
        <Route
          path="/"
          element={
            <>
              <FilterBar meta={meta} filters={filters} onChange={setFilters} />
              {meta && <RankingsTable filters={filters} />}
            </>
          }
        />
        <Route path="/district/:code" element={<DistrictDetail />} />
        <Route
          path="/compare"
          element={
            <>
              <FilterBar meta={meta} filters={filters} onChange={setFilters} showMethod={false} />
              {meta && <CompareView filters={filters} />}
            </>
          }
        />
      </Routes>
    </div>
  );
}
