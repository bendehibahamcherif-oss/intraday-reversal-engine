import { useEffect, useMemo } from 'react';
import { useMacroStore } from '../store/macroStore';
import { useHistoricalDataStore } from '../store/historicalDataStore.js';

const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';
const BLUE    = '#2563eb';
const VIOLET  = '#a78bfa';

const panel = { background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 };
const iStyle = { background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 8px', fontSize: 12 };

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtPct(v, d = 1) {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const pct = Math.abs(n) <= 1.001 ? n * 100 : n;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(d)}%`;
}
function fmtN(v, d = 2) {
  if (v == null) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}

// ── Correlation cell color ─────────────────────────────────────────────────────
// -1 → red, 0 → surface, +1 → green
function finiteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function corrCellStyle(v, isDiag) {
  if (isDiag) return { background: '#15803d', color: '#fff', fontWeight: 800 };
  const value = finiteNumber(v);
  if (value == null) return { background: SURFACE, color: MUTED };
  // Blend: 0→gray, +1→green, -1→red
  let bg, fg;
  if (value >= 0) {
    const t = Math.min(1, Math.max(0, value));
    const r = Math.round(13 + (21 - 13) * (1 - t));
    const g = Math.round(13 + (197 - 13) * t);
    const b = Math.round(26 + (94 - 26) * t);
    bg = `rgb(${Math.round(13 + 60 * t)},${Math.round(13 + 80 * t * t)},${Math.round(26 + 20 * t)})`;
    fg = t > 0.4 ? '#fff' : TEXT;
    void r; void g; void b;
    // simple green tint
    bg = `rgba(34,197,94,${Math.round(t * 50)}%)`.replace('%', '%');
    bg = `rgba(34,197,94,${(t * 0.45).toFixed(2)})`;
    fg = t > 0.55 ? '#fff' : TEXT;
  } else {
    const t = Math.min(1, Math.max(0, -value));
    bg = `rgba(239,68,68,${(t * 0.45).toFixed(2)})`;
    fg = t > 0.55 ? '#fff' : TEXT;
  }
  return { background: bg, color: fg };
}

// ── Correlation Matrix ─────────────────────────────────────────────────────────
function CorrelationMatrix({ correlation, loading, error, requestedSymbols = [] }) {
  if (loading) return <div style={{ color: MUTED, fontSize: 12 }}>Computing correlation matrix…</div>;
  if (error)   return <div style={{ color: RED, fontSize: 12 }}>{error}</div>;
  if (!correlation) return <div style={{ color: MUTED, fontSize: 12 }}>No data. Click ↻ Refresh.</div>;

  if (correlation.status === 'missing_symbols') {
    return (
      <div style={{ fontSize: 12 }}>
        <div style={{ color: AMBER, marginBottom: 4, fontWeight: 700 }}>Dataset missing symbols</div>
        <div style={{ color: TEXT, marginBottom: 2 }}>Missing: <strong style={{ color: RED }}>{(correlation.missingSymbols || []).join(', ')}</strong></div>
        <div style={{ color: MUTED }}>Available in dataset: {(correlation.availableSymbols || []).join(', ') || '(none)'}</div>
        <div style={{ color: MUTED, marginTop: 6 }}>Select a dataset that includes all requested symbols, or remove the missing symbols from the Symbols input.</div>
        {correlation.autoDiscovered && Object.keys(correlation.autoDiscovered).length > 0 && (
          <div style={{ color: MUTED, marginTop: 4 }}>Auto-discovered datasets for: {Object.entries(correlation.autoDiscovered).map(([s, id]) => `${s} → ${id}`).join(', ')}</div>
        )}
      </div>
    );
  }

  if (correlation.status === 'not_enough_data') {
    return (
      <div style={{ fontSize: 12, color: MUTED }}>
        Not enough overlapping observations.
        {correlation.observations != null && <> Aligned rows: <strong style={{ color: TEXT }}>{correlation.observations}</strong> (min {correlation.window} required).</>}
        {' '}Increase date range or reduce window.
      </div>
    );
  }

  const { symbols, matrix } = correlation;
  if (!Array.isArray(matrix) || !matrix.length || !symbols?.length) return <div style={{ color: MUTED, fontSize: 12 }}>Empty result.</div>;

  const multiDatasetBanner = correlation.resolution === 'multi_dataset' && correlation.datasetsBySymbol && (
    <div style={{ fontSize: 11, color: MUTED, marginBottom: 8, padding: '4px 8px', background: '#0a1628', borderRadius: 4, border: `1px solid ${BLUE}44` }}>
      <span style={{ color: BLUE, fontWeight: 700, marginRight: 4 }}>Using compatible datasets: {requestedSymbols.join(', ') || Object.keys(correlation.datasetsBySymbol).join(', ')}</span>
      {Object.entries(correlation.datasetsBySymbol).map(([sym, id]) => (
        <span key={sym} style={{ marginRight: 8 }}>
          <span style={{ color: TEXT }}>{sym}</span>
          <span style={{ color: MUTED }}> → </span>
          <span style={{ color: MUTED, fontFamily: 'monospace' }}>{String(id).slice(0, 40)}{String(id).length > 40 ? '…' : ''}</span>
        </span>
      ))}
    </div>
  );

  const cellW = Math.max(54, Math.min(80, Math.floor(600 / (symbols.length + 1))));
  const cellStyle = {
    width: cellW, minWidth: cellW, textAlign: 'center',
    padding: '5px 3px', fontSize: 11, fontFamily: 'monospace',
    border: `1px solid ${BORDER}22`, borderRadius: 3,
  };
  const hStyle = { ...cellStyle, color: MUTED, fontSize: 10, fontWeight: 700, background: 'transparent' };

  return (
    <div style={{ overflowX: 'auto' }} data-testid="correlation-matrix">
      {multiDatasetBanner}
      <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
        <thead>
          <tr>
            <td style={{ ...hStyle, color: 'transparent' }}>—</td>
            {symbols.map((s) => <th key={s} style={hStyle}>{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, ri) => (
            <tr key={symbols[ri]}>
              <th style={{ ...hStyle, textAlign: 'right', paddingRight: 6 }}>{symbols[ri]}</th>
              {row.map((v, ci) => {
                const isDiag = ri === ci;
                const finiteValue = finiteNumber(v);
                const cs = corrCellStyle(finiteValue, isDiag);
                return (
                  <td key={ci} title={`${symbols[ri]} / ${symbols[ci]}: ${finiteValue ?? 'not enough data'}`} style={{ ...cellStyle, ...cs }}>
                    {isDiag ? '1.00' : (finiteValue != null ? finiteValue.toFixed(2) : '—')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: MUTED }}>
          Window: <strong style={{ color: TEXT }}>{correlation.window}d</strong>
          {'  ·  '}Timeframe: <strong style={{ color: TEXT }}>{correlation.timeframe}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: MUTED }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(239,68,68,0.45)' }} /> −1
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: SURFACE, border: `1px solid ${BORDER}`, margin: '0 2px' }} /> 0
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(34,197,94,0.45)' }} /> +1
        </div>
      </div>
    </div>
  );
}

// ── Rolling Beta panel ─────────────────────────────────────────────────────────
function BetaPanel({ beta, loading, error, selectedAsset, benchmark, setSelectedAsset, setBenchmark, symbols, window: w }) {
  if (loading) return <div style={{ color: MUTED, fontSize: 12 }}>Computing beta…</div>;
  if (error)   return <div style={{ color: RED, fontSize: 12 }}>{error}</div>;

  if (beta?.status === 'missing_symbols') {
    return (
      <div style={{ fontSize: 12 }}>
        <div style={{ color: AMBER, marginBottom: 4, fontWeight: 700 }}>Dataset missing symbols</div>
        <div style={{ color: TEXT, marginBottom: 2 }}>Missing: <strong style={{ color: RED }}>{(beta.missingSymbols || []).join(', ')}</strong></div>
        <div style={{ color: MUTED }}>Available in dataset: {(beta.availableSymbols || []).join(', ') || '(none)'}</div>
        <div style={{ color: MUTED, marginTop: 6 }}>Select a dataset that includes both the asset and benchmark symbols.</div>
      </div>
    );
  }

  const betaMultiDatasetBanner = beta?.resolution === 'multi_dataset' && beta?.datasetsBySymbol && (
    <div style={{ fontSize: 11, color: MUTED, marginBottom: 8, padding: '4px 8px', background: '#0a1628', borderRadius: 4, border: `1px solid ${BLUE}44` }}>
      <span style={{ color: BLUE, fontWeight: 700, marginRight: 4 }}>Using compatible datasets: {symbols.join(', ') || Object.keys(beta.datasetsBySymbol).join(', ')}</span>
      {Object.entries(beta.datasetsBySymbol).map(([sym, id]) => (
        <span key={sym} style={{ marginRight: 8 }}>
          <span style={{ color: TEXT }}>{sym}</span>
          <span style={{ color: MUTED }}> → </span>
          <span style={{ color: MUTED, fontFamily: 'monospace' }}>{String(id).slice(0, 40)}{String(id).length > 40 ? '…' : ''}</span>
        </span>
      ))}
    </div>
  );

  const betaVal = finiteNumber(beta?.beta);
  const r2Val   = finiteNumber(beta?.r2);

  let betaColor = TEXT;
  let betaLabel = '—';
  if (betaVal != null) {
    betaLabel = betaVal >= 0 ? `+${Number(betaVal).toFixed(2)}` : Number(betaVal).toFixed(2);
    betaColor = betaVal > 1.2 ? RED : betaVal > 0.8 ? GREEN : AMBER;
  }

  const chips = [
    { label: 'Beta',     value: betaLabel,                   color: betaColor, testId: 'beta-display-value' },
    { label: 'R²',       value: r2Val != null ? Number(r2Val).toFixed(3) : '—', color: r2Val != null && r2Val > 0.7 ? GREEN : MUTED, testId: 'r2-display-value' },
    { label: 'Window',   value: `${w}d`,                     color: MUTED  },
    { label: 'Asset',    value: selectedAsset,               color: BLUE   },
    { label: 'Benchmark',value: benchmark,                   color: VIOLET },
  ];

  return (
    <div data-testid="beta-panel">
      {betaMultiDatasetBanner}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} style={iStyle}>
          {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ color: MUTED, alignSelf: 'center', fontSize: 12 }}>vs</span>
        <input
          value={benchmark}
          onChange={(e) => setBenchmark(e.target.value.toUpperCase())}
          placeholder="Benchmark"
          style={{ ...iStyle, width: 80 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {chips.map(({ label, value, color, testId }) => (
          <div key={label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 16px', minWidth: 90 }}>
            <div style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
            <div data-testid={testId} style={{ fontWeight: 800, fontFamily: 'monospace', color, fontSize: 15 }}>{value}</div>
          </div>
        ))}
      </div>
      {betaVal != null && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>
            Beta interpretation:
            <strong style={{ color: betaColor, marginLeft: 6 }}>
              {betaVal > 1.2 ? 'High-beta — amplifies market moves' :
               betaVal > 0.8 ? 'Market-neutral — tracks benchmark closely' :
               betaVal > 0    ? 'Low-beta — defensive posture' :
                                'Inverse — negative correlation to benchmark'}
            </strong>
          </div>
          {/* Beta bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: MUTED, width: 28, textAlign: 'right' }}>0</span>
            <div style={{ flex: 1, height: 6, background: BORDER, borderRadius: 3, position: 'relative' }}>
              {/* baseline at β=1 */}
              <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: MUTED }} />
              <div style={{
                position: 'absolute', left: 0,
                width: `${Math.min(100, Math.max(0, (betaVal / 2) * 100))}%`,
                height: '100%', borderRadius: 3,
                background: betaColor,
              }} />
            </div>
            <span style={{ fontSize: 10, color: MUTED, width: 28 }}>2+</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sector Rotation ────────────────────────────────────────────────────────────
function SectorRotationPanel({ sectorRotation, loading, error }) {
  if (loading) return <div style={{ color: MUTED, fontSize: 12 }}>Computing sector rotation…</div>;
  if (error)   return <div style={{ color: RED, fontSize: 12 }}>{error}</div>;

  if (sectorRotation?.status === 'not_available' || sectorRotation?.reason === 'sector_metadata_missing') {
    return (
      <div style={{ fontSize: 12 }}>
        <div style={{ color: AMBER, marginBottom: 4, fontWeight: 700 }}>Sector metadata not available</div>
        <div style={{ color: MUTED, marginBottom: 4 }}>{sectorRotation.message || 'Sector rotation requires standard sector ETF classifications.'}</div>
        {sectorRotation.symbols?.length > 0 && (
          <div style={{ color: MUTED }}>Requested symbols: <strong style={{ color: TEXT }}>{sectorRotation.symbols.join(', ')}</strong></div>
        )}
        <div style={{ color: MUTED, marginTop: 6 }}>Standard sector ETFs: XLK, XLF, XLV, XLE, XLI, XLY, XLC, XLU, XLB, XLRE</div>
      </div>
    );
  }

  if (!sectorRotation?.sectors?.length) return <div style={{ color: MUTED, fontSize: 12 }}>No data. Click ↻ Refresh.</div>;

  const sectors = [...sectorRotation.sectors].filter((s) => s.return != null).sort((a, b) => b.return - a.return);
  if (!sectors.length) return <div style={{ color: MUTED, fontSize: 12 }}>No sector data available.</div>;

  const maxAbs = Math.max(...sectors.map((s) => Math.abs(s.return)));
  const BAR_MAX = 260;

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {sectors.map((s, i) => {
          const isPos = s.return >= 0;
          const barW = maxAbs > 0 ? Math.round((Math.abs(s.return) / maxAbs) * BAR_MAX) : 0;
          const color = isPos ? GREEN : RED;
          const rankBadge = i === 0 ? '▲' : i === sectors.length - 1 ? '▼' : '';
          return (
            <div key={s.symbol} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, fontSize: 10, color: MUTED, textAlign: 'right', fontFamily: 'monospace' }}>#{i + 1}</div>
              <div style={{ width: 36, fontWeight: 700, fontSize: 11, color }}>
                {s.symbol} {rankBadge}
              </div>
              <div style={{ width: 110, fontSize: 10, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.name}
              </div>
              <div style={{ flex: 1, position: 'relative', height: 16, display: 'flex', alignItems: 'center' }}>
                <div style={{ height: 10, width: barW, background: color + '66', borderRadius: 3, border: `1px solid ${color}44` }} />
              </div>
              <div style={{ width: 54, textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color }}>
                {fmtPct(s.return, 2)}
              </div>
              {s.vol != null && (
                <div style={{ width: 48, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: MUTED }}>
                  σ{fmtPct(s.vol, 0)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: MUTED }}>
        Window: <strong style={{ color: TEXT }}>{sectorRotation.window}d</strong>
        {'  ·  Sector ETF proxies: XLK, XLF, XLV, XLE, XLI, XLY, XLC, XLU, XLB, XLRE'}
      </div>
    </div>
  );
}

// ── Volatility Heatmap ─────────────────────────────────────────────────────────
function VolatilityHeatmap({ volatility, loading, error }) {
  if (loading) return <div style={{ color: MUTED, fontSize: 12 }}>Computing volatility…</div>;
  if (error)   return <div style={{ color: RED, fontSize: 12 }}>{error}</div>;

  if (volatility?.status === 'missing_symbols') {
    return (
      <div style={{ fontSize: 12 }}>
        <div style={{ color: AMBER, marginBottom: 4, fontWeight: 700 }}>Dataset missing symbols</div>
        <div style={{ color: TEXT, marginBottom: 2 }}>Missing: <strong style={{ color: RED }}>{(volatility.missingSymbols || []).join(', ')}</strong></div>
        <div style={{ color: MUTED }}>Available in dataset: {(volatility.availableSymbols || []).join(', ') || '(none)'}</div>
      </div>
    );
  }

  // Use volatility array; also accept heatmap as fallback field name
  const items_raw = volatility?.volatility || volatility?.heatmap || [];
  if (!items_raw.length) return <div style={{ color: MUTED, fontSize: 12 }}>No data. Click ↻ Refresh.</div>;

  const items = [...items_raw].sort((a, b) => (b.vol ?? 0) - (a.vol ?? 0));

  function volColor(v) {
    if (v == null) return SURFACE;
    if (v > 0.40) return RED;
    if (v > 0.28) return AMBER;
    if (v > 0.16) return BLUE;
    return GREEN;
  }
  function volLabel(v) {
    if (v == null) return '—';
    if (v > 0.40) return 'EXTREME';
    if (v > 0.28) return 'HIGH';
    if (v > 0.16) return 'MOD';
    return 'LOW';
  }

  const th = { padding: '5px 10px', fontSize: 10, color: MUTED, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
  const td = { padding: '5px 8px', fontSize: 12, borderBottom: `1px solid ${BORDER}22`, verticalAlign: 'middle' };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
        <thead>
          <tr>
            <th style={th}>Symbol</th>
            <th style={{ ...th, textAlign: 'right' }}>Ann. Vol</th>
            <th style={{ ...th, textAlign: 'right' }}>Return ({volatility.window}d)</th>
            <th style={th}>Regime</th>
            <th style={{ ...th }}>Vol Level</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const color = volColor(row.vol);
            const label = volLabel(row.vol);
            const retVal = Number(row.return ?? 0);
            const retColor = retVal >= 0 ? GREEN : RED;
            const barPct = row.vol != null ? Math.min(100, Math.round((row.vol / 0.5) * 100)) : 0;
            return (
              <tr key={row.symbol}>
                <td style={{ ...td, fontWeight: 700, color: TEXT }}>{row.symbol}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color }}>
                  {row.vol != null ? `${(row.vol * 100).toFixed(1)}%` : '—'}
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: retColor }}>
                  {fmtPct(row.return, 2)}
                </td>
                <td style={{ ...td }}>
                  <span style={{ background: color + '22', color, border: `1px solid ${color}55`, borderRadius: 4, fontSize: 10, padding: '2px 6px', fontWeight: 700 }}>
                    {label}
                  </span>
                </td>
                <td style={{ ...td, width: 140 }}>
                  <div style={{ background: BORDER, borderRadius: 3, height: 6, width: '100%', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 3 }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: MUTED, marginTop: 6 }}>
        Annualized volatility = rolling σ(log returns) × √252 &nbsp;·&nbsp; Window: {volatility.window}d
      </div>
    </div>
  );
}

// ── Config bar ─────────────────────────────────────────────────────────────────
function ConfigBar({ store }) {
  const { symbolsInput, window: w, timeframe, setSymbolsInput, applySymbols, setWindow, setTimeframe } = store;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: MUTED }}>Symbols (comma-separated, max 12)</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={symbolsInput}
            onChange={(e) => setSymbolsInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySymbols()}
            style={{ ...iStyle, width: 280 }}
            placeholder="SPY, QQQ, IWM, DIA, TLT, GLD"
          />
          <button
            onClick={applySymbols}
            style={{ background: BLUE + '22', color: BLUE, border: `1px solid ${BLUE}55`, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Apply
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: MUTED }}>Window (bars)</span>
        <input
          type="number" min="5" max="252" step="5"
          value={w}
          onChange={(e) => setWindow(e.target.value)}
          style={{ ...iStyle, width: 70 }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: MUTED }}>Timeframe</span>
        <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={iStyle}>
          <option value="1m">1m</option>
          <option value="5m">5m</option>
          <option value="1d">1d</option>
        </select>
      </div>
    </div>
  );
}

// ── Main workspace ─────────────────────────────────────────────────────────────
export default function MacroWorkspace() {
  const store = useMacroStore();
  const {
    symbols, benchmark, window: w, selectedAsset,
    correlation, correlationLoading, correlationError,
    beta, betaLoading, betaError,
    sectorRotation, sectorRotationLoading, sectorRotationError,
    volatility, volatilityLoading, volatilityError,
    correlationDatasetId,
    setBenchmark, setSelectedAsset,
    loadBeta, refreshAll, clearErrors,
  } = store;

  useEffect(() => {
    const histState = useHistoricalDataStore.getState();
    store.validateSelectedCorrelationDataset?.(histState.datasets || []);
    refreshAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for dataset selection from Historical Data workspace
  useEffect(() => {
    const { selectedCorrelationDatasetId: histId, selectedCorrelationDataset: histDataset } =
      useHistoricalDataStore.getState();
    store.validateSelectedCorrelationDataset?.(useHistoricalDataStore.getState().datasets || []);
    if (histId && !useMacroStore.getState().correlationDatasetId) {
      store.setCorrelationDatasetId(histId, histDataset);
      store.refreshAll();
    }

    function onDatasetCorrelation(e) {
      const { datasetId, dataset } = e.detail || {};
      if (datasetId) {
        store.setCorrelationDatasetId(datasetId, dataset);
        store.refreshAll();
      }
    }
    window.addEventListener('reversal:use-dataset-correlation', onDatasetCorrelation);
    return () => window.removeEventListener('reversal:use-dataset-correlation', onDatasetCorrelation);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const anyError = correlationError || betaError || sectorRotationError || volatilityError;
  const displayedAssetCount = symbols.length;
  const showDebug = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('debugMacro') === '1'; } catch { return false; }
  }, []);

  return (
    <section style={{ display: 'grid', gap: 12 }} data-testid="macro-workspace">

      {/* Header */}
      <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>Multi-Asset Analytics</strong>
        <span style={{ background: VIOLET + '22', color: VIOLET, border: `1px solid ${VIOLET}55`, borderRadius: 4, fontSize: 10, padding: '2px 7px', fontWeight: 700 }}>
          Phase 13
        </span>
        {correlationDatasetId && <span style={{ color: MUTED, fontSize: 12 }}>Dataset: <strong>{correlationDatasetId}</strong></span>}
        <button
          onClick={refreshAll}
          style={{ marginLeft: 'auto', background: BLUE, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          ↻ Refresh All
        </button>
      </div>

      {/* Error bar */}
      {anyError && (
        <div style={{ ...panel, borderColor: '#7f1d1d', color: '#fecaca', display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
          {anyError}
          <button onClick={clearErrors} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #7f1d1d', borderRadius: 5, color: '#fecaca', cursor: 'pointer', padding: '2px 10px' }}>Dismiss</button>
        </div>
      )}

      {/* Config */}
      <div style={panel}>
        <div style={{ marginBottom: 10 }}><strong>Configuration</strong></div>
        <ConfigBar store={store} />
      </div>

      {/* ── Correlation Matrix ──────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Rolling Correlation Matrix</strong>
          {correlationLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
          <span style={{ fontSize: 11, color: MUTED }}>
            {`${displayedAssetCount} assets`}
          </span>
        </div>
        <CorrelationMatrix correlation={correlation} loading={correlationLoading} error={correlationError} requestedSymbols={symbols} />
      </div>

      {/* ── Rolling Beta ────────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Rolling Beta vs Benchmark</strong>
          {betaLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
          <button
            onClick={loadBeta}
            style={{ marginLeft: 'auto', background: VIOLET + '22', color: VIOLET, border: `1px solid ${VIOLET}55`, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            Compute Beta
          </button>
        </div>
        <BetaPanel
          beta={beta} loading={betaLoading} error={betaError}
          selectedAsset={selectedAsset} benchmark={benchmark}
          setSelectedAsset={setSelectedAsset} setBenchmark={setBenchmark}
          symbols={symbols} window={w}
        />
      </div>


      {showDebug && (
        <div style={{ ...panel, fontSize: 11, color: MUTED }} data-testid="macro-debug-panel">
          <strong style={{ color: TEXT }}>Macro debug</strong>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '8px 0 0' }}>{JSON.stringify({
            inputSymbolsRaw: store.symbolsInput,
            normalizedSymbols: symbols,
            displayedAssetCount,
            selectedCorrelationDatasetId: correlationDatasetId,
            clearedStaleDatasetId: store.clearedStaleDatasetId,
            datasetIdsSent: store.lastRequest?.datasetIds || [],
            datasetsBySymbol: correlation?.datasetsBySymbol || beta?.datasetsBySymbol || store.lastResolution?.datasetsBySymbol || {},
            backendStatus: correlation?.status || beta?.status || null,
            backendResolution: correlation?.resolution || beta?.resolution || null,
            alignedRows: correlation?.alignedRows || beta?.alignedRows || null,
            observations: correlation?.observations || beta?.observations || null,
            diagnostics: correlation?.diagnostics || beta?.diagnostics || null,
          }, null, 2)}</pre>
        </div>
      )}

      {/* ── Sector Rotation ─────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Sector Rotation</strong>
          {sectorRotationLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
          {sectorRotation?.computedAt && (
            <span style={{ fontSize: 11, color: MUTED, marginLeft: 'auto' }}>
              {new Date(sectorRotation.computedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <SectorRotationPanel sectorRotation={sectorRotation} loading={sectorRotationLoading} error={sectorRotationError} />
      </div>

      {/* ── Volatility Heatmap ───────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Volatility Heatmap</strong>
          {volatilityLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
        </div>
        <VolatilityHeatmap volatility={volatility} loading={volatilityLoading} error={volatilityError} />
      </div>

    </section>
  );
}
