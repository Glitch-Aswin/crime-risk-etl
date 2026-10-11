import { getRankings } from "../api";
import { useFetch } from "../lib/hooks";
import { Loading, ErrorMsg } from "./Loading";
import RankingsSummary from "./RankingsSummary";
import RankingsTable from "./RankingsTable";

export default function RankingsPage({ filters }) {
  const { data: rows, error } = useFetch(
    () => getRankings(filters),
    [filters.dataset, filters.crime_category, filters.year, filters.method, filters.state]
  );

  if (error) return <ErrorMsg error={error} />;
  if (!rows) return <Loading rows={3} />;
  if (rows.length === 0) return <p className="muted">No data for this selection.</p>;

  return (
    <div className="stack">
      <RankingsSummary rows={rows} filters={filters} />
      <RankingsTable rows={rows} filters={filters} />
    </div>
  );
}
