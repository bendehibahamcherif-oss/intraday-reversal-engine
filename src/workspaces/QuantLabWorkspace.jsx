import { useEffect, useState } from 'react';
import { useQuantLabStore } from '../store/quantLabStore.js';

const TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '1H'];

const panelStyle = { background: '#0a0a0a', border: '1px solid #202020', borderRadius: 12, padding: 12 };

function getText(item, keys, fallback = '—') {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
  }
  return fallback;
}


function formatFeatureValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(4)).toString();
  }
  if (typeof value === 'string') {
    return value || '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null || value === undefined) {
    return '—';
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return 'See details';
  }
  return String(value);
}

function formatFeatureDetails(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    const json = JSON.stringify(value);
    return json.length > 180 ? `${json.slice(0, 177)}...` : json;
  }
  return null;
}


function formatRiskRuleValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map((item) => formatRiskRuleValue(item)).join(', ') : '—';
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, nested]) => nested !== undefined && nested !== null && nested !== '');
    if (!entries.length) return '—';
    return entries.map(([key, nested]) => `${key}: ${formatRiskRuleValue(nested)}`).join('; ');
  }
  return String(value);
}

function RiskRulesValue({ value }) {
  if (value === null || value === undefined || value === '') {
    return <span>—</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>—</span>;
    return (
      <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 2 }}>
        {value.map((rule, index) => (
          <li key={`risk-rule-${index}`} style={{ lineHeight: 1.35 }}>{formatRiskRuleValue(rule)}</li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object') {
    const fields = [
      ['Max risk/trade', value?.maxRiskPerTrade],
      ['Stop loss', value?.stopLossLogic],
      ['Take profit', value?.takeProfitLogic],
      ['Invalidation', value?.invalidationCondition],
    ].filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null && fieldValue !== '');

    if (fields.length === 0) return <span>—</span>;

    return (
      <div style={{ display: 'grid', gap: 2 }}>
        {fields.map(([label, fieldValue]) => (
          <div key={label} style={{ lineHeight: 1.35 }}>
            <span style={{ color: '#9ca3af' }}>{label}:</span> {formatRiskRuleValue(fieldValue)}
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

function directionColor(direction = '') {
  const normalized = String(direction).toLowerCase();
  if (normalized.includes('bull')) return '#86efac';
  if (normalized.includes('bear')) return '#fca5a5';
  return '#cbd5e1';
}

function CompactRow({ label, value, color }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 6, alignItems: 'start' }}>
      <span style={{ color: '#9ca3af', fontSize: 12 }}>{label}</span>
      <span style={{ color: color ?? '#e5e7eb', fontSize: 12, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function CardGrid({ children }) {
  return <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>{children}</div>;
}

function EmptyState({ text }) {
  return <div style={{ color: '#9ca3af' }}>{text}</div>;
}

function gradeStyle(grade = '') {
  const normalized = String(grade).toUpperCase();
  if (normalized.startsWith('A')) return { color: '#86efac', border: '#14532d', label: 'strong' };
  if (normalized.startsWith('B')) return { color: '#bfdbfe', border: '#1e3a8a', label: 'good' };
  if (normalized.startsWith('C')) return { color: '#fef08a', border: '#713f12', label: 'neutral' };
  if (normalized.startsWith('D')) return { color: '#fdba74', border: '#7c2d12', label: 'weak' };
  if (normalized.startsWith('F')) return { color: '#fca5a5', border: '#7f1d1d', label: 'poor' };
  return { color: '#e5e7eb', border: '#374151', label: 'unrated' };
}

function listToText(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ?? '—';
}

function AlphaSignalsPanel({ items, loading }) {
  if (loading) return <div style={{ color: '#9ca3af' }}>Loading…</div>;
  if (items.length === 0) return <EmptyState text="No signals yet" />;

  return (
    <CardGrid>
      {items.map((item, index) => {
        const direction = getText(item, ['direction', 'bias', 'signalDirection']);
        return (
          <article key={`alpha-${index}`} style={{ border: '1px solid #1f2937', borderRadius: 10, padding: 10, background: '#070707' }}>
            <CompactRow label="Type" value={getText(item, ['type', 'signalType'])} />
            <CompactRow label="Direction" value={direction} color={directionColor(direction)} />
            <CompactRow label="Confidence" value={getText(item, ['confidence'])} />
            <CompactRow label="Strength" value={getText(item, ['strength', 'score'])} />
            <CompactRow label="Timeframe" value={getText(item, ['timeframe', 'tf'])} />
            <CompactRow label="Reason" value={getText(item, ['reason', 'rationale', 'description'])} />
          </article>
        );
      })}
    </CardGrid>
  );
}

function PatternSignalsPanel({ items, loading }) {
  if (loading) return <div style={{ color: '#9ca3af' }}>Loading…</div>;
  if (items.length === 0) return <EmptyState text="No patterns yet" />;

  return (
    <CardGrid>
      {items.map((item, index) => {
        const direction = getText(item, ['direction', 'bias']);
        return (
          <article key={`pattern-${index}`} style={{ border: '1px solid #1f2937', borderRadius: 10, padding: 10, background: '#070707' }}>
            <CompactRow label="Pattern" value={getText(item, ['pattern', 'name'])} />
            <CompactRow label="Category" value={getText(item, ['category'])} />
            <CompactRow label="Direction" value={direction} color={directionColor(direction)} />
            <CompactRow label="Confidence" value={getText(item, ['confidence'])} />
            <CompactRow label="Timeframe" value={getText(item, ['timeframe', 'tf'])} />
            <CompactRow label="Reason" value={getText(item, ['reason', 'rationale', 'description'])} />
          </article>
        );
      })}
    </CardGrid>
  );
}

function StrategyCandidatesPanel({ items, loading, onRunBacktest, backtestLoading, onValidate, validationLoading }) {
  if (loading) return <div style={{ color: '#9ca3af' }}>Loading…</div>;
  if (items.length === 0) return <EmptyState text="No strategies yet" />;

  return (
    <CardGrid>
      {items.map((item, index) => {
        const direction = getText(item, ['direction', 'bias']);
        const warnings = item?.warnings;
        const warningText = Array.isArray(warnings) ? warnings.join(', ') : getText(item, ['warnings', 'warning'], '—');

        return (
          <article key={`strategy-${index}`} style={{ border: '1px solid #1f2937', borderRadius: 10, padding: 10, background: '#070707' }}>
            <CompactRow label="Name" value={getText(item, ['name'])} />
            <CompactRow label="Type" value={getText(item, ['type'])} />
            <CompactRow label="Direction" value={direction} color={directionColor(direction)} />
            <CompactRow label="Confidence" value={getText(item, ['confidence'])} />
            <CompactRow label="Entry logic" value={getText(item, ['entryLogic', 'entry'])} />
            <CompactRow label="Exit logic" value={getText(item, ['exitLogic', 'exit'])} />
            <CompactRow label="Risk rules" value={<RiskRulesValue value={item?.riskRules ?? item?.risk} />} />
            <CompactRow label="Warnings" value={warningText} />
            <button
              onClick={() => onRunBacktest?.(item?.id || item?._id || item?.strategyId || item?.name)}
              disabled={backtestLoading}
              style={{ marginTop: 8, background: '#065f46', color: 'white', border: '1px solid #10b981', borderRadius: 6, padding: '6px 10px' }}
            >
              {backtestLoading ? 'Running…' : 'Backtest'}
            </button>
            <button
              onClick={() => onValidate?.(item?.id || item?._id || item?.strategyId || item?.name)}
              disabled={validationLoading}
              style={{ marginTop: 8, marginLeft: 8, background: '#1e3a8a', color: 'white', border: '1px solid #60a5fa', borderRadius: 6, padding: '6px 10px' }}
            >
              {validationLoading ? 'Validating…' : 'Validate'}
            </button>
          </article>
        );
      })}
    </CardGrid>
  );
}
function validationStatusStyle(status = '') {
  const normalized = String(status).toLowerCase();
  if (normalized === 'validated') return { color: '#86efac', border: '#14532d' };
  if (normalized === 'watchlist') return { color: '#fde68a', border: '#1e3a8a' };
  if (normalized === 'weak') return { color: '#fdba74', border: '#7c2d12' };
  if (normalized === 'rejected') return { color: '#fca5a5', border: '#7f1d1d' };
  return { color: '#e5e7eb', border: '#374151' };
}
function ValidationResultsPanel({ results, selectedResult, loading, error, onSelect, onClear }) {
  const active = selectedResult || (Array.isArray(results) ? results[0] : null);
  const hasResults = Array.isArray(results) && results.length > 0;
  const status = getText(active, ['status'], '—');
  const statusStyle = validationStatusStyle(status);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: '#9ca3af', fontSize: 12 }}>Validate a strategy candidate to populate results.</div>
        <button onClick={onClear} disabled={loading} style={{ background: '#3b0a0a', color: 'white', border: '1px solid #7f1d1d', borderRadius: 8, padding: '6px 10px' }}>Clear Validations</button>
      </div>
      {error && <div style={{ background: '#2a0f10', border: '1px solid #7f1d1d', borderRadius: 8, padding: 10, color: '#fecaca' }}>{error}</div>}
      {!hasResults ? <EmptyState text="No validation results yet" /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {results.map((item, index) => {
            const id = item?.id || item?._id || item?.resultId || item?.validationId || `validation-${index}`;
            return <button key={id} onClick={() => onSelect(id)} style={{ textAlign: 'left', border: '1px solid #1f2937', background: '#070707', color: '#e5e7eb', borderRadius: 8, padding: 8 }}>{item?.strategyName || item?.strategyId || id}</button>;
          })}
        </div>
      )}
      {active && (
        <article style={{ border: `1px solid ${statusStyle.border}`, borderRadius: 8, padding: 10, background: '#070707', display: 'grid', gap: 6 }}>
          <CompactRow label="Validation Score" value={getText(active, ['validationScore', 'score'])} />
          <CompactRow label="Grade" value={getText(active, ['grade'])} />
          <CompactRow label="Status" value={status} color={statusStyle.color} />
          <CompactRow label="Reasons" value={listToText(active?.reasons)} />
          <CompactRow label="Warnings" value={listToText(active?.warnings)} />
          <CompactRow label="Backtest Summary" value={listToText(active?.backtestSummary)} />
          <CompactRow label="Quality Summary" value={listToText(active?.qualitySummary)} />
          <CompactRow label="Risk Summary" value={listToText(active?.riskSummary)} />
        </article>
      )}
    </div>
  );
}

function QuantFeaturesPanel({ items, loading }) {
  if (loading) return <div style={{ color: '#9ca3af' }}>Loading…</div>;
  if (!Array.isArray(items) || items.length === 0) return <EmptyState text="No features yet" />;

  const grouped = items.reduce((acc, feature) => {
    const category = getText(feature, ['category'], 'Uncategorized');
    if (!acc[category]) acc[category] = [];
    acc[category].push(feature);
    return acc;
  }, {});

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {Object.entries(grouped).map(([category, features]) => (
        <section key={category} style={{ border: '1px solid #1f2937', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#111827', padding: '8px 10px', fontWeight: 700 }}>{category}</div>
          <div style={{ display: 'grid', gap: 8, padding: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {features.map((feature, index) => {
              const value = formatFeatureValue(feature?.value);
              const details = formatFeatureDetails(feature?.value);
              return (
                <article key={`${category}-${index}`} style={{ border: '1px solid #111827', borderRadius: 8, padding: 10, background: '#070707' }}>
                  <CompactRow label="Category" value={getText(feature, ['category'], 'Uncategorized')} />
                  <CompactRow label="Name" value={getText(feature, ['name'])} />
                  <CompactRow label="Value" value={value} />
                  <CompactRow label="Timeframe" value={getText(feature, ['timeframe', 'tf'])} />
                  <CompactRow label="Confidence" value={formatFeatureValue(feature?.confidence)} />
                  <CompactRow label="Source" value={getText(feature, ['source', 'origin'])} />
                  {details && <CompactRow label="Details" value={details} color="#9ca3af" />}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function QualityScoresPanel({ items, loading }) {
  if (loading) return <div style={{ color: '#9ca3af' }}>Loading…</div>;
  if (!Array.isArray(items) || items.length === 0) return <EmptyState text="No quality scores yet" />;

  return (
    <CardGrid>
      {items.map((item, index) => {
        const grade = getText(item, ['grade'], '—');
        const style = gradeStyle(grade);
        return (
          <article key={`quality-${index}`} style={{ border: `1px solid ${style.border}`, borderRadius: 10, padding: 10, background: '#070707' }}>
            <CompactRow label="Signal type" value={getText(item, ['signalType', 'type'])} />
            <CompactRow label="Score" value={getText(item, ['score'])} />
            <CompactRow label="Grade" value={`${grade} (${style.label})`} color={style.color} />
            <CompactRow label="Reasons" value={listToText(item?.reasons)} />
            <CompactRow label="Bonuses" value={listToText(item?.bonuses)} />
            <CompactRow label="Penalties" value={listToText(item?.penalties)} />
          </article>
        );
      })}
    </CardGrid>
  );
}

function RankedSignalsPanel({ items, loading }) {
  if (loading) return <div style={{ color: '#9ca3af' }}>Loading…</div>;
  if (!Array.isArray(items) || items.length === 0) return <EmptyState text="No ranked signals yet" />;

  return (
    <CardGrid>
      {items.map((item, index) => {
        const grade = getText(item, ['grade'], '—');
        const style = gradeStyle(grade);
        return (
          <article key={`ranked-${index}`} style={{ border: `1px solid ${style.border}`, borderRadius: 10, padding: 10, background: '#070707' }}>
            <CompactRow label="Rank" value={getText(item, ['rank', 'position'])} />
            <CompactRow label="Signal type" value={getText(item, ['signalType', 'type'])} />
            <CompactRow label="Score" value={getText(item, ['score'])} />
            <CompactRow label="Grade" value={`${grade} (${style.label})`} color={style.color} />
            <CompactRow label="Reasons" value={listToText(item?.reasons)} />
            <CompactRow label="Bonuses" value={listToText(item?.bonuses)} />
            <CompactRow label="Penalties" value={listToText(item?.penalties)} />
          </article>
        );
      })}
    </CardGrid>
  );
}


function ReversalPointsPanel({ items, loading, error, strategyLoading, strategyError, onDetect, onClear, onCreateStrategy, onSaveStrategy, disabled }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onDetect} disabled={loading || disabled} style={{ background: '#065f46', color: 'white', border: '1px solid #10b981', borderRadius: 8, padding: '8px 12px' }}>{loading ? 'Detecting…' : 'Detect Reversals'}</button>
        <button onClick={onClear} disabled={loading || disabled} style={{ background: '#3b0a0a', color: 'white', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 12px' }}>Clear Reversals</button>
      </div>
      <div style={{ color: '#9ca3af', fontSize: 12 }}>Reversal-derived strategies are research-only until backtested and validated.</div>
      {error && <div style={{ background: '#2a0f10', border: '1px solid #7f1d1d', borderRadius: 8, padding: 10, color: '#fecaca' }}>{error}</div>}
      {strategyError && <div style={{ background: '#2a0f10', border: '1px solid #7f1d1d', borderRadius: 8, padding: 10, color: '#fecaca' }}>{strategyError}</div>}
      {!Array.isArray(items) || items.length === 0 ? <EmptyState text="No reversal points detected yet" /> : (
        <CardGrid>
          {items.map((item, index) => {
            const grade = getText(item, ['grade'], '—');
            const style = gradeStyle(grade);
            return (
              <article key={`reversal-${index}`} style={{ border: `1px solid ${style.border}`, borderRadius: 10, padding: 10, background: '#070707' }}>
                <CompactRow label="Direction" value={getText(item, ['direction'])} color={directionColor(getText(item, ['direction']))} />
                <CompactRow label="Score" value={getText(item, ['score'])} />
                <CompactRow label="Grade" value={`${grade} (${style.label})`} color={style.color} />
                <CompactRow label="Timeframe" value={getText(item, ['timeframe', 'tf'])} />
                <CompactRow label="Zone" value={listToText(item?.zone)} />
                <CompactRow label="Entry" value={getText(item, ['entrySuggestion'])} />
                <CompactRow label="Stop" value={getText(item, ['stopSuggestion'])} />
                <CompactRow label="Target" value={getText(item, ['targetSuggestion'])} />
                <CompactRow label="Invalidation" value={getText(item, ['invalidationCondition'])} />
                <CompactRow label="Reasons" value={listToText(item?.reasons)} />
                <CompactRow label="Warnings" value={listToText(item?.warnings)} />
                <CompactRow label="Source" value={getText(item, ['source'])} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => onCreateStrategy?.(item?.id || item?._id || item?.reversalPointId)} disabled={loading || strategyLoading} style={{ background: '#1d4ed8', color: 'white', border: '1px solid #60a5fa', borderRadius: 6, padding: '6px 10px' }}>{strategyLoading ? 'Creating…' : 'Create Strategy'}</button>
                  <button onClick={() => onSaveStrategy?.(item?.id || item?._id || item?.reversalPointId)} disabled={loading || strategyLoading} style={{ background: '#065f46', color: 'white', border: '1px solid #10b981', borderRadius: 6, padding: '6px 10px' }}>{strategyLoading ? 'Saving…' : 'Save to Strategy Lab'}</button>
                </div>
                {item?.generatedStrategy && (
                  <div style={{ marginTop: 8, border: '1px solid #1f2937', borderRadius: 8, padding: 8, display: 'grid', gap: 4 }}>
                    <CompactRow label="Name" value={getText(item.generatedStrategy, ['name'])} />
                    <CompactRow label="Type" value={getText(item.generatedStrategy, ['type'])} />
                    <CompactRow label="Status" value={getText(item.generatedStrategy, ['status'])} />
                    <CompactRow label="Direction" value={getText(item.generatedStrategy, ['direction'])} color={directionColor(getText(item.generatedStrategy, ['direction']))} />
                    <CompactRow label="Confidence" value={getText(item.generatedStrategy, ['confidence'])} />
                    <CompactRow label="Entry logic" value={getText(item.generatedStrategy, ['entryLogic'])} />
                    <CompactRow label="Stop loss logic" value={getText(item.generatedStrategy, ['stopLossLogic'])} />
                    <CompactRow label="Exit logic" value={getText(item.generatedStrategy, ['targetLogic', 'exitLogic'])} />
                    <CompactRow label="Invalidation" value={getText(item.generatedStrategy, ['invalidationCondition'])} />
                    <CompactRow label="Warnings" value={listToText(item.generatedStrategy?.warnings)} />
                  </div>
                )}
              </article>
            );
          })}
        </CardGrid>
      )}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section style={panelStyle}>
      <div style={{ marginBottom: 8, fontWeight: 800 }}>{title}</div>
      {children}
    </section>
  );
}

function TrendPanel({ trend }) {
  if (!Array.isArray(trend) || trend.length === 0) return <EmptyState text="No trend data yet" />;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {trend.map((item, index) => (
        <article key={`trend-${item?.snapshotId || index}`} style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#070707' }}>
          <CompactRow label="Snapshot" value={getText(item, ['snapshotId', 'id'])} />
          <CompactRow label="Quality trend" value={getText(item, ['qualityTrend', 'qualityScoreTrend', 'qualityScore'])} />
          <CompactRow label="Signal count" value={getText(item, ['signalCountTrend', 'signalCount', 'totalSignals'])} />
          <CompactRow label="Direction bias" value={getText(item, ['directionBiasTrend', 'directionBias', 'bias'])} />
          <CompactRow label="Analyzed at" value={item?.createdAt ? new Date(item.createdAt).toLocaleString() : '—'} />
        </article>
      ))}
    </div>
  );
}


function formatMetric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(4)).toString();
  return value ?? '—';
}

function formatDecimal(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toFixed(2);
}

function formatPercentage(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(2)}%`;
}

function getPnLColor(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '#e5e7eb';
  return num > 0 ? '#86efac' : '#fca5a5';
}

function BacktestResultsPanel({ results, selectedResult, loading, error, onSelect, onClear }) {
  const effectiveSelectedResult = selectedResult || (Array.isArray(results) ? results[0] : null);
  const metrics = effectiveSelectedResult?.metrics || effectiveSelectedResult?.summary || effectiveSelectedResult || {};
  const trades = effectiveSelectedResult?.trades || effectiveSelectedResult?.executions || [];
  const hasBacktestResults = Array.isArray(results) && results.length > 0;
  const showEmptyState = !effectiveSelectedResult && !hasBacktestResults;

  const metricCards = [
    { label: 'Total PnL', value: formatDecimal(metrics?.totalPnL), color: getPnLColor(metrics?.totalPnL) },
    { label: 'Total PnL %', value: formatPercentage(metrics?.totalPnLPercent) },
    { label: 'Win Rate', value: formatPercentage(metrics?.winRate) },
    { label: 'Loss Rate', value: formatPercentage(metrics?.lossRate) },
    { label: 'Average Win', value: formatDecimal(metrics?.averageWin) },
    { label: 'Average Loss', value: formatDecimal(metrics?.averageLoss) },
    { label: 'Max Drawdown', value: formatPercentage(metrics?.maxDrawdown) },
    { label: 'Profit Factor', value: formatDecimal(metrics?.profitFactor) },
    { label: 'Expectancy', value: formatDecimal(metrics?.expectancy) },
    { label: 'Number of Trades', value: formatMetric(metrics?.numberOfTrades) },
    { label: 'Avg Trade Duration', value: formatMetric(metrics?.averageTradeDuration) },
  ];

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: '#9ca3af', fontSize: 12 }}>Run a strategy backtest to populate results.</div>
        <button onClick={onClear} disabled={loading} style={{ background: '#3b0a0a', color: 'white', border: '1px solid #7f1d1d', borderRadius: 8, padding: '6px 10px' }}>Clear Backtests</button>
      </div>
      <div style={{ color: '#9ca3af', fontSize: 12 }}>Reversal-derived strategies are research-only until backtested and validated.</div>
      {error && <div style={{ background: '#2a0f10', border: '1px solid #7f1d1d', borderRadius: 8, padding: 10, color: '#fecaca' }}>{error}</div>}
      {strategyError && <div style={{ background: '#2a0f10', border: '1px solid #7f1d1d', borderRadius: 8, padding: 10, color: '#fecaca' }}>{strategyError}</div>}
      {showEmptyState ? (
        <EmptyState text="No backtest results yet" />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {results.map((item, index) => {
            const id = item?.id || item?._id || item?.resultId || `result-${index}`;
            return <button key={id} onClick={() => onSelect(id)} style={{ textAlign: 'left', border: '1px solid #1f2937', background: '#070707', color: '#e5e7eb', borderRadius: 8, padding: 8 }}>{item?.strategyName || item?.strategyId || id}</button>;
          })}
        </div>
      )}
      {effectiveSelectedResult && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            {metricCards.map((metric) => (
              <article key={metric.label} style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#070707' }}>
                <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>{metric.label}</div>
                <div style={{ color: metric.color || '#e5e7eb', fontWeight: 700, fontSize: 16 }}>{metric.value}</div>
              </article>
            ))}
          </div>
          {Array.isArray(trades) && trades.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              <strong style={{ fontSize: 13 }}>Trades</strong>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {trades.map((trade, index) => (
                  <article key={`trade-${index}`} style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#070707', display: 'grid', gap: 4 }}>
                    <CompactRow label="Direction" value={getText(trade, ['direction'])} color={directionColor(getText(trade, ['direction']))} />
                    <CompactRow label="Entry Time" value={getText(trade, ['entryTime'])} />
                    <CompactRow label="Entry Price" value={formatDecimal(trade?.entryPrice)} />
                    <CompactRow label="Exit Time" value={getText(trade, ['exitTime'])} />
                    <CompactRow label="Exit Price" value={formatDecimal(trade?.exitPrice)} />
                    <CompactRow label="PnL" value={formatDecimal(trade?.pnl)} color={getPnLColor(trade?.pnl)} />
                    <CompactRow label="PnL %" value={formatPercentage(trade?.pnlPercent)} color={getPnLColor(trade?.pnlPercent)} />
                    <CompactRow label="Reason" value={getText(trade, ['reason'])} />
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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
    qualityScores,
    rankedSignals,
    warnings,
    reversalPoints,
    reversalLoading,
    reversalError,
    reversalStrategyLoading,
    reversalStrategyError,
    analysisHistory,
    analyticsTrend,
    latestAnalytics,
    snapshotComparison,
    selectedBaseSnapshotId,
    selectedCompareSnapshotId,
    snapshotId,
    loading,
    error,
    lastUpdated,
    analyzedAt,
    setSymbol,
    setTimeframe,
    refreshAll,
    analyzeAll,
    loadHistory,
    loadAnalytics,
    compareSelectedSnapshots,
    setSelectedBaseSnapshotId,
    setSelectedCompareSnapshotId,
    selectSnapshot,
    clearHistory,
    clearError,
    backtestResults,
    selectedBacktestResult,
    backtestLoading,
    backtestError,
    runBacktest,
    loadBacktestResults,
    selectBacktestResult,
    clearBacktestResults,
    validationResults,
    selectedValidationResult,
    validationLoading,
    validationError,
    validateStrategy,
    loadValidationResults,
    selectValidationResult,
    clearValidationResults,
    detectReversals,
    loadReversalPoints,
    clearReversalPoints,
    createStrategyFromReversal,
    saveStrategyFromReversal,
  } = useQuantLabStore();

  const [draftSymbol, setDraftSymbol] = useState(symbol);

  useEffect(() => {
    setDraftSymbol(symbol);
  }, [symbol]);

  useEffect(() => {
    loadHistory();
    loadAnalytics();
    loadBacktestResults();
    loadValidationResults();
    loadReversalPoints();
  }, [symbol, loadHistory, loadAnalytics]);

  const handleClearHistory = async () => {
    if (!window.confirm(`Clear all analysis history for ${symbol}?`)) return;
    await clearHistory();
  };

  const hasEnoughSnapshotsForComparison = Array.isArray(analysisHistory) && analysisHistory.length >= 2;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section style={panelStyle}>
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
          <button onClick={handleClearHistory} disabled={loading} style={{ background: '#3b0a0a', color: 'white', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 12px' }}>Clear History</button>
          {snapshotId && <span style={{ color: '#9ca3af', fontSize: 12 }}>Snapshot ID: {snapshotId}</span>}
          {analyzedAt && <span style={{ color: '#9ca3af', fontSize: 12 }}>Analyzed at: {new Date(analyzedAt).toLocaleString()}</span>}
          {lastUpdated && <span style={{ color: '#9ca3af', fontSize: 12 }}>Last updated: {new Date(lastUpdated).toLocaleString()}</span>}
        </div>

        {Array.isArray(strategyCandidates) && strategyCandidates.length === 0 && (
          <div style={{ marginTop: 10, background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: 10, color: '#cbd5e1' }}>No strategies to validate yet</div>
        )}

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

      <Panel title="Analysis History">
        <div style={{ marginBottom: 8, color: "#9ca3af", fontSize: 12 }}>Each Analyze creates a new snapshot.</div>
        {!Array.isArray(analysisHistory) || analysisHistory.length === 0 ? (
          <EmptyState text="No analysis history yet" />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {analysisHistory.map((item, index) => {
              const id = item?.id || item?._id || item?.snapshotId;
              const createdAt = item?.createdAt || item?.analyzedAt;
              return (
                <button
                  key={id || `history-${index}`}
                  onClick={() => id && selectSnapshot(id)}
                  style={{ textAlign: 'left', border: '1px solid #1f2937', background: '#070707', color: '#e5e7eb', borderRadius: 8, padding: 10, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{createdAt ? new Date(createdAt).toLocaleString() : 'Unknown date'}</strong>
                    <span style={{ color: '#9ca3af' }}>{item?.timeframe || '—'}</span>
                  </div>
                  <div style={{ marginTop: 6, color: '#9ca3af', fontSize: 12 }}>
                    α: {item?.alphaCount ?? item?.counts?.alpha ?? 0} · Patterns: {item?.patternCount ?? item?.counts?.patterns ?? 0} · Strategies: {item?.strategyCount ?? item?.counts?.strategies ?? 0} · Features: {item?.quantFeatureCount ?? item?.counts?.quantFeatures ?? 0} · Quality: {item?.qualityScoreCount ?? item?.counts?.qualityScores ?? 0}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Analytics Trend">
        <TrendPanel trend={analyticsTrend} />
        {latestAnalytics && (
          <div style={{ marginTop: 10, border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#070707' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Latest analytics</div>
            <CompactRow label="Quality" value={getText(latestAnalytics, ['qualityTrend', 'qualityScore', 'quality'])} />
            <CompactRow label="Signals" value={getText(latestAnalytics, ['signalCountTrend', 'signalCount', 'totalSignals'])} />
            <CompactRow label="Bias" value={getText(latestAnalytics, ['directionBiasTrend', 'directionBias', 'bias'])} />
          </div>
        )}
      </Panel>

      <Panel title="Snapshot Comparison">
        <div style={{ display: 'grid', gap: 10 }}>
          {!hasEnoughSnapshotsForComparison && (
            <div style={{ color: '#9ca3af', fontSize: 13 }}>
              Run Analyze at least twice to create two snapshots for comparison.
            </div>
          )}
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <select value={selectedBaseSnapshotId} onChange={(e) => setSelectedBaseSnapshotId(e.target.value)} disabled={!hasEnoughSnapshotsForComparison} style={{ background: '#050505', color: 'white', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 10px' }}>
              <option value="">Select base snapshot</option>
              {analysisHistory.map((item, index) => {
                const id = item?.id || item?._id || item?.snapshotId;
                const createdAt = item?.createdAt || item?.analyzedAt;
                return <option key={`base-${id || index}`} value={id || ''}>{createdAt ? new Date(createdAt).toLocaleString() : id || `Snapshot ${index + 1}`}</option>;
              })}
            </select>
            <select value={selectedCompareSnapshotId} onChange={(e) => setSelectedCompareSnapshotId(e.target.value)} disabled={!hasEnoughSnapshotsForComparison} style={{ background: '#050505', color: 'white', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 10px' }}>
              <option value="">Select comparison snapshot</option>
              {analysisHistory.map((item, index) => {
                const id = item?.id || item?._id || item?.snapshotId;
                const createdAt = item?.createdAt || item?.analyzedAt;
                return <option key={`compare-${id || index}`} value={id || ''}>{createdAt ? new Date(createdAt).toLocaleString() : id || `Snapshot ${index + 1}`}</option>;
              })}
            </select>
          </div>
          <button onClick={compareSelectedSnapshots} disabled={loading || !hasEnoughSnapshotsForComparison || !selectedBaseSnapshotId || !selectedCompareSnapshotId} style={{ width: 'fit-content', background: '#1d4ed8', color: 'white', border: '1px solid #3b82f6', borderRadius: 8, padding: '8px 12px' }}>Compare Selected Snapshots</button>
          {!snapshotComparison ? (
            <EmptyState text="No comparison yet." />
          ) : (
            <article style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 10, background: '#070707', display: 'grid', gap: 6 }}>
              <CompactRow label="Alpha Δ" value={getText(snapshotComparison, ['alphaDelta'])} />
              <CompactRow label="Pattern Δ" value={getText(snapshotComparison, ['patternDelta'])} />
              <CompactRow label="Strategy Δ" value={getText(snapshotComparison, ['strategyDelta'])} />
              <CompactRow label="Feature Δ" value={getText(snapshotComparison, ['quantFeatureDelta'])} />
              <CompactRow label="Quality Δ" value={getText(snapshotComparison, ['qualityScoreDelta'])} />
              <CompactRow label="Direction shift" value={getText(snapshotComparison, ['directionShift'])} />
              <CompactRow label="Confidence shift" value={getText(snapshotComparison, ['confidenceShift'])} />
              <CompactRow label="Warnings" value={listToText(snapshotComparison?.warnings)} />
            </article>
          )}
        </div>
      </Panel>

      <Panel title="Alpha Signals"><AlphaSignalsPanel items={alphaSignals} loading={loading} /></Panel>
      <Panel title="Pattern Signals"><PatternSignalsPanel items={patternSignals} loading={loading} /></Panel>
      <Panel title="Strategy Candidates"><StrategyCandidatesPanel items={strategyCandidates} loading={loading} onRunBacktest={runBacktest} backtestLoading={backtestLoading} onValidate={validateStrategy} validationLoading={validationLoading} /></Panel>
      <Panel title="Strategy Validation"><ValidationResultsPanel results={validationResults} selectedResult={selectedValidationResult} loading={validationLoading} error={validationError} onSelect={selectValidationResult} onClear={clearValidationResults} /></Panel>
      <Panel title="Backtest Results"><BacktestResultsPanel results={backtestResults} selectedResult={selectedBacktestResult} loading={backtestLoading} error={backtestError} onSelect={selectBacktestResult} onClear={clearBacktestResults} /></Panel>
      <Panel title="Potential Reversal Points"><ReversalPointsPanel items={reversalPoints} loading={reversalLoading} error={reversalError} strategyLoading={reversalStrategyLoading} strategyError={reversalStrategyError} onDetect={detectReversals} onClear={clearReversalPoints} onCreateStrategy={createStrategyFromReversal} onSaveStrategy={saveStrategyFromReversal} disabled={loading} /></Panel>
      <Panel title="Quant Features"><QuantFeaturesPanel items={quantFeatures} loading={loading} /></Panel>
      <Panel title="Quality Scores"><QualityScoresPanel items={qualityScores} loading={loading} /></Panel>
      <Panel title="Ranked Signals"><RankedSignalsPanel items={rankedSignals} loading={loading} /></Panel>
    </div>
  );
}
