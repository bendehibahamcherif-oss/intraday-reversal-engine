import { useEffect } from 'react';
import { useRuleBuilderStore } from '../store/ruleBuilderStore.js';
import ConditionGroupBuilder from '../components/ConditionGroupBuilder.jsx';
import RuleActionEditor from '../components/RuleActionEditor.jsx';
import StrategyPreviewChart from '../components/StrategyPreviewChart.jsx';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = '#0a0a0a';
const SURFACE = '#0d0d1a';
const BORDER  = '#202020';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const AMBER   = '#FFB800';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const BLUE    = '#2563eb';

const panel = { background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 };
const iStyle = { background: '#050505', border: `1px solid #1f2937`, color: TEXT, borderRadius: 8, padding: '6px 8px', fontSize: 12 };
const btn = (bg = BLUE) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 });
const ghostBtn = { background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 12, cursor: 'pointer', padding: '6px 12px' };

const valueOrDash = (v) => (v === undefined || v === null || v === '' ? '—' : String(v));
const toArray = (v) => (Array.isArray(v) ? v : []);
const pickFirstArray = (obj, keys) => keys.map((k) => obj?.[k]).find(Array.isArray) || [];
const itemId = (item) => String(item?.id || item?._id || item?.ruleSetId || item?.templateId || '');

function InfoCard({ label, value }) {
  return (
    <div style={{ border: `1px solid #1f2937`, borderRadius: 8, padding: '8px 10px', background: '#050505' }}>
      <div style={{ color: MUTED, fontSize: 11 }}>{label}</div>
      <div style={{ color: TEXT, marginTop: 3, wordBreak: 'break-word', fontSize: 13 }}>{valueOrDash(value)}</div>
    </div>
  );
}

function SectionHeader({ title, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <h3 style={{ margin: 0, color: TEXT, fontSize: 14 }}>{title}</h3>
      {children}
    </div>
  );
}

