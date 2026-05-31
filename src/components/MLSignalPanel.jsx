/**
 * MLSignalPanel — full P1 signal display.
 *
 * Shows: class, probabilities, confidence, model version, asOf,
 *        top features, drift summary, latency diagnostics.
 */

import { useEffect } from 'react';
import MLSignalBadge from './MLSignalBadge.jsx';

const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';
const BLUE    = '#2563eb';
const VIOLET  = '#a78bfa';

const card = { background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 14 };
const lbl  = { fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };

function ProbBar({ label: l, prob, color }) {
  const pct = prob != null ? Math.round(prob * 100) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
        <span style={{ color: TEXT }}>{l}</span>
        <span style={{ color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ background: '#1f2937', borderRadius: 3, height: 5 }}>
        <div style={{ background: color, borderRadius: 3, height: 5, width: `${pct}%`, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function FeatureBar({ name, value, maxAbs }) {
  if (value == null) return null;
  const pct = maxAbs > 0 ? Math.abs(value) / maxAbs * 100 : 0;
  const color = value > 0 ? GREEN : RED;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 10, color: MUTED, width: 160, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <div style={{ flex: 1, background: '#1f2937', borderRadius: 2, height: 4 }}>
        <div style={{ background: color, borderRadius: 2, height: 4, width: `${pct}%` }} />
      </div>
      <span style={{ fontSize: 10, color, width: 60, textAlign: 'right' }}>{typeof value === 'number' ? value.toFixed(4) : value}</span>
    </div>
  );
}

export default function MLSignalPanel({ signal, features, loading, error, onRefresh }) {
  if (loading) return (
    <div style={{ ...card, color: MUTED, fontSize: 13, textAlign: 'center', padding: 24 }}>
      Computing signal…
    </div>
  );

  if (error) return (
    <div style={{ ...card, borderColor: RED }}>
      <div style={{ color: AMBER, fontSize: 12 }}>Signal unavailable</div>
      <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>{error}</div>
    </div>
  );

  if (!signal) return (
    <div style={{ ...card, color: MUTED, fontSize: 13, textAlign: 'center', padding: 24 }}>
      No signal — await 1m bar close or run inference
    </div>
  );

  const probs   = signal.probabilities || {};
  const diag    = signal.diagnostics || {};
  const feats   = features?.features || {};

  // Feature values for sparkbars
  const featEntries = Object.entries(feats).filter(([, v]) => v != null && Number.isFinite(v));
  const maxAbs      = Math.max(...featEntries.map(([, v]) => Math.abs(v)), 0.001);

  const driftColor = diag.driftStatus === 'ok' ? GREEN : diag.driftStatus?.includes('warning') ? AMBER : RED;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Header */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={lbl}>ML Signal — P1</div>
          <MLSignalBadge signal={signal} size="md" showConf />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: MUTED }}>Model</div>
          <div style={{ fontSize: 11, color: VIOLET, fontFamily: 'monospace' }}>
            {signal.modelVersion?.slice(0, 24) || '—'}
          </div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
            {signal.asOf ? new Date(signal.asOf).toLocaleTimeString() : '—'}
          </div>
        </div>
        {onRefresh && (
          <button onClick={onRefresh} style={{ background: BLUE, color: '#fff', border: 'none', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11 }}>
            Refresh
          </button>
        )}
      </div>

      {/* Probabilities */}
      <div style={card}>
        <div style={lbl}>Class Probabilities</div>
        <ProbBar label="LONG"    prob={probs.LONG}    color={GREEN} />
        <ProbBar label="NEUTRAL" prob={probs.NEUTRAL} color={MUTED} />
        <ProbBar label="SHORT"   prob={probs.SHORT}   color={RED}   />
      </div>

      {/* Features */}
      {featEntries.length > 0 && (
        <div style={card}>
          <div style={lbl}>P1 Features (as-of snapshot)</div>
          {featEntries.slice(0, 11).map(([name, val]) => (
            <FeatureBar key={name} name={name} value={val} maxAbs={maxAbs} />
          ))}
          {features?.missingFeatureCount > 0 && (
            <div style={{ fontSize: 10, color: AMBER, marginTop: 4 }}>
              {features.missingFeatureCount} feature(s) missing/null
            </div>
          )}
        </div>
      )}

      {/* Diagnostics */}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
        {[
          { label: 'Inference', value: diag.inferenceLatencyMs != null ? `${diag.inferenceLatencyMs}ms` : '—', color: diag.inferenceLatencyMs > 100 ? AMBER : GREEN },
          { label: 'Feature Compute', value: diag.featureComputeMs != null ? `${diag.featureComputeMs}ms` : '—', color: TEXT },
          { label: 'Drift', value: diag.driftStatus || '—', color: driftColor },
          { label: 'Missing Feat.', value: diag.missingFeatureCount ?? '—', color: diag.missingFeatureCount > 0 ? AMBER : GREEN },
        ].map(({ label: l, value, color }) => (
          <div key={l} style={{ background: '#080810', borderRadius: 6, padding: '6px 10px' }}>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>{l}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
