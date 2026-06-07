import { useEffect, useMemo, useState } from 'react';
import { useChartStore } from '../store/chartStore';
import { useVolumeProfileStore } from '../store/volumeProfileStore';
import { useCVDStore } from '../store/cvdStore.js';
import { useFootprintStore } from '../store/footprintStore.js';
import { VolumeProfileOverlay, VolumeProfileSettings } from '../components/VolumeProfilePanel';
import CVDOverlay from '../components/CVDOverlay.jsx';
import FootprintSettings from '../components/FootprintSettings.jsx';
import FootprintChart from '../components/FootprintChart.jsx';

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

// Chart constants shared with VolumeProfileOverlay so both use the same coordinate system
const CHART_W = 900;
const CHART_H = 320;
const VOL_H = 80;
const CANDLE_H = CHART_H - VOL_H - 20; // = 220

function CandlestickChart({ candles = [] }) {
  console.debug('[ChartOrderflowWorkspace] chart render trigger', { candleCount: candles.length });
  if (!candles.length) return <div style={{ color: '#9ca3af' }}>No chart candles yet.</div>;

  const data = candles.slice(-80);
  const highs = data.map((c) => Number(c.high));
  const lows = data.map((c) => Number(c.low));
  const volumes = data.map((c) => Number(c.volume || 0));
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const maxVol = Math.max(...volumes, 1);
  const step = CHART_W / data.length;
  const bodyWidth = Math.max(3, step * 0.55);

  const y = (price) => {
    const pct = (price - minLow) / Math.max(maxHigh - minLow, 0.000001);
    return CANDLE_H - pct * (CANDLE_H - 12) + 6;
  };

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: '100%', minWidth: 500, background: '#050505', borderRadius: 10 }}>
        {data.map((candle, i) => {
          const open = Number(candle.open);
          const close = Number(candle.close);
          const high = Number(candle.high);
          const low = Number(candle.low);
          const vol = Number(candle.volume || 0);
          const cx = i * step + step / 2;
          const up = close >= open;
          const color = up ? '#22c55e' : '#ef4444';
          const top = y(Math.max(open, close));
          const bottom = y(Math.min(open, close));
          const volTop = CHART_H - (vol / maxVol) * (VOL_H - 8);

          return (
            <g key={`${candle.timestamp || i}-${i}`}>
              <line x1={cx} x2={cx} y1={y(high)} y2={y(low)} stroke={color} strokeWidth="1.4" />
              <rect x={cx - bodyWidth / 2} y={Math.min(top, bottom)} width={bodyWidth} height={Math.max(1.2, Math.abs(bottom - top))} fill={color} opacity="0.95" />
              <rect x={cx - bodyWidth / 2} y={volTop} width={bodyWidth} height={CHART_H - volTop - 2} fill={color} opacity="0.4" />
            </g>
          );
        })}

        {/* Volume Profile overlay — rendered on top of candles, inside the same SVG coordinate space */}
        <VolumeProfileOverlay
          minPrice={minLow}
          maxPrice={maxHigh}
          chartWidth={CHART_W}
          candleHeight={CANDLE_H}
        />
      </svg>
    </div>
  );
}

