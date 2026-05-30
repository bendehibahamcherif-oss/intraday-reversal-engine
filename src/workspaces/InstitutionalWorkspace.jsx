import { useEffect } from 'react';
import {
  useInstitutionalStore,
  SCENARIO_PACKS,
} from '../store/institutionalStore';

const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';
const BLUE    = '#2563eb';
const VIOLET  = '#a78bfa';

const panel  = { background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 };
const iStyle = { background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, width: '100%' };
const th     = { padding: '5px 10px', fontSize: 10, color: MUTED, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
const td     = { padding: '5px 8px', fontSize: 12, borderBottom: `1px solid ${BORDER}22`, verticalAlign: 'middle' };

function fmtMoney(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(v, d = 2) {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;
}
function fmtN(v, d = 2) {
  if (v == null) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}

// ── Config panel ───────────────────────────────────────────────────────────────
function ConfigPanel({ s }) {
  const isLive = s.mode === 'live';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      <div>
        <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>Account Equity ($)</div>
        <input
          type="number" min="0" step="1000"
          value={s.accountEquity}
          onChange={(e) => s.setAccountEquity(e.target.value)}
          style={iStyle}
        />
      </div>
      <div>
        <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>Risk Per Trade (%)</div>
        <input
          type="number" min="0.01" max="50" step="0.1"
          value={s.riskPct}
          onChange={(e) => s.setRiskPct(e.target.value)}
          style={iStyle}
        />
      </div>
      <div>
        <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>Mode</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['paper', 'live'].map((m) => (
            <button
              key={m}
              onClick={() => s.setMode(m)}
              style={{
                flex: 1, padding: '5px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                borderRadius: 6, border: 'none',
                background: s.mode === m ? (m === 'live' ? RED + '33' : BLUE + '33') : SURFACE,
                color: s.mode === m ? (m === 'live' ? RED : BLUE) : MUTED,
                outline: s.mode === m ? `1px solid ${m === 'live' ? RED : BLUE}` : 'none',
              }}
            >
              {m === 'live' ? '● LIVE' : '◎ PAPER'}
            </button>
          ))}
        </div>
        {isLive && (
          <div style={{ fontSize: 10, color: AMBER, marginTop: 4 }}>
            ⚠ Sizing shown for reference — live orders require Phase 12 OMS unlock
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sizing output chips ────────────────────────────────────────────────────────
function SizingChips({ result }) {
  if (!result) return null;
  const isVol   = result.method === 'volatility_target';
  const chips = isVol ? [
    { label: 'Shares',       value: result.shares.toLocaleString(),  color: GREEN  },
    { label: 'Notional',     value: fmtMoney(result.actualNotional), color: TEXT   },
    { label: 'Dollar Risk',  value: fmtMoney(result.dollarRisk),     color: AMBER  },
    { label: 'Target Risk',  value: fmtMoney(result.targetRisk),     color: MUTED  },
    { label: 'Period Vol',   value: `${fmtN(result.periodVol, 2)}%`, color: VIOLET },
    { label: 'Daily Vol',    value: `${fmtN(result.dailyVol, 2)}%`,  color: MUTED  },
  ] : [
    { label: 'Shares',       value: result.shares.toLocaleString(),  color: GREEN  },
    { label: 'Notional',     value: fmtMoney(result.actualNotional), color: TEXT   },
    { label: 'Full Kelly',   value: fmtPct(result.fullKelly),        color: AMBER  },
    { label: 'Capped Kelly', value: fmtPct(result.cappedKelly),      color: VIOLET },
    { label: 'Odds (b)',     value: fmtN(result.odds, 3),            color: MUTED  },
    { label: result.usedMlConfidence ? 'ML Win Rate' : 'Win Rate', value: fmtPct(result.inputs.winRate, 1), color: result.usedMlConfidence ? VIOLET : MUTED },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginTop: 12 }}>
      {chips.map(({ label, value, color }) => (
        <div key={label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px' }}>
          <div style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
          <div style={{ fontWeight: 800, fontFamily: 'monospace', color, fontSize: 14 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Vol-based sizing panel ─────────────────────────────────────────────────────
function VolSizingPanel({ s }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
        {[
          { label: 'Symbol', key: 'volSymbol', type: 'text' },
          { label: 'Price ($)', key: 'volPrice', type: 'number', min: 0, step: 0.01 },
          { label: 'Ann. Vol (%)', key: 'volAnnualizedVol', type: 'number', min: 1, step: 0.1 },
          { label: 'Horizon (days)', key: 'volHorizon', type: 'number', min: 1, step: 1 },
        ].map(({ label, key, type, min, step }) => (
          <div key={key}>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>{label}</div>
            <input
              type={type} min={min} step={step}
              value={s[key]}
              onChange={(e) => s.setVolField(key, type === 'number' ? Number(e.target.value) : e.target.value.toUpperCase())}
              style={iStyle}
            />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: MUTED, marginBottom: 10, lineHeight: 1.6 }}>
        <strong style={{ color: TEXT }}>Formula:</strong>{' '}
        shares = floor( (equity × riskPct%) / (price × dailyVol × √horizon) ){' '}
        where dailyVol = annVol / √252
      </div>
      <button
        onClick={s.computeVolSizing}
        style={{ background: GREEN + '22', color: GREEN, border: `1px solid ${GREEN}55`, borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
      >
        Compute Volatility Size
      </button>
      <SizingChips result={s.volResult} />
    </div>
  );
}

// ── Kelly sizing panel ─────────────────────────────────────────────────────────
function KellySizingPanel({ s }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
        {[
          { label: 'Symbol', key: 'kellySymbol', type: 'text' },
          { label: 'Price ($)', key: 'kellyPrice', type: 'number', min: 0, step: 0.01 },
          { label: 'Win Rate (%)', key: 'kellyWinRate', type: 'number', min: 1, max: 99, step: 1 },
          { label: 'Avg Win (%)', key: 'kellyAvgWin', type: 'number', min: 0.01, step: 0.1 },
          { label: 'Avg Loss (%)', key: 'kellyAvgLoss', type: 'number', min: 0.01, step: 0.1 },
          { label: 'Kelly Fraction', key: 'kellyFraction', type: 'number', min: 0.01, max: 1, step: 0.05 },
          { label: 'Max Alloc (%)', key: 'kellyMaxAlloc', type: 'number', min: 1, max: 100, step: 1 },
        ].map(({ label, key, type, min, max, step }) => (
          <div key={key}>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>{label}</div>
            <input
              type={type} min={min} max={max} step={step}
              value={s[key]}
              onChange={(e) => s.setKellyField(key, type === 'number' ? Number(e.target.value) : e.target.value.toUpperCase())}
              style={iStyle}
              disabled={key === 'kellyWinRate' && s.kellyUseMl && s.kellyMlConfidence !== null}
            />
          </div>
        ))}
      </div>

      {/* ML signal integration */}
      <div style={{ background: VIOLET + '11', border: `1px solid ${VIOLET}33`, borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={s.kellyUseMl}
              onChange={(e) => s.setKellyUseMl(e.target.checked)}
            />
            <span style={{ color: VIOLET, fontWeight: 700 }}>Use ML signal confidence as win rate (optional)</span>
          </label>
          {s.kellyMlConfidence !== null && (
            <span style={{ background: VIOLET + '22', color: VIOLET, border: `1px solid ${VIOLET}55`, borderRadius: 4, fontSize: 10, padding: '2px 7px', fontWeight: 700 }}>
              ML conf: {(s.kellyMlConfidence * 100).toFixed(1)}%
            </span>
          )}
          {s.kellyMlConfidence === null && s.kellyUseMl && (
            <span style={{ color: MUTED, fontSize: 11 }}>— no inference result loaded (go to AILab → Run Inference)</span>
          )}
        </div>
      </div>

      <div style={{ fontSize: 10, color: MUTED, marginBottom: 10, lineHeight: 1.6 }}>
        <strong style={{ color: TEXT }}>Formula:</strong>{' '}
        fullKelly = (p × b − q) / b, b = avgWin / avgLoss{' '}
        · cappedKelly = min(fullKelly × fraction, maxAlloc%){' '}
        · shares = floor(equity × cappedKelly / price)
      </div>
      <button
        onClick={s.computeKellySizing}
        style={{ background: VIOLET + '22', color: VIOLET, border: `1px solid ${VIOLET}55`, borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
      >
        Compute Kelly Size
      </button>
      <SizingChips result={s.kellyResult} />
    </div>
  );
}

// ── Position editor ────────────────────────────────────────────────────────────
function PositionEditor({ positions, updatePosition, addPosition, removePosition }) {
  const ASSET_CLASSES = ['equity', 'bonds', 'commodities'];
  return (
    <div>
      <div style={{ overflowX: 'auto', marginBottom: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              {['Symbol', 'Shares', 'Price ($)', 'Asset Class', ''].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((pos, idx) => (
              <tr key={idx}>
                <td style={td}>
                  <input
                    value={pos.symbol}
                    onChange={(e) => updatePosition(idx, 'symbol', e.target.value.toUpperCase())}
                    style={{ ...iStyle, width: 70 }}
                    placeholder="SPY"
                  />
                </td>
                <td style={td}>
                  <input
                    type="number" min="1"
                    value={pos.shares}
                    onChange={(e) => updatePosition(idx, 'shares', Number(e.target.value))}
                    style={{ ...iStyle, width: 80 }}
                  />
                </td>
                <td style={td}>
                  <input
                    type="number" min="0.01" step="0.01"
                    value={pos.price}
                    onChange={(e) => updatePosition(idx, 'price', Number(e.target.value))}
                    style={{ ...iStyle, width: 90 }}
                  />
                </td>
                <td style={td}>
                  <select
                    value={pos.assetClass}
                    onChange={(e) => updatePosition(idx, 'assetClass', e.target.value)}
                    style={{ ...iStyle, width: 110 }}
                  >
                    {ASSET_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={td}>
                  <button
                    onClick={() => removePosition(idx)}
                    style={{ background: RED + '22', color: RED, border: `1px solid ${RED}44`, borderRadius: 4, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={addPosition}
        style={{ background: BLUE + '22', color: BLUE, border: `1px solid ${BLUE}55`, borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
      >
        + Add Position
      </button>
    </div>
  );
}

// ── Scenario selector ──────────────────────────────────────────────────────────
function ScenarioSelector({ selectedScenarios, toggleScenario, customShock, setCustomShock }) {
  const ALL = [...SCENARIO_PACKS, { id: 'custom', name: 'Custom Shock', description: 'Apply user-defined % shock to all equity positions' }];
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {ALL.map((sc) => {
        const sel = selectedScenarios.includes(sc.id);
        return (
          <label key={sc.id} title={sc.description} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={sel} onChange={() => toggleScenario(sc.id)} />
            <span style={{ fontSize: 11, color: sel ? TEXT : MUTED, fontWeight: sel ? 700 : 400 }}>{sc.name}</span>
          </label>
        );
      })}
      {selectedScenarios.includes('custom') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: MUTED }}>Shock %:</span>
          <input
            type="number" step="1"
            value={customShock}
            onChange={(e) => setCustomShock(e.target.value)}
            style={{ ...iStyle, width: 70 }}
          />
        </div>
      )}
    </div>
  );
}

// ── Scenario results table ─────────────────────────────────────────────────────
function ScenarioResultsTable({ results }) {
  if (!results.length) return <div style={{ color: MUTED, fontSize: 12 }}>No scenario results yet. Select scenarios and click Run Stress Test.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary row */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              {['Scenario', 'Total Notional', 'P&L Impact', '% Impact', 'Run At'].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const isNeg = r.pctImpact < 0;
              const color = isNeg ? RED : GREEN;
              return (
                <tr key={r.scenarioId}>
                  <td style={{ ...td, fontWeight: 700 }}>{r.scenarioName}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{fmtMoney(r.totalNotional)}</td>
                  <td style={{ ...td, fontFamily: 'monospace', color }}>{fmtMoney(Math.abs(r.totalPnl))}{r.totalPnl < 0 ? ' loss' : ' gain'}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 800, color }}>
                    {fmtPct(r.pctImpact)}
                  </td>
                  <td style={{ ...td, fontSize: 10, color: MUTED }}>{new Date(r.runAt).toLocaleTimeString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-position breakdown for worst scenario */}
      {(() => {
        const worst = [...results].sort((a, b) => a.pctImpact - b.pctImpact)[0];
        if (!worst?.positions?.length) return null;
        return (
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>
              Worst case breakdown — <strong style={{ color: RED }}>{worst.scenarioName}</strong>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Symbol', 'Shares', 'Notional', 'Shock', 'P&L'].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {worst.positions.map((p, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: 700 }}>{p.symbol || '—'}</td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{p.shares}</td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{fmtMoney(p.notional)}</td>
                    <td style={{ ...td, fontFamily: 'monospace', color: p.shock < 0 ? RED : GREEN }}>{fmtPct(p.shock)}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: p.pnl < 0 ? RED : GREEN }}>{fmtMoney(Math.abs(p.pnl))}{p.pnl < 0 ? ' ↓' : ' ↑'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

// ── Audit trail ────────────────────────────────────────────────────────────────
function AuditTrail({ auditLog }) {
  if (!auditLog.length) return <div style={{ color: MUTED, fontSize: 12 }}>No analyses recorded this session.</div>;
  const TYPE_COLOR = { vol_sizing: GREEN, kelly_sizing: VIOLET, scenario: AMBER };
  const TYPE_LABEL = { vol_sizing: 'VOL SIZE', kelly_sizing: 'KELLY', scenario: 'SCENARIO' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 340, overflowY: 'auto' }}>
      {auditLog.map((entry) => {
        const color = TYPE_COLOR[entry.type] || MUTED;
        const label = TYPE_LABEL[entry.type] || entry.type.toUpperCase();
        const isScenario = entry.type === 'scenario';
        return (
          <div key={entry.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ background: color + '22', color, border: `1px solid ${color}55`, borderRadius: 4, fontSize: 9, padding: '2px 5px', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
              {label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: TEXT, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {isScenario && <span><strong>{entry.scenarioId}</strong></span>}
                {!isScenario && entry.result && (
                  <>
                    <span>shares: <strong style={{ color: GREEN }}>{entry.result.shares}</strong></span>
                    <span>notional: <strong>{fmtMoney(entry.result.actualNotional)}</strong></span>
                    {entry.result.method === 'volatility_target' && (
                      <span>dollarRisk: <strong style={{ color: AMBER }}>{fmtMoney(entry.result.dollarRisk)}</strong></span>
                    )}
                    {entry.result.method === 'capped_kelly' && (
                      <span>kelly: <strong style={{ color: VIOLET }}>{fmtPct(entry.result.cappedKelly)}</strong></span>
                    )}
                  </>
                )}
                {isScenario && entry.result && (
                  <>
                    <span>impact: <strong style={{ color: entry.result.pctImpact < 0 ? RED : GREEN }}>{fmtPct(entry.result.pctImpact)}</strong></span>
                    <span>P&L: <strong>{fmtMoney(Math.abs(entry.result.totalPnl))}</strong></span>
                  </>
                )}
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                {new Date(entry.timestamp).toLocaleString()} · mode: {entry.mode}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main workspace ─────────────────────────────────────────────────────────────
export default function InstitutionalWorkspace() {
  const s = useInstitutionalStore();

  // Attempt to pull ML confidence from aiLabStore if it's mounted
  useEffect(() => {
    try {
      // Dynamic import to avoid hard coupling — aiLabStore may not be loaded
      import('../store/aiLabStore.js').then(({ useAILabStore }) => {
        const inf = useAILabStore.getState().inferenceResult;
        if (inf?.confidence != null) {
          s.setMlConfidenceFromInference(Number(inf.confidence));
        }
        // Subscribe to future updates
        return useAILabStore.subscribe(
          (state) => state.inferenceResult,
          (inf) => { if (inf?.confidence != null) s.setMlConfidenceFromInference(Number(inf.confidence)); }
        );
      }).catch(() => {});
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section style={{ display: 'grid', gap: 12 }}>

      {/* Header */}
      <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>Institutional Toolkit</strong>
        <span style={{ background: AMBER + '22', color: AMBER, border: `1px solid ${AMBER}55`, borderRadius: 4, fontSize: 10, padding: '2px 7px', fontWeight: 700 }}>
          Phase 14
        </span>
        <span style={{ fontSize: 11, color: MUTED }}>Sizing · Scenarios · Audit · Export</span>
        <button
          onClick={s.exportReport}
          style={{ marginLeft: 'auto', background: AMBER + '22', color: AMBER, border: `1px solid ${AMBER}55`, borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          ↓ Export Report
        </button>
      </div>

      {/* ── Global Config ────────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ marginBottom: 12 }}><strong>Global Parameters</strong></div>
        <ConfigPanel s={s} />
      </div>

      {/* ── Volatility-Based Sizing ───────────────────────────────────────────  */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Volatility-Based Position Sizing</strong>
          <span style={{ background: GREEN + '22', color: GREEN, border: `1px solid ${GREEN}55`, borderRadius: 4, fontSize: 10, padding: '2px 6px', fontWeight: 700 }}>
            Vol-Target
          </span>
        </div>
        <VolSizingPanel s={s} />
      </div>

      {/* ── Capped Kelly Sizing ───────────────────────────────────────────────  */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Capped Kelly Position Sizing</strong>
          <span style={{ background: VIOLET + '22', color: VIOLET, border: `1px solid ${VIOLET}55`, borderRadius: 4, fontSize: 10, padding: '2px 6px', fontWeight: 700 }}>
            Kelly
          </span>
          {s.kellyUseMl && s.kellyMlConfidence !== null && (
            <span style={{ background: VIOLET + '22', color: VIOLET, border: `1px solid ${VIOLET}55`, borderRadius: 4, fontSize: 10, padding: '2px 6px', fontWeight: 700 }}>
              ML-enhanced
            </span>
          )}
        </div>
        <KellySizingPanel s={s} />
      </div>

      {/* ── Scenario / Stress Test ────────────────────────────────────────────  */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <strong>Scenario Stress Test</strong>
          {s.scenarioLoading && <span style={{ color: MUTED, fontSize: 12 }}>Running…</span>}
          {s.scenarioError && <span style={{ color: RED, fontSize: 12 }}>{s.scenarioError}</span>}
          <button
            onClick={s.runScenarios}
            disabled={s.scenarioLoading || !s.selectedScenarios.length}
            style={{
              marginLeft: 'auto', background: RED + '22', color: RED, border: `1px solid ${RED}55`,
              borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700,
              cursor: s.scenarioLoading || !s.selectedScenarios.length ? 'default' : 'pointer',
              opacity: s.scenarioLoading || !s.selectedScenarios.length ? 0.5 : 1,
            }}
          >
            ⚡ Run Stress Test
          </button>
        </div>

        {/* Position editor */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginBottom: 6 }}>Positions</div>
          <PositionEditor
            positions={s.positions}
            updatePosition={s.updatePosition}
            addPosition={s.addPosition}
            removePosition={s.removePosition}
          />
        </div>

        {/* Scenario picker */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginBottom: 6 }}>Scenarios</div>
          <ScenarioSelector
            selectedScenarios={s.selectedScenarios}
            toggleScenario={s.toggleScenario}
            customShock={s.customShock}
            setCustomShock={s.setCustomShock}
          />
        </div>

        <ScenarioResultsTable results={s.scenarioResults} />
      </div>

      {/* ── Audit Trail ───────────────────────────────────────────────────────  */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Audit Trail</strong>
          <span style={{ fontSize: 11, color: MUTED }}>{s.auditLog.length} entr{s.auditLog.length !== 1 ? 'ies' : 'y'} this session</span>
          {s.auditLog.length > 0 && (
            <span style={{ fontSize: 10, color: MUTED, marginLeft: 'auto' }}>
              Mode: <strong style={{ color: s.mode === 'live' ? RED : BLUE }}>{s.mode.toUpperCase()}</strong>
            </span>
          )}
        </div>
        <AuditTrail auditLog={s.auditLog} />
      </div>

    </section>
  );
}
