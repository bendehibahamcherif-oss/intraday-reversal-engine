import { useEffect, useState } from 'react';
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
  const [tab, setTab] = useState('market');
  const providerOrder = ['polygon', 'alphaVantage', 'ibkr', 'yahoo', 'fallback_demo'];

  const providerStatus = (provider) => {
    const sourceStatus = store.providerCredentialsStatus?.[provider] || 'unknown';
    if (provider === 'fallback_demo') return 'idle_demo';
    if (provider === 'yahoo') return sourceStatus === 'connected' ? 'connected' : 'delayed';
    return sourceStatus;
  };

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
        {store.credentialsError ? <p style={{ color: '#fca5a5' }}>{store.credentialsError}</p> : null}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setTab('market')} disabled={tab === 'market'}>Market Data</button>
        <button onClick={() => setTab('providers')} disabled={tab === 'providers'}>Providers</button>
        <button onClick={() => setTab('credentials')} disabled={tab === 'credentials'}>Credentials</button>
      </div>

      {tab === 'market' ? <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
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
      </div> : null}

      {tab === 'providers' ? <section style={panelStyle}>
        <h3 style={{ marginTop: 0 }}>Feed Providers</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {providerOrder.map((provider) => (
            <label key={provider} style={{ display: 'grid', gridTemplateColumns: '24px 180px 1fr', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={store.selectedProviders.includes(provider)} onChange={() => store.toggleProvider(provider)} />
              <strong>{provider}</strong>
              <span>Status: {providerStatus(provider)}</span>
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
