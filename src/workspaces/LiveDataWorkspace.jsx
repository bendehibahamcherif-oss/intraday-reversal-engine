import { useEffect } from 'react';
import { useFeedStore } from '../store/feedStore.js';

const panelStyle = { background: '#0a0a0a', border: '1px solid #202020', borderRadius: 12, padding: 12 };

const listStyle = { display: 'grid', gap: 8, margin: 0 };
const rowStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(120px, 38%) 1fr',
  alignItems: 'start',
  columnGap: 8,
  rowGap: 4,
  padding: '6px 0',
  borderBottom: '1px solid #1b1b1b',
};

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatText(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}

function formatDate(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return formatText(value);
  return date.toLocaleString();
}

function formatArray(value) {
  if (!Array.isArray(value) || value.length === 0) return '—';
  return value.join(', ');
}

function statusLabel(status) {
  const source = String(status?.source || status?.mode || status?.state || 'unknown');
  const connected = Boolean(status?.connected === true);
  const explicitLive = String(status?.live || status?.feedType || '').toLowerCase() === 'live';
  const isDemoSource = source.includes('fallback_demo') || source.includes('idle_demo');
  const isLive = connected && explicitLive && !isDemoSource;
  if (isLive) return `LIVE (${source})`;
  if (isDemoSource) return `DEMO (${source})`;
  return `${connected ? 'CONNECTED' : 'NOT CONNECTED'} (${source})`;
}

function FieldRows({ rows, emptyLabel = 'No data yet' }) {
  if (!rows || rows.length === 0) return <p>{emptyLabel}</p>;
  return (
    <div style={listStyle}>
      {rows.map((row) => (
        <div key={row.label} style={rowStyle}>
          <strong>{row.label}</strong>
          <span style={{ overflowWrap: 'anywhere' }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function formatOrderSide(levels) {
  if (!Array.isArray(levels) || levels.length === 0) return '—';
  return levels
    .slice(0, 5)
    .map((level) => {
      if (Array.isArray(level)) {
        const [price, size] = level;
        return `${formatNumber(price)} × ${formatNumber(size)}`;
      }
      if (level && typeof level === 'object') {
        return `${formatNumber(level.price)} × ${formatNumber(level.size ?? level.qty ?? level.volume)}`;
      }
      return formatText(level);
    })
    .join(' | ');
}

export default function LiveDataWorkspace() {
  const store = useFeedStore();

  useEffect(() => {
    store.refreshAll();
  }, [store.symbol, store.timeframe]);

  const feedSource = String(store.feedStatus?.source || store.feedStatus?.mode || 'unknown');
  const demoSource = feedSource.includes('fallback_demo') || feedSource.includes('idle_demo');

  const feedRows = [
    { label: 'Source', value: demoSource ? `DEMO (${feedSource})` : formatText(feedSource) },
    { label: 'Status', value: statusLabel(store.feedStatus) },
    { label: 'Connected', value: formatText(Boolean(store.feedStatus?.connected)) },
    { label: 'Symbols', value: formatArray(store.feedStatus?.symbols) },
    { label: 'Last Message At', value: formatDate(store.feedStatus?.lastMessageAt) },
    { label: 'Latency (ms)', value: formatNumber(store.feedStatus?.latencyMs) },
    { label: 'Warnings', value: formatArray(store.feedStatus?.warnings) },
  ];

  const tickRows = store.latestTick
    ? [
        { label: 'Symbol', value: formatText(store.latestTick?.symbol) },
        { label: 'Price', value: formatNumber(store.latestTick?.price) },
        { label: 'Bid', value: formatNumber(store.latestTick?.bid) },
        { label: 'Ask', value: formatNumber(store.latestTick?.ask) },
        { label: 'Volume', value: formatNumber(store.latestTick?.volume) },
        { label: 'Source', value: formatText(store.latestTick?.source) },
        { label: 'Timestamp', value: formatDate(store.latestTick?.timestamp) },
        { label: 'Sequence', value: formatText(store.latestTick?.sequence) },
      ]
    : [];

  const candleRows = store.latestCandle
    ? [
        { label: 'Symbol', value: formatText(store.latestCandle?.symbol) },
        { label: 'Timeframe', value: formatText(store.latestCandle?.timeframe) },
        { label: 'Open', value: formatNumber(store.latestCandle?.open) },
        { label: 'High', value: formatNumber(store.latestCandle?.high) },
        { label: 'Low', value: formatNumber(store.latestCandle?.low) },
        { label: 'Close', value: formatNumber(store.latestCandle?.close) },
        { label: 'Volume', value: formatNumber(store.latestCandle?.volume) },
        { label: 'Source', value: formatText(store.latestCandle?.source) },
        { label: 'Timestamp', value: formatDate(store.latestCandle?.timestamp) },
      ]
    : [];

  const orderBookRows = store.latestOrderBook
    ? [
        { label: 'Symbol', value: formatText(store.latestOrderBook?.symbol) },
        { label: 'Spread', value: formatNumber(store.latestOrderBook?.spread) },
        { label: 'Imbalance', value: formatNumber(store.latestOrderBook?.imbalance) },
        { label: 'Source', value: formatText(store.latestOrderBook?.source) },
        { label: 'Timestamp', value: formatDate(store.latestOrderBook?.timestamp) },
        { label: 'Top Bids', value: formatOrderSide(store.latestOrderBook?.bids) },
        { label: 'Top Asks', value: formatOrderSide(store.latestOrderBook?.asks) },
      ]
    : [];

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
          <FieldRows rows={feedRows} emptyLabel="No feed status yet" />
          {demoSource ? <div style={{ color: '#fbbf24', marginTop: 8 }}>Demo feed active (never live).</div> : null}
        </section>

        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Latest Tick</h3><FieldRows rows={tickRows} emptyLabel="No tick data yet" /></section>
        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Latest Candle</h3><FieldRows rows={candleRows} emptyLabel="No candle data yet" /></section>
        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Latest OrderBook</h3><FieldRows rows={orderBookRows} emptyLabel="No orderbook data yet" /></section>
        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Demo Data Generator</h3><p>Use this to create demo tick/candle/orderbook when feed is fallback_demo or idle_demo.</p><button onClick={store.generateDemoMarketData} disabled={store.loading}>Generate tick + candle + orderbook</button></section>
      </div>
    </div>
  );
}
