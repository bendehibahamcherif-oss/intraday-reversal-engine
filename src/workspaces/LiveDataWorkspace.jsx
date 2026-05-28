import { useEffect, useState } from 'react';
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

function feedCardTitle(status) {
  const source = String(status?.source || 'unknown');
  if (source.includes('fallback_demo') || source.includes('idle_demo')) return `DEMO (${source})`;
  return source;
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
  const [tab, setTab] = useState('market');
  const showDebug = import.meta.env.VITE_LIVE_DATA_DEBUG === 'true';
  const providerOrder = ['polygon', 'alphaVantage', 'ibkr', 'yahoo', 'fallback_demo'];

  const providerStatus = (provider) => {
    const sourceStatus = store.providerCredentialsStatus?.[provider] || 'unknown';
    if (provider === 'fallback_demo') return 'idle_demo';
    if (provider === 'yahoo') return sourceStatus === 'connected' ? 'connected' : 'delayed';
    return sourceStatus;
  };

  useEffect(() => {
    store.initializeFeedWorkspace();
  }, []);

  const statuses = Array.isArray(store.feedStatus?.activeStatuses) && store.feedStatus.activeStatuses.length
    ? store.feedStatus.activeStatuses
    : (store.feedStatus ? [store.feedStatus] : []);

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
        {store.credentialsError ? <p style={{ color: '#fca5a5' }}>{store.credentialsError}</p> : null}
        {showDebug ? (
          <div style={{ marginTop: 8, fontSize: 12, color: '#93c5fd' }}>
            <div>lastFeedUrl: {formatText(store.lastFeedUrl)}</div>
            <div>lastFeedMethod: {formatText(store.lastFeedMethod)}</div>
            <div>lastFeedError: {formatText(store.lastFeedError)}</div>
            <div>activeProviders: {formatArray(store.activeProviders)}</div>
            <div>VITE_API_BASE: {formatText(store.apiBase)}</div>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setTab('market')} disabled={tab === 'market'}>Market Data</button>
        <button onClick={() => setTab('providers')} disabled={tab === 'providers'}>Providers</button>
        <button onClick={() => setTab('credentials')} disabled={tab === 'credentials'}>Credentials</button>
      </div>

      {tab === 'market' ? <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <section style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>Feed Status</h3>
          {statuses.length === 0 ? <FieldRows rows={[]} emptyLabel="No feed status yet" /> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {statuses.map((statusItem) => {
                const source = String(statusItem?.source || 'unknown');
                const demoSource = source.includes('fallback_demo') || source.includes('idle_demo');
                const feedRows = [
                  { label: 'Source', value: feedCardTitle(statusItem) },
                  { label: 'Status', value: statusLabel(statusItem) },
                  { label: 'Connected', value: formatText(Boolean(statusItem?.connected)) },
                  { label: 'Symbols', value: formatArray(statusItem?.symbols?.length ? statusItem.symbols : store.activeSymbols) },
                  { label: 'Last Message At', value: formatDate(statusItem?.lastMessageAt) },
                  { label: 'Latency (ms)', value: formatNumber(statusItem?.latencyMs) },
                  { label: 'Warnings', value: formatArray(statusItem?.warnings) },
                ];
                return (
                  <div key={source} style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>{feedCardTitle(statusItem)}</div>
                    <FieldRows rows={feedRows} />
                    {demoSource ? <div style={{ color: '#fbbf24', marginTop: 8 }}>Demo feed active (never live).</div> : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Latest Tick</h3><FieldRows rows={tickRows} emptyLabel="No tick data yet" /></section>
        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Latest Candle</h3><FieldRows rows={candleRows} emptyLabel="No candle data yet" /></section>
        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Latest OrderBook</h3><FieldRows rows={orderBookRows} emptyLabel="No orderbook data yet" /></section>
        <section style={panelStyle}><h3 style={{ marginTop: 0 }}>Demo Data Generator</h3><p>Use this to create demo tick/candle/orderbook when feed is fallback_demo or idle_demo.</p><button onClick={store.generateDemoMarketData} disabled={store.loading}>Generate tick + candle + orderbook</button></section>
      </div> : null}

      {tab === 'providers' ? <section style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>Feed Providers</h3>
        <div style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Active providers</div>
          <div style={{ fontWeight: 700 }}>{formatArray(store.activeProviders)}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
            Provider order: {formatArray(store.activeProviders.map((provider, idx) => `${idx + 1}. ${provider}`))}
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
            Persistence: {store.providerSelectionSavedAt ? `Saved ${formatDate(store.providerSelectionSavedAt)}` : 'Waiting for save'}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {providerOrder.map((provider) => (
            <label key={provider} style={{ display: 'grid', gridTemplateColumns: '24px minmax(100px, 180px) 1fr', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={store.selectedProviders.includes(provider)} onChange={() => store.toggleProvider(provider)} />
              <strong>{provider}</strong>
              <span>Status: {providerStatus(provider)}{store.activeProviders.includes(provider) ? ' • Active' : ' • Inactive'}</span>
            </label>
          ))}
        </div>
        {store.selectedProviders.includes('fallback_demo') ? <p style={{ color: '#fbbf24' }}>Demo/fallback data only, not live market data.</p> : null}
        {store.selectedProviders.includes('yahoo') ? <p style={{ color: '#fbbf24' }}>Fallback/delayed provider; not institutional real-time feed.</p> : null}
        {store.selectedProviders.some((p) => ['polygon', 'alphaVantage', 'ibkr'].includes(p) && String(providerStatus(p)).includes('missing_credentials')) ? <p style={{ color: '#fca5a5' }}>One or more selected providers are missing credentials.</p> : null}
        {store.selectedProviders.includes('ibkr') && String(providerStatus('ibkr')).includes('requires_gateway') ? <p style={{ color: '#fbbf24' }}>IBKR requires TWS/IB Gateway setup and active session.</p> : null}
        <button onClick={store.saveActiveProviders} disabled={store.credentialsLoading}>Save provider selection</button>
      </section> : null}

      {tab === 'credentials' ? <section style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>Provider Credentials</h3>
        {[
          { provider: 'polygon', fields: [{ key: 'apiKey', label: 'Polygon API Key', type: 'password' }] },
          { provider: 'alphaVantage', fields: [{ key: 'apiKey', label: 'Alpha Vantage API Key', type: 'password' }] },
          { provider: 'ibkr', fields: [{ key: 'gatewayUrl', label: 'IBKR Gateway URL' }, { key: 'account', label: 'IBKR Account' }, { key: 'session', label: 'IBKR Session', type: 'password' }] },
          { provider: 'yahoo', fields: [] },
          { provider: 'fallback_demo', fields: [] },
        ].map(({ provider, fields }) => (
          <div key={provider} style={{ border: '1px solid #202020', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <h4 style={{ marginTop: 0 }}>{provider}</h4>
            {fields.length === 0 ? <p>No credentials required.</p> : fields.map((f) => (
              <label key={f.key} style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
                <span>{f.label}</span>
                <input type={f.type || 'text'} value={store.credentialsDraft?.[provider]?.[f.key] || ''} onChange={(e) => store.updateCredentialField(provider, f.key, e.target.value)} />
              </label>
            ))}
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>Configured status: {String(providerStatus(provider)).includes('missing') ? 'Not configured' : 'Configured/masked'}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => store.saveCredentials(provider)} disabled={store.credentialsLoading || fields.length === 0}>Save credentials</button>
              <button onClick={() => store.deleteCredentials(provider)} disabled={store.credentialsLoading || fields.length === 0}>Delete credentials</button>
            </div>
          </div>
        ))}
      </section> : null}
    </div>
  );
}
