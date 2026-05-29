// ── Design tokens ─────────────────────────────────────────────────────────────
const SURFACE = '#0d0d1a';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';

// ── BacktestEquityCurve ───────────────────────────────────────────────────────
export default function BacktestEquityCurve({ trades, width = 460, height = 100 }) {
  if (!Array.isArray(trades) || trades.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          background: SURFACE,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <text style={{ color: MUTED, fontSize: 12, fontFamily: 'monospace' }}>No trades</text>
      </div>
    );
  }

  const PAD = { t: 8, r: 8, b: 20, l: 44 };
  const innerW = width  - PAD.l - PAD.r;
  const innerH = height - PAD.t - PAD.b;

  // Build cumulative P&L series (starts at 0)
  const cumulative = [0];
  let running = 0;
  for (const t of trades) {
    running += Number(t.pnl) || 0;
    cumulative.push(running);
  }

  const minY   = Math.min(...cumulative);
  const maxY   = Math.max(...cumulative);
  const rangeY = Math.max(maxY - minY, 0.0001);

  const toX = (i) => PAD.l + (i / (cumulative.length - 1)) * innerW;
  const toY = (v)  => PAD.t + innerH - ((v - minY) / rangeY) * innerH;

  const points    = cumulative.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const finalPnl  = cumulative[cumulative.length - 1];
  const lineColor = finalPnl >= 0 ? GREEN : RED;

  // Y-axis: min, mid, max
  const midY   = (minY + maxY) / 2;
  const yLabels = [
    { value: minY,  y: toY(minY) },
    { value: midY,  y: toY(midY) },
    { value: maxY,  y: toY(maxY) },
  ];

  const fmtLabel = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

  return (
    <div style={{ borderRadius: 6, display: 'inline-block', lineHeight: 0 }}>
      <svg
        width={width}
        height={height}
        style={{ display: 'block', background: SURFACE, borderRadius: 6 }}
      >
        {/* Dashed zero-line (only when zero falls inside the range) */}
        {minY < 0 && maxY > 0 && (
          <line
            x1={PAD.l}        y1={toY(0)}
            x2={width - PAD.r} y2={toY(0)}
            stroke={MUTED}
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />
        )}

        {/* Y-axis labels */}
        {yLabels.map(({ value, y }, i) => (
          <text
            key={i}
            x={PAD.l - 4}
            y={y + 3.5}
            fill={MUTED}
            fontSize={9}
            textAnchor="end"
            fontFamily="monospace"
          >
            {fmtLabel(value)}
          </text>
        ))}

        {/* Equity polyline */}
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth={1.5} />

        {/* Start dot at cumulative[0] = 0 */}
        <circle cx={toX(0)} cy={toY(0)} r={2.5} fill={MUTED} />

        {/* End dot at last cumulative point */}
        <circle cx={toX(cumulative.length - 1)} cy={toY(finalPnl)} r={3} fill={lineColor} />
      </svg>
    </div>
  );
}
