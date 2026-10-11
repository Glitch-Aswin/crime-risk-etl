export function Loading({ rows = 1 }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

export function ErrorMsg({ error }) {
  return <p className="error">Failed to load: {error}</p>;
}
