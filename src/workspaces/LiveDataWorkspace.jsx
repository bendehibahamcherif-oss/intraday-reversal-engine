import { useEffect } from 'react';
import { useFeedStore } from '../store/feedStore.js';

const panelStyle = { background: '#0a0a0a', border: '1px solid #202020', borderRadius: 12, padding: 12 };

function toPrettyJson(value) {
  if (!value || typeof value !== 'object') return '—';
  return JSON.stringify(value, null, 2);
}

function statusLabel(status) {
  const source = String(status?.source || status?.mode || status?.state || 'unknown');
  const connected = Boolean(status?.connected === true);
  const explicitLive = String(status?.live || status?.feedType || '').toLowerCase() === 'live';
  const isLive = connected && explicitLive;
  if (isLive) return `LIVE (${source})`;
  if (source.includes('fallback_demo') || source.includes('idle_demo')) return `DEMO (${source})`;
  return `${connected ? 'CONNECTED' : 'NOT CONNECTED'} (${source})`;
}

export default function LiveDataWorkspace() {
  const store = useFeedStore();

  useEffect(() => {
    store.refreshAll();
  }, [store.symbol, store.timeframe]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>Live Data Controls</h3>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 120px auto auto' }}>
          <input value={store.symbol} onChange={(e) => store.setSymbol(e.target.value)} placeholder="Symbol" />
          <select value={store.timeframe} onChange={(e) => store.setTimeframe(e.target.value)}>
            <option value="1m">1m</option><option value="5m">5m</option><option value="15m">15m</option><option value="1H">1H</option>
          </select>
          <button onClick={store.refreshAll} disabled={store.loading}>Refresh</button>
          <button onClick={store.generateDemoMarketData} disabled={store.loading}>Generate Demo Data</button>
        </div>
        {store.error ? <p style={{ color: '#fca5a5' }}>{store.error}</p> : null}
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <section style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>Feed Status</h3>
          <div><strong>Status:</strong> {statusLabel(store.feedStatus)}</div>
          <div><strong>source:</strong> {String(store.feedStatus?.source || store.feedStatus?.mode || 'unknown')}</div>
          <div><strong>connected:</strong> {String(Boolean(store.feedStatus?.connected))}</div>
          {String(store.feedStatus?.source || '').includes('fallback_demo') || String(store.feedStatus?.source || '').includes('idle_demo') ? (
            <div style={{ color: '#fbbf24', marginTop: 6 }}>Demo/idle feed active (not live).</div>
          ) : null}
        </section>

        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Latest Tick</h3><pre>{store.latestTick ? toPrettyJson(store.latestTick) : 'No tick data yet'}</pre></section>
        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Latest Candle</h3><pre>{store.latestCandle ? toPrettyJson(store.latestCandle) : 'No candle data yet'}</pre></section>
        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Latest OrderBook</h3><pre>{store.latestOrderBook ? toPrettyJson(store.latestOrderBook) : 'No orderbook data yet'}</pre></section>
        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Demo Data Generator</h3><p>Use this to create demo tick/candle/orderbook when feed is fallback_demo or idle_demo.</p><button onClick={store.generateDemoMarketData} disabled={store.loading}>Generate tick + candle + orderbook</button></section>
      </div>
    </div>
  );
}
