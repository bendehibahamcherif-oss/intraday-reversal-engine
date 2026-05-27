import { useEffect } from 'react';
import { useAILabStore } from '../store/aiLabStore.js';

const panel = { background: '#0a0a0a', border: '1px solid #202020', borderRadius: 12, padding: 12 };
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v) => (v ? new Date(v).toLocaleString() : '—');
const warn = (w) => Array.isArray(w) ? w.join(', ') : (w || '—');

export default function AILabWorkspace() {
  const s = useAILabStore();

  useEffect(() => { s.refreshAll(); }, []);

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...panel, borderColor: '#7c2d12', background: '#111827' }}>
        <strong style={{ color: '#fbbf24' }}>Dataset preparation only. No model predictions yet.</strong>
      </div>

      <div style={{ ...panel, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
        <label>Symbol<input value={s.symbol} onChange={(e) => s.setSymbol(e.target.value)} style={{ width: '100%' }} /></label>
        <label>Horizon<input type="number" min="1" value={s.horizon} onChange={(e) => s.setHorizon(e.target.value)} style={{ width: '100%' }} /></label>
        <label>Limit<input type="number" min="1" value={s.limit} onChange={(e) => s.setLimit(e.target.value)} style={{ width: '100%' }} /></label>
        <button onClick={s.refreshAll} disabled={s.loading}>{s.loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {s.error && <div style={{ ...panel, borderColor: '#7f1d1d', color: '#fecaca' }}>{s.error} <button onClick={s.clearError}>Dismiss</button></div>}

      <div style={panel}>
        <h3>Feature Records</h3>
        {s.featureRecords.length === 0 ? <div style={{ color: '#9ca3af' }}>No feature records yet.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>
            <th>ID</th><th>Symbol</th><th>Timeframe</th><th>Timestamp</th><th>Counts</th><th>Created</th></tr></thead>
            <tbody>{s.featureRecords.map((r) => {
              const id = r?.id || r?._id;
              const counts = `a:${n(r?.alphaSignals?.length || r?.alphaCount)} p:${n(r?.patternSignals?.length || r?.patternCount)} s:${n(r?.strategyCandidates?.length || r?.strategyCount)} q:${n(r?.quantFeatures?.length || r?.quantCount)} qual:${n(r?.qualityScores?.length || r?.qualityCount)} rev:${n(r?.reversalPoints?.length || r?.reversalCount)}`;
              return <tr key={id} onClick={() => s.selectFeatureRecord(id)} style={{ cursor: 'pointer' }}><td>{id}</td><td>{r?.symbol || '—'}</td><td>{r?.timeframe || '—'}</td><td>{fmt(r?.timestamp || r?.candleTimestamp)}</td><td>{counts}</td><td>{fmt(r?.createdAt)}</td></tr>;
            })}</tbody></table>
        )}
      </div>

      <div style={panel}>
        <h3>Selected Feature Record</h3>
        {!s.selectedFeatureRecord ? <div style={{ color: '#9ca3af' }}>No feature record selected.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8 }}>
            <div><b>ID:</b> {s.selectedFeatureRecord?.id || s.selectedFeatureRecord?._id}</div>
            <div><b>Symbol:</b> {s.selectedFeatureRecord?.symbol || '—'}</div>
            <div><b>Timeframe:</b> {s.selectedFeatureRecord?.timeframe || '—'}</div>
            <div><b>Timestamp:</b> {fmt(s.selectedFeatureRecord?.timestamp || s.selectedFeatureRecord?.candleTimestamp)}</div>
            <div><b>Created:</b> {fmt(s.selectedFeatureRecord?.createdAt)}</div>
          </div>
        )}
      </div>

      <div style={panel}>
        <h3>Outcome Labels</h3>
        {s.outcomeLabels.length === 0 ? <div style={{ color: '#9ca3af' }}>No outcome labels yet.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>
            <th>Feature Record</th><th>Horizon</th><th>Future Return</th><th>MFE</th><th>MAE</th><th>Outcome</th><th>Label</th><th>Warnings</th></tr></thead>
            <tbody>{s.outcomeLabels.map((l, i) => <tr key={`${l?.featureRecordId || 'label'}-${i}`}>
              <td>{l?.featureRecordId || '—'}</td><td>{l?.horizon ?? '—'}</td><td>{l?.futureReturn ?? 'unknown'}</td><td>{l?.maxFavorableExcursion ?? 'unknown'}</td><td>{l?.maxAdverseExcursion ?? 'unknown'}</td><td>{l?.outcome || 'unknown'}</td><td>{l?.label || 'unknown'}</td><td>{warn(l?.warnings)}</td>
            </tr>)}</tbody></table>
        )}
      </div>

      <div style={panel}>
        <h3>Dataset Actions</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={s.saveFeatureRecord} disabled={s.loading}>Save current feature record</button>
          <button onClick={s.labelSelectedRecord} disabled={s.loading}>Label selected record</button>
          <button onClick={s.labelSymbolHistory} disabled={s.loading}>Label symbol history</button>
          <button onClick={s.clearFeatureRecords} disabled={s.loading}>Clear features</button>
          <button onClick={s.clearOutcomeLabels} disabled={s.loading}>Clear labels</button>
        </div>
        <div style={{ color: '#9ca3af', marginTop: 8 }}>Last updated: {fmt(s.lastUpdated)}</div>
      </div>
    </section>
  );
}
