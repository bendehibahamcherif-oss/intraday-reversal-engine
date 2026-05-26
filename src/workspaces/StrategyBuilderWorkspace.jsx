import { useEffect } from 'react';
import { useRuleBuilderStore } from '../store/ruleBuilderStore.js';

const panel = { background: '#0a0a0a', border: '1px solid #202020', borderRadius: 12, padding: 12 };
const inputStyle = { background: '#050505', border: '1px solid #1f2937', color: 'white', borderRadius: 8, padding: '6px 8px' };

const valueOrDash = (value) => (value === undefined || value === null || value === '' ? '—' : String(value));
const toArray = (value) => (Array.isArray(value) ? value : []);

const pickFirstArray = (obj, keys) => keys.map((key) => obj?.[key]).find(Array.isArray) || [];

const renderInfoCard = (label, value) => (
  <div style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#050505' }}>
    <div style={{ color: '#9ca3af', fontSize: 12 }}>{label}</div>
    <div style={{ color: 'white', marginTop: 4, wordBreak: 'break-word' }}>{valueOrDash(value)}</div>
  </div>
);

export default function StrategyBuilderWorkspace() {
  const {
    symbol, ruleSets, selectedRuleSet, draftRuleSet, evaluationResult, convertedStrategy, loading, error, lastUpdated,
    setSymbol, loadRuleSets, createRuleSet, selectRuleSet, updateDraftField,
    addCondition, updateCondition, removeCondition,
    addAction, updateAction, removeAction,
    saveDraft, evaluateSelected, convertSelected,
    deleteSelected, clearRuleSets, clearError,
  } = useRuleBuilderStore();

  useEffect(() => { loadRuleSets(); }, [symbol, loadRuleSets]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...panel, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#9ca3af' }}>Symbol</span>
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inputStyle} />
        <button onClick={loadRuleSets} disabled={loading}>Refresh</button>
        <button onClick={createRuleSet} disabled={loading}>Create Rule Set</button>
        <button onClick={saveDraft} disabled={loading}>Save Draft</button>
        <button onClick={deleteSelected} disabled={loading || !selectedRuleSet}>Delete Selected</button>
        <button onClick={clearRuleSets} disabled={loading}>Clear All</button>
      </div>

      {error ? <div style={{ ...panel, background: '#2a0f10', borderColor: '#7f1d1d', color: '#fecaca' }}><div>{error}</div><button onClick={clearError}>Dismiss</button></div> : null}

      <div style={panel}>
        <h3 style={{ marginTop: 0 }}>Rule Set list</h3>
        {!ruleSets.length ? <div style={{ color: '#9ca3af' }}>No rule sets yet</div> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {ruleSets.map((item, idx) => {
              const id = String(item?.id || item?._id || item?.ruleSetId || `r-${idx}`);
              const active = String(selectedRuleSet?.id || selectedRuleSet?._id || selectedRuleSet?.ruleSetId || '') === id;
              return (
                <button key={id} onClick={() => selectRuleSet(id)} style={{ textAlign: 'left', borderRadius: 8, padding: 8, border: active ? '1px solid #3b82f6' : '1px solid #1f2937', background: active ? '#0f172a' : '#050505', color: 'white' }}>
                  {item?.name || `Rule set ${idx + 1}`} · {(item?.conditions || []).length} conditions · {(item?.actions || []).length} actions
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={panel}>
        <h3 style={{ marginTop: 0 }}>Rule Set editor</h3>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <input placeholder="name" value={draftRuleSet?.name || ''} onChange={(e) => updateDraftField('name', e.target.value)} style={inputStyle} />
          <input placeholder="description" value={draftRuleSet?.description || ''} onChange={(e) => updateDraftField('description', e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={panel}>
        <h3 style={{ marginTop: 0 }}>Conditions builder</h3>
        <button onClick={addCondition}>Add Condition</button>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {(draftRuleSet?.conditions || []).map((condition, idx) => (
            <div key={`c-${idx}`} style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 8, display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                {['source', 'field', 'operator', 'value', 'timeframe'].map((field) => (
                  <input key={field} placeholder={field} value={condition?.[field] ?? ''} onChange={(e) => updateCondition(idx, { [field]: e.target.value })} style={inputStyle} />
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={Boolean(condition?.enabled)} onChange={(e) => updateCondition(idx, { enabled: e.target.checked })} /> enabled
                </label>
              </div>
              <button onClick={() => removeCondition(idx)} style={{ width: 'fit-content' }}>Remove Condition</button>
            </div>
          ))}
        </div>
      </div>

      <div style={panel}>
        <h3 style={{ marginTop: 0 }}>Actions builder</h3>
        <button onClick={addAction}>Add Action</button>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {(draftRuleSet?.actions || []).map((action, idx) => (
            <div key={`a-${idx}`} style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 8, display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
                {['type', 'direction', 'entryLogic', 'exitLogic', 'stopLossLogic', 'takeProfitLogic', 'invalidationCondition', 'riskRules'].map((field) => (
                  <input key={field} placeholder={field} value={action?.[field] ?? ''} onChange={(e) => updateAction(idx, { [field]: e.target.value })} style={inputStyle} />
                ))}
              </div>
              <button onClick={() => removeAction(idx)} style={{ width: 'fit-content' }}>Remove Action</button>
            </div>
          ))}
        </div>
      </div>

      <div style={panel}>
        <h3 style={{ marginTop: 0 }}>Risk rules editor</h3>
        <textarea placeholder="riskRules" value={draftRuleSet?.riskRules || ''} onChange={(e) => updateDraftField('riskRules', e.target.value)} style={{ ...inputStyle, minHeight: 80, width: '100%' }} />
      </div>

      <div style={{ ...panel, display: 'grid', gap: 8 }}>
        <h3 style={{ marginTop: 0 }}>Evaluate panel</h3>
        <button onClick={evaluateSelected} disabled={loading || !selectedRuleSet}>Evaluate selected</button>
        {evaluationResult ? (
          <>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
              {renderInfoCard('Passed', evaluationResult?.passed ? 'Yes' : 'No')}
              {renderInfoCard('Matched conditions count', evaluationResult?.matchedConditionsCount ?? evaluationResult?.matchedCount ?? toArray(evaluationResult?.matchedConditions).length)}
              {renderInfoCard('Failed conditions count', evaluationResult?.failedConditionsCount ?? evaluationResult?.failedCount ?? pickFirstArray(evaluationResult, ['failedConditions', 'failures']).length)}
            </div>

            <div style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#050505' }}>
              <div style={{ color: '#9ca3af', fontSize: 12 }}>Warnings</div>
              {toArray(evaluationResult?.warnings).length ? (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {toArray(evaluationResult?.warnings).map((warning, idx) => <li key={`warning-${idx}`}>{valueOrDash(warning)}</li>)}
                </ul>
              ) : <div style={{ marginTop: 4 }}>None</div>}
            </div>

            <div style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#050505' }}>
              <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>Failed conditions</div>
              {!pickFirstArray(evaluationResult, ['failedConditions', 'failures']).length ? <div>None</div> : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {pickFirstArray(evaluationResult, ['failedConditions', 'failures']).map((item, idx) => (
                    <div key={`failed-condition-${idx}`} style={{ border: '1px solid #374151', borderRadius: 8, padding: 8, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
                      {renderInfoCard('Source', item?.source)}
                      {renderInfoCard('Field', item?.field)}
                      {renderInfoCard('Operator', item?.operator)}
                      {renderInfoCard('Expected value', item?.expectedValue ?? item?.value)}
                      {renderInfoCard('Actual value', item?.actualValue)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : <div style={{ color: '#9ca3af' }}>No evaluation result yet</div>}
      </div>

      <div style={{ ...panel, display: 'grid', gap: 8 }}>
        <h3 style={{ marginTop: 0 }}>Convert to Strategy panel</h3>
        <button onClick={convertSelected} disabled={loading || !selectedRuleSet}>Convert selected</button>
        <div style={{ color: '#9ca3af', fontSize: 12 }}>Convert creates a draft strategy from this rule set. It does not validate or prove profitability.</div>
        {convertedStrategy ? (
          <div style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#050505', display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
              {renderInfoCard('Name', convertedStrategy?.name)}
              {renderInfoCard('Type', convertedStrategy?.type)}
              {renderInfoCard('Status', convertedStrategy?.status)}
              {renderInfoCard('Direction', convertedStrategy?.direction)}
              {renderInfoCard('Timeframe', convertedStrategy?.timeframe)}
            </div>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
              {renderInfoCard('Entry logic', convertedStrategy?.entryLogic)}
              {renderInfoCard('Exit logic', convertedStrategy?.exitLogic)}
              {renderInfoCard('Stop loss logic', convertedStrategy?.stopLossLogic)}
              {renderInfoCard('Take profit logic', convertedStrategy?.takeProfitLogic)}
              {renderInfoCard('Invalidation condition', convertedStrategy?.invalidationCondition)}
            </div>
            <div style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#030712' }}>
              <div style={{ color: '#9ca3af', fontSize: 12 }}>Warnings</div>
              {toArray(convertedStrategy?.warnings).length ? (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {toArray(convertedStrategy?.warnings).map((warning, idx) => <li key={`converted-warning-${idx}`}>{valueOrDash(warning)}</li>)}
                </ul>
              ) : <div style={{ marginTop: 4 }}>None</div>}
            </div>
          </div>
        ) : <div style={{ color: '#9ca3af' }}>No converted strategy yet</div>}
      </div>

      <div style={{ color: '#6b7280', fontSize: 12 }}>Last updated: {lastUpdated || '—'}</div>
    </div>
  );
}
