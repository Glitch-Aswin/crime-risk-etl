export default function Pager({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="pager">
      <span className="muted">{from}–{to} of {total}</span>
      <button disabled={page === 0} onClick={() => onChange(page - 1)}>← Prev</button>
      <span className="muted">{page + 1} / {pages}</span>
      <button disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}
