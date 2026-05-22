function pathFrom(values, width = 760, height = 180) {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => {
    const x = values.length === 1 ? 0 : (i / (values.length - 1)) * width;
    const y = height - ((v - min) / span) * height;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function sma(values, period) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - period + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export default function AdvancedChartPanel({ ticks }) {
  const values = (ticks || []).map((t) => Number(t.price)).filter(Number.isFinite).slice(-120);
  const fast = sma(values, 8);
  const slow = sma(values, 21);
  const last = values[values.length - 1];
  const first = values[0];
  const change = first ? ((last - first) / first) * 100 : 0;

  return (
    <section className="terminal-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 1 }}>ADVANCED CHART</div>
          <strong>Live price with fast / slow overlays</strong>
        </div>
        <strong style={{ color: change >= 0 ? "#22c55e" : "#ef4444" }}>
          {Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
        </strong>
      </div>

      <svg viewBox="0 0 760 180" width="100%" height="180" style={{ background: "#050505", borderRadius: 14 }}>
        <path d={pathFrom(values)} fill="none" stroke="#60a5fa" strokeWidth="2.5" />
        <path d={pathFrom(fast)} fill="none" stroke="#22c55e" strokeWidth="1.5" opacity="0.9" />
        <path d={pathFrom(slow)} fill="none" stroke="#f97316" strokeWidth="1.5" opacity="0.9" />
      </svg>

      <div style={{ display: "flex", gap: 16, color: "#9ca3af", fontSize: 12, marginTop: 10 }}>
        <span>Blue: price</span><span>Green: fast MA</span><span>Orange: slow MA</span>
      </div>
    </section>
  );
}