// ── Templates panel ───────────────────────────────────────────────────────────
function TemplatesPanel() {
  const { templates, selectedTemplate, templateLoading, templateError, selectTemplate, createFromTemplate, clearTemplateError } = useRuleBuilderStore();

  return (
    <div style={panel}>
      <SectionHeader title="Strategy Templates">
        {templateLoading && <span style={{ fontSize: 11, color: MUTED }}>Loading…</span>}
      </SectionHeader>

      <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 10, padding: '6px 8px', background: '#1a0000', borderRadius: 6 }}>
        Templates create draft/research rule sets only. They are not validated and do not imply profitability.
      </div>

      {templateError && (
        <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{templateError} <button onClick={clearTemplateError} style={{ ...ghostBtn, fontSize: 11 }}>Dismiss</button></div>
      )}

      {!templates.length ? (
        <div style={{ color: MUTED, fontSize: 12 }}>No templates available.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {templates.map((item, idx) => {
            const id = String(item?.id || item?._id || item?.templateId || `t-${idx}`);
            const active = itemId(selectedTemplate) === id;
            return (
              <button
                key={id}
                onClick={() => selectTemplate(id)}
                style={{ textAlign: 'left', borderRadius: 8, padding: 10, border: active ? `1px solid ${BLUE}` : `1px solid #1f2937`, background: active ? '#0f172a' : '#050505', color: TEXT, cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{item?.name || `Template ${idx + 1}`}</div>
                <div style={{ color: MUTED, fontSize: 11, marginTop: 3 }}>{valueOrDash(item?.category)} · {valueOrDash(item?.defaultTimeframe)}</div>
                <div style={{ color: '#d1d5db', fontSize: 12, marginTop: 4 }}>{valueOrDash(item?.description)}</div>
                {toArray(item?.warnings).length > 0 && (
                  <div style={{ color: AMBER, fontSize: 11, marginTop: 4 }}>
                    ⚠ {toArray(item.warnings).join(' · ')}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <button onClick={() => createFromTemplate(itemId(selectedTemplate))} disabled={templateLoading || !selectedTemplate} style={btn()}>
          Create Rule Set from Template
        </button>
      </div>
    </div>
  );
}

// ── Rule sets list ────────────────────────────────────────────────────────────
function RuleSetList() {
  const { ruleSets, selectedRuleSet, selectRuleSet, loading } = useRuleBuilderStore();

  if (!ruleSets.length) {
    return <div style={{ color: MUTED, fontSize: 12 }}>No rule sets yet. Create one or use a template.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {ruleSets.map((item, idx) => {
        const id = itemId(item) || `r-${idx}`;
        const active = itemId(selectedRuleSet) === id;
        const conditions = toArray(item?.conditions);
        const actions = toArray(item?.actions);
        return (
          <button
            key={id}
            onClick={() => selectRuleSet(id)}
            disabled={loading}
            style={{ textAlign: 'left', borderRadius: 8, padding: '8px 10px', border: active ? `1px solid ${BLUE}` : `1px solid #1f2937`, background: active ? '#0f172a' : '#050505', color: TEXT, cursor: 'pointer' }}
          >
            <span style={{ fontWeight: active ? 700 : 400, fontSize: 13 }}>{item?.name || `Rule set ${idx + 1}`}</span>
            <span style={{ color: MUTED, fontSize: 11, marginLeft: 8 }}>
              {conditions.length}c · {actions.length}a · {item?.timeframe || '?'} · {item?.status || 'draft'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Evaluate results ──────────────────────────────────────────────────────────
function EvaluatePanel() {
  const { evaluationResult, evaluateSelected, loading, selectedRuleSet } = useRuleBuilderStore();

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <button onClick={evaluateSelected} disabled={loading || !selectedRuleSet} style={btn()}>
        Evaluate Selected Rule Set
      </button>

      {evaluationResult ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <InfoCard label="Passed" value={evaluationResult?.passed ? '✓ Yes' : '✗ No'} />
            <InfoCard label="Matched" value={evaluationResult?.matchedConditions?.length ?? evaluationResult?.matchedConditionsCount ?? '—'} />
            <InfoCard label="Failed" value={pickFirstArray(evaluationResult, ['failedConditions', 'failures']).length} />
          </div>

          {toArray(evaluationResult?.warnings).length > 0 && (
            <div style={{ background: '#0a0800', border: `1px solid ${AMBER}44`, borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ color: AMBER, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Evaluation warnings:</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {toArray(evaluationResult.warnings).map((w, i) => (
                  <li key={i} style={{ color: MUTED, fontSize: 11 }}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {pickFirstArray(evaluationResult, ['failedConditions', 'failures']).length > 0 && (
            <div>
              <div style={{ color: MUTED, fontSize: 11, marginBottom: 6 }}>Failed conditions:</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {pickFirstArray(evaluationResult, ['failedConditions', 'failures']).map((item, i) => (
                  <div key={i} style={{ border: `1px solid #374151`, borderRadius: 8, padding: '6px 10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
                    <InfoCard label="Source" value={item?.source} />
                    <InfoCard label="Field" value={item?.field} />
                    <InfoCard label="Operator" value={item?.operator} />
                    <InfoCard label="Expected" value={item?.expectedValue ?? item?.value} />
                    <InfoCard label="Actual" value={item?.actualValue} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ color: MUTED, fontSize: 12 }}>No evaluation result yet.</div>
      )}
    </div>
  );
}

// ── Convert result ────────────────────────────────────────────────────────────
function ConvertPanel() {
  const { convertedStrategy, convertSelected, loading, selectedRuleSet } = useRuleBuilderStore();

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ color: MUTED, fontSize: 11 }}>
        Convert creates a draft SavedStrategy from this rule set. It does not validate or prove profitability.
      </div>
      <button onClick={convertSelected} disabled={loading || !selectedRuleSet} style={btn()}>
        Convert to Strategy
      </button>

      {convertedStrategy ? (
        <div style={{ border: `1px solid #1f2937`, borderRadius: 8, padding: 10, background: '#050505', display: 'grid', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <InfoCard label="Name" value={convertedStrategy?.name} />
            <InfoCard label="Type" value={convertedStrategy?.type} />
            <InfoCard label="Status" value={convertedStrategy?.status} />
            <InfoCard label="Direction" value={convertedStrategy?.direction} />
            <InfoCard label="Timeframe" value={convertedStrategy?.timeframe} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            <InfoCard label="Entry Logic" value={convertedStrategy?.entryLogic} />
            <InfoCard label="Exit Logic" value={convertedStrategy?.exitLogic} />
            <InfoCard label="Stop Loss Logic" value={convertedStrategy?.stopLossLogic} />
            <InfoCard label="Take Profit Logic" value={convertedStrategy?.takeProfitLogic} />
            <InfoCard label="Invalidation" value={convertedStrategy?.invalidationCondition} />
          </div>
          {toArray(convertedStrategy?.warnings).length > 0 && (
            <div style={{ color: AMBER, fontSize: 11 }}>
              ⚠ {toArray(convertedStrategy.warnings).join(' · ')}
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: MUTED, fontSize: 12 }}>No converted strategy yet.</div>
      )}
    </div>
  );
}

// ── Validation summary bar ────────────────────────────────────────────────────
function ValidationBar() {
  const { draftValidationErrors } = useRuleBuilderStore();
  const errCount = Object.keys(draftValidationErrors).length;

  if (errCount === 0) {
    return <div style={{ background: '#001a08', border: `1px solid ${GREEN}44`, borderRadius: 6, padding: '6px 10px', fontSize: 11, color: GREEN }}>✓ Draft has no validation errors</div>;
  }
  return (
    <div style={{ background: '#1a0000', border: `1px solid ${RED}44`, borderRadius: 6, padding: '6px 10px', fontSize: 11, color: RED }}>
      ✗ {errCount} validation error{errCount !== 1 ? 's' : ''} — fix before saving:{' '}
      {Object.values(draftValidationErrors).slice(0, 3).join(' · ')}
      {errCount > 3 ? `  +${errCount - 3} more` : ''}
    </div>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────────
export default function StrategyBuilderWorkspace() {
  const {
    symbol, draftRuleSet, selectedRuleSet, loading, error, lastUpdated,
    setSymbol, loadRuleSets, loadTemplates, createRuleSet, saveDraft,
    deleteSelected, clearRuleSets, clearError, updateDraftField,
  } = useRuleBuilderStore();

  useEffect(() => { loadRuleSets(); loadTemplates(); }, [symbol]);

  const TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', '1D'];

  return (
    <div style={{ display: 'grid', gap: 14 }}>

      {/* ── Top toolbar ── */}
      <div style={{ ...panel, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: MUTED, fontSize: 12 }}>Symbol</span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            style={{ ...iStyle, width: 80 }}
            placeholder="SPY"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: MUTED, fontSize: 12 }}>Timeframe</span>
          <select
            value={draftRuleSet?.timeframe || '5m'}
            onChange={(e) => updateDraftField('timeframe', e.target.value)}
            style={{ ...iStyle, width: 70 }}
          >
            {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <button onClick={loadRuleSets} disabled={loading} style={ghostBtn}>↻ Refresh</button>
          <button onClick={createRuleSet} disabled={loading} style={btn()}>+ New Rule Set</button>
          <button onClick={saveDraft} disabled={loading} style={btn(GREEN + 'cc')}>Save Draft</button>
          <button onClick={deleteSelected} disabled={loading || !selectedRuleSet} style={btn(RED + 'aa')}>Delete</button>
          <button onClick={clearRuleSets} disabled={loading} style={{ ...ghostBtn, color: RED }}>Clear All</button>
        </div>
      </div>

      {error && (
        <div style={{ ...panel, background: '#1a0000', borderColor: '#7f1d1d', color: '#fecaca', fontSize: 12 }}>
          {error} <button onClick={clearError} style={{ ...ghostBtn, marginLeft: 8 }}>Dismiss</button>
        </div>
      )}

      {/* ── Validation bar ── */}
      <ValidationBar />

      {/* ── Templates + Rule sets list (side by side on wide screens) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(200px, 1fr)', gap: 14, alignItems: 'start' }}>
        <TemplatesPanel />

        <div style={panel}>
          <SectionHeader title="Saved Rule Sets" />
          <RuleSetList />
        </div>
      </div>

      {/* ── Draft editor ── */}
      <div style={panel}>
        <SectionHeader title="Rule Set Properties" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <span style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 2 }}>Name *</span>
            <input
              value={draftRuleSet?.name || ''}
              onChange={(e) => updateDraftField('name', e.target.value)}
              placeholder="Name (required)"
              style={{ ...iStyle, width: '100%', boxSizing: 'border-box', borderColor: !draftRuleSet?.name?.trim() ? RED + '88' : '#1f2937' }}
            />
          </div>
          <div>
            <span style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 2 }}>Description</span>
            <input
              value={draftRuleSet?.description || ''}
              onChange={(e) => updateDraftField('description', e.target.value)}
              placeholder="Optional description"
              style={{ ...iStyle, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </div>

      {/* ── Conditions (via ConditionGroupBuilder) ── */}
      <div style={panel}>
        <SectionHeader title="Conditions">
          <span style={{ color: MUTED, fontSize: 11 }}>Drag ⠿ to reorder · AND/OR groups control evaluation order</span>
        </SectionHeader>
        <ConditionGroupBuilder />
      </div>

      {/* ── Actions (via RuleActionEditor) ── */}
      <div style={panel}>
        <SectionHeader title="Actions">
          <span style={{ color: MUTED, fontSize: 11 }}>Drag ⠿ to reorder</span>
        </SectionHeader>
        <RuleActionEditor />
      </div>

      {/* ── Risk rules ── */}
      <div style={panel}>
        <SectionHeader title="Risk Rules" />
        <textarea
          placeholder='JSON or text, e.g. {"maxRiskPerTrade":"1%","noOvernightHold":true}'
          value={draftRuleSet?.riskRules || ''}
          onChange={(e) => updateDraftField('riskRules', e.target.value)}
          rows={3}
          style={{ ...iStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
        />
      </div>

      {/* ── Evaluate ── */}
      <div style={panel}>
        <SectionHeader title="Evaluate" />
        <EvaluatePanel />
      </div>

      {/* ── Convert ── */}
      <div style={panel}>
        <SectionHeader title="Convert to Strategy" />
        <ConvertPanel />
      </div>

      {/* ── Preview Backtest ── */}
      <div style={panel}>
        <SectionHeader title="Preview Backtest">
          <span style={{ background: AMBER + '22', color: AMBER, fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>RESEARCH ONLY</span>
        </SectionHeader>
        <StrategyPreviewChart />
      </div>

      <div style={{ color: MUTED, fontSize: 11 }}>Last updated: {lastUpdated || '—'}</div>
    </div>
  );
}
