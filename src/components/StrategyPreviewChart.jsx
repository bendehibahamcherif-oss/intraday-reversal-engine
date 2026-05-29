import { useRuleBuilderStore } from '../store/ruleBuilderStore.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const W = 380;
const H = 90;
const PAD = { t: 8, r: 8, b: 20, l: 44 };
const INNER_W = W - PAD.l - PAD.r;
const INNER_H = H - PAD.t - PAD.b;

const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const AMBER   = '#FFB800';
const GREEN   = '#22c55e';
const RED     = '#ef4444';

const LEGAL_DISCLAIMER = `RESEARCH TOOL ONLY — NOT FINANCIAL ADVICE

This backtest preview is provided exclusively for research and educational purposes.

• Past backtest results do NOT predict, guarantee, or imply future performance.
• Strategy rules may be overfitted to historical data used to construct them.
• Real trading involves costs, slippage, market impact, and regulatory constraints not reflected here.
• The single-trade preview is a simplified simulation, not a rigorous walk-forward test.
• This tool does not constitute financial advice. Do not risk real capital based on these results without independent professional review.

By accepting, you confirm you understand this tool is for research purposes only.`;

// ── Equity curve SVG ──────────────────────────────────────────────────────────
function EquityCurve({ trades }) {
  if (!Array.isArray(trades) || trades.length === 0) {
    return <div style={{ color: MUTED, fontSize: 12, padding: '20px 0' }}>No trades in this result.</div>;
  }

  // Build cumulative P&L points
  const cumulative = [];
  let running = 0;
  cumulative.push(0);
  for (const t of trades) {
    running += Number(t.pnl) || 0;
    cumulative.push(running);
  }

  const minY = Math.min(...cumulative);
  const maxY = Math.max(...cumulative);
  const rangeY = Math.max(maxY - minY, 0.0001);

  const toX = (i) => PAD.l + (i / (cumulative.length - 1)) * INNER_W;
  const toY = (v) => PAD.t + INNER_H - ((v - minY) / rangeY) * INNER_H;

  const points = cumulative.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const finalPnl = cumulative[cumulative.length - 1];
  const lineColor = finalPnl >= 0 ? GREEN : RED;

  // Y-axis labels
  const yLabels = [minY, (minY + maxY) / 2, maxY];

  return (
    <svg width={W} height={H} style={{ display: 'block', background: SURFACE, borderRadius: 6 }}>
      {/* Zero line */}
      {minY < 0 && maxY > 0 && (
        <line
          x1={PAD.l} x2={W - PAD.r}
          y1={toY(0)} y2={toY(0)}
          stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
        />
      )}
      {/* Y-axis labels */}
      {yLabels.map((v, i) => (
        <text key={i} x={PAD.l - 4} y={toY(v) + 4} fill={MUTED} fontSize={9} textAnchor="end" fontFamily="monospace">
          {v >= 0 ? '+' : ''}{v.toFixed(2)}
        </text>
      ))}
      {/* Equity polyline */}
      <polyline points={points} fill="none" stroke={lineColor} strokeWidth={1.5} />
      {/* Start dot */}
      <circle cx={toX(0)} cy={toY(0)} r={2.5} fill={MUTED} />
      {/* End dot */}
      <circle cx={toX(cumulative.length - 1)} cy={toY(finalPnl)} r={3} fill={lineColor} />
    </svg>
  );
}

