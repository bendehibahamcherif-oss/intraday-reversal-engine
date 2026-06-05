import { useMLStore } from '../store/mlStore.js';

const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';

const PSI_WARNING  = 0.10;
const PSI_CRITICAL = 0.20;

function psiColor(psi) {
  if (psi == null) return MUTED;
  if (psi < PSI_WARNING)  return GREEN;
  if (psi < PSI_CRITICAL) return AMBER;
  return RED;
}

function psiLabel(psi) {
  if (psi == null)           return '—';
  if (psi < PSI_WARNING)    return 'Stable';
  if (psi < PSI_CRITICAL)   return 'Warning';
  return 'Critical';
}

function psiStatus(psi) {
  if (psi < PSI_WARNING)  return 'stable';
  if (psi < PSI_CRITICAL) return 'warning';
  return 'critical';
}

function PSIBar({ value, maxVal = 0.3 }) {
  const w = value != null ? Math.min(100, (value / maxVal) * 100) : 0;
  const color = psiColor(value);
  return (
    <div style={{ width: '100%', height: 5, background: '#1f2937', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  );
}

/**
 * DriftDashboard — PSI feature drift, prediction drift, data quality summary.
 */
export default function DriftDashboard() {
  const drift   = useMLStore((s) => s.driftMetrics);
  const loading = useMLStore((s) => s.driftLoading);
  const error   = useMLStore((s) => s.driftError);
  const fetchDrift = useMLStore((s) => s.fetchDriftMetrics);

  if (loading) return <div style={{ color: MUTED, padding: 20, textAlign: 'center', fontSize: 13 }}>Loading drift…</div>;
  if (error)   return <div style={{ color: AMBER, fontSize: 12, padding: 10 }}>{error}</div>;

  const features    = drift?.features || drift?.featurePsi || {};
  const globalStatus = drift?.global_status || drift?.globalStatus || 'unknown';
  const predDrift   = drift?.predDrift;
  const dataDrift   = drift?.dataDrift;
  const nWarning    = drift?.n_features_warning ?? Object.values(features).filter((f) => {
    const psi = typeof f === 'number' ? f : f?.psi;
    return psi != null && psi >= PSI_WARNING && psi < PSI_CRITICAL;
  }).length;
  const nCritical   = drift?.n_features_critical ?? Object.values(features).filter((f) => {
    const psi = typeof f === 'number' ? f : f?.psi;
    return psi != null && psi >= PSI_CRITICAL;
  }).length;
  const computedAt  = drift?.computed_at || drift?.computedAt;

  const statusColor = globalStatus === 'stable' ? GREEN : globalStatus === 'warning' ? AMBER : globalStatus === 'critical' ? RED : MUTED;

  const card = { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 14 };
  const lbl  = { fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
        {[
          { label: 'Global Status', value: globalStatus?.toUpperCase() || '—', color: statusColor },
          { label: 'Features Warning', value: nWarning, color: nWarning > 0 ? AMBER : GREEN },
          { label: 'Features Critical', value: nCritical, color: nCritical > 0 ? RED : GREEN },
          { label: 'Pred Drift', value: predDrift != null ? Number(predDrift).toFixed(3) : '—', color: psiColor(predDrift) },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#080810', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Feature PSI table */}
      {Object.keys(features).length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ ...lbl, marginBottom: 0 }}>Feature Drift (PSI)</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 9, color: MUTED }}>
              <span style={{ color: GREEN }}>●</span> Stable &lt;0.10
              <span style={{ color: AMBER }}>●</span> Warning 0.10–0.20
              <span style={{ color: RED   }}>●</span> Critical &gt;0.20
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(features)
              .sort((a, b) => {
                const pa = typeof a[1] === 'number' ? a[1] : a[1]?.psi ?? 0;
                const pb = typeof b[1] === 'number' ? b[1] : b[1]?.psi ?? 0;
                return pb - pa;
              })
              .map(([feat, entry]) => {
                const psi = typeof entry === 'number' ? entry : entry?.psi;
                const color = psiColor(psi);
                return (
                  <div key={feat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#e0e0f0', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>
                        {feat}
                      </span>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'monospace' }}>
                          {psi != null ? Number(psi).toFixed(3) : '—'}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, color,
                          background: `${color}18`, border: `1px solid ${color}44`,
                          borderRadius: 3, padding: '1px 4px',
                        }}>
                          {psiLabel(psi)}
                        </span>
                      </div>
                    </div>
                    <PSIBar value={psi} />
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Prediction drift */}
      {predDrift != null && (
        <div style={card}>
          <div style={lbl}>Prediction Distribution Drift</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div>
              <div style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Pred PSI</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: psiColor(predDrift), fontFamily: 'monospace' }}>
                {Number(predDrift).toFixed(3)}
              </div>
            </div>
            {dataDrift != null && (
              <div>
                <div style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Data Drift</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: psiColor(dataDrift), fontFamily: 'monospace' }}>
                  {Number(dataDrift).toFixed(3)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {computedAt && (
          <span style={{ fontSize: 10, color: MUTED }}>
            Computed: {new Date(computedAt).toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={() => fetchDrift()}
          style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 10, padding: '3px 8px', cursor: 'pointer' }}
        >
          ↺ Refresh
        </button>
      </div>

      {/* Empty state */}
      {Object.keys(features).length === 0 && !loading && (
        <div style={{ color: MUTED, fontSize: 12, textAlign: 'center', padding: 20 }}>
          Not enough prediction history for drift monitoring.
        </div>
      )}
    </div>
  );
}
