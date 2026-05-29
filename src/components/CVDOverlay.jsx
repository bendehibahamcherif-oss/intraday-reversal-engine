import { useCVDStore, CVD_SOURCES } from '../store/cvdStore.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#FFB800';
const BLUE    = '#3b82f6';

// ── Chart geometry (matches CandlestickChart coordinate space) ────────────────
const CHART_W = 900;
const CVD_H   = 90;
const PAD     = { t: 6, r: 8, b: 18, l: 56 };
const INNER_W = CHART_W - PAD.l - PAD.r;
const INNER_H = CVD_H - PAD.t - PAD.b;
const MAX_BARS = 80; // same window as CandlestickChart

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDelta(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

// ── Source/fallback badge ─────────────────────────────────────────────────────
function SourceBadge({ source, fallback }) {
  const label = CVD_SOURCES[source] || source || 'unknown';
  const isFallback = fallback || !['bid_ask_tick'].includes(source);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        background: isFallback ? AMBER + '22' : GREEN + '22',
        color:      isFallback ? AMBER : GREEN,
        border:     `1px solid ${isFallback ? AMBER + '66' : GREEN + '66'}`,
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 6px',
        letterSpacing: '0.02em',
      }}>
        {isFallback ? '⚠ APPROX' : '✓ LIVE'}
      </span>
      <span style={{ fontSize: 10, color: MUTED }}>{label}</span>
    </div>
  );
}

