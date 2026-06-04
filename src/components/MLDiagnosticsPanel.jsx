/**
 * MLDiagnosticsPanel — drift, latency, eval stats, champion/challenger.
 */

const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';
const VIOLET  = '#a78bfa';

const card = { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 14 };
const lbl  = { fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 };

function psiColor(psi) {
  if (psi == null) return MUTED;
  if (psi < 0.10) return GREEN;
  if (psi < 0.20) return AMBER;
  return RED;
}

function psiLabel(psi) {
  if (psi == null) return '—';
  if (psi < 0.10) return 'Stable';
  if (psi < 0.20) return 'Warning';
  return 'Critical';
}

function DriftRow({ feature, entry }) {
  const color = psiColor(entry?.psi);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ flex: 1, fontSize: 11, fontFamily: 'monospace', color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis' }}>{feature}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color, width: 60, textAlign: 'right' }}>
        {entry?.psi != null ? Number(entry.psi).toFixed(3) : '—'}
      </span>
      <span style={{ fontSize: 10, color, width: 55, textAlign: 'right' }}>
        {psiLabel(entry?.psi)}
      </span>
    </div>
  );
}

export default function MLDiagnosticsPanel({ diagnostics, loading, error }) {
  if (loading) return <div style={{ ...card, color: MUTED, fontSize: 13, textAlign: 'center', padding: 20 }}>Loading diagnostics…</div>;
  if (error)   return <div style={{ ...card, borderColor: RED, color: AMBER, fontSize: 12 }}>{error}</div>;
  if (!diagnostics) return <div style={{ ...card, color: MUTED, fontSize: 13, textAlign: 'center', padding: 20 }}>No diagnostics yet</div>;

  const { signal, drift, worker, features, registry: reg } = diagnostics;
  const featureDrift = drift?.featureDrift || {};

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Signal quality */}
      {signal?.ok && (
        <div style={card}>
          <div style={lbl}>Signal Quality</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
            {[
              { l: 'Eval Count',     v: signal.evalCount      ?? '—', c: TEXT },
              { l: 'Flip Rate',      v: signal.flipRate        ?? '—', c: Number(signal.flipRate) > 0.3 ? AMBER : GREEN },
              { l: 'Conf Mean',      v: signal.confidenceMean  ?? '—', c: TEXT },
              { l: 'Conf P95',       v: signal.confidenceP95   ?? '—', c: TEXT },
            ].map(({ l, v, c }) => (
              <div key={l} style={{ background: '#080810', borderRadius: 6, padding: '6px 8px' }}>
                <div style={{ fontSize: 9, color: MUTED }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          {signal.classDistPct && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11 }}>
              <span style={{ color: GREEN }}>LONG: {signal.classDistPct.LONG}%</span>
              <span style={{ color: MUTED }}>NEUTRAL: {signal.classDistPct.NEUTRAL}%</span>
              <span style={{ color: RED   }}>SHORT: {signal.classDistPct.SHORT}%</span>
            </div>
          )}
        </div>
      )}

      {/* PSI drift table */}
      {Object.keys(featureDrift).length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ ...lbl, marginBottom: 0 }}>Feature Drift (PSI)</div>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: drift.globalStatus === 'ok' ? GREEN : AMBER,
            }}>
              {drift.globalStatus?.toUpperCase() || '—'}
            </span>
          </div>
          <div style={{ fontSize: 9, color: MUTED, marginBottom: 6 }}>Stable &lt;0.10 | Warning 0.10–0.20 | Critical &gt;0.20</div>
          {Object.entries(featureDrift).map(([feat, entry]) => (
            <DriftRow key={feat} feature={feat} entry={entry} />
          ))}
        </div>
      )}

      {/* Worker status */}
      {worker && (
        <div style={card}>
          <div style={lbl}>Python Inference Worker</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: worker.ready ? GREEN : RED }}>
              {worker.ready ? '● Running' : '○ Stopped'}
            </span>
            {worker.loadedModel && (
              <span style={{ fontSize: 10, color: MUTED, fontFamily: 'monospace' }}>
                {worker.loadedModel.split('/').pop()}
              </span>
            )}
            <span style={{ fontSize: 11, color: MUTED }}>
              Pending: {worker.pendingRequests ?? 0}
            </span>
          </div>
        </div>
      )}

      {/* Registry */}
      {reg && (
        <div style={card}>
          <div style={lbl}>Model Registry</div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span style={{ color: TEXT }}>Total: {reg.totalModels ?? 0}</span>
            {reg.champion && <span style={{ color: GREEN }}>Champion: {reg.champion.slice(0, 20)}</span>}
            {reg.challenger && <span style={{ color: VIOLET }}>Challenger: {reg.challenger.slice(0, 20)}</span>}
          </div>
        </div>
      )}

      {drift?.computedAt && (
        <div style={{ fontSize: 10, color: MUTED, textAlign: 'right' }}>
          Drift snapshot: {new Date(drift.computedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