// ── Metric chip ───────────────────────────────────────────────────────────────
function Chip({ label, value, color }) {
  return (
    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || TEXT, marginTop: 2, fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

function fmt(v, digits = 2) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StrategyPreviewChart() {
  const {
    previewBacktest,
    previewLoading,
    disclaimerAccepted,
    acceptDisclaimer,
    runPreviewBacktest,
    draftRuleSet,
  } = useRuleBuilderStore();

  const m = previewBacktest?.metrics || {};
  const trades = previewBacktest?.trades || [];
  const warnings = previewBacktest?.warnings || [];
  const totalPnl = Number(m.totalPnL ?? 0);
  const pnlColor = totalPnl > 0 ? GREEN : totalPnl < 0 ? RED : TEXT;

  // ── Disclaimer gate ───────────────────────────────────────────────────────────
  if (!disclaimerAccepted) {
    return (
      <div style={{ border: `1px solid ${AMBER}`, borderRadius: 10, padding: 16, background: '#0a0800', position: 'relative' }}>
        <div style={{ color: AMBER, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
          ⚠ Accept Disclaimer to Enable Preview
        </div>
        <pre style={{ color: MUTED, fontSize: 11, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0 0 14px', lineHeight: 1.5 }}>
          {LEGAL_DISCLAIMER}
        </pre>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            onChange={(e) => { if (e.target.checked) acceptDisclaimer(); }}
            style={{ width: 16, height: 16, accentColor: AMBER, cursor: 'pointer' }}
          />
          <span style={{ color: TEXT, fontSize: 13 }}>
            I understand this is a research tool. Past results do not imply future profitability.
          </span>
        </label>
      </div>
    );
  }

  // ── Preview panel (disclaimer accepted) ──────────────────────────────────────
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Persistent compact disclaimer badge */}
      <div style={{ background: '#0a0800', border: `1px solid ${AMBER}44`, borderRadius: 6, padding: '6px 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: AMBER, fontSize: 12 }}>⚠</span>
        <span style={{ color: MUTED, fontSize: 11 }}>Research only · Not financial advice · Backtest ≠ live performance</span>
        <span style={{ marginLeft: 'auto', color: GREEN, fontSize: 10 }}>Disclaimer accepted ✓</span>
      </div>

      {/* Run button */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={runPreviewBacktest}
          disabled={previewLoading}
          style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 12, cursor: previewLoading ? 'default' : 'pointer', opacity: previewLoading ? 0.7 : 1, fontWeight: 600 }}
        >
          {previewLoading ? 'Running…' : '▶ Run Preview Backtest'}
        </button>
        <span style={{ color: MUTED, fontSize: 11 }}>Symbol: {draftRuleSet?.symbol || 'SPY'} · Timeframe: {draftRuleSet?.timeframe || '5m'}</span>
      </div>

      {previewBacktest && (
        <>
          {/* Equity curve */}
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>
              Equity curve — {trades.length} trade{trades.length !== 1 ? 's' : ''} · {previewBacktest.symbol} · {previewBacktest.timeframe}
            </div>
            <EquityCurve trades={trades} />
          </div>

          {/* Metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
            <Chip label="Total P&L" value={`${totalPnl >= 0 ? '+' : ''}${fmt(totalPnl)}`} color={pnlColor} />
            <Chip label="Trades" value={m.numberOfTrades ?? trades.length} />
            <Chip label="Win Rate" value={m.winRate != null ? `${(Number(m.winRate) * 100).toFixed(0)}%` : '—'} />
            <Chip label="Max DD" value={m.maxDrawdown != null ? fmt(m.maxDrawdown) : '—'} color={Number(m.maxDrawdown) < 0 ? RED : TEXT} />
            <Chip label="Profit Factor" value={m.profitFactor != null ? fmt(m.profitFactor) : '—'} />
            <Chip label="Expectancy" value={m.expectancy != null ? fmt(m.expectancy) : '—'} />
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div style={{ background: '#1a0a00', border: `1px solid ${AMBER}44`, borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ color: AMBER, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Backtest warnings:</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {warnings.map((w, i) => <li key={i} style={{ color: MUTED, fontSize: 11, marginBottom: 2 }}>{w}</li>)}
              </ul>
            </div>
          )}

          <div style={{ color: MUTED, fontSize: 10 }}>
            Result ID: {previewBacktest.id} · Created: {previewBacktest.createdAt ? new Date(previewBacktest.createdAt).toLocaleString() : '—'}
          </div>
        </>
      )}

      {!previewBacktest && !previewLoading && (
        <div style={{ color: MUTED, fontSize: 12 }}>
          Click "Run Preview Backtest" to see a simplified simulation. Ensure strategies are generated first (run Evaluate to populate context).
        </div>
      )}
    </div>
  );
}
