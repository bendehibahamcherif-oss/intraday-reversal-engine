import { useEffect } from 'react';
import { useStrategyLabStore } from '../store/strategyLabStore.js';

const panel = { background: '#0a0a0a', border: '1px solid #202020', borderRadius: 12, padding: 12 };
const cardStyle = { background: '#050505', border: '1px solid #1f2937', borderRadius: 10, padding: 10 };

const asArray = (value) => (Array.isArray(value) ? value : []);
const showValue = (value, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length ? value.join(', ') : fallback;
  return String(value);
};

const pickStatus = (strategy) => strategy?.status || strategy?.state || strategy?.lifecycle || '—';
const pickConfidence = (strategy) => {
  const raw = strategy?.confidence ?? strategy?.score ?? strategy?.metrics?.confidence;
  if (raw === null || raw === undefined || raw === '') return '—';
  return typeof raw === 'number' ? raw.toFixed(2) : String(raw);
};
const pickTimeframe = (strategy) => strategy?.timeframe || strategy?.interval || strategy?.horizon || '—';

const summarizeRun = (run, label) => {
  if (!run || typeof run !== 'object') return `No ${label}`;
  const summary = run.summary || run.resultSummary || run.results || run.metrics || null;
  if (typeof summary === 'string') return summary;
  if (summary && typeof summary === 'object') {
    const winRate = summary.winRate ?? summary.win_rate ?? summary.winrate;
    const pnl = summary.pnl ?? summary.netPnl ?? summary.net_profit;
    const trades = summary.trades ?? summary.tradeCount ?? summary.totalTrades;
    const parts = [
      winRate !== undefined ? `Win rate: ${showValue(winRate)}` : null,
      pnl !== undefined ? `PnL: ${showValue(pnl)}` : null,
      trades !== undefined ? `Trades: ${showValue(trades)}` : null,
    ].filter(Boolean);
    if (parts.length) return parts.join(' • ');
  }
  return showValue(summary || run.status || run.result || `No ${label}`);
};

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
  const compareItems = asArray(compareResult?.strategies || compareResult?.items || compareResult?.results);
  const compareSymbol = compareResult?.symbol || compareResult?.meta?.symbol || symbol || '—';
  const comparedCount = compareItems.length || Number(compareResult?.count) || 0;
  const bestConfidenceItem = compareItems.reduce((best, item) => {
    const confidence = Number(item?.confidence ?? item?.score ?? item?.metrics?.confidence);
    if (!Number.isFinite(confidence)) return best;
    if (!best || confidence > best.confidence) return { confidence, item };
    return best;
  }, null);
  const validatedCount = compareItems.filter((item) => {
    const status = String(pickStatus(item)).toLowerCase();
    return status.includes('validated') || Boolean(item?.latestValidation);
  }).length;
  const draftResearchCount = compareItems.filter((item) => {
    const status = String(pickStatus(item)).toLowerCase();
    return status.includes('draft') || status.includes('research');
  }).length;

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
        {!compareResult ? (
          <div style={{ color: '#9ca3af', marginTop: 8 }}>No comparison yet</div>
        ) : (
          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            <div style={{ ...cardStyle, display: 'grid', gap: 4 }}>
              <div><strong>Symbol:</strong> {showValue(compareSymbol)}</div>
              <div><strong>Compared:</strong> {comparedCount}</div>
              <div><strong>Best confidence:</strong> {bestConfidenceItem ? `${showValue(bestConfidenceItem.item?.name || bestConfidenceItem.item?.strategyName || 'Unnamed')} (${bestConfidenceItem.confidence.toFixed(2)})` : '—'}</div>
              <div><strong>Validated strategies:</strong> {validatedCount}</div>
              <div><strong>Draft/Research strategies:</strong> {draftResearchCount}</div>
            </div>

            {!compareItems.length ? (
              <div style={{ color: '#9ca3af' }}>No strategy comparison rows returned.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
                {compareItems.map((strategy, idx) => (
                  <div key={String(strategy?.id || strategy?._id || strategy?.strategyId || idx)} style={cardStyle}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{showValue(strategy?.name || strategy?.strategyName || `Strategy ${idx + 1}`)}</div>
                    <div><strong>Status:</strong> {showValue(pickStatus(strategy))}</div>
                    <div><strong>Direction:</strong> {showValue(strategy?.direction)}</div>
                    <div><strong>Confidence:</strong> {showValue(pickConfidence(strategy))}</div>
                    <div><strong>Timeframe:</strong> {showValue(pickTimeframe(strategy))}</div>
                    <div><strong>Backtest:</strong> {summarizeRun(strategy?.latestBacktest, 'backtest')}</div>
                    <div><strong>Validation:</strong> {summarizeRun(strategy?.latestValidation, 'validation')}</div>
                    <div><strong>Warnings:</strong> {showValue(strategy?.warnings, 'None')}</div>
                    <div><strong>Tags:</strong> {showValue(strategy?.tags, 'None')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
