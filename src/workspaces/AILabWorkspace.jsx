import { useEffect } from 'react';
import { useAILabStore } from '../store/aiLabStore.js';

const panel = { background: '#0a0a0a', border: '1px solid #202020', borderRadius: 12, padding: 12 };
const fmt = (v) => (v ? new Date(v).toLocaleString() : '—');
const warn = (w) => Array.isArray(w) ? w.join(', ') : (w || '—');

const valueRows = (obj) => Object.entries(obj || {}).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v));

export default function AILabWorkspace() {
  const s = useAILabStore();

  useEffect(() => { s.refreshAll(); }, []);

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...panel, borderColor: '#7c2d12', background: '#111827' }}>
        <strong style={{ color: '#fbbf24' }}>AI Lab focuses on measured analytics and regime context (no prediction claims).</strong>
      </div>
      <div style={{ ...panel, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
        <label>Symbol<input value={s.symbol} onChange={(e) => s.setSymbol(e.target.value)} style={{ width: '100%' }} /></label>
        <label>Horizon<input type="number" min="1" value={s.horizon} onChange={(e) => s.setHorizon(e.target.value)} style={{ width: '100%' }} /></label>
        <label>Limit<input type="number" min="1" value={s.limit} onChange={(e) => s.setLimit(e.target.value)} style={{ width: '100%' }} /></label>
        <button onClick={s.refreshAll} disabled={s.loading || s.analyticsLoading}>{(s.loading || s.analyticsLoading) ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {(s.error || s.analyticsError) && <div style={{ ...panel, borderColor: '#7f1d1d', color: '#fecaca' }}>{s.error || s.analyticsError} <button onClick={s.clearError}>Dismiss</button></div>}

      <div style={panel}>
        <h3>Regime Detection</h3>
        {!s.currentRegime ? <div style={{ color: '#9ca3af' }}>Current regime unavailable.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8 }}>
            {valueRows(s.currentRegime).map(([k, v]) => <div key={k}><b>{k}:</b> {String(v)}</div>)}
            {s.currentRegime?.warnings?.length > 0 && <div style={{ color: '#fbbf24' }}><b>Warnings:</b> {warn(s.currentRegime.warnings)}</div>}
          </div>
        )}
      </div>

      <div style={panel}>
        <h3>Dataset Analytics</h3>
        {!s.datasetAnalytics ? <div style={{ color: '#9ca3af' }}>No dataset analytics yet.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8 }}>
            {valueRows(s.datasetAnalytics).map(([k, v]) => <div key={k}><b>{k}:</b> {String(v)}</div>)}
            {(s.datasetAnalytics?.warnings?.length > 0 || s.datasetAnalytics?.insufficientData) && <div style={{ color: '#fbbf24' }}><b>Warnings:</b> {warn(s.datasetAnalytics?.warnings || 'Insufficient data')}</div>}
          </div>
        )}
      </div>

      <div style={panel}>
        <h3>Feature Analytics</h3>
        {!s.featureAnalytics ? <div style={{ color: '#9ca3af' }}>No feature analytics yet.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8 }}>
            {valueRows(s.featureAnalytics).map(([k, v]) => <div key={k}><b>{k}:</b> {String(v)}</div>)}
            {(s.featureAnalytics?.warnings?.length > 0 || s.featureAnalytics?.insufficientData) && <div style={{ color: '#fbbf24' }}><b>Warnings:</b> {warn(s.featureAnalytics?.warnings || 'Insufficient data')}</div>}
          </div>
        )}
      </div>

      <div style={panel}>
        <h3>Regime Performance</h3>
        {!s.regimeAnalytics ? <div style={{ color: '#9ca3af' }}>No regime analytics yet.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8 }}>
            {valueRows(s.regimeAnalytics).map(([k, v]) => <div key={k}><b>{k}:</b> {String(v)}</div>)}
            {(s.regimeAnalytics?.warnings?.length > 0 || s.regimeAnalytics?.insufficientData) && <div style={{ color: '#fbbf24' }}><b>Warnings:</b> {warn(s.regimeAnalytics?.warnings || 'Insufficient data')}</div>}
          </div>
        )}
      </div>

      <div style={panel}>
        <h3>Analytics Actions</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={s.analyzeDataset} disabled={s.analyticsLoading}>Analyze Dataset</button>
          <button onClick={s.clearDatasetAnalytics} disabled={s.analyticsLoading}>Clear Analytics</button>
        </div>
        <div style={{ color: '#9ca3af', marginTop: 8 }}>Last updated: {fmt(s.lastUpdated)}</div>
      </div>
    </section>
  );
}
