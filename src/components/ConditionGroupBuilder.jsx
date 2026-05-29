import { useRef } from 'react';
import { useRuleBuilderStore, ALLOWED_SOURCES, ALLOWED_OPERATORS, VALUE_OPERATORS } from '../store/ruleBuilderStore.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const AMBER   = '#FFB800';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const BLUE    = '#3b82f6';

const iStyle = { background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, width: '100%', boxSizing: 'border-box' };
const errStyle = { color: RED, fontSize: 10, marginTop: 2, display: 'block' };
const dragHandle = { cursor: 'grab', color: MUTED, fontSize: 14, padding: '0 4px', userSelect: 'none', flexShrink: 0 };

function FieldInput({ label, value, onChange, error, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, ...style }}>
      <span style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>{label}</span>
      {children || <input style={{ ...iStyle, borderColor: error ? RED : BORDER }} value={value ?? ''} onChange={onChange} />}
      {error ? <span style={errStyle}>{error}</span> : null}
    </div>
  );
}

function ConditionRow({ condition, index, groupId, errors }) {
  const { updateCondition, removeCondition, moveCondition, setConditionGroup, draftRuleSet } = useRuleBuilderStore();
  const dragRef = useRef(null);

  const needsValue = VALUE_OPERATORS.has(condition.operator);
  const pfx = `conditions.${index}`;

  const handleDragStart = (e) => { e.dataTransfer.setData('text/plain', String(index)); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); moveCondition(from, index); };

  const otherGroups = (draftRuleSet?.conditionGroups || []).filter((g) => g.id !== groupId);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', background: SURFACE, display: 'flex', gap: 8, alignItems: 'flex-start' }}
    >
      <span style={dragHandle} title="Drag to reorder">⠿</span>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
        {/* Source */}
        <FieldInput label="Source" error={errors[`${pfx}.source`]}>
          <select
            style={{ ...iStyle, borderColor: errors[`${pfx}.source`] ? RED : BORDER }}
            value={condition.source ?? ''}
            onChange={(e) => updateCondition(index, { source: e.target.value })}
          >
            <option value="">— select —</option>
            {ALLOWED_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FieldInput>

        {/* Field */}
        <FieldInput label="Field" value={condition.field} onChange={(e) => updateCondition(index, { field: e.target.value })} error={errors[`${pfx}.field`]} />

        {/* Operator */}
        <FieldInput label="Operator" error={errors[`${pfx}.operator`]}>
          <select
            style={{ ...iStyle, borderColor: errors[`${pfx}.operator`] ? RED : BORDER }}
            value={condition.operator ?? 'exists'}
            onChange={(e) => updateCondition(index, { operator: e.target.value })}
          >
            {ALLOWED_OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
        </FieldInput>

        {/* Value — only when operator needs it */}
        {needsValue ? (
          <FieldInput label="Value" value={condition.value} onChange={(e) => updateCondition(index, { value: e.target.value })} error={errors[`${pfx}.value`]} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10, color: MUTED }}>Value</span>
            <span style={{ fontSize: 11, color: MUTED, padding: '5px 0' }}>n/a</span>
          </div>
        )}

        {/* Timeframe */}
        <FieldInput label="Timeframe" value={condition.timeframe} onChange={(e) => updateCondition(index, { timeframe: e.target.value })} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, alignItems: 'flex-end' }}>
        {/* Enabled toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: condition.enabled ? GREEN : MUTED }}>
          <input type="checkbox" checked={Boolean(condition.enabled)} onChange={(e) => updateCondition(index, { enabled: e.target.checked })} style={{ accentColor: GREEN }} />
          on
        </label>

        {/* Move to group (only shown when multiple groups exist) */}
        {otherGroups.length > 0 && (
          <select
            title="Move to group"
            style={{ ...iStyle, width: 'auto', fontSize: 10, padding: '2px 4px' }}
            value={groupId}
            onChange={(e) => setConditionGroup(index, e.target.value)}
          >
            {(draftRuleSet?.conditionGroups || []).map((g) => (
              <option key={g.id} value={g.id}>{g.label || g.operator || g.id}</option>
            ))}
          </select>
        )}

        {/* Remove */}
        <button
          onClick={() => removeCondition(index)}
          style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
          title="Remove condition"
        >✕</button>
      </div>
    </div>
  );
}

