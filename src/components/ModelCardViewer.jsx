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

const card = { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 10 };
const lbl  = { fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 700 };
const row  = { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${BORDER}22`, fontSize: 12 };

const TABS = ['Overview', 'Performance', 'Features', 'Risks', 'Deployment', 'Metadata'];

function MetricGrid({ metrics }) {
  if (!metrics) return null;
  const entries = [
    ['Accuracy',    metrics.accuracy,      v => (v*100).toFixed(1)+'%'],
    ['F1 Macro',    metrics.f1_macro,      v => (v*100).toFixed(1)+'%'],
    ['ROC AUC',     metrics.roc_auc_macro, v => v.toFixed(3)],
    ['Brier (Long)',metrics.brier_long,    v => v.toFixed(4)],
    ['Log Loss',    metrics.mlogloss,      v => v.toFixed(4)],
  ].filter(([, v]) => v != null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
      {entries.map(([label, value, fmt]) => (
        <div key={label} style={{ background: '#080810', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: BLUE, fontFamily: 'monospace' }}>{fmt(value)}</div>
        </div>
      ))}
    </div>
  );
}

function ConfusionMatrix({ matrix }) {
  if (!matrix?.length) return null;
  const labels = ['SHORT', 'NEUTRAL', 'LONG'];
  const colors = [RED, MUTED, GREEN];
  const maxVal = Math.max(...matrix.flat());

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
        <thead>
          <tr>
            <th style={{ color: MUTED, padding: '4px 8px', textAlign: 'right', fontSize: 9 }}>True↓ Pred→</th>
            {labels.map((l, i) => (
              <th key={l} style={{ color: colors[i], padding: '4px 8px', textAlign: 'center' }}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row_, ri) => (
            <tr key={ri}>
              <td style={{ color: colors[ri], padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{labels[ri]}</td>
              {row_.map((v, ci) => {
                const intensity = maxVal > 0 ? v / maxVal : 0;
                const isCorrect = ri === ci;
                const bg = isCorrect ? `rgba(34,197,94,${0.05 + intensity * 0.2})` : `rgba(239,68,68,${intensity * 0.15})`;
                return (
                  <td key={ci} style={{ padding: '6px 12px', textAlign: 'center', background: bg, color: isCorrect ? GREEN : TEXT }}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * ModelCardViewer — full governance model card.
 *
 * Props:
 *   onExport  function(format: 'md'|'json') — export callback
 */
export default function ModelCardViewer({ onExport }) {
  const modelCard = useMLStore((s) => s.modelCard);
  const loading   = useMLStore((s) => s.modelCardLoading);
  const error     = useMLStore((s) => s.modelCardError);
  const fetchCard = useMLStore((s) => s.fetchModelCard);

  const [activeTab, setActiveTab] = useState('Overview');

  const handleExport = (format) => {
    if (onExport) { onExport(format, modelCard); return; }
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(modelCard, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `model_card_${modelCard?.version || 'unknown'}.json`; a.click();
    } else if (format === 'md' && modelCard?.markdownContent) {
      const blob = new Blob([modelCard.markdownContent], { type: 'text/markdown' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `model_card_${modelCard?.version || 'unknown'}.md`; a.click();
    }
  };

  if (loading) return <div style={{ color: MUTED, padding: 30, textAlign: 'center' }}>Loading model card…</div>;
  if (error)   return (
    <div style={{ color: AMBER, padding: 16 }}>
      {error}
      <button onClick={() => fetchCard()} style={{ marginLeft: 12, color: BLUE, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12 }}>Retry</button>
    </div>
  );
  if (!modelCard) return (
    <div style={{ color: MUTED, padding: 30, textAlign: 'center' }}>
      No model card available.
      <button onClick={() => fetchCard()} style={{ display: 'block', margin: '12px auto', color: BLUE, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 12 }}>
        Load Model Card
      </button>
    </div>
  );

  const { version, trainingDate, objective, labelDefinition: ld, features = [], metrics, limitations = [], risks = [], deployment, guardrails = [], metadata } = modelCard;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: TEXT }}>Model Card</div>
          <div style={{ fontSize: 12, color: VIOLET, fontFamily: 'monospace', marginTop: 2 }}>{version || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => handleExport('json')}
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: BLUE, fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>
            ⬇ JSON
          </button>
          {modelCard?.markdownContent && (
            <button onClick={() => handleExport('md')}
              style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>
              ⬇ MD
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{
              background: activeTab === t ? '#1e3a5f' : 'transparent',
              border: `1px solid ${activeTab === t ? BLUE : BORDER}`,
              borderRadius: 6, color: activeTab === t ? BLUE : MUTED,
              fontSize: 11, padding: '4px 12px', cursor: 'pointer', fontWeight: activeTab === t ? 700 : 400,
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────────── */}
      {activeTab === 'Overview' && (
        <div>
          <div style={card}>
            <div style={lbl}>Objective</div>
            <p style={{ fontSize: 13, color: TEXT, lineHeight: 1.5, margin: 0 }}>{objective || '—'}</p>
          </div>
          {ld && (
            <div style={card}>
              <div style={lbl}>Label Definition (tradable_v1)</div>
              <div style={row}>
                <span style={{ color: MUTED }}>Horizon</span>
                <span style={{ color: TEXT, fontFamily: 'monospace' }}>{ld.horizon} bars</span>
              </div>
              <div style={row}>
                <span style={{ color: MUTED }}>τ (threshold)</span>
                <span style={{ color: TEXT, fontFamily: 'monospace' }}>{ld.tau ?? '—'} ({((ld.tau || 0) * 10000).toFixed(0)} bps)</span>
              </div>
              <div style={row}>
                <span style={{ color: MUTED }}>Cost</span>
                <span style={{ color: TEXT, fontFamily: 'monospace' }}>{ld.costBps} bps round-trip</span>
              </div>
              <div style={row}>
                <span style={{ color: MUTED }}>Slippage</span>
                <span style={{ color: TEXT, fontFamily: 'monospace' }}>{ld.slippageBps} bps / side</span>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 12 }}>
                <span style={{ color: GREEN }}>LONG (2): r_net &gt; +τ</span>
                <span style={{ color: MUTED }}>NEUTRAL (1): |r_net| ≤ τ</span>
                <span style={{ color: RED   }}>SHORT (0): r_net &lt; -τ</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: MUTED, fontFamily: 'monospace' }}>
                r_net = (exit − entry) / entry − cost &nbsp;|&nbsp; entry = open[t+1] &nbsp;|&nbsp; exit = close[t+H]
              </div>
            </div>
          )}
          <div style={card}>
            <div style={lbl}>Training Date</div>
            <span style={{ color: TEXT, fontSize: 12 }}>
              {trainingDate ? new Date(trainingDate).toLocaleString() : '—'}
            </span>
          </div>
        </div>
      )}

      {/* ── Performance ───────────────────────────────────────────────────────── */}
      {activeTab === 'Performance' && (
        <div>
          {metrics?.testMetrics && (
            <div style={card}>
              <div style={lbl}>Test Set Metrics</div>
              <MetricGrid metrics={metrics.testMetrics} />
            </div>
          )}
          {metrics?.valMetrics && (
            <div style={card}>
              <div style={lbl}>Validation Set Metrics</div>
              <MetricGrid metrics={metrics.valMetrics} />
            </div>
          )}
          {metrics?.testMetrics?.confusion_matrix && (
            <div style={card}>
              <div style={lbl}>Confusion Matrix (Test)</div>
              <ConfusionMatrix matrix={metrics.testMetrics.confusion_matrix} />
            </div>
          )}
          {!metrics && <div style={{ color: MUTED, fontSize: 12, padding: 20, textAlign: 'center' }}>No metrics available</div>}
        </div>
      )}

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      {activeTab === 'Features' && (
        <div>
          {features.length === 0 ? (
            <div style={{ color: MUTED, fontSize: 12, padding: 20, textAlign: 'center' }}>No feature families documented</div>
          ) : features.map((family, i) => (
            <div key={i} style={card}>
              <div style={lbl}>{family.name || `Family ${i + 1}`}</div>
              {Array.isArray(family.features) ? (
                <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {family.features.map((f, j) => (
                    <li key={j} style={{ fontSize: 12, color: TEXT, fontFamily: 'monospace' }}>{f}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 12, color: TEXT, margin: 0 }}>{String(family)}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Risks ─────────────────────────────────────────────────────────────── */}
      {activeTab === 'Risks' && (
        <div>
          <div style={card}>
            <div style={lbl}>Limitations</div>
            {limitations.length ? (
              <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {limitations.map((l, i) => <li key={i} style={{ fontSize: 12, color: MUTED }}>{l}</li>)}
              </ul>
            ) : <span style={{ color: MUTED, fontSize: 12 }}>None documented</span>}
          </div>
          <div style={card}>
            <div style={lbl}>Risks</div>
            {risks.length ? (
              <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {risks.map((r, i) => <li key={i} style={{ fontSize: 12, color: AMBER }}>{r}</li>)}
              </ul>
            ) : <span style={{ color: MUTED, fontSize: 12 }}>None documented</span>}
          </div>
          {guardrails.length > 0 && (
            <div style={card}>
              <div style={lbl}>Guardrails</div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {guardrails.map((g, i) => <li key={i} style={{ fontSize: 12, color: TEXT }}>{g}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Deployment ────────────────────────────────────────────────────────── */}
      {activeTab === 'Deployment' && deployment && (
        <div>
          <div style={card}>
            <div style={lbl}>Endpoints</div>
            {(deployment.endpoints || []).map((ep) => (
              <div key={ep} style={{ fontFamily: 'monospace', fontSize: 12, color: BLUE, padding: '3px 0' }}>{ep}</div>
            ))}
          </div>
          <div style={card}>
            <div style={lbl}>SLAs</div>
            <div style={row}>
              <span style={{ color: MUTED }}>Latency p95</span>
              <span style={{ color: TEXT, fontFamily: 'monospace' }}>
                {deployment.latencyP95 != null ? `${deployment.latencyP95}ms` : '< 500ms (target)'}
              </span>
            </div>
            <div style={row}>
              <span style={{ color: MUTED }}>Error rate</span>
              <span style={{ color: TEXT, fontFamily: 'monospace' }}>
                {deployment.errorRate != null ? `${(deployment.errorRate * 100).toFixed(2)}%` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Metadata ─────────────────────────────────────────────────────────── */}
      {activeTab === 'Metadata' && metadata && (
        <div style={card}>
          <div style={lbl}>Technical Metadata</div>
          {[
            ['Model version',    metadata.modelVersion || version],
            ['Dataset hash',     metadata.datasetHash],
            ['Feature hash',     metadata.featureSchemaHash],
            ['Git SHA',          metadata.gitSha],
            ['Artifact URI',     metadata.artifactUri],
            ['Train window start', metadata.trainingWindowStart],
            ['Train window end',   metadata.trainingWindowEnd],
          ].map(([k, v]) => v ? (
            <div key={k} style={row}>
              <span style={{ color: MUTED, fontSize: 11 }}>{k}</span>
              <span style={{ color: BLUE, fontFamily: 'monospace', fontSize: 11, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>
                {v}
              </span>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}