// ── SVG delta bar chart + cumulative line ─────────────────────────────────────
function CVDChart({ bars }) {
  if (!Array.isArray(bars) || bars.length === 0) {
    return (
      <div style={{ width: '100%', height: CVD_H, background: SURFACE, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: MUTED, fontSize: 11 }}>No CVD data — load chart or run Analyze first.</span>
      </div>
    );
  }

  const data = bars.slice(-MAX_BARS);
  const n = data.length;

  // Per-bar delta range for bar chart height
  const deltas = data.map((b) => Number(b.delta ?? b.barDelta ?? 0));
  const maxAbsDelta = Math.max(...deltas.map(Math.abs), 0.0001);

  // Cumulative delta range for line chart
  const cumDeltas = data.map((b) => Number(b.cumDelta ?? b.cumulativeDelta ?? 0));
  const minCum = Math.min(...cumDeltas);
  const maxCum = Math.max(...cumDeltas);
  const cumRange = Math.max(maxCum - minCum, 0.0001);

  const step = INNER_W / n;
  const barW = Math.max(1, step * 0.6);
  const midY = PAD.t + INNER_H / 2; // zero line for bar chart

  const toBarH = (d) => Math.abs(d) / maxAbsDelta * (INNER_H / 2 - 2);
  const toCumY = (v) => PAD.t + INNER_H - ((v - minCum) / cumRange) * INNER_H;

  const linePts = data
    .map((b, i) => {
      const cx = PAD.l + i * step + step / 2;
      const cy = toCumY(Number(b.cumDelta ?? b.cumulativeDelta ?? 0));
      return `${cx.toFixed(1)},${cy.toFixed(1)}`;
    })
    .join(' ');

  const finalCum = cumDeltas[cumDeltas.length - 1];
  const lineColor = finalCum >= 0 ? GREEN : RED;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${CHART_W} ${CVD_H}`} style={{ width: '100%', minWidth: 400, background: SURFACE, borderRadius: 6, display: 'block' }}>
        {/* Zero line for bars */}
        <line x1={PAD.l} x2={CHART_W - PAD.r} y1={midY} y2={midY} stroke={MUTED} strokeWidth={0.5} strokeDasharray="3 3" opacity={0.4} />

        {/* Zero line for cumulative (only when range crosses 0) */}
        {minCum < 0 && maxCum > 0 && (
          <line x1={PAD.l} x2={CHART_W - PAD.r} y1={toCumY(0)} y2={toCumY(0)} stroke={MUTED} strokeWidth={0.5} strokeDasharray="2 4" opacity={0.3} />
        )}

        {/* Per-bar delta bars */}
        {data.map((bar, i) => {
          const d = Number(bar.delta ?? bar.barDelta ?? 0);
          const cx = PAD.l + i * step + step / 2;
          const h = toBarH(d);
          const barY = d >= 0 ? midY - h : midY;
          const color = d >= 0 ? GREEN : RED;
          return (
            <rect key={`bar-${i}`} x={cx - barW / 2} y={barY} width={barW} height={Math.max(1, h)} fill={color} opacity={0.5} />
          );
        })}

        {/* Cumulative delta polyline */}
        <polyline points={linePts} fill="none" stroke={lineColor} strokeWidth={1.5} opacity={0.9} />

        {/* End dot */}
        {data.length > 0 && (
          <circle
            cx={PAD.l + (n - 1) * step + step / 2}
            cy={toCumY(finalCum)}
            r={3}
            fill={lineColor}
          />
        )}

        {/* Y-axis labels for cumulative */}
        {[minCum, (minCum + maxCum) / 2, maxCum].map((v, i) => (
          <text key={`yl-${i}`} x={PAD.l - 4} y={toCumY(v) + 3} fill={MUTED} fontSize={8} textAnchor="end" fontFamily="monospace">
            {fmtDelta(v)}
          </text>
        ))}

        {/* X-axis tick labels (first + last timestamp) */}
        {data[0]?.timestamp && (
          <text x={PAD.l} y={CVD_H - 4} fill={MUTED} fontSize={8} fontFamily="monospace">
            {String(data[0].timestamp).slice(11, 16)}
          </text>
        )}
        {data[n - 1]?.timestamp && (
          <text x={CHART_W - PAD.r} y={CVD_H - 4} fill={MUTED} fontSize={8} textAnchor="end" fontFamily="monospace">
            {String(data[n - 1].timestamp).slice(11, 16)}
          </text>
        )}
      </svg>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function CVDOverlay() {
  const { bars, sessionDelta, source, fallback, sessionResetAt, loading, error, liveUpdate, lastUpdated, loadCVD } = useCVDStore();

  const deltaColor = sessionDelta > 0 ? GREEN : sessionDelta < 0 ? RED : TEXT;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ color: TEXT, fontSize: 13 }}>Cumulative Delta Volume</strong>

        {/* Live / approx badge */}
        <SourceBadge source={source} fallback={fallback} />

        {/* Live update indicator */}
        {liveUpdate && (
          <span style={{ fontSize: 10, color: BLUE, background: BLUE + '22', border: `1px solid ${BLUE}55`, borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>
            ● LIVE
          </span>
        )}

        {/* Session delta */}
        <span style={{ marginLeft: 'auto', color: MUTED, fontSize: 11 }}>
          Session CVD:{' '}
          <strong style={{ color: deltaColor, fontFamily: 'monospace' }}>
            {sessionDelta > 0 ? '+' : ''}{fmtDelta(sessionDelta)}
          </strong>
        </span>

        {/* Refresh button */}
        <button
          onClick={loadCVD}
          disabled={loading}
          style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 11, cursor: loading ? 'default' : 'pointer', padding: '3px 8px', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Fallback explanation banner — only when approximation is active */}
      {fallback && (
        <div style={{ background: AMBER + '11', border: `1px solid ${AMBER}44`, borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
          <span style={{ color: AMBER, fontWeight: 700 }}>⚠ Approximation mode:</span>
          <span style={{ color: MUTED, marginLeft: 6 }}>
            {source === 'l1_midpoint'
              ? 'No tick direction available — CVD computed from L1 midpoint pressure. Values are approximate.'
              : source === 'ohlcv_synthetic'
                ? 'No order book data — CVD derived from OHLCV candle structure (synthetic). Treat as directional estimate only.'
                : 'CVD source is synthetic or unknown. Results may not reflect real order flow.'}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#1a0000', border: `1px solid ${RED}44`, borderRadius: 6, padding: '6px 10px', fontSize: 11, color: RED }}>
          {error}
        </div>
      )}

      {/* Chart */}
      <CVDChart bars={bars} />

      {/* Session reset indicator */}
      {sessionResetAt && (
        <div style={{ fontSize: 10, color: MUTED }}>
          Session reset: {new Date(sessionResetAt).toLocaleTimeString()} · Last update: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}
        </div>
      )}
    </div>
  );
}

// ── Settings/controls panel (optional import) ─────────────────────────────────
export function CVDSettings() {
  const { symbol, loadCVD, loading } = useCVDStore();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: MUTED, fontSize: 12 }}>CVD source for {symbol}</span>
      <button onClick={loadCVD} disabled={loading} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 11, cursor: loading ? 'default' : 'pointer', padding: '4px 10px' }}>
        {loading ? 'Loading…' : 'Reload CVD'}
      </button>
    </div>
  );
}
