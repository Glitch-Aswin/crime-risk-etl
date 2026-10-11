import { useEffect, useState } from "react";

// Runs `fn` (returning a promise) whenever `deps` change, ignoring results
// from superseded calls. `data` is null while loading.
export function useFetch(fn, deps) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: null });
    fn()
      .then((data) => !cancelled && setState({ data, error: null }))
      .catch((e) => !cancelled && setState({ data: null, error: e.message }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// Recharts draws raw SVG, so it needs literal colors rather than var().
// Re-read from the CSS custom properties when the OS theme flips.
function readColors() {
  const s = getComputedStyle(document.documentElement);
  const g = (name) => s.getPropertyValue(name).trim();
  return {
    blue: g("--series-blue"),
    orange: g("--series-orange"),
    grid: g("--gridline"),
    muted: g("--text-muted"),
    text: g("--text-primary"),
    surface: g("--surface-1"),
    border: g("--baseline"),
    good: g("--status-good"),
    warning: g("--status-warning"),
    critical: g("--status-critical"),
  };
}

export function useChartColors() {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => requestAnimationFrame(() => setColors(readColors()));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return colors;
}
