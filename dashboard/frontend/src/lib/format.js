export function fmt(n, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export const label = (s) => (s ? s.replaceAll("_", " ") : "");

export const finite = (xs) => xs.filter((x) => Number.isFinite(x));

// q in [0, 1]; xs need not be sorted.
export function quantile(xs, q) {
  const v = finite(xs).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

export const median = (xs) => quantile(xs, 0.5);
