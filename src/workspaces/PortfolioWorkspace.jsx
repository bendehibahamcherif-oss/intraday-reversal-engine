import { useEffect } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';

const BLUE   = '#2563eb';
const RED    = '#ef4444';
const GREEN  = '#22c55e';
const MUTED  = '#6b7280';
const BORDER = '#1f2937';
const SURFACE = '#0d0d1a';

function fmtMoney(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(2)}K` : abs.toFixed(digits);
  return n < 0 ? `-${s}` : s;
}

function fmtPct(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function fmtN(v, digits = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function ModeBadge({ mode, onToggle }) {
  const live = mode === 'live';
  return (
    <button
      onClick={onToggle}
      style={{
        background: live ? RED + '22' : BLUE + '22',
        color: live ? RED : BLUE,
        border: `1px solid ${live ? RED + '66' : BLUE + '66'}`,
        borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '4px 12px', cursor: 'pointer',
      }}
    >
      {live ? '● LIVE' : '◎ PAPER'}
    </button>
  );
}

function Chip({ label, value, color }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ color: MUTED, fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 800, color: color || '#e5e7eb', fontFamily: 'monospace', fontSize: 14 }}>{value}</div>
    </div>
  );
}

function ExposureBar({ label, value, max, color }) {
  const pct = Math.min(100, max > 0 ? (Math.abs(Number(value) || 0) / max) * 100 : 0);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED, marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>{fmtMoney(value)}</span>
      </div>
      <div style={{ background: '#111', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

function DrawdownChart({ drawdown }) {
  if (!drawdown?.series?.length) {
    return <div style={{ color: MUTED, fontSize: 12 }}>No drawdown series data.</div>;
  }
  const W = 600, H = 90, PAD = { t: 10, r: 10, b: 22, l: 44 };
  const series = drawdown.series.map((v) => Number(v));
  const minDD = Math.min(...series, 0);
  const range = Math.abs(minDD) || 0.000001;
  const ry = (v) => PAD.t + ((0 - v) / range) * (H - PAD.t - PAD.b);
  const rx = (i) => PAD.l + (i / Math.max(series.length - 1, 1)) * (W - PAD.l - PAD.r);
  const pts = series.map((v, i) => `${rx(i).toFixed(1)},${ry(v).toFixed(1)}`).join(' ');
  const firstX = rx(0).toFixed(1);
  const lastX = rx(series.length - 1).toFixed(1);
  const maxDD = Number(drawdown.maxDrawdown ?? minDD);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, background: '#050505', borderRadius: 8 }}>
      <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t} y2={PAD.t} stroke={BORDER} strokeWidth="1" />
      {minDD < 0 && (
        <line x1={PAD.l} x2={W - PAD.r} y1={ry(minDD)} y2={ry(minDD)} stroke={RED + '55'} strokeWidth="1" strokeDasharray="4 4" />
      )}
      <polygon points={`${firstX},${PAD.t} ${pts} ${lastX},${PAD.t}`} fill={RED + '18'} />
      <polyline points={pts} fill="none" stroke={RED} strokeWidth="1.5" />
      <text x={PAD.l - 3} y={PAD.t + 4} fill={MUTED} fontSize="8" textAnchor="end">0%</text>
      <text x={PAD.l - 3} y={H - PAD.b} fill={MUTED} fontSize="8" textAnchor="end">{fmtPct(minDD, 1)}</text>
      <text x={W - PAD.r} y={H - PAD.b + 12} fill={MUTED} fontSize="8" textAnchor="end">Max DD: {fmtPct(maxDD, 2)}</text>
    </svg>
  );
}

function PositionsTable({ positions }) {
  if (!positions.length) {
    return <div style={{ color: MUTED, marginTop: 8, fontSize: 13 }}>No open positions.</div>;
  }
  const th = { padding: '6px 10px', fontSize: 11, color: MUTED, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
  const td = { padding: '6px 10px', fontSize: 12, fontFamily: 'monospace', borderBottom: `1px solid ${BORDER}22` };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
        <thead>
          <tr>
            <th style={th}>Symbol</th>
            <th style={th}>Side</th>
            <th style={{ ...th, textAlign: 'right' }}>Qty</th>
            <th style={{ ...th, textAlign: 'right' }}>Entry</th>
            <th style={{ ...th, textAlign: 'right' }}>Price</th>
            <th style={{ ...th, textAlign: 'right' }}>Unrealized P&L</th>
            <th style={{ ...th, textAlign: 'right' }}>Fresh At</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const upnl = Number(p.unrealizedPnL ?? p.unrealized_pnl ?? p.unrealizedPnl ?? 0);
            const pnlColor = upnl > 0 ? GREEN : upnl < 0 ? RED : '#e5e7eb';
            const freshAt = p.freshAt ?? p.fresh_at ?? p.updatedAt ?? null;
            const side = String(p.side || p.direction || '—').toUpperCase();
            return (
              <tr key={`${p.symbol || i}-${i}`}>
                <td style={{ ...td, fontWeight: 700, color: '#e5e7eb' }}>{p.symbol || '—'}</td>
                <td style={{ ...td, color: side === 'LONG' ? GREEN : side === 'SHORT' ? RED : MUTED }}>{side}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtN(p.quantity ?? p.qty, 2)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(p.entryPrice ?? p.entry_price ?? p.avgCost, 4)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(p.currentPrice ?? p.price ?? p.markPrice, 4)}</td>
                <td style={{ ...td, textAlign: 'right', color: pnlColor }}>{fmtMoney(upnl)}</td>
                <td style={{ ...td, textAlign: 'right', color: MUTED, fontSize: 10 }}>
                  {freshAt ? new Date(freshAt).toLocaleTimeString() : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PortfolioWorkspace() {
  const {
    mode, setMode,
    positions, positionsLoading, positionsError,
    pnl, pnlLoading, pnlError,
    exposure, exposureLoading, exposureError,
    drawdown, drawdownLoading, drawdownError,
    loadAll,
  } = usePortfolioStore();

  useEffect(() => { loadAll(); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const grossMax = Math.max(
    Math.abs(Number(exposure?.gross) || 0),
    Math.abs(Number(exposure?.net) || 0),
    Math.abs(Number(exposure?.long) || 0),
    Math.abs(Number(exposure?.short) || 0),
    1,
  );

  const winRateRaw = Number(pnl?.winRate ?? pnl?.win_rate ?? 0);
  const winRatePct = winRateRaw <= 1 ? winRateRaw * 100 : winRateRaw;

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div className="terminal-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong style={{ fontSize: 15 }}>Portfolio Analytics</strong>
        <ModeBadge mode={mode} onToggle={() => setMode(mode === 'paper' ? 'live' : 'paper')} />
        <button
          onClick={loadAll}
          style={{ marginLeft: 'auto', background: BLUE, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          ↻ Refresh All
        </button>
      </div>

      {/* Positions */}
      <div className="terminal-card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <strong>Open Positions</strong>
          {positionsLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
        </div>
        {positionsError
          ? <div style={{ color: RED, fontSize: 12 }}>{positionsError}</div>
          : <PositionsTable positions={positions} />}
      </div>

      {/* PnL */}
      <div className="terminal-card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <strong>P&amp;L Summary</strong>
          {pnlLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
        </div>
        {pnlError ? (
          <div style={{ color: RED, fontSize: 12 }}>{pnlError}</div>
        ) : pnl ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <Chip label="Realized" value={fmtMoney(pnl.realized)} color={Number(pnl.realized) >= 0 ? GREEN : RED} />
            <Chip label="Unrealized" value={fmtMoney(pnl.unrealized)} color={Number(pnl.unrealized) >= 0 ? GREEN : RED} />
            <Chip label="Total" value={fmtMoney(pnl.total)} color={Number(pnl.total) >= 0 ? GREEN : RED} />
            <Chip label="Daily P&L" value={fmtMoney(pnl.dailyPnL ?? pnl.daily_pnl)} color={Number(pnl.dailyPnL ?? pnl.daily_pnl) >= 0 ? GREEN : RED} />
            <Chip label="Win Rate" value={fmtPct(winRatePct, 1)} />
            <Chip label="Trades" value={fmtN(pnl.tradeCount ?? pnl.trade_count, 0)} />
          </div>
        ) : (
          <div style={{ color: MUTED, fontSize: 12 }}>No P&L data. Click Refresh All to load.</div>
        )}
      </div>

      {/* Exposure */}
      <div className="terminal-card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <strong>Exposure</strong>
          {exposureLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
        </div>
        {exposureError ? (
          <div style={{ color: RED, fontSize: 12 }}>{exposureError}</div>
        ) : exposure ? (
          <div>
            <ExposureBar label="Gross" value={exposure.gross} max={grossMax} color={BLUE} />
            <ExposureBar label="Net" value={exposure.net} max={grossMax} color={Number(exposure.net) >= 0 ? GREEN : RED} />
            <ExposureBar label="Long" value={exposure.long} max={grossMax} color={GREEN} />
            <ExposureBar label="Short" value={exposure.short} max={grossMax} color={RED} />
            {exposure.leverage != null && (
              <div style={{ marginTop: 10, fontSize: 12, color: MUTED }}>
                Leverage: <strong style={{ color: '#e5e7eb' }}>{fmtN(exposure.leverage, 2)}x</strong>
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: MUTED, fontSize: 12 }}>No exposure data. Click Refresh All to load.</div>
        )}
      </div>

      {/* Drawdown */}
      <div className="terminal-card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <strong>Drawdown</strong>
          {drawdownLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
          {drawdown && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: MUTED }}>
              Current: <strong style={{ color: RED }}>{fmtPct(drawdown.currentDrawdown, 2)}</strong>
              {' · '}Max: <strong style={{ color: RED }}>{fmtPct(drawdown.maxDrawdown, 2)}</strong>
            </span>
          )}
        </div>
        {drawdownError ? (
          <div style={{ color: RED, fontSize: 12 }}>{drawdownError}</div>
        ) : (
          <DrawdownChart drawdown={drawdown} />
        )}
      </div>
    </section>
  );
}
