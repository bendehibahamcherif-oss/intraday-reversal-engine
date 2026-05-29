import { useRuleBuilderStore, DIRECTIONS, ACTION_TYPES } from '../store/ruleBuilderStore.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const RED     = '#ef4444';

const iStyle = { background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, width: '100%', boxSizing: 'border-box' };
const errStyle = { color: RED, fontSize: 10, marginTop: 2, display: 'block' };
const dragHandle = { cursor: 'grab', color: MUTED, fontSize: 14, padding: '0 4px', userSelect: 'none', flexShrink: 0 };

function TextAreaField({ label, value, onChange, error, placeholder }) {
  return (
    <div>
      <span style={{ fontSize: 10, color: MUTED, marginBottom: 2, display: 'block' }}>{label}</span>
      <textarea
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder || label}
        rows={2}
        style={{ ...iStyle, resize: 'vertical', borderColor: error ? RED : BORDER }}
      />
      {error ? <span style={errStyle}>{error}</span> : null}
    </div>
  );
}

function SelectField({ label, value, onChange, options, error }) {
  return (
    <div>
      <span style={{ fontSize: 10, color: MUTED, marginBottom: 2, display: 'block' }}>{label}</span>
      <select style={{ ...iStyle, borderColor: error ? RED : BORDER }} value={value ?? ''} onChange={onChange}>
        <option value="">— select —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {error ? <span style={errStyle}>{error}</span> : null}
    </div>
  );
}

function ActionRow({ action, index }) {
  const { updateAction, removeAction, moveAction, draftValidationErrors } = useRuleBuilderStore();
  const pfx = `actions.${index}`;

  const handleDragStart = (e) => { e.dataTransfer.setData('text/plain', String(index)); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); moveAction(from, index); };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', background: SURFACE }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={dragHandle} title="Drag to reorder">⠿</span>
        <span style={{ color: MUTED, fontSize: 11 }}>Action {index + 1}</span>
        <button
          onClick={() => removeAction(index)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 14, padding: 0 }}
          title="Remove action"
        >✕</button>
      </div>

      {/* Type + Direction */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <SelectField
          label="Type"
          value={action.type}
          onChange={(e) => updateAction(index, { type: e.target.value })}
          options={ACTION_TYPES}
          error={draftValidationErrors[`${pfx}.type`]}
        />
        <SelectField
          label="Direction *"
          value={action.direction}
          onChange={(e) => updateAction(index, { direction: e.target.value })}
          options={DIRECTIONS}
          error={draftValidationErrors[`${pfx}.direction`]}
        />
      </div>

      {/* Logic fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <TextAreaField
          label="Entry Logic *"
          value={action.entryLogic}
          onChange={(e) => updateAction(index, { entryLogic: e.target.value })}
          placeholder="Describe the entry trigger…"
          error={draftValidationErrors[`${pfx}.entryLogic`]}
        />
        <TextAreaField
          label="Exit Logic"
          value={action.exitLogic}
          onChange={(e) => updateAction(index, { exitLogic: e.target.value })}
          placeholder="Describe the exit trigger…"
        />
        <TextAreaField
          label="Stop Loss Logic"
          value={action.stopLossLogic}
          onChange={(e) => updateAction(index, { stopLossLogic: e.target.value })}
          placeholder="e.g. Stop below session low"
        />
        <TextAreaField
          label="Take Profit Logic"
          value={action.takeProfitLogic}
          onChange={(e) => updateAction(index, { takeProfitLogic: e.target.value })}
          placeholder="e.g. 2R target or VWAP"
        />
        <TextAreaField
          label="Invalidation Condition"
          value={action.invalidationCondition}
          onChange={(e) => updateAction(index, { invalidationCondition: e.target.value })}
          placeholder="e.g. If price closes above resistance"
        />
        <TextAreaField
          label="Risk Rules"
          value={typeof action.riskRules === 'object' ? JSON.stringify(action.riskRules) : (action.riskRules || '')}
          onChange={(e) => updateAction(index, { riskRules: e.target.value })}
          placeholder='e.g. {"maxRiskPct": 1}'
        />
      </div>
    </div>
  );
}

export default function RuleActionEditor() {
  const { draftRuleSet, addAction } = useRuleBuilderStore();
  const actions = draftRuleSet?.actions || [];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {actions.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 12 }}>No actions yet. Add one below.</div>
      ) : (
        actions.map((action, index) => (
          <ActionRow key={`action-${index}`} action={action} index={index} />
        ))
      )}

      <button
        onClick={addAction}
        style={{ background: 'transparent', border: `1px dashed ${BORDER}`, borderRadius: 8, color: MUTED, fontSize: 12, cursor: 'pointer', padding: '6px 16px', alignSelf: 'flex-start' }}
      >
        + Add Action
      </button>
    </div>
  );
}
