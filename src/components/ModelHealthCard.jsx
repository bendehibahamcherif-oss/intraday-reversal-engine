import { useMLStore } from '../store/mlStore.js';

const S = {
  card:   { background: '#0d0d1a', border: '1px solid #1f2937', borderRadius: 10, padding: 16 },
  lbl:    { fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  row:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #1f293733' },
  val:    { fontSize: 12, fontFamily: 'monospace', color: '#e0e0f0' },
  muted:  { fontSize: 11, color: '#6b7280' },
  badge:  (ok) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 11, fontWeight: 700,
    color: ok ? '#22c55e' : '#ef4444',
  }),
};

function HashChip({ value, label }) {
  if (!value) return <span style={S.muted}>—</span>;
  return (
    <span
      title={value}
      style={{ fontFamily: 'monospace', fontSize: 11, color: '#60a5fa', cursor: 'default' }}
    >
      {label ? `${label}: ` : ''}{value.slice(0, 8)}…
    </span>
  );
}

/**
 * ModelHealthCard — displays champion model health, version, hashes, latency.
 *
 * Props:
 *   onPromoteChallenger  function(challengerVersion) — callback for promote button
 *   showPromoteButton    bool (default false)
 */
export default function ModelHealthCard({ onPromoteChallenger, showPromoteButton = false }) {
  const health      = useMLStore((s) => s.healthStatus);
  const healthLoad  = useMLStore((s) => s.healthLoading);
  const modelInfo   = useMLStore((s) => s.modelInfo);
  const infoLoad    = useMLStore((s) => s.modelInfoLoading);
  const trainingRuns = useMLStore((s) => s.trainingRuns);

  const fetchHealth    = useMLStore((s) => s.fetchHealth);
  const fetchModelInfo = useMLStore((s) => s.fetchModelInfo);

  const ok      = health?.ok ?? false;
  const pool    = health?.workerPool;
  const champ   = health?.champion || modelInfo;
  const challenger = trainingRuns?.find?.((r) => r.status === 'candidate' && r.version !== champ?.version);

  const version = modelInfo?.version || champ?.version || champ?.champion || '—';
  const dataHash = modelInfo?.datasetHash || champ?.dataset_hash || '';
  const featHash = modelInfo?.featureHash || champ?.feature_schema_hash || '';
  const trainDate = modelInfo?.trainingWindow?.start
    ? new Date(modelInfo.trainingWindow.start).toLocaleDateString()
    : champ?.created_at ? new Date(champ.created_at).toLocaleDateString()
    : '—';

  const metrics = modelInfo?.metrics;
  const testAcc = metrics?.testMetrics?.accuracy;
  const testF1  = metrics?.testMetrics?.f1_macro;

  const handleRefresh = () => { fetchHealth(); fetchModelInfo(); };

  return (
    <div style={S.card}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={S.lbl}>Champion Model</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={S.badge(ok)}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
            {ok ? 'Healthy' : 'Degraded'}
          </span>
          <button
            onClick={handleRefresh}
            disabled={healthLoad || infoLoad}
            style={{ background: 'transparent', border: '1px solid #374151', borderRadius: 6, color: '#9ca3af', fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}
          >
            {healthLoad || infoLoad ? '…' : '↺'}
          </button>
        </div>
      </div>

      {/* Version row */}
      <div style={S.row}>
        <span style={S.muted}>Version</span>
        <span style={{ ...S.val, color: '#60a5fa' }}>{version}</span>
      </div>

      {/* Training date */}
      <div style={S.row}>
        <span style={S.muted}>Trained</span>
        <span style={S.val}>{trainDate}</span>
      </div>

      {/* Hashes */}
      <div style={S.row}>
        <span style={S.muted}>Dataset hash</span>
        <HashChip value={dataHash} />
      </div>
      <div style={S.row}>
        <span style={S.muted}>Feature hash</span>
        <HashChip value={featHash} />
      </div>

      {/* Test metrics */}
      {testAcc != null && (
        <div style={S.row}>
          <span style={S.muted}>Test Acc / F1</span>
          <span style={S.val}>
            {(Number(testAcc) * 100).toFixed(1)}% / {testF1 != null ? (Number(testF1) * 100).toFixed(1) + '%' : '—'}
          </span>
        </div>
      )}

      {/* Worker pool */}
      {pool && (
        <div style={S.row}>
          <span style={S.muted}>Workers</span>
          <span style={{ ...S.val, color: pool.readyWorkers > 0 ? '#22c55e' : '#ef4444' }}>
            {pool.readyWorkers}/{pool.poolSize} ready
          </span>
        </div>
      )}

      {/* Promote challenger */}
      {showPromoteButton && challenger && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #1f2937' }}>
          <div style={{ ...S.muted, marginBottom: 6 }}>
            Challenger: <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{challenger.version?.slice(0, 24)}</span>
          </div>
          <button
            onClick={() => onPromoteChallenger?.(challenger.version)}
            style={{
              width: '100%', padding: '8px 0', background: '#1e3a5f',
              border: '1px solid #2563eb', borderRadius: 8, color: '#60a5fa',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Promote Challenger → Champion
          </button>
        </div>
      )}
    </div>
  );
}
