const TIER_STYLE = {
  Low: { color: "var(--status-good)", icon: "●", label: "Low" },
  Medium: { color: "var(--status-warning)", icon: "▲", label: "Medium" },
  High: { color: "var(--status-critical)", icon: "■", label: "High" },
};

// Status color is never the only signal (warning/critical fall below
// contrast floor on light surfaces per the palette) -- icon + label always
// ship alongside the color, never color alone.
export default function TierBadge({ tier }) {
  if (!tier) return <span className="muted">—</span>;
  const style = TIER_STYLE[tier] ?? { color: "var(--text-muted)", icon: "?", label: tier };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
      <span style={{ color: style.color }}>{style.icon}</span>
      {style.label}
    </span>
  );
}