function GroupHeader({ group }) {
  const { updateConditionGroup, removeConditionGroup, addCondition, draftRuleSet } = useRuleBuilderStore();
  const isDefault = group.id === 'default';
  const conditionsInGroup = (draftRuleSet?.conditions || []).filter((c) => c.groupId === group.id);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: 4 }}>
      {/* AND/OR toggle */}
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${BORDER}`, flexShrink: 0 }}>
        {['AND', 'OR'].map((op) => (
          <button
            key={op}
            onClick={() => updateConditionGroup(group.id, { operator: op })}
            style={{
              background: group.operator === op ? BLUE : 'transparent',
              color: group.operator === op ? '#fff' : MUTED,
              border: 'none',
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {op}
          </button>
        ))}
      </div>

      {/* Group label */}
      <input
        value={group.label || ''}
        onChange={(e) => updateConditionGroup(group.id, { label: e.target.value })}
        placeholder={isDefault ? 'Default group' : 'Group label…'}
        style={{ ...iStyle, width: 140 }}
      />

      {/* Condition count */}
      <span style={{ fontSize: 11, color: MUTED }}>{conditionsInGroup.length} condition{conditionsInGroup.length !== 1 ? 's' : ''}</span>

      {/* Add condition to this group */}
      <button
        onClick={() => addCondition(group.id)}
        style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 11, cursor: 'pointer', padding: '2px 8px', flexShrink: 0 }}
      >
        + Condition
      </button>

      {/* Remove group (not default) */}
      {!isDefault && (
        <button
          onClick={() => removeConditionGroup(group.id)}
          style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 13, padding: 0, flexShrink: 0 }}
          title="Remove group (conditions move to default)"
        >✕ group</button>
      )}
    </div>
  );
}

export default function ConditionGroupBuilder() {
  const {
    draftRuleSet,
    draftValidationErrors,
    addConditionGroup,
  } = useRuleBuilderStore();

  const groups = draftRuleSet?.conditionGroups || [{ id: 'default', operator: 'AND', label: '' }];
  const conditions = draftRuleSet?.conditions || [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {groups.map((group) => {
        const groupConditions = conditions
          .map((c, globalIndex) => ({ c, globalIndex }))
          .filter(({ c }) => c.groupId === group.id);

        return (
          <div key={group.id} style={{ border: `1px solid ${group.id === 'default' ? BORDER : BLUE + '44'}`, borderRadius: 10, padding: 10, background: group.id === 'default' ? 'transparent' : BLUE + '08' }}>
            <GroupHeader group={group} />
            {groupConditions.length === 0 ? (
              <div style={{ color: MUTED, fontSize: 11, padding: '4px 0' }}>No conditions in this group.</div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {groupConditions.map(({ c, globalIndex }) => (
                  <ConditionRow
                    key={`cond-${globalIndex}`}
                    condition={c}
                    index={globalIndex}
                    groupId={group.id}
                    errors={draftValidationErrors}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Conditions with missing/unknown groupId fall back here */}
      {(() => {
        const knownGroupIds = new Set(groups.map((g) => g.id));
        const orphans = conditions
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => !knownGroupIds.has(c.groupId));
        if (!orphans.length) return null;
        return (
          <div style={{ border: `1px dashed ${RED}`, borderRadius: 8, padding: 8 }}>
            <span style={{ fontSize: 11, color: RED }}>Orphaned conditions (group deleted) — move them to a group:</span>
            <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
              {orphans.map(({ c, i }) => <ConditionRow key={`orphan-${i}`} condition={c} index={i} groupId={c.groupId} errors={draftValidationErrors} />)}
            </div>
          </div>
        );
      })()}

      <button
        onClick={() => addConditionGroup()}
        style={{ background: 'transparent', border: `1px dashed ${BLUE}`, borderRadius: 8, color: BLUE, fontSize: 12, cursor: 'pointer', padding: '6px 16px', alignSelf: 'flex-start' }}
      >
        + Add Condition Group (AND/OR)
      </button>

      {/* Global conditions summary */}
      {conditions.length > 0 && (
        <div style={{ fontSize: 11, color: MUTED }}>
          {conditions.filter((c) => c.enabled !== false).length} active / {conditions.length} total conditions
        </div>
      )}
    </div>
  );
}
