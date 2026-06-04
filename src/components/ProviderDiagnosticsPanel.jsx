import { useFeedStore } from '../store/feedStore.js';

const ALL_PROVIDERS = ['polygon', 'alphaVantage', 'ibkr', 'yahoo', 'twelvedata', 'fallback_demo'];
const PROVIDER_META = {
  polygon: { realtime: true, label: 'Polygon', requiresCreds: true },
  alphaVantage: { realtime: false, label: 'Alpha Vantage', requiresCreds: true },
  ibkr: { realtime: true, label: 'IBKR Gateway', requiresCreds: true },
  yahoo: { realtime: false, label: 'Yahoo Finance', requiresCreds: false },
  twelvedata: { realtime: false, label: 'Twelve Data', requiresCreds: true },
  fallback_demo: { realtime: false, label: 'Demo Fallback', requiresCreds: false },
};

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'connected' || s === 'configured' || s === 'delayed') return '#22c55e';
  if (s === 'missing_credentials' || s === 'missing' || s === 'requires_gateway') return '#ef4444';
  if (s.includes('idle') || s.includes('demo')) return '#f59e0b';
  return '#9ca3af';
}

const panelStyle = { background: '#0a0a0a', border: '1px solid #202020', borderRadius: 12, padding: 12 };
const cardStyle = { border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#050505' };
const labelStyle = { color: '#9ca3af' };
const fmt = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));

function byProviderId(providers = []) {
  return Object.fromEntries((Array.isArray(providers) ? providers : [])
    .map((provider) => [provider?.id || provider?.provider || provider?.source, provider])
    .filter(([id]) => id));
}

function filteredWarnings(provider = {}) {
  const credentialConfigured = provider.credentialStatus === 'configured' || provider.credentialsStatus === 'configured';
  return (Array.isArray(provider.warnings) ? provider.warnings : []).filter((warning) => {
    if (!credentialConfigured) return true;
    const text = String(warning).toLowerCase();
    return !(text.includes('api key') || text.includes('credential') || text.includes('not configured'));
  });
}

function CredentialPersistenceRow({ provider, credentialsMeta = {} }) {
  const meta = credentialsMeta[provider] || {};
  return (
    <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#9ca3af' }}>
      <span style={labelStyle}>Credential source: </span>{fmt(meta.source || 'none')}
      <span style={{ marginLeft: 10 }}><span style={labelStyle}>Masked: </span>{fmt(meta.masked)}</span>
    </div>
  );
}

export default function ProviderDiagnosticsPanel() {
  const feed = useFeedStore((s) => s);
  const canonicalById = byProviderId(feed.providers?.length ? feed.providers : feed.feedStatus?.providers);
  const activeProviders = new Set(feed.activeProviders || []);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={panelStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>Provider Diagnostics</h3>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 0 }}>
          Diagnostics render the canonical backend provider state. Credentials are stored on the backend and never in browser localStorage.
        </p>

        {ALL_PROVIDERS.map((providerId) => {
          const meta = PROVIDER_META[providerId] || {};
          const canonical = canonicalById[providerId] || {};
          const selected = canonical.selected ?? activeProviders.has(providerId);
          const active = canonical.active ?? activeProviders.has(providerId);
          const credentialStatus = canonical.credentialStatus || (meta.requiresCreds ? (feed.providerCredentialsStatus?.[providerId] || 'unknown') : 'not_required');
          const runtimeStatus = credentialStatus === 'configured' && canonical.runtimeStatus === 'missing_credentials'
            ? (providerId === 'alphaVantage' ? 'delayed' : 'disconnected')
            : (canonical.runtimeStatus || canonical.status || (providerId === 'fallback_demo' ? 'idle_demo' : 'unknown'));
          const connected = Boolean(canonical.connected);
          const warnings = filteredWarnings({ ...canonical, credentialStatus });

          return (
            <div key={providerId} style={{ ...cardStyle, borderColor: active ? '#2d4a2d' : '#1f2937' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(runtimeStatus), display: 'inline-block', flexShrink: 0 }} />
                <strong style={{ fontSize: 13 }}>{canonical.label || meta.label || providerId}</strong>
                <span style={{ fontSize: 11, color: '#4b5563', fontFamily: 'monospace' }}>{providerId}</span>
                {active && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#22c55e', fontWeight: 600 }}>● active</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12 }}>
                <div><span style={labelStyle}>Selected: </span>{fmt(selected)}</div>
                <div><span style={labelStyle}>Active: </span>{fmt(active)}</div>
                <div><span style={labelStyle}>Credential status: </span><span style={{ color: statusColor(credentialStatus), fontWeight: 600 }}>{credentialStatus}</span></div>
                <div><span style={labelStyle}>Runtime status: </span><span style={{ color: statusColor(runtimeStatus) }}>{runtimeStatus}</span></div>
                <div><span style={labelStyle}>Connected: </span><span style={{ color: connected ? '#22c55e' : '#6b7280' }}>{fmt(connected)}</span></div>
                <div><span style={labelStyle}>Realtime: </span><span style={{ color: canonical.realtime ? '#22c55e' : '#f59e0b' }}>{canonical.realtime ? 'Yes' : 'No (delayed)'}</span></div>
                <div><span style={labelStyle}>Credentials required: </span>{fmt(canonical.requiresCredentials ?? meta.requiresCreds)}</div>
                <div><span style={labelStyle}>Priority: </span>{fmt(canonical.priority)}</div>
                {(canonical.requiresCredentials ?? meta.requiresCreds) && <CredentialPersistenceRow provider={providerId} credentialsMeta={feed.providerCredentialsMeta} />}
              </div>

              {warnings.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {warnings.map((warning, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#fcd34d' }}>⚠ {warning}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
