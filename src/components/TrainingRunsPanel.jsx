import { useState } from 'react';
import { useMLStore } from '../store/mlStore.js';

const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';
const BLUE    = '#60a5fa';
const VIOLET  = '#a78bfa';

const STATUS_COLORS = {
  champion:  { color: GREEN,  label: 'Champion' },
  candidate: { color: VIOLET, label: 'Candidate' },
  old:       { color: MUTED,  label: 'Old' },
};

function MetricChip({ label, value, highlight }) {
  if (value == null) return null;
  const v = typeof value === 'number' ? (value < 1 ? (value * 100).toFixed(1) + '%' : value.toFixed(3)) : value;
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: highlight ? BLUE : TEXT, fontFamily: 'monospace' }}>{v}</span>
    </span>
  );
}

/**
 * TrainingRunsPanel — list of model training runs with champion/challenger badges.
 *
 * Props:
 *   onPromote  function(version) — called when user clicks Promote
 *   compact    bool (default false)
 */
export default function TrainingRunsPanel({ onPromote, compact = false }) {
  const runs    = useMLStore((s) => s.trainingRuns);
  const loading = useMLStore((s) => s.trainingLoading);
  const error   = useMLStore((s) => s.trainingError);
  const trainingInProgress = useMLStore((s) => s.trainingInProgress);
  const fetchRuns   = useMLStore((s) => s.fetchTrainingRuns);
  const startTrain  = useMLStore((s) => s.startTraining);

  const [expanded, setExpanded] = useState(null);

  const handlePromote = async (version) => {
    if (!onPromote) return;
    try { await onPromote(version); } catch {}
  };

  if (loading) return <div style={{ color: MUTED, padding: 20, textAlign: 'center', fontSize: 13 }}>Loading runs…</div>;
  if (error)   return <div style={{ color: AMBER, fontSize: 12, padding: 10 }}>{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>
          Training Runs ({runs.length})
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => fetchRuns()}
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}
          >↺ Refresh</button>
          <button
            onClick={() => startTrain()}
            disabled={trainingInProgress}
            style={{
              background: trainingInProgress ? '#111' : '#1e3a5f',
              border: `1px solid ${trainingInProgress ? BORDER : BLUE}`,
              borderRadius: 6, color: trainingInProgress ? MUTED : BLUE,
              fontSize: 11, padding: '3px 10px', cursor: trainingInProgress ? 'not-allowed' : 'pointer', fontWeight: 700,
            }}
          >
            {trainingInProgress ? '⏳ Training…' : '▶ Train'}
          </button>
        </div>
      </div>

      {runs.length === 0 && (
        <div style={{ color: MUTED, fontSize: 12, textAlign: 'center', padding: 20 }}>No trained models yet</div>
      )}

      {runs.map((run) => {
        const statusCfg = STATUS_COLORS[run.status] || { color: MUTED, label: run.status };
        const isChamp   = run.status === 'champion';
        const isExpanded = expanded === (run.version || run.modelVersion);
        const key = run.version || run.modelVersion || run.model_id;
        const ver = run.version || run.modelVersion || '—';
        const date = run.created_at || run.createdAt;
        const metrics = run.metrics_json
          ? (typeof run.metrics_json === 'string' ? JSON.parse(run.metrics_json) : run.metrics_json)
          : (run.testMetrics || run.valMetrics || null);

        return (
          <div
            key={key}
            style={{
              background: isChamp ? '#0a1a0a' : SURFACE,
              border: `1px solid ${isChamp ? '#22c55e44' : BORDER}`,
              borderRadius: 8,
            }}
          >
            {/* Row header */}
            <div
              style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
              onClick={() => setExpanded(isExpanded ? null : key)}
            >
              {/* Status badge */}
              <span style={{
                fontSize: 10, fontWeight: 700, color: statusCfg.color,
                background: `${statusCfg.color}22`, border: `1px solid ${statusCfg.color}55`,
                borderRadius: 4, padding: '2px 6px',
              }}>
                {statusCfg.label}
              </span>

              {/* Version */}
              <span style={{ flex: 1, fontSize: 11, fontFamily: 'monospace', color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {ver}
              </span>

              {/* Date */}
              {date && (
                <span style={{ fontSize: 10, color: MUTED }}>
                  {new Date(date).toLocaleDateString()}
                </span>
              )}

              {/* Expand */}
              <span style={{ color: MUTED, fontSize: 11 }}>{isExpanded ? '▲' : '▼'}</span>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div style={{ padding: '0 12px 12px 12px', borderTop: `1px solid ${BORDER}` }}>
                {/* Metrics grid */}
                {metrics && (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 10, paddingBottom: 10 }}>
                    <MetricChip label="Acc" value={metrics.accuracy || metrics.test_accuracy} highlight />
                    <MetricChip label="F1" value={metrics.f1_macro || metrics.f1} highlight />
                    <MetricChip label="AUC" value={metrics.roc_auc_macro || metrics.auc} />
                    <MetricChip label="Brier" value={metrics.brier_long || metrics.brier} />
                    <MetricChip label="Logloss" value={metrics.mlogloss || metrics.logloss} />
                  </div>
                )}

                {/* Hashes */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                  {run.dataset_hash && (
                    <span style={{ fontSize: 10, color: MUTED }}>
                      DS: <span style={{ color: BLUE, fontFamily: 'monospace' }}>{run.dataset_hash.slice(0, 8)}</span>
                    </span>
                  )}
                  {(run.featureVersion || run.feature_schema_hash) && (
                    <span style={{ fontSize: 10, color: MUTED }}>
                      Features: <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>
                        {(run.featureVersion || run.feature_schema_hash || '').slice(0, 8)}
                      </span>
                    </span>
                  )}
                </div>

                {/* Promote button */}
                {run.status !== 'champion' && onPromote && (
                  <button
                    onClick={() => handlePromote(ver)}
                    style={{
                      width: '100%', padding: '7px 0', marginTop: 4,
                      background: '#1e3a5f', border: `1px solid ${BLUE}`,
                      borderRadius: 6, color: BLUE, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Promote to Champion
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
