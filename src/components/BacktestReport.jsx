import { useState } from 'react';
import BacktestEquityCurve from './BacktestEquityCurve.jsx';

const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#FFB800';
const BLUE    = '#2563eb';

const fmt2 = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : '—'; };
const fmtPct = (v) => { const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—'; };
const getPnlColor = (v) => { const n = Number(v); return !Number.isFinite(n) || n === 0 ? TEXT : n > 0 ? GREEN : RED; };

const styles = {
  root: {
    background: BG,
    color: TEXT,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 13,
    padding: 16,
    minHeight: '100%',
    boxSizing: 'border-box',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: TEXT,
    margin: 0,
  },
  clearBtn: {
    background: 'transparent',
    border: `1px solid ${RED}44`,
    color: RED,
    borderRadius: 5,
    padding: '3px 10px',
    cursor: 'pointer',
    fontSize: 12,
  },
  disclaimer: {
    fontSize: 11,
    color: MUTED,
    marginBottom: 12,
  },
  errorBanner: {
    background: `${RED}1a`,
    border: `1px solid ${RED}55`,
    color: RED,
    borderRadius: 6,
    padding: '8px 12px',
    marginBottom: 12,
    fontSize: 12,
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 14,
  },
  resultBtn: (active) => ({
    background: active ? `${BLUE}22` : SURFACE,
    border: `1px solid ${active ? BLUE : BORDER}`,
    color: TEXT,
    borderRadius: 6,
    padding: '7px 12px',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: 12,
    transition: 'border-color 0.15s',
  }),
  emptyResults: {
    color: MUTED,
    fontSize: 12,
    padding: '6px 0',
  },
  noSelection: {
    color: MUTED,
    fontSize: 12,
    marginTop: 8,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 8,
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 8,
  },
  metaItem: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: '7px 10px',
  },
  metaKey: {
    fontSize: 10,
    color: MUTED,
    marginBottom: 2,
  },
  metaVal: {
    fontSize: 12,
    color: TEXT,
    wordBreak: 'break-all',
  },
  badge: (ok) => ({
    display: 'inline-block',
    background: ok ? `${GREEN}22` : `${AMBER}22`,
    border: `1px solid ${ok ? GREEN : AMBER}55`,
    color: ok ? GREEN : AMBER,
    borderRadius: 4,
    padding: '2px 7px',
    fontSize: 11,
    fontWeight: 600,
  }),
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 8,
  },
  metricCard: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: '8px 12px',
  },
  metricLabel: {
    fontSize: 10,
    color: MUTED,
    marginBottom: 3,
  },
  metricVal: (color) => ({
    fontSize: 15,
    fontWeight: 700,
    color: color || TEXT,
  }),
  equityWrap: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: 10,
    overflowX: 'auto',
  },
  tradesTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 11,
  },
  th: {
    color: MUTED,
    padding: '4px 6px',
    textAlign: 'left',
    fontWeight: 600,
    borderBottom: `1px solid ${BORDER}`,
  },
  td: {
    padding: '4px 6px',
    borderBottom: `1px solid ${BORDER}22`,
    color: TEXT,
  },
  mcRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  iterInput: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    color: TEXT,
    borderRadius: 5,
    padding: '4px 8px',
    width: 80,
    fontSize: 12,
  },
  runMcBtn: (disabled) => ({
    background: disabled ? `${BLUE}44` : BLUE,
    border: 'none',
    color: '#fff',
    borderRadius: 5,
    padding: '5px 14px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    opacity: disabled ? 0.6 : 1,
  }),
  mcAmber: {
    color: AMBER,
    fontSize: 12,
    marginBottom: 6,
  },
  mcSimulating: {
    color: MUTED,
    fontSize: 12,
    fontStyle: 'italic',
  },
  pctChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  pctChip: (color) => ({
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: '6px 12px',
    textAlign: 'center',
    minWidth: 80,
    borderTop: `3px solid ${color}`,
  }),
  pctChipLabel: {
    fontSize: 10,
    color: MUTED,
    marginBottom: 2,
  },
  pctChipVal: {
    fontSize: 13,
    fontWeight: 700,
    color: TEXT,
  },
  warningsBox: {
    background: `${AMBER}11`,
    border: `1px solid ${AMBER}44`,
    borderRadius: 6,
    padding: '8px 12px',
    marginBottom: 12,
  },
  warningItem: {
    fontSize: 12,
    color: AMBER,
    marginBottom: 2,
  },
  exportRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  exportBtn: (disabled) => ({
    background: disabled ? `${SURFACE}` : SURFACE,
    border: `1px solid ${disabled ? BORDER : BLUE}`,
    color: disabled ? MUTED : BLUE,
    borderRadius: 6,
    padding: '6px 16px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    opacity: disabled ? 0.55 : 1,
  }),
  divider: {
    borderColor: BORDER,
    margin: '14px 0',
  },
};

const PCT_COLOR_MAP = {
  p5:  RED,
  p25: AMBER,
  p50: BLUE,
  p75: GREEN,
  p95: GREEN,
};

