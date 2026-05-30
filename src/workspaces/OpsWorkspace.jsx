import { useEffect } from 'react';
import { useOpsStore } from '../store/opsStore';

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

const card = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: 16,
};

const label = { fontSize: 11, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 };
const val   = { fontSize: 18, fontWeight: 700, color: TEXT };

function Chip({ color, children }) {
  return (
    <span style={{
      display: 'inline-block',
      background: `${color}22`,
      color,
      border: `1px solid ${color}55`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.5,
    }}>
      {children}
    </span>
  );
}

function StatCard({ label: lbl, value, color = TEXT, sub }) {
  return (
    <div style={{ ...card, minWidth: 120 }}>
      <div style={label}>{lbl}</div>
      <div style={{ ...val, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SessionBadge({ state, isOpen, etTime }) {
  const color = isOpen ? GREEN : state === 'PRE_MARKET' ? AMBER : state === 'AFTER_HOURS' ? AMBER : MUTED;
  return (
    <div style={{ ...card }}>
      <div style={label}>Market Session</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ ...val, color, fontSize: 22 }}>{state?.replace(/_/g, ' ')}</span>
        <Chip color={color}>{isOpen ? 'LIVE' : 'CLOSED'}</Chip>
      </div>
      {etTime && <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>{etTime} ET</div>}
    </div>
  );
}

function ProviderHealthPanel({ metrics }) {
  if (!metrics) return null;
  const providerEntries = Object.entries(metrics)
    .filter(([k]) => k.startsWith('provider_health'));

  if (!providerEntries.length) {
    return (
      <div style={card}>
        <div style={label}>Provider Health</div>
        <div style={{ color: MUTED, fontSize: 13 }}>No provider data</div>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={label}>Provider Health</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {providerEntries.map(([k, entry]) => {
          const name = k.replace('provider_health{', '').replace('}', '').replace('provider=', '') || k;
          const healthy = entry?.value === 1 || entry === 1;
          return (
            <div key={k} style={{
              background: healthy ? `${GREEN}18` : `${RED}18`,
              border: `1px solid ${healthy ? GREEN : RED}44`,
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 12,
              color: healthy ? GREEN : RED,
            }}>
              {name} {healthy ? '✓' : '✗'}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WsPanel({ ws }) {
  if (!ws) return null;
  return (
    <div style={card}>
      <div style={label}>WebSocket Adapter</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 6 }}>
        <div>
          <div style={{ fontSize: 11, color: MUTED }}>Adapter</div>
          <div style={{ color: BLUE, fontWeight: 700, fontSize: 14 }}>{ws.adapter || '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: MUTED }}>Connections</div>
          <div style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>{ws.connections ?? '—'}</div>
        </div>
        {ws.channels && Object.keys(ws.channels).length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: MUTED }}>Channels</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              {Object.entries(ws.channels).map(([ch, count]) => (
                <span key={ch} style={{ color: VIOLET, fontSize: 12 }}>{ch}({count})</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RateLimitPanel({ rateLimits }) {
  if (!rateLimits) return null;
  return (
    <div style={card}>
      <div style={label}>Rate Limits</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginTop: 6 }}>
        {Object.entries(rateLimits).map(([tier, cfg]) => (
          <div key={tier} style={{ background: '#0a0a14', borderRadius: 6, padding: '6px 10px' }}>
            <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase' }}>{tier}</div>
            <div style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>
              {cfg.max} <span style={{ color: MUTED, fontWeight: 400 }}>/ {cfg.windowMs / 1000}s</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricsPanel({ snap }) {
  if (!snap) return null;

  const interesting = Object.entries(snap).filter(([k]) =>
    ['http_requests_total', 'http_errors_total', 'ws_connections_active', 'ws_messages_total',
     'rate_limit_rejections_total', 'auth_failures_total'].includes(k)
  );

  if (!interesting.length) return null;

  return (
    <div style={card}>
      <div style={label}>Key Metrics</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginTop: 6 }}>
        {interesting.map(([k, entry]) => {
          const v = typeof entry === 'object' ? (entry.value ?? entry.count ?? JSON.stringify(entry)) : entry;
          const isError = k.includes('error') || k.includes('fail') || k.includes('reject');
          const color = isError && Number(v) > 0 ? AMBER : TEXT;
          return (
            <div key={k} style={{ background: '#0a0a14', borderRadius: 6, padding: '6px 10px' }}>
              <div style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {k.replace(/_/g, ' ')}
              </div>
              <div style={{ color, fontWeight: 700, fontSize: 16, marginTop: 2 }}>{v}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OpsWorkspace() {
  const { status, statusLoading, statusError, lastFetched, clientSession, loadStatus, startPolling, stopPolling, refreshClientSession } = useOpsStore();

  useEffect(() => {
    startPolling();
    const sessionTimer = setInterval(refreshClientSession, 30_000);
    return () => {
      stopPolling();
      clearInterval(sessionTimer);
    };
  }, []);

  const serverSession = status?.session;
  const session = serverSession || clientSession;

  return (
    <div style={{ fontFamily: 'monospace', color: TEXT, background: BG, minHeight: '100vh', padding: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: MUTED, letterSpacing: 2, marginBottom: 2 }}>PLATFORM HEALTH</div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Ops Dashboard</h2>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {lastFetched && (
            <span style={{ fontSize: 11, color: MUTED }}>
              Updated {new Date(lastFetched).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={loadStatus}
            disabled={statusLoading}
            style={{
              background: BLUE, color: '#fff', border: 'none', borderRadius: 6,
              padding: '6px 14px', cursor: statusLoading ? 'wait' : 'pointer', fontSize: 12,
            }}
          >
            {statusLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {statusError && !status && (
        <div style={{ ...card, borderColor: RED, color: AMBER, marginBottom: 16, fontSize: 13 }}>
          Backend unreachable: {statusError} — showing client-side session state
        </div>
      )}

      {/* Row 1: session + server stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
        <SessionBadge
          state={session.state}
          isOpen={session.isOpen}
          etTime={session.etString || session.etTime}
        />
        {status && (
          <>
            <StatCard label="Service" value={status.service || '—'} color={BLUE} />
            <StatCard label="Uptime" value={`${Math.floor((status.uptime || 0) / 60)}m`} sub={`${status.uptime}s`} />
            <StatCard label="Heap" value={`${status.memMb || 0} MB`} color={status.memMb > 500 ? AMBER : GREEN} />
            <StatCard label="Environment" value={status.nodeEnv || '—'} color={status.nodeEnv === 'production' ? GREEN : AMBER} />
          </>
        )}
        {!status && (
          <StatCard label="Backend" value="Offline" color={RED} sub={statusLoading ? 'connecting…' : 'check server'} />
        )}
      </div>

      {/* Row 2: session next event */}
      {session.nextEvent && (
        <div style={{ ...card, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>Next Event</span>
          <span style={{ color: AMBER, fontWeight: 700 }}>{session.nextEvent.event?.toUpperCase()}</span>
          <span style={{ color: TEXT }}>in {session.nextEvent.minutesAway} min</span>
        </div>
      )}

      {/* Provider health */}
      {status?.metrics && (
        <div style={{ marginBottom: 12 }}>
          <ProviderHealthPanel metrics={status.metrics} />
        </div>
      )}

      {/* WS adapter */}
      {status?.ws && (
        <div style={{ marginBottom: 12 }}>
          <WsPanel ws={status.ws} />
        </div>
      )}

      {/* Rate limits */}
      {status?.rateLimits && (
        <div style={{ marginBottom: 12 }}>
          <RateLimitPanel rateLimits={status.rateLimits} />
        </div>
      )}

      {/* Metrics */}
      {status?.metrics && (
        <div style={{ marginBottom: 12 }}>
          <MetricsPanel snap={status.metrics} />
        </div>
      )}

      {/* Tenancy */}
      {status?.tenancy && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={label}>Tenancy</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <div>
              <span style={{ color: MUTED, fontSize: 12 }}>Mode: </span>
              <span style={{ color: status.tenancy.enabled ? VIOLET : TEXT, fontSize: 13, fontWeight: 600 }}>
                {status.tenancy.enabled ? 'MULTI-TENANT' : 'SINGLE-TENANT'}
              </span>
            </div>
            <div>
              <span style={{ color: MUTED, fontSize: 12 }}>Default: </span>
              <span style={{ color: TEXT, fontSize: 13 }}>{status.tenancy.defaultTenant}</span>
            </div>
          </div>
        </div>
      )}

      {/* Timestamp */}
      {status?.timestamp && (
        <div style={{ fontSize: 11, color: MUTED, textAlign: 'right' }}>
          Snapshot: {new Date(status.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  );
}
