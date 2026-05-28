import { useFeedStore } from '../store/feedStore.js';
import { useMarketRuntimeStore } from '../store/marketRuntimeStore.js';

const panelStyle = { background: '#0a0a0a', border: '1px solid #1f2937', borderRadius: 10, padding: 12 };
const cardStyle = { border: '1px solid #1f2937', borderRadius: 8, padding: 10, marginBottom: 8, background: '#060606' };
const labelStyle = { color: '#9ca3af', fontSize: 11 };

const PROVIDERS_WITH_CREDS = ['polygon', 'alphaVantage', 'twelvedata', 'ibkr'];
const ALL_PROVIDERS = ['polygon', 'alphaVantage', 'ibkr', 'yahoo', 'twelvedata', 'fallback_demo'];

const PROVIDER_META = {
  polygon: { realtime: true, label: 'Polygon.io', requiresCreds: true },
  alphaVantage: { realtime: false, label: 'Alpha Vantage', requiresCreds: true },
  ibkr: { realtime: true, label: 'IBKR TWS', requiresCreds: true },
  yahoo: { realtime: false, label: 'Yahoo Finance', requiresCreds: false },
  twelvedata: { realtime: true, label: 'Twelve Data', requiresCreds: true },
  fallback_demo: { realtime: false, label: 'Demo Fallback', requiresCreds: false },
};

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'connected' || s === 'ok' || s === 'active') return '#22c55e';
  if (s === 'missing_credentials') return '#ef4444';
  if (s.includes('delayed') || s === 'idle_demo' || s === 'idle') return '#f59e0b';
  if (s === 'disconnected' || s === 'stopped') return '#6b7280';
  return '#9ca3af';
}

function fmt(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function CredentialPersistenceRow({ provider, credentialsStatus }) {
  const status = credentialsStatus?.[provider];
  const hasCreds = status && !String(status).includes('missing');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
      <span style={labelStyle}>Credentials:</span>
      <span style={{ fontSize: 12, color: hasCreds ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
        {hasCreds ? 'Configured' : 'Missing'}
      </span>
      <span style={{ ...labelStyle, marginLeft: 8 }}>Persistence:</span>
      <span style={{ fontSize: 12, color: '#9ca3af' }}>backend-stored (survives reload)</span>
    </div>
  );
}

export default function ProviderDiagnosticsPanel() {
  const feed = useFeedStore();
  const runtime = useMarketRuntimeStore();

  const statuses = Array.isArray(feed.feedStatus?.statuses) ? feed.feedStatus.statuses : [];
  const statusBySource = Object.fromEntries(statuses.map((s) => [s.source, s]));
  const credStatus = feed.providerCredentialsStatus || {};
  const activeProviders = new Set([...feed.activeProviders, ...runtime.activeProviders]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={panelStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>Provider Diagnostics</h3>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 0 }}>
          Credentials are stored on the backend and persist across browser reloads and backend restarts.
        </p>

        {ALL_PROVIDERS.map((provider) => {
          const meta = PROVIDER_META[provider] || {};
          const feedStatusEntry = statusBySource[provider] || {};
          const healthEntry = runtime.providerHealth?.[provider] || {};
          const isActive = activeProviders.has(provider);
          const credConfigured = PROVIDERS_WITH_CREDS.includes(provider)
            ? credStatus[provider] && !String(credStatus[provider]).includes('missing')
            : null;
          const providerStatus = String(feedStatusEntry.status || healthEntry.status || (provider === 'fallback_demo' ? 'idle_demo' : 'unknown'));
          const connected = Boolean(feedStatusEntry.connected);
          const warnings = Array.isArray(feedStatusEntry.warnings) ? feedStatusEntry.warnings : [];
          const failoverReason = healthEntry.lastFailureReason || feedStatusEntry.lastFailureReason || null;
          const subscriptionCount = (runtime.subscribedSymbols?.length ?? 0);

          return (
            <div key={provider} style={{ ...cardStyle, borderColor: isActive ? '#2d4a2d' : '#1f2937' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(providerStatus), display: 'inline-block', flexShrink: 0 }} />
                <strong style={{ fontSize: 13 }}>{meta.label || provider}</strong>
                <span style={{ fontSize: 11, color: '#4b5563', fontFamily: 'monospace' }}>{provider}</span>
                {isActive && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#22c55e', fontWeight: 600 }}>● active</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12 }}>
                <div><span style={labelStyle}>Status: </span><span style={{ color: statusColor(providerStatus) }}>{providerStatus}</span></div>
                <div><span style={labelStyle}>Connected: </span><span style={{ color: connected ? '#22c55e' : '#6b7280' }}>{fmt(connected)}</span></div>
                <div><span style={labelStyle}>Realtime: </span><span style={{ color: meta.realtime ? '#22c55e' : '#f59e0b' }}>{meta.realtime ? 'Yes (realtime)' : 'No (delayed)'}</span></div>
                <div><span style={labelStyle}>Credentials required: </span>{fmt(meta.requiresCreds)}</div>
                {meta.requiresCreds && (
                  <div><span style={labelStyle}>Cred status: </span>
                    <span style={{ color: credConfigured ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                      {credConfigured ? 'Configured ✓' : 'Missing ✗'}
                    </span>
                  </div>
                )}
                {healthEntry.consecutiveFailures !== undefined && (
                  <div><span style={labelStyle}>Consec. failures: </span>{fmt(healthEntry.consecutiveFailures)}</div>
                )}
                {healthEntry.lastSuccessAt && (
                  <div style={{ gridColumn: '1 / -1' }}><span style={labelStyle}>Last success: </span>{fmt(healthEntry.lastSuccessAt)}</div>
                )}
                {isActive && provider !== 'fallback_demo' && (
                  <div><span style={labelStyle}>Subscriptions: </span>{subscriptionCount}</div>
                )}
              </div>

              {meta.requiresCreds && (
                <CredentialPersistenceRow provider={provider} credentialsStatus={credStatus} />
              )}

              {failoverReason && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#f87171' }}>
                  Failover reason: {failoverReason}
                </div>
              )}
              {warnings.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#fcd34d' }}>⚠ {w}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={panelStyle}>
        <h4 style={{ marginTop: 0, marginBottom: 8 }}>Credential Persistence Verification</h4>
        <p style={{ color: '#9ca3af', fontSize: 12 }}>
          Credentials for polygon, alphaVantage, twelvedata, and ibkr are stored exclusively on the backend.
          The frontend reads credential status on each load via <code>/api/feeds/providers</code> — no API keys are stored in localStorage or browser state.
          Runtime refresh and subscription polling never mutate provider credential state.
        </p>
        <div style={{ display: 'grid', gap: 6 }}>
          {PROVIDERS_WITH_CREDS.map((p) => {
            const status = credStatus[p];
            const configured = status && !String(status).includes('missing');
            return (
              <div key={p} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #111' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: configured ? '#22c55e' : '#6b7280', display: 'inline-block', flexShrink: 0 }} />
                <strong style={{ width: 110 }}>{p}</strong>
                <span style={{ color: configured ? '#22c55e' : '#9ca3af' }}>{configured ? 'Configured (backend-stored)' : 'Not configured'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