const PCT_LABELS = {
  p5:  '5th pct',
  p25: '25th pct',
  p50: 'Median',
  p75: '75th pct',
  p95: '95th pct',
};

function MetaItem({ label, children }) {
  return (
    <div style={styles.metaItem}>
      <div style={styles.metaKey}>{label}</div>
      <div style={styles.metaVal}>{children}</div>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricVal(color)}>{value}</div>
    </div>
  );
}

function PercentileChips({ percentiles, label }) {
  if (!percentiles) return null;
  const keys = ['p5', 'p25', 'p50', 'p75', 'p95'];
  return (
    <div style={{ marginBottom: 10 }}>
      {label && <div style={styles.metricLabel}>{label}</div>}
      <div style={styles.pctChips}>
        {keys.map((k) => (
          <div key={k} style={styles.pctChip(PCT_COLOR_MAP[k])}>
            <div style={styles.pctChipLabel}>{PCT_LABELS[k]}</div>
            <div style={styles.pctChipVal}>{fmt2(percentiles[k])}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BacktestReport({
  result,
  results = [],
  loading,
  error,
  onSelect,
  onClear,
  monteCarloResult,
  mcLoading,
  mcError,
  onRunMonteCarlo,
  onDownloadReport,
  reportDownloading,
}) {
  const [mcIterations, setMcIterations] = useState(500);

  const metrics = result?.metrics || {};
  const trades = result?.trades || [];
  const warnings = result?.warnings || [];
  const candleRange = result?.candleRange || {};

  const exportDisabled = reportDownloading || !result?.id;

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.headerRow}>
        <h2 style={styles.title}>Backtest Results</h2>
        <button
          style={styles.clearBtn}
          onClick={onClear}
          disabled={loading}
        >
          Clear
        </button>
      </div>

      {/* Disclaimer */}
      <div style={styles.disclaimer}>
        Research only · Backtest ≠ live performance · Past results do not imply future profitability
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBanner}>
          {error}
        </div>
      )}

      {/* Results list */}
      <div style={styles.resultsList}>
        {results.length === 0 ? (
          <div style={styles.emptyResults}>No backtest results yet.</div>
        ) : (
          results.map((r) => (
            <button
              key={r.id}
              style={styles.resultBtn(result?.id === r.id)}
              onClick={() => onSelect && onSelect(r.id)}
            >
              {r.strategyName || r.strategyId || r.id}
            </button>
          ))
        )}
      </div>

      {/* No selection placeholder */}
      {!result && (
        <div style={styles.noSelection}>Select a result to view the report.</div>
      )}

      {/* Full report */}
      {result && (
        <>
          <hr style={styles.divider} />

          {/* Metadata */}
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Metadata</div>
            <div style={styles.metaGrid}>
              <MetaItem label="Lookahead">
                <span style={styles.badge(result.noLookaheadVerified)}>
                  {result.noLookaheadVerified ? '✓ No-lookahead verified' : '⚠ Not verified'}
                </span>
              </MetaItem>
              {result.symbol != null && (
                <MetaItem label="Symbol">{result.symbol}</MetaItem>
              )}
              {result.timeframe != null && (
                <MetaItem label="Timeframe">{result.timeframe}</MetaItem>
              )}
              {result.strategyName != null && (
                <MetaItem label="Strategy Name">{result.strategyName}</MetaItem>
              )}
              {result.datasetVersion != null && (
                <MetaItem label="Dataset Version">{result.datasetVersion}</MetaItem>
              )}
              {result.sourceProvider != null && (
                <MetaItem label="Source Provider">{result.sourceProvider}</MetaItem>
              )}
              {(candleRange.from != null || candleRange.to != null) && (
                <MetaItem label="Candle Range">
                  {candleRange.from || '—'} – {candleRange.to || '—'}
                  {candleRange.count != null && (
                    <span style={{ color: MUTED }}> ({candleRange.count} candles)</span>
                  )}
                </MetaItem>
              )}
              {result.createdAt != null && (
                <MetaItem label="Created At">
                  {new Date(result.createdAt).toLocaleString()}
                </MetaItem>
              )}
            </div>
          </div>

          {/* Metrics */}
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Metrics</div>
            <div style={styles.metricsGrid}>
              <MetricCard
                label="Total PnL"
                value={fmt2(metrics.totalPnL)}
                color={getPnlColor(metrics.totalPnL)}
              />
              <MetricCard
                label="Total PnL %"
                value={fmtPct(metrics.totalPnLPercent)}
                color={getPnlColor(metrics.totalPnLPercent)}
              />
              <MetricCard
                label="Win Rate"
                value={fmtPct(metrics.winRate)}
                color={GREEN}
              />
              <MetricCard
                label="Loss Rate"
                value={fmtPct(metrics.lossRate)}
                color={RED}
              />
              <MetricCard
                label="Avg Win"
                value={fmt2(metrics.averageWin)}
                color={GREEN}
              />
              <MetricCard
                label="Avg Loss"
                value={fmt2(metrics.averageLoss)}
                color={RED}
              />
              <MetricCard
                label="Max Drawdown"
                value={fmt2(metrics.maxDrawdown)}
                color={RED}
              />
              <MetricCard
                label="Profit Factor"
                value={fmt2(metrics.profitFactor)}
                color={getPnlColor(metrics.profitFactor)}
              />
              <MetricCard
                label="Expectancy"
                value={fmt2(metrics.expectancy)}
                color={getPnlColor(metrics.expectancy)}
              />
              <MetricCard
                label="# Trades"
                value={metrics.numberOfTrades != null ? String(metrics.numberOfTrades) : '—'}
              />
              <MetricCard
                label="Avg Trade Duration"
                value={metrics.averageTradeDuration != null ? String(metrics.averageTradeDuration) : '—'}
              />
            </div>
          </div>

          {/* Equity Curve */}
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Equity Curve</div>
            <div style={styles.equityWrap}>
              <BacktestEquityCurve trades={trades} width={460} height={100} />
            </div>
          </div>

          {/* Trades summary */}
          {trades.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>
                Trades (showing {Math.min(trades.length, 10)} of {trades.length})
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.tradesTable}>
                  <thead>
                    <tr>
                      {['Dir', 'Entry Time', 'Entry Price', 'Exit Time', 'Exit Price', 'PnL', 'Reason'].map((h) => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 10).map((t, i) => {
                      const dir = t.direction || t.side || '';
                      const isLong = dir.toLowerCase() === 'long' || dir.toLowerCase() === 'buy';
                      const isShort = dir.toLowerCase() === 'short' || dir.toLowerCase() === 'sell';
                      const dirColor = isLong ? GREEN : isShort ? RED : TEXT;
                      return (
                        <tr key={t.id || i}>
                          <td style={{ ...styles.td, color: dirColor, fontWeight: 600 }}>{dir || '—'}</td>
                          <td style={styles.td}>{t.entryTime || '—'}</td>
                          <td style={styles.td}>{fmt2(t.entryPrice)}</td>
                          <td style={styles.td}>{t.exitTime || '—'}</td>
                          <td style={styles.td}>{fmt2(t.exitPrice)}</td>
                          <td style={{ ...styles.td, color: getPnlColor(t.pnl), fontWeight: 600 }}>
                            {fmt2(t.pnl)}
                          </td>
                          <td style={{ ...styles.td, color: MUTED }}>{t.reason || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Monte Carlo */}
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Monte Carlo Simulation</div>
            <div style={styles.mcRow}>
              <input
                type="number"
                min={100}
                max={5000}
                value={mcIterations}
                onChange={(e) => setMcIterations(Number(e.target.value))}
                style={styles.iterInput}
              />
              <button
                style={styles.runMcBtn(mcLoading)}
                disabled={mcLoading}
                onClick={() => onRunMonteCarlo && onRunMonteCarlo(mcIterations)}
              >
                {mcLoading ? 'Running…' : 'Run Monte Carlo'}
              </button>
            </div>

            {mcError && (
              <div style={styles.mcAmber}>{mcError}</div>
            )}
            {mcLoading && !mcError && (
              <div style={styles.mcSimulating}>Simulating…</div>
            )}

            {monteCarloResult && !mcLoading && (
              <>
                {monteCarloResult.iterations != null && (
                  <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>
                    {monteCarloResult.iterations.toLocaleString()} iterations
                  </div>
                )}
                <PercentileChips
                  percentiles={monteCarloResult.percentiles}
                  label="PnL Percentiles"
                />
                {monteCarloResult.maxDrawdownPercentiles && (
                  <div style={{ marginTop: 10 }}>
                    <div style={styles.metricLabel}>Max Drawdown Percentiles</div>
                    <div style={styles.pctChips}>
                      {[['p5', '5th pct'], ['p50', 'Median'], ['p95', '95th pct']].map(([k, lbl]) => (
                        <div key={k} style={styles.pctChip(RED)}>
                          <div style={styles.pctChipLabel}>{lbl}</div>
                          <div style={styles.pctChipVal}>
                            {fmt2(monteCarloResult.maxDrawdownPercentiles[k])}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {monteCarloResult.warnings && monteCarloResult.warnings.length > 0 && (
                  <div style={{ ...styles.warningsBox, marginTop: 10 }}>
                    {monteCarloResult.warnings.map((w, i) => (
                      <div key={i} style={styles.warningItem}>⚠ {w}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div style={styles.warningsBox}>
              <div style={{ fontSize: 11, fontWeight: 600, color: AMBER, marginBottom: 4 }}>
                Warnings
              </div>
              {warnings.map((w, i) => (
                <div key={i} style={styles.warningItem}>⚠ {w}</div>
              ))}
            </div>
          )}

          {/* Export */}
          <div style={styles.exportRow}>
            <button
              style={styles.exportBtn(exportDisabled)}
              disabled={exportDisabled}
              onClick={() => !exportDisabled && onDownloadReport && onDownloadReport(result.id)}
            >
              {reportDownloading ? 'Exporting…' : 'Export HTML Report'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
