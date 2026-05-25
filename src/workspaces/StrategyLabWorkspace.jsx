import { useEffect } from 'react';
import { useStrategyLabStore } from '../store/strategyLabStore.js';

const panel = { background: '#0a0a0a', border: '1px solid #202020', borderRadius: 12, padding: 12 };

export default function StrategyLabWorkspace() {
  const {
    symbol, savedStrategies, selectedStrategyId, compareSelection, compareResult, manualStrategy,
    loading, saving, comparing, error, debug,
    setSymbol, setManualField, clearError,
    loadSavedStrategies, selectStrategy, saveManualStrategy,
    deleteSelectedStrategy, clearSavedStrategies, toggleCompareStrategy, compareSelectedStrategies,
  } = useStrategyLabStore();

  useEffect(() => {
    loadSavedStrategies();
  }, [symbol, loadSavedStrategies]);

  const selectedStrategy = savedStrategies.find((s) => String(s?.id || s?._id || s?.strategyId || '') === selectedStrategyId) || null;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...panel, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#9ca3af' }}>Symbol</span>
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ background: '#050505', border: '1px solid #1f2937', color: 'white', borderRadius: 8, padding: '6px 8px' }} />
        <button onClick={loadSavedStrategies} disabled={loading} style={{ background: '#111827', color: 'white', border: '1px solid #374151', borderRadius: 8, padding: '6px 10px' }}>Refresh</button>
        <button onClick={clearSavedStrategies} disabled={saving} style={{ background: '#3b0a0a', color: 'white', border: '1px solid #7f1d1d', borderRadius: 8, padding: '6px 10px' }}>Clear All</button>
      </div>

      {error ? <div style={{ ...panel, background: '#2a0f10', borderColor: '#7f1d1d', color: '#fecaca' }}><div>{error}</div><button onClick={clearError}>Dismiss</button></div> : null}

      {import.meta.env.VITE_STRATEGY_LAB_DEBUG === 'true' ? (
        <div style={{ ...panel, background: '#0f172a', borderColor: '#334155', color: '#bfdbfe' }}>
          <div><strong>lastStrategyLabUrl:</strong> {debug?.lastStrategyLabUrl || '—'}</div>
          <div><strong>lastStrategyLabError:</strong> {debug?.lastStrategyLabError || '—'}</div>
          <div><strong>VITE_API_BASE:</strong> {import.meta.env.VITE_API_BASE || '—'}</div>
        </div>
      ) : null}

      <div style={{ ...panel }}>
        <h3 style={{ marginTop: 0 }}>Saved Strategies</h3>
        {!savedStrategies.length ? <div style={{ color: '#9ca3af' }}>No saved strategies yet</div> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {savedStrategies.map((item, idx) => {
              const id = String(item?.id || item?._id || item?.strategyId || `s-${idx}`);
              const active = selectedStrategyId === id;
              const checked = compareSelection.includes(id);
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: active ? '1px solid #3b82f6' : '1px solid #1f2937', borderRadius: 8, padding: 8 }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleCompareStrategy(id)} />
                  <button onClick={() => selectStrategy(id)} style={{ flex: 1, textAlign: 'left', background: 'transparent', color: 'white', border: 'none' }}>
                    {item?.name || `Strategy ${idx + 1}`} · {item?.type || 'Unknown'} · {item?.direction || 'N/A'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={panel}>
        <h3 style={{ marginTop: 0 }}>Selected Strategy Details</h3>
        {!selectedStrategy ? <div style={{ color: '#9ca3af' }}>Select a saved strategy to view details.</div> : (
          <div style={{ display: 'grid', gap: 4 }}>
            <div><strong>Name:</strong> {selectedStrategy?.name || '—'}</div>
            <div><strong>Type:</strong> {selectedStrategy?.type || '—'}</div>
            <div><strong>Direction:</strong> {selectedStrategy?.direction || '—'}</div>
            <div><strong>Entry:</strong> {selectedStrategy?.entryLogic || selectedStrategy?.entry || '—'}</div>
            <div><strong>Exit:</strong> {selectedStrategy?.exitLogic || selectedStrategy?.exit || '—'}</div>
          </div>
        )}
        <button onClick={deleteSelectedStrategy} disabled={!selectedStrategyId || saving} style={{ marginTop: 10, background: '#3b0a0a', color: 'white', border: '1px solid #7f1d1d', borderRadius: 8, padding: '6px 10px' }}>Delete</button>
      </div>

      <div style={panel}>
        <h3 style={{ marginTop: 0 }}>Manual Strategy</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8 }}>
          {['name', 'type', 'direction', 'entryLogic', 'exitLogic'].map((field) => (
            <input key={field} placeholder={field} value={manualStrategy[field] || ''} onChange={(e) => setManualField(field, e.target.value)} style={{ background: '#050505', border: '1px solid #1f2937', color: 'white', borderRadius: 8, padding: '6px 8px' }} />
          ))}
        </div>
        <button onClick={saveManualStrategy} disabled={saving} style={{ marginTop: 10, background: '#065f46', color: 'white', border: '1px solid #10b981', borderRadius: 8, padding: '6px 10px' }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>

      <div style={panel}>
        <h3 style={{ marginTop: 0 }}>Strategy Comparison</h3>
        <button onClick={compareSelectedStrategies} disabled={comparing || compareSelection.length < 2} style={{ background: '#1e3a8a', color: 'white', border: '1px solid #60a5fa', borderRadius: 8, padding: '6px 10px' }}>{comparing ? 'Comparing…' : 'Compare'}</button>
        {!compareResult ? <div style={{ color: '#9ca3af', marginTop: 8 }}>Select 2+ strategies and run compare.</div> : <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{JSON.stringify(compareResult, null, 2)}</pre>}
      </div>
    </div>
  );
}
