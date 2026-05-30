import { useEffect, useState } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';

const BLUE   = '#2563eb';
const RED    = '#ef4444';
const GREEN  = '#22c55e';
const AMBER  = '#f59e0b';
const MUTED  = '#6b7280';
const BORDER = '#1f2937';
const SURFACE = '#0d0d1a';

const PREDEFINED_SCENARIOS = [
  { name: 'Market Crash', shock: -0.20 },
  { name: 'Flash Crash',  shock: -0.10 },
  { name: 'Rate Spike',   shock: -0.05 },
  { name: 'Rally +10%',   shock:  0.10 },
];

function ModeBadge({ mode }) {
  const live = mode === 'live';
  return (
    <span style={{
      background: live ? RED + '22' : BLUE + '22',
      color: live ? RED : BLUE,
      border: `1px solid ${live ? RED + '66' : BLUE + '66'}`,
      borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '4px 12px',
    }}>
      {live ? '● LIVE' : '◎ PAPER'}
    </span>
  );
}

function fmtMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(2)}K` : abs.toFixed(2);
  return n < 0 ? `-$${s}` : `$${s}`;
}

function fmtPct(v, d = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;
}

// ── VaR Panel ─────────────────────────────────────────────────────────────────
function VaRPanel() {
  const {
    varResult, varLoading, varError,
    varConfig, setVarConfig, loadVaR,
  } = usePortfolioStore();

  const iStyle = {
    background: '#111', color: '#fff', border: `1px solid ${BORDER}`,
    borderRadius: 6, padding: '4px 8px', fontSize: 12,
  };

  return (
    <div className="terminal-card" style={{ padding: 14 }}>
      <strong>Value at Risk (VaR)</strong>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 130 }}>
          <span style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>
            Confidence: <strong style={{ color: '#e5e7eb' }}>{(varConfig.confidence * 100).toFixed(0)}%</strong>
          </span>
          <input
            type="range" min="0.90" max="0.99" step="0.01"
            value={varConfig.confidence}
            onChange={(e) => setVarConfig({ confidence: Number(e.target.value) })}
            style={{ accentColor: BLUE, width: 130 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>Method</span>
          <select value={varConfig.method} onChange={(e) => setVarConfig({ method: e.target.value })} style={iStyle}>
            <option value="historical">Historical</option>
            <option value="parametric">Parametric</option>
            <option value="monte_carlo">Monte Carlo</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>Horizon</span>
          <select value={varConfig.horizon} onChange={(e) => setVarConfig({ horizon: Number(e.target.value) })} style={iStyle}>
            {[1, 5, 10, 21].map((d) => <option key={d} value={d}>{d}d</option>)}
          </select>
        </div>

        <button
          onClick={loadVaR}
          disabled={varLoading}
          style={{
            background: BLUE, color: '#fff', border: 'none', borderRadius: 7,
            padding: '6px 14px', fontSize: 12, fontWeight: 700,
            cursor: varLoading ? 'default' : 'pointer', opacity: varLoading ? 0.7 : 1,
            alignSelf: 'flex-end',
          }}
        >
          {varLoading ? 'Computing…' : 'Compute VaR'}
        </button>
      </div>

      {varError && <div style={{ color: RED, fontSize: 12, marginTop: 10 }}>{varError}</div>}

      {varResult && (
        <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 16px' }}>
            <div style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>
              VaR ({(varConfig.confidence * 100).toFixed(0)}%, {varConfig.horizon}d)
            </div>
            <div style={{ fontWeight: 800, color: RED, fontFamily: 'monospace', fontSize: 15 }}>
              {fmtMoney(varResult.value)}
            </div>
          </div>
          {varResult.valuePct != null && (
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>VaR %</div>
              <div style={{ fontWeight: 800, color: RED, fontFamily: 'monospace', fontSize: 15 }}>
                {fmtPct(Number(varResult.valuePct) * 100, 2)}
              </div>
            </div>
          )}
          {varResult.reproducible != null && (
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>Reproducible</div>
              <div style={{ fontWeight: 700, color: varResult.reproducible ? GREEN : AMBER, fontSize: 13 }}>
                {varResult.reproducible ? '✓ Yes' : '⚠ No'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stress Test Panel ─────────────────────────────────────────────────────────
function StressTestPanel() {
  const { stressTestResult, stressTestLoading, stressTestError, runStressTest } = usePortfolioStore();
  const [selected, setSelected] = useState(new Set([0, 1, 2]));
  const [customName, setCustomName] = useState('Custom');
  const [customShock, setCustomShock] = useState('-0.15');
  const [includeCustom, setIncludeCustom] = useState(false);

  const iStyle = {
    background: '#111', color: '#fff', border: `1px solid ${BORDER}`,
    borderRadius: 6, padding: '4px 8px', fontSize: 12,
  };

  const toggleScenario = (i) => {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
  };

  const handleRun = () => {
    const scenarios = PREDEFINED_SCENARIOS
      .filter((_, i) => selected.has(i))
      .map((s) => ({ name: s.name, shock: s.shock }));
    if (includeCustom) {
      const shock = Number(customShock);
      if (Number.isFinite(shock)) scenarios.push({ name: customName || 'Custom', shock });
    }
    runStressTest(scenarios);
  };

  const canRun = !stressTestLoading && (selected.size > 0 || includeCustom);

  return (
    <div className="terminal-card" style={{ padding: 14 }}>
      <strong>Stress Test</strong>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Predefined scenarios</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {PREDEFINED_SCENARIOS.map((s, i) => (
              <label key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggleScenario(i)} style={{ accentColor: BLUE }} />
                <span style={{ color: '#e5e7eb' }}>{s.name}</span>
                <span style={{ color: s.shock < 0 ? RED : GREEN, fontFamily: 'monospace', fontSize: 11 }}>
                  ({s.shock > 0 ? '+' : ''}{(s.shock * 100).toFixed(0)}%)
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Custom scenario</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, marginBottom: 8 }}>
            <input type="checkbox" checked={includeCustom} onChange={(e) => setIncludeCustom(e.target.checked)} style={{ accentColor: BLUE }} />
            <span style={{ color: '#e5e7eb' }}>Include custom</span>
          </label>
          {includeCustom && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Name"
                style={{ ...iStyle, width: 80 }}
              />
              <input
                value={customShock}
                onChange={(e) => setCustomShock(e.target.value)}
                placeholder="-0.15"
                style={{ ...iStyle, width: 90 }}
              />
            </div>
          )}
        </div>

        <button
          onClick={handleRun}
          disabled={!canRun}
          style={{
            background: AMBER, color: '#000', border: 'none', borderRadius: 7,
            padding: '6px 16px', fontSize: 12, fontWeight: 700,
            cursor: canRun ? 'pointer' : 'default', opacity: canRun ? 1 : 0.5,
            alignSelf: 'flex-end',
          }}
        >
          {stressTestLoading ? 'Running…' : '▶ Run Stress Test'}
        </button>
      </div>

      {stressTestError && <div style={{ color: RED, fontSize: 12, marginTop: 10 }}>{stressTestError}</div>}

      {stressTestResult && (
        <div style={{ marginTop: 14 }}>
          {stressTestResult.worstCaseImpact != null && (
            <div style={{ marginBottom: 10, fontSize: 13 }}>
              Worst-case impact: <strong style={{ color: RED, fontFamily: 'monospace' }}>{fmtMoney(stressTestResult.worstCaseImpact)}</strong>
            </div>
          )}
          {Array.isArray(stressTestResult.scenarios) && stressTestResult.scenarios.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Scenario', 'Shock', 'P&L Impact', 'Impact %'].map((h, i) => (
                      <th key={h} style={{ padding: '5px 10px', color: MUTED, textAlign: i === 0 ? 'left' : 'right', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stressTestResult.scenarios.map((s, i) => {
                    const impact = Number(s.impact ?? s.pnlImpact ?? s.pnl_impact ?? 0);
                    const impactColor = impact < 0 ? RED : GREEN;
                    const shockVal = Number(s.shock);
                    return (
                      <tr key={`${s.name || i}-${i}`}>
                        <td style={{ padding: '5px 10px', color: '#e5e7eb', borderBottom: `1px solid ${BORDER}22` }}>{s.name}</td>
                        <td style={{ padding: '5px 10px', color: shockVal < 0 ? RED : GREEN, textAlign: 'right', fontFamily: 'monospace', borderBottom: `1px solid ${BORDER}22` }}>
                          {Number.isFinite(shockVal) ? `${shockVal >= 0 ? '+' : ''}${(shockVal * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ padding: '5px 10px', color: impactColor, textAlign: 'right', fontFamily: 'monospace', borderBottom: `1px solid ${BORDER}22` }}>
                          {fmtMoney(impact)}
                        </td>
                        <td style={{ padding: '5px 10px', color: impactColor, textAlign: 'right', fontFamily: 'monospace', borderBottom: `1px solid ${BORDER}22` }}>
                          {s.impactPct != null ? fmtPct(Number(s.impactPct) * 100, 2) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Kill Switch Panel ─────────────────────────────────────────────────────────
function KillSwitchPanel() {
  const {
    mode,
    riskStatus, riskStatusLoading, killSwitchLoading,
    loadRiskStatus, enableKillSwitch, disableKillSwitch,
  } = usePortfolioStore();

  useEffect(() => { loadRiskStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const active = Boolean(riskStatus?.killSwitchActive ?? riskStatus?.kill_switch_active);
  const reason = riskStatus?.reason ?? riskStatus?.triggeredReason ?? null;
  const paperOnly = mode === 'live';

  return (
    <div className="terminal-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <strong>Kill Switch</strong>
        {riskStatusLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
        <button
          onClick={loadRiskStatus}
          style={{ marginLeft: 'auto', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}
        >
          ↻ Refresh
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{
          background: active ? RED + '22' : GREEN + '22',
          border: `1px solid ${active ? RED + '66' : GREEN + '66'}`,
          borderRadius: 10, padding: '14px 20px', textAlign: 'center', minWidth: 160,
        }}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>{active ? '🛑' : '✅'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: active ? RED : GREEN }}>
            {active ? 'KILL SWITCH ACTIVE' : 'Trading Enabled'}
          </div>
          {reason && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{reason}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={enableKillSwitch}
            disabled={killSwitchLoading || active || paperOnly}
            style={{
              background: (active || paperOnly) ? BORDER : RED,
              color: (active || paperOnly) ? MUTED : '#fff',
              border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700,
              cursor: (killSwitchLoading || active || paperOnly) ? 'default' : 'pointer',
              opacity: (killSwitchLoading || active || paperOnly) ? 0.5 : 1,
            }}
          >
            ⛔ Activate Kill Switch
          </button>
          <button
            onClick={disableKillSwitch}
            disabled={killSwitchLoading || !active || paperOnly}
            style={{
              background: (!active || paperOnly) ? BORDER : GREEN,
              color: (!active || paperOnly) ? MUTED : '#000',
              border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700,
              cursor: (killSwitchLoading || !active || paperOnly) ? 'default' : 'pointer',
              opacity: (killSwitchLoading || !active || paperOnly) ? 0.5 : 1,
            }}
          >
            ✅ Resume Trading
          </button>
          {paperOnly && (
            <div style={{ fontSize: 11, color: AMBER }}>⚠ Kill switch is paper-mode only in this build.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Workspace ─────────────────────────────────────────────────────────────────
export default function RiskWorkspace() {
  const { mode } = usePortfolioStore();
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div className="terminal-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong style={{ fontSize: 15 }}>Risk Analytics</strong>
        <ModeBadge mode={mode} />
        <span style={{ color: MUTED, fontSize: 11, marginLeft: 'auto' }}>Mode shared with Portfolio workspace</span>
      </div>
      <KillSwitchPanel />
      <VaRPanel />
      <StressTestPanel />
    </section>
  );
}
