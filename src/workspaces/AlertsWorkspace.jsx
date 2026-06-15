import { useEffect, useState } from 'react';
import { useAlertStore, ALERT_TYPE_GROUPS, THRESHOLD_TYPES, EMA_PERIOD_TYPES } from '../store/alertStore.js';
import { useActiveSymbolStore } from '../store/activeSymbolStore.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG       = '#0f0f1a';
const SURFACE  = '#1a1a2e';
const BORDER   = '#2a2a4a';
const TEXT     = '#e0e0f0';
const MUTED    = '#8080a0';
const AMBER    = '#FFB800';
const GREEN    = '#00c864';
const RED      = '#dc3232';
const DISABLED = '#404060';

const card   = { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14 };
const label  = { fontSize: 11, color: MUTED, marginBottom: 4, display: 'block' };
const input  = { background: '#0f0f1a', color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const btn    = (bg = '#2563eb') => ({ background: bg, color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600 });

function fmt(v, digits = 2) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : String(v);
}
function fmtDate(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
}
function fmtAgo(v) {
  if (!v) return '—';
  const secs = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}
function typeLabel(t) {
  return String(t || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Create Alert Form ─────────────────────────────────────────────────────────
function CreateAlertForm({ onCreated }) {
  const activeSymbol = useActiveSymbolStore((s) => s.symbol);
  const createAlert  = useAlertStore((s) => s.createAlert);
  const loading      = useAlertStore((s) => s.loading);
  const error        = useAlertStore((s) => s.error);

  const [symbol,          setSymbol]          = useState(activeSymbol || 'SPY');
  const [type,            setType]            = useState('price_above');
  const [threshold,       setThreshold]       = useState('');
  const [emaPeriod,       setEmaPeriod]       = useState('9');
  const [cooldownMode,    setCooldownMode]     = useState('cooldown_minutes');
  const [cooldownMinutes, setCooldownMinutes]  = useState('60');
  const [expiresAt,       setExpiresAt]       = useState('');
  const [formError,       setFormError]       = useState('');

  const needsThreshold = THRESHOLD_TYPES.has(type);
  const needsEma       = EMA_PERIOD_TYPES.has(type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!symbol.trim()) { setFormError('Symbol is required'); return; }
    if (needsThreshold && !threshold) { setFormError('Threshold is required for this alert type'); return; }

    const payload = {
      symbol: symbol.trim().toUpperCase(),
      type,
      threshold: needsThreshold ? Number(threshold) : undefined,
      params: needsEma ? { emaPeriod: Number(emaPeriod) } : {},
      cooldownMode,
      cooldownMinutes: cooldownMode === 'cooldown_minutes' ? Number(cooldownMinutes) : undefined,
      expiresAt: expiresAt || null,
    };

    try {
      await createAlert(payload);
      setThreshold('');
      setExpiresAt('');
      onCreated?.();
    } catch {}
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <span style={label}>Symbol</span>
          <input data-testid="alerts-symbol-input" style={input} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="SPY" />
        </div>
        <div>
          <span style={label}>Alert Type</span>
          <select data-testid="alerts-type-select" style={input} value={type} onChange={(e) => setType(e.target.value)}>
            {ALERT_TYPE_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.types.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {(needsThreshold || needsEma) && (
        <div style={{ display: 'grid', gridTemplateColumns: needsEma ? '1fr 1fr' : '1fr', gap: 10 }}>
          {needsThreshold && (
            <div>
              <span style={label}>Threshold</span>
              <input data-testid="alerts-threshold-input" style={input} type="number" step="any" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="e.g. 590" />
            </div>
          )}
          {needsEma && (
            <div>
              <span style={label}>EMA Period</span>
              <select style={input} value={emaPeriod} onChange={(e) => setEmaPeriod(e.target.value)}>
                <option value="9">EMA 9</option>
                <option value="20">EMA 20</option>
              </select>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div>
          <span style={label}>Cooldown Mode</span>
          <select style={input} value={cooldownMode} onChange={(e) => setCooldownMode(e.target.value)}>
            <option value="once">Once</option>
            <option value="always">Always</option>
            <option value="cooldown_minutes">Cooldown Minutes</option>
          </select>
        </div>
        {cooldownMode === 'cooldown_minutes' && (
          <div>
            <span style={label}>Cooldown (minutes)</span>
            <input style={input} type="number" inputMode="numeric" min="1" value={cooldownMinutes} onChange={(e) => setCooldownMinutes(e.target.value)} />
          </div>
        )}
        <div>
          <span style={label}>Expires At (optional)</span>
          <input style={input} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
      </div>

      {(formError || error) && (
        <div style={{ color: RED, fontSize: 12 }}>{formError || error}</div>
      )}

      <button data-testid="alerts-create-btn" type="submit" style={btn(AMBER.replace('#', '#') )} disabled={loading}>
        {loading ? 'Creating…' : '+ Create Alert'}
      </button>
    </form>
  );
}

// ── Alert List ────────────────────────────────────────────────────────────────
function AlertList() {
  const alerts      = useAlertStore((s) => s.alerts);
  const enableAlert  = useAlertStore((s) => s.enableAlert);
  const disableAlert = useAlertStore((s) => s.disableAlert);
  const deleteAlert  = useAlertStore((s) => s.deleteAlert);

  if (!alerts.length) {
    return <p data-testid="alerts-empty" style={{ color: MUTED, margin: 0 }}>No alerts yet. Create one above.</p>;
  }

  return (
    <div data-testid="alerts-list" style={{ display: 'grid', gap: 6 }}>
      {alerts.map((a) => (
        <div data-testid="alerts-item" key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', background: BG, border: `1px solid ${a.enabled ? BORDER : DISABLED}`, borderRadius: 8, opacity: a.enabled ? 1 : 0.65 }}>
          {/* Symbol badge */}
          <span data-testid="alerts-item-symbol" style={{ background: '#2a2a4a', color: AMBER, fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 5, flexShrink: 0 }}>
            {a.symbol}
          </span>

          {/* Type + threshold */}
          <span style={{ color: TEXT, fontSize: 12, flex: 1, overflowWrap: 'anywhere' }}>
            {typeLabel(a.type)}{THRESHOLD_TYPES.has(a.type) && a.threshold != null ? ` @ ${fmt(a.threshold, 4)}` : ''}
            {EMA_PERIOD_TYPES.has(a.type) && a.params?.emaPeriod ? ` EMA${a.params.emaPeriod}` : ''}
          </span>

          {/* Last triggered */}
          <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>
            {a.lastTriggeredAt ? `🔔 ${fmtAgo(a.lastTriggeredAt)}` : 'Never'}
          </span>

          {/* Cooldown badge */}
          <span style={{ fontSize: 10, color: MUTED, background: '#1a1a2e', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>
            {a.cooldownMode === 'once' ? 'once' : a.cooldownMode === 'always' ? '∞' : `${a.cooldownMinutes ?? '?'}m`}
          </span>

          {/* Enable toggle */}
          <button
            onClick={() => a.enabled ? disableAlert(a.id) : enableAlert(a.id)}
            title={a.enabled ? 'Disable' : 'Enable'}
            style={{ background: a.enabled ? GREEN : DISABLED, border: 'none', borderRadius: 20, width: 36, height: 20, cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s' }}
          >
            <span style={{ display: 'block', width: 14, height: 14, background: '#fff', borderRadius: '50%', margin: a.enabled ? '3px 0 3px auto' : '3px auto 3px 3px', transition: 'margin 0.15s' }} />
          </button>

          {/* Delete */}
          <button
            onClick={() => deleteAlert(a.id)}
            style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 16, padding: '0 2px', flexShrink: 0 }}
            title="Delete alert"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ── History Table ─────────────────────────────────────────────────────────────
function HistoryTable() {
  const history = useAlertStore((s) => s.history);

  if (!history.length) {
    return <p style={{ color: MUTED, margin: 0 }}>No trigger history yet.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
            {['Triggered At', 'Symbol', 'Type', 'Value', 'Reason'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: MUTED, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} style={{ borderBottom: `1px solid ${BORDER}22` }}>
              <td style={{ padding: '6px 8px', color: MUTED, whiteSpace: 'nowrap' }}>{fmtDate(h.triggeredAt)}</td>
              <td style={{ padding: '6px 8px', color: AMBER, fontWeight: 700 }}>{h.symbol}</td>
              <td style={{ padding: '6px 8px', color: TEXT }}>{typeLabel(h.type)}</td>
              <td style={{ padding: '6px 8px', color: TEXT, fontFamily: 'monospace' }}>{fmt(h.triggerValue, 4)}</td>
              <td style={{ padding: '6px 8px', color: MUTED, maxWidth: 260, overflowWrap: 'anywhere' }}>{h.reason || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Diagnostics Bar ───────────────────────────────────────────────────────────
function DiagnosticsBar() {
  const d = useAlertStore((s) => s.diagnostics);

  return (
    <div style={{ fontSize: 11, color: MUTED, display: 'flex', gap: 16, flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>
      <span>Engine: <strong style={{ color: d.running ? GREEN : RED }}>{d.running ? 'running ✓' : 'stopped ✗'}</strong></span>
      <span>Evals: <strong style={{ color: TEXT }}>{d.evaluationCount ?? '—'}</strong></span>
      <span>Triggers: <strong style={{ color: TEXT }}>{d.triggerCount ?? '—'}</strong></span>
      <span>Active: <strong style={{ color: TEXT }}>{d.activeAlerts ?? '—'}</strong></span>
      <span>Total: <strong style={{ color: TEXT }}>{d.totalAlerts ?? '—'}</strong></span>
      {d.symbolsTracked?.length ? <span>Tracking: <strong style={{ color: TEXT }}>{d.symbolsTracked.join(', ')}</strong></span> : null}
      {d.lastEvaluationAt ? <span>Last eval: <strong style={{ color: TEXT }}>{fmtAgo(d.lastEvaluationAt)}</strong></span> : null}
      {d.evalIntervalMs ? <span>Interval: <strong style={{ color: TEXT }}>{d.evalIntervalMs / 1000}s</strong></span> : null}
    </div>
  );
}

// ── Main Workspace ────────────────────────────────────────────────────────────
export default function AlertsWorkspace() {
  const loadAlerts     = useAlertStore((s) => s.loadAlerts);
  const loadHistory    = useAlertStore((s) => s.loadHistory);
  const loadDiagnostics = useAlertStore((s) => s.loadDiagnostics);

  useEffect(() => {
    loadAlerts();
    loadHistory(undefined, 50);
    loadDiagnostics();
  }, []);

  return (
    <div style={{ display: 'grid', gap: 16, background: BG, minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: TEXT }}>Alert Center</h2>
        <button
          onClick={() => { loadAlerts(); loadHistory(undefined, 50); loadDiagnostics(); }}
          style={btn('#2a2a4a')}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Create + List row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px,1fr) 1fr', gap: 16, alignItems: 'start' }}>
        <div style={card}>
          <h3 style={{ marginTop: 0, marginBottom: 14, color: TEXT, fontSize: 14 }}>Create Alert</h3>
          <CreateAlertForm onCreated={() => { loadAlerts(); loadHistory(undefined, 50); }} />
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0, marginBottom: 14, color: TEXT, fontSize: 14 }}>Active Alerts</h3>
          <AlertList />
        </div>
      </div>

      {/* History */}
      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: 14, color: TEXT, fontSize: 14 }}>Trigger History</h3>
        <HistoryTable />
      </div>

      {/* Diagnostics */}
      <div style={{ ...card, padding: '10px 14px' }}>
        <DiagnosticsBar />
      </div>
    </div>
  );
}
