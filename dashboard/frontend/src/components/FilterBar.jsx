export default function FilterBar({
  meta,
  filters,
  onChange,
  showMethod = true,
  showState = true,
}) {
  if (!meta) return null;

  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });

  return (
    <div className="filters">
      <label>
        <div>Dataset</div>
        <select value={filters.dataset} onChange={set("dataset")}>
          <option value="women">Crimes against women</option>
          <option value="ipc">General IPC crimes</option>
        </select>
      </label>

      <label>
        <div>Crime category</div>
        <select value={filters.crime_category} onChange={set("crime_category")}>
          {meta.crime_categories.map((c) => (
            <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
          ))}
        </select>
      </label>

      <label>
        <div>Year</div>
        <select value={filters.year} onChange={set("year")}>
          {meta.years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>

      {showMethod && (
        <label>
          <div>Tiering method</div>
          <select value={filters.method} onChange={set("method")}>
            <option value="quantile">Quantile (state-relative)</option>
            <option value="kmeans">K-means (national)</option>
          </select>
        </label>
      )}

      {showState && (
        <label>
          <div>State</div>
          <select value={filters.state ?? ""} onChange={set("state")}>
            <option value="">All states</option>
            {meta.states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
