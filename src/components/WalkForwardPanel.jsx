import { useState } from 'react';

const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT     = '#e0e0f0';
const MUTED    = '#6b7280';
const GREEN    = '#22c55e';
const RED      = '#ef4444';
const AMBER    = '#FFB800';
const BLUE     = '#2563eb';

const GRID_COLS = '60px 80px 80px 90px 80px 80px 70px';
const COL_HEADERS = ['Window', 'TrainBars', 'TestBars', 'P&L', 'WinRate%', 'MaxDD', 'Trades'];

function MetricCard({ label, value }) {
  return (
    <div
      style={{
        background: BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 100,
      }}
    >
      <span style={{ fontSize: 11, color: MUTED }}>{label}</span>
      <span style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function GridRow({ cells, isHeader }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_COLS,
        gap: '0 8px',
        padding: '5px 8px',
        borderBottom: `1px solid ${BORDER}`,
        background: isHeader ? SURFACE : 'transparent',
        color: isHeader ? MUTED : TEXT,
        fontSize: isHeader ? 11 : 13,
        fontWeight: isHeader ? 600 : 400,
        textTransform: isHeader ? 'uppercase' : 'none',
        letterSpacing: isHeader ? '0.04em' : 'normal',
      }}
    >
      {cells.map((cell, i) => (
        <span key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cell}
        </span>
      ))}
    </div>
  );
}

function pnlColor(val) {
  if (val == null) return TEXT;
  return val > 0 ? GREEN : val < 0 ? RED : TEXT;
}

function fmt(val, digits = 2) {
  if (val == null || val === undefined) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

export default function WalkForwardPanel({
  strategyCandidates = [],
  result = null,
  loading = false,
  error = '',
  onRun,
}) {
  const [strategyId, setStrategyId] = useState('');
  const [windowSize, setWindowSize] = useState(50);
  const [stepSize, setStepSize] = useState(25);

  function handleRun() {
    if (!strategyId || loading) return;
    if (typeof onRun === 'function') {
      onRun(strategyId, { windowSize, stepSize });
    }
  }

  const windows = result?.windows ?? [];
  const agg = result?.aggregateMetrics ?? {};
  const warnings = result?.warnings ?? [];
  const noLookahead = result?.noLookaheadVerified;

  return (
    <div
      style={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: 16,
        color: TEXT,
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Config row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Strategy selector */}
        <select
          value={strategyId}
          onChange={(e) => setStrategyId(e.target.value)}
          style={{
            background: BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 5,
            color: strategyId ? TEXT : MUTED,
            fontSize: 13,
            padding: '5px 8px',
            minWidth: 180,
            cursor: 'pointer',
          }}
        >
          <option value="" disabled style={{ color: MUTED }}>
            — select strategy —
          </option>
          {strategyCandidates.map((s) => (
            <option key={s._id ?? s.id ?? s.strategyId} value={s._id ?? s.id ?? s.strategyId}>
              {s.name ?? s.strategyId ?? s.id}
            </option>
          ))}
        </select>

        {/* Window size */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: MUTED }}>
          Window
          <input
            type="number"
            min={1}
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value))}
            style={{
              background: BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 5,
              color: TEXT,
              fontSize: 13,
              padding: '5px 8px',
              width: 72,
            }}
          />
        </label>

        {/* Step size */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: MUTED }}>
          Step
          <input
            type="number"
            min={1}
            value={stepSize}
            onChange={(e) => setStepSize(Number(e.target.value))}
            style={{
              background: BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 5,
              color: TEXT,
              fontSize: 13,
              padding: '5px 8px',
              width: 72,
            }}
          />
        </label>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={loading || !strategyId}
          style={{
            background: loading || !strategyId ? BORDER : BLUE,
            border: 'none',
            borderRadius: 5,
            color: loading || !strategyId ? MUTED : '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            padding: '6px 14px',
            cursor: loading || !strategyId ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          Run Walk-Forward
        </button>
      </div>

      {/* Error */}
      {error ? (
        <div
          style={{
            background: `${AMBER}18`,
            border: `1px solid ${AMBER}`,
            borderRadius: 5,
            color: AMBER,
            fontSize: 13,
            padding: '8px 12px',
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Loading */}
      {loading ? (
        <div style={{ color: MUTED, fontSize: 13 }}>Running walk-forward…</div>
      ) : null}

      {/* Result */}
      {!loading && result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* No look-ahead badge */}
          {noLookahead != null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: noLookahead ? `${GREEN}18` : `${AMBER}18`,
                  border: `1px solid ${noLookahead ? GREEN : AMBER}`,
                  borderRadius: 4,
                  color: noLookahead ? GREEN : AMBER,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '3px 9px',
                }}
              >
                {noLookahead ? '✓ No look-ahead verified' : '⚠ Look-ahead not verified'}
              </span>
            </div>
          ) : null}

          {/* Aggregate metrics */}
          {(agg.avgPnL != null || agg.avgWinRate != null || agg.consistencyScore != null) ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {agg.avgPnL != null && (
                <MetricCard
                  label="Avg P&L"
                  value={
                    <span style={{ color: pnlColor(agg.avgPnL) }}>{fmt(agg.avgPnL)}</span>
                  }
                />
              )}
              {agg.avgWinRate != null && (
                <MetricCard
                  label="Avg WinRate"
                  value={`${fmt(agg.avgWinRate * (agg.avgWinRate <= 1 ? 100 : 1))}%`}
                />
              )}
              {agg.consistencyScore != null && (
                <MetricCard
                  label="Consistency"
                  value={fmt(agg.consistencyScore)}
                />
              )}
            </div>
          ) : null}

          {/* Per-window table */}
          {windows.length > 0 ? (
            <div
              style={{
                background: BG,
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <GridRow cells={COL_HEADERS} isHeader />
              {windows.map((w, idx) => {
                const pnl = w.testPnL ?? null;
                const wr = w.winRate != null ? `${fmt(w.winRate * (w.winRate <= 1 ? 100 : 1))}%` : '—';
                const dd = w.maxDrawdown != null ? fmt(w.maxDrawdown) : '—';
                return (
                  <GridRow
                    key={w.windowIndex ?? idx}
                    isHeader={false}
                    cells={[
                      String(w.windowIndex ?? idx + 1),
                      String(w.trainCandleCount ?? '—'),
                      String(w.testCandleCount ?? '—'),
                      <span key="pnl" style={{ color: pnlColor(pnl) }}>
                        {pnl != null ? fmt(pnl) : '—'}
                      </span>,
                      wr,
                      dd,
                      String(w.numberOfTrades ?? '—'),
                    ]}
                  />
                );
              })}
            </div>
          ) : null}

          {/* Warnings */}
          {warnings.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Warnings
              </span>
              {warnings.map((w, i) => (
                <div
                  key={i}
                  style={{
                    background: `${AMBER}12`,
                    border: `1px solid ${AMBER}40`,
                    borderRadius: 4,
                    color: AMBER,
                    fontSize: 12,
                    padding: '4px 10px',
                  }}
                >
                  ⚠ {w}
                </div>
              ))}
            </div>
          ) : null}

        </div>
      ) : null}
    </div>
  );
}
