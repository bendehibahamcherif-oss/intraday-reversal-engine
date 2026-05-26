import { useEffect, useMemo } from 'react';
import { useChartStore } from '../store/chartStore';

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

function CandlestickChart({ candles = [] }) {
  if (!candles.length) return <div style={{ color: '#9ca3af' }}>No chart candles yet.</div>;

  const data = candles.slice(-80);
  const highs = data.map((c) => Number(c.high));
  const lows = data.map((c) => Number(c.low));
  const volumes = data.map((c) => Number(c.volume || 0));
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const maxVol = Math.max(...volumes, 1);
  const width = 900;
  const height = 320;
  const volHeight = 80;
  const candleHeight = height - volHeight - 20;
  const step = width / data.length;
  const bodyWidth = Math.max(3, step * 0.55);

  const y = (price) => {
    const pct = (price - minLow) / Math.max(maxHigh - minLow, 0.000001);
    return candleHeight - pct * (candleHeight - 12) + 6;
  };

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 500, background: '#050505', borderRadius: 10 }}>
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
          const volTop = height - (vol / maxVol) * (volHeight - 8);

          return (
            <g key={`${candle.timestamp || i}-${i}`}>
              <line x1={cx} x2={cx} y1={y(high)} y2={y(low)} stroke={color} strokeWidth="1.4" />
              <rect x={cx - bodyWidth / 2} y={Math.min(top, bottom)} width={bodyWidth} height={Math.max(1.2, Math.abs(bottom - top))} fill={color} opacity="0.95" />
              <rect x={cx - bodyWidth / 2} y={volTop} width={bodyWidth} height={height - volTop - 2} fill={color} opacity="0.4" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function ChartOrderflowWorkspace() {
  const {
    symbol, timeframe, limit, candles, indicators, overlays, orderflow, source, warnings, loading, error, lastUpdated,
    setSymbol, setTimeframe, setLimit, refreshChart, clearError,
  } = useChartStore();

  useEffect(() => {
    refreshChart();
  }, []);

  const latestClose = useMemo(() => candles?.length ? candles[candles.length - 1]?.close : null, [candles]);
  const overlayList = Array.isArray(overlays) ? overlays : [];

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div className="terminal-card" style={{ padding: 14, border: '1px solid #1f2937', borderRadius: 12, background: '#0a0a0a' }}>
        <strong>Chart Controls</strong>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbol" style={{ background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: '8px 10px' }} />
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={{ background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: '8px 10px' }}>
            {['1m', '5m', '15m', '1h'].map((tf) => <option key={tf} value={tf}>{tf}</option>)}
          </select>
          <input type="number" min="10" max="500" value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 100, background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: '8px 10px' }} />
          <button onClick={() => refreshChart()} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
        {error ? <div style={{ marginTop: 10, color: '#fca5a5' }}>Error: {error} <button onClick={clearError} style={{ marginLeft: 8 }}>Dismiss</button></div> : null}
      </div>

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

      <div className="terminal-card" style={{ padding: 14 }}>
        <strong>Source / Warnings</strong>
        <div style={{ marginTop: 8 }}>Source: <strong>{source || 'unknown'}</strong>{source === 'fallback_demo' ? <span style={{ color: '#f59e0b' }}> (Demo fallback, not live)</span> : null}</div>
        {!warnings?.length ? <div style={{ color: '#9ca3af', marginTop: 8 }}>No warnings.</div> : <ul>{warnings.map((w, i) => <li key={`${w}-${i}`} style={{ color: '#f59e0b' }}>{w}</li>)}</ul>}
        <div style={{ color: '#9ca3af', fontSize: 12 }}>Last updated: {lastUpdated || '—'}</div>
      </div>
    </section>
  );
}