export default function ChartOrderflowWorkspace() {
  const {
    symbol, timeframe, limit, candles, indicators, overlays, orderflow, source, warnings, loading, error, lastUpdated,
    setSymbol, setTimeframe, setLimit, refreshChart, clearError, abortChartRequest,
  } = useChartStore();

  // Local draft for the symbol input — avoids firing setSymbol (and a fetch) on every keystroke.
  const [symbolDraft, setSymbolDraft] = useState(symbol);

  // Keep draft in sync when symbol changes externally (e.g. watchlist click).
  useEffect(() => {
    setSymbolDraft(symbol);
  }, [symbol]);

  // Commit the typed symbol to the store after a 500ms pause.
  useEffect(() => {
    const normalized = symbolDraft.trim().toUpperCase();
    if (!normalized || normalized === symbol) return;
    const id = setTimeout(() => setSymbol(normalized), 500);
    return () => clearTimeout(id);
  }, [symbolDraft, symbol, setSymbol]);

  // Auto-fetch chart when symbol, timeframe, or limit finalizes.
  useEffect(() => {
    if (!symbol) return undefined;
    refreshChart();
    return () => abortChartRequest();
  }, [symbol, timeframe, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial volume profile load on mount.
  useEffect(() => {
    useVolumeProfileStore.getState().loadVolumeProfile();
    return () => useVolumeProfileStore.getState().abortVolumeProfileRequest();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load CVD whenever symbol changes; also on mount.
  useEffect(() => {
    useCVDStore.getState().loadCVD();
    return () => useCVDStore.getState().abortCVDRequest();
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync footprint timeframe with chart timeframe; reload if footprint panel is open.
  useEffect(() => {
    const fp = useFootprintStore.getState();
    fp.setTimeframe(timeframe);
    if (fp.visible) fp.loadFootprint();
  }, [symbol, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    console.debug('[ChartOrderflowWorkspace] chart data length', candles?.length || 0);
  }, [candles]);

  const latestClose = useMemo(() => candles?.length ? candles[candles.length - 1]?.close : null, [candles]);
  const latestCandleTimestamp = useMemo(() => candles?.length ? (candles[candles.length - 1]?.timestamp ?? candles[candles.length - 1]?.time ?? '—') : '—', [candles]);
  const overlayList = Array.isArray(overlays) ? overlays : [];
  const hydrated = Array.isArray(candles) && candles.length > 0;

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div className="terminal-card" style={{ padding: 14, border: '1px solid #1f2937', borderRadius: 12, background: '#0a0a0a' }}>
        <strong>Chart Controls</strong>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <input value={symbolDraft} onChange={(e) => setSymbolDraft(e.target.value.toUpperCase())} placeholder="Symbol" style={{ background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: '8px 10px' }} />
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={{ background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: '8px 10px' }}>
            {['1m', '5m', '15m', '1h'].map((tf) => <option key={tf} value={tf}>{tf}</option>)}
          </select>
          <input type="number" min="10" max="500" value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 100, background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: '8px 10px' }} />
          <button onClick={() => refreshChart()} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
        {error ? <div style={{ marginTop: 10, color: '#fca5a5' }}>Error: {error} <button onClick={clearError} style={{ marginLeft: 8 }}>Dismiss</button></div> : null}
      </div>

      {/* Volume Profile settings — show/hide, mode, bins, refresh */}
      <VolumeProfileSettings />

      <div className="terminal-card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><strong>Candlestick Chart</strong><span style={{ color: '#9ca3af' }}>Latest close: {formatNumber(latestClose, 4)}</span></div>
        <CandlestickChart candles={candles} />
      </div>

      <div className="terminal-card" style={{ padding: 14 }}>
        <strong>Indicator Summary</strong>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
          {['vwap', 'ema9', 'ema20', 'rsi14'].map((key) => (
            <div key={key} style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: 10, padding: 10 }}>
              <div style={{ color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>{key}</div>
              <div style={{ fontWeight: 800 }}>{formatNumber(indicators?.[key], 4)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="terminal-card" style={{ padding: 14 }}>
        <strong>Overlay Markers</strong>
        {!overlayList.length ? <div style={{ color: '#9ca3af', marginTop: 8 }}>No overlays yet.</div> : (
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {overlayList.map((item, idx) => (
              <div key={`${item.id || item.timestamp || idx}-${idx}`} style={{ border: '1px solid #1f2937', borderRadius: 10, padding: 10, background: '#0b0b0b' }}>
                <div style={{ fontWeight: 700 }}>{item.type || item.category || 'Overlay marker'}</div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>Price: {formatNumber(item.price, 4)} · Side: {item.side || '—'} · Time: {item.timestamp || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="terminal-card" style={{ padding: 14 }}>
        <strong>Orderflow Snapshot</strong>
        {!orderflow ? <div style={{ color: '#9ca3af', marginTop: 8 }}>No orderflow snapshot yet.</div> : (
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            <div>Spread: <strong>{formatNumber(orderflow.spread, 6)}</strong></div>
            <div>Imbalance: <strong>{formatNumber(orderflow.imbalance, 4)}</strong></div>
            <div>Liquidity Pressure: <strong>{formatNumber(orderflow.liquidityPressure, 4)}</strong></div>
            <div>Top Bids: <strong>{(orderflow.topBids || []).map((b) => `${formatNumber(b?.price, 4)} x ${formatNumber(b?.size, 0)}`).join(' | ') || '—'}</strong></div>
            <div>Top Asks: <strong>{(orderflow.topAsks || []).map((a) => `${formatNumber(a?.price, 4)} x ${formatNumber(a?.size, 0)}`).join(' | ') || '—'}</strong></div>
          </div>
        )}
      </div>

      {/* CVD panel */}
      <div className="terminal-card" style={{ padding: 14 }}>
        <CVDOverlay />
      </div>

      {/* Footprint chart — settings panel first (collapsed by default), chart below when visible */}
      <div className="terminal-card" style={{ padding: 14 }}>
        <FootprintSettings />
        <FootprintChart />
      </div>

      <div className="terminal-card" style={{ padding: 14 }}>
        <strong>Source / Warnings</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>Hydrated: <strong style={{ color: hydrated ? '#22c55e' : '#fca5a5' }}>{hydrated ? 'true' : 'false'}</strong></div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>Candle count: <strong style={{ color: '#e5e7eb' }}>{Array.isArray(candles) ? candles.length : 0}</strong></div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>Latest candle timestamp: <strong style={{ color: '#e5e7eb' }}>{latestCandleTimestamp || '—'}</strong></div>
        <div style={{ marginTop: 8 }}>Source: <strong>{source || 'unknown'}</strong>{source === 'fallback_demo' ? <span style={{ color: '#f59e0b' }}> (Demo fallback, not live)</span> : null}</div>
        {!warnings?.length ? <div style={{ color: '#9ca3af', marginTop: 8 }}>No warnings.</div> : <ul>{warnings.map((w, i) => <li key={`${w}-${i}`} style={{ color: '#f59e0b' }}>{w}</li>)}</ul>}
        <div style={{ color: '#9ca3af', fontSize: 12 }}>Last updated: {lastUpdated || '—'}</div>
      </div>
    </section>
  );
}
