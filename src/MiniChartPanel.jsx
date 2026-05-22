function makePath(points, width = 520, height = 120) {
  if (!points.length) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  return points.map((p, i) => {
    const x = points.length === 1 ? 0 : (i / (points.length - 1)) * width;
    const y = height - ((p - min) / span) * height;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export default function MiniChartPanel({ ticks }) {
  const points = (ticks || []).map((t) => Number(t.price)).filter(Number.isFinite).slice(-60);
  const last = points[points.length - 1];
  const first = points[0];
  const change = first ? ((last - first) / first) * 100 : 0;
  const color = change >= 0 ? "#22c55e" : "#ef4444";

  return (
    <section style={{ background: "#101010", border: "1px solid #242424", borderRadius: 14, padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>LIVE MINI CHART</div>
          <strong>{ticks?.[ticks.length - 1]?.symbol || "—"}</strong>
        </div>
        <strong style={{ color }}>{Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}</strong>
      </div>

      <svg viewBox="0 0 520 120" width="100%" height="120" style={{ background: "#050505", borderRadius: 12 }}>
        <path d={makePath(points)} fill="none" stroke={color} strokeWidth="2.5" />
      </svg>
    </section>
  );
}
