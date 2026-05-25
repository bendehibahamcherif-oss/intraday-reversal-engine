import { useEffect, useState } from 'react';
import { useQuantLabStore } from '../store/quantLabStore.js';

const TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '1H'];

function Panel({ title, items, loading }) {
  return (
    <section style={{ background: '#0a0a0a', border: '1px solid #202020', borderRadius: 12, padding: 12 }}>
      <div style={{ marginBottom: 8, fontWeight: 800 }}>{title}</div>
      {loading ? (
        <div style={{ color: '#9ca3af' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ color: '#9ca3af' }}>No signals yet</div>
      ) : (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#d1d5db', fontSize: 12 }}>{JSON.stringify(items, null, 2)}</pre>
      )}
    </section>
  );
}

export default function QuantLabWorkspace() {
  const {
    symbol,
    timeframe,
    alphaSignals,
    patternSignals,
    strategyCandidates,
    quantFeatures,
    warnings,
    loading,
    error,
    lastUpdated,
    analyzedAt,
    setSymbol,
    setTimeframe,
    refreshAll,
    analyzeAll,
    clearError,
  } = useQuantLabStore();

  const [draftSymbol, setDraftSymbol] = useState(symbol);

  useEffect(() => {
    setDraftSymbol(symbol);
  }, [symbol]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section style={{ background: '#0a0a0a', border: '1px solid #202020', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={draftSymbol}
            onChange={(e) => setDraftSymbol(e.target.value.toUpperCase())}
            placeholder="Enter symbol"
            style={{ background: '#050505', color: 'white', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 10px' }}
          />
          <button onClick={() => setSymbol(draftSymbol)} style={{ background: '#111111', color: 'white', border: '1px solid #202020', borderRadius: 8, padding: '8px 12px' }}>Set Symbol</button>

          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            style={{ background: '#050505', color: 'white', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 10px' }}
          >
            {TIMEFRAME_OPTIONS.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>

          <button onClick={refreshAll} disabled={loading} style={{ background: '#2563eb', color: 'white', border: '1px solid #3b82f6', borderRadius: 8, padding: '8px 12px' }}>Refresh</button>
          <button onClick={analyzeAll} disabled={loading} style={{ background: '#7c3aed', color: 'white', border: '1px solid #8b5cf6', borderRadius: 8, padding: '8px 12px' }}>Analyze</button>
          {analyzedAt && <span style={{ color: '#9ca3af', fontSize: 12 }}>Analyzed at: {new Date(analyzedAt).toLocaleString()}</span>}
          {lastUpdated && <span style={{ color: '#9ca3af', fontSize: 12 }}>Last updated: {new Date(lastUpdated).toLocaleString()}</span>}
        </div>

        {Array.isArray(warnings) && warnings.length > 0 && (
          <div style={{ marginTop: 10, background: '#2a220f', border: '1px solid #92400e', borderRadius: 8, padding: 10, color: '#fde68a' }}>
            <strong>Pipeline warnings:</strong>
            <ul style={{ margin: '8px 0 0 20px' }}>
              {warnings.map((warning, index) => (
                <li key={`${index}-${String(warning)}`}>{String(warning)}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 10, background: '#2a0f10', border: '1px solid #7f1d1d', borderRadius: 8, padding: 10, color: '#fecaca' }}>
            {error}
            <button onClick={clearError} style={{ marginLeft: 10, background: 'transparent', color: '#fecaca', border: '1px solid #7f1d1d', borderRadius: 6 }}>Dismiss</button>
          </div>
        )}
      </section>

      <Panel title="Alpha Signals" items={alphaSignals} loading={loading} />
      <Panel title="Pattern Signals" items={patternSignals} loading={loading} />
      <Panel title="Strategy Candidates" items={strategyCandidates} loading={loading} />
      <Panel title="Quant Features" items={quantFeatures} loading={loading} />
    </div>
  );
}
