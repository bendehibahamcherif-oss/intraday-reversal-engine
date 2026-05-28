import { useMarketRuntimeStore } from '../store/marketRuntimeStore.js';
import { useSocketStore } from '../store/socketStore.js';

const panelStyle = { background: '#0a0a0a', border: '1px solid #1f2937', borderRadius: 10, padding: 12 };
const rowStyle = { display: 'grid', gridTemplateColumns: 'minmax(130px, 38%) 1fr', alignItems: 'start', columnGap: 8, padding: '5px 0', borderBottom: '1px solid #111' };
const labelStyle = { color: '#9ca3af', fontSize: 12 };
const badge = (color) => ({ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6 });

function Row({ label, children }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={{ overflowWrap: 'anywhere', fontSize: 13 }}>{children}</span>
    </div>
  );
}

function fmt(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString() : '—';
  return String(v);
}

function fmtDate(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
}

export default function MarketStreamStatus() {
  const rt = useMarketRuntimeStore();
  const socket = useSocketStore();

  // Merge: WS transport state from socketStore; provider runtime from marketRuntimeStore
  const connected = socket.connected || rt.connected;
  const latency = socket.latency ?? rt.latency;
  const stale = socket.stale || rt.stale;
  const reconnectCount = Math.max(socket.reconnectCount ?? 0, rt.reconnectCount ?? 0);

  const connColor = stale ? '#f59e0b' : (connected ? '#22c55e' : '#ef4444');
  const connLabel = stale ? 'STALE' : (connected ? 'CONNECTED' : 'DISCONNECTED');

  const endpointStatus = rt._endpointsAvailable;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={panelStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>
          <span style={badge(connColor)} />
          Stream Status
        </h3>
        <Row label="Connection"><span style={{ color: connColor, fontWeight: 700 }}>{connLabel}</span></Row>
        <Row label="Active Provider"><strong>{fmt(rt.activeProvider !== 'unknown' ? rt.activeProvider : rt.source)}</strong></Row>
        <Row label="Source">{fmt(rt.source)}</Row>
        <Row label="Latency">{latency !== null ? `${latency} ms` : '—'}</Row>
        <Row label="Reconnect Count">{fmt(reconnectCount)}</Row>
        <Row label="Last Update">{fmtDate(rt.lastUpdate)}</Row>
        {stale && <div style={{ color: '#f59e0b', marginTop: 8, fontSize: 12 }}>⚠ Feed is stale — no messages received for &gt;15s</div>}
      </div>

      <div style={panelStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>Active Providers</h3>
        {rt.activeProviders.length ? (
          <div style={{ display: 'grid', gap: 4 }}>
            {rt.activeProviders.map((p, i) => (
              <div key={p} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #111' }}>
                <span style={{ color: '#9ca3af', width: 20, fontSize: 12 }}>{i + 1}.</span>
                <strong style={{ fontSize: 13 }}>{p}</strong>
                {p === rt.activeProvider || p === rt.source ? <span style={{ fontSize: 11, color: '#22c55e' }}>● primary</span> : null}
                {rt.providerHealth?.[p] ? (
                  <span style={{ fontSize: 11, color: rt.providerHealth[p].healthy === false ? '#ef4444' : '#9ca3af', marginLeft: 'auto' }}>
                    {rt.providerHealth[p].healthy === false ? 'unhealthy' : 'healthy'}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : <p style={{ color: '#9ca3af', margin: 0 }}>No active providers yet</p>}
      </div>

      <div style={panelStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>Subscribed Symbols</h3>
        {rt.subscribedSymbols.length ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {rt.subscribedSymbols.map((sym) => (
              <span key={sym} style={{ background: '#1e2533', border: '1px solid #2d3748', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>{sym}</span>
            ))}
          </div>
        ) : <p style={{ color: '#9ca3af', margin: 0 }}>No backend subscriptions yet</p>}
      </div>

      {rt.warnings.length > 0 && (
        <div style={{ ...panelStyle, borderColor: '#92400e' }}>
          <h4 style={{ marginTop: 0, color: '#f59e0b' }}>Warnings</h4>
          {rt.warnings.map((w, i) => <div key={i} style={{ color: '#fcd34d', fontSize: 12, marginBottom: 4 }}>• {w}</div>)}
        </div>
      )}

      <div style={{ ...panelStyle, fontSize: 11, color: '#4b5563' }}>
        <strong style={{ color: '#6b7280' }}>Endpoint availability:</strong>{' '}
        runtime: {endpointStatus.runtime === null ? 'pending' : endpointStatus.runtime ? 'ok' : 'unavailable'}{' | '}
        health: {endpointStatus.health === null ? 'pending' : endpointStatus.health ? 'ok' : 'unavailable'}{' | '}
        subscriptions: {endpointStatus.subscriptions === null ? 'pending' : endpointStatus.subscriptions ? 'ok' : 'unavailable'}
      </div>
    </div>
  );
}
