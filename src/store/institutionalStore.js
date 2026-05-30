import { create } from 'zustand';
import { api } from '../api.js';

const errMsg = (e) => e?.message || 'Institutional error';

// ── Pre-defined scenario packs ─────────────────────────────────────────────────
export const SCENARIO_PACKS = [
  {
    id: 'crisis_2008',
    name: '2008 Financial Crisis',
    description: 'Global financial crisis — Lehman collapse, credit freeze',
    shocks: { equity: -0.50, bonds: 0.10, commodities: -0.30 },
  },
  {
    id: 'covid_2020',
    name: '2020 COVID Crash',
    description: 'Pandemic shock — fastest 30% drawdown in history',
    shocks: { equity: -0.35, bonds: 0.08, commodities: -0.45 },
  },
  {
    id: 'rate_shock_2022',
    name: '2022 Rate Shock',
    description: 'Fed hiking cycle — bonds −20%, equities −25%',
    shocks: { equity: -0.25, bonds: -0.20, commodities: 0.10 },
  },
  {
    id: 'flash_crash',
    name: 'Flash Crash',
    description: 'Intraday circuit-breaker event — rapid −10%',
    shocks: { equity: -0.10, bonds: 0.05, commodities: -0.05 },
  },
  {
    id: 'tech_correction',
    name: 'Tech Sector Correction',
    description: 'Growth/tech rotation — growth names −30%',
    shocks: { equity: -0.15, bonds: 0.05, commodities: 0.02 },
  },
];

// ── Sizing formulas (deterministic, frontend-executable) ──────────────────────
export function computeVolSizing({ accountEquity, riskPct, annualizedVol, price, horizon = 1 }) {
  const eq  = Number(accountEquity);
  const rp  = Number(riskPct) / 100;
  const vol = Number(annualizedVol) / 100;
  const px  = Number(price);
  const h   = Math.max(1, Number(horizon));

  if (!eq || !rp || !vol || !px) return null;

  const targetRisk  = eq * rp;
  const dailyVol    = vol / Math.sqrt(252);
  const periodVol   = dailyVol * Math.sqrt(h);
  const notional    = targetRisk / periodVol;
  const shares      = Math.max(1, Math.floor(notional / px));
  const actualNotional = shares * px;
  const dollarRisk  = actualNotional * periodVol;

  return {
    method: 'volatility_target',
    targetRisk: round(targetRisk, 2),
    dailyVol:   round(dailyVol * 100, 4),   // %
    periodVol:  round(periodVol * 100, 4),  // %
    notional:   round(notional, 2),
    shares,
    actualNotional: round(actualNotional, 2),
    dollarRisk: round(dollarRisk, 2),
    inputs: { accountEquity: eq, riskPct: Number(riskPct), annualizedVol: Number(annualizedVol), price: px, horizon: h },
  };
}

export function computeKellySizing({ accountEquity, price, winRate, avgWinPct, avgLossPct, kellyFraction = 0.5, maxAllocationPct = 25, mlConfidence = null }) {
  const eq   = Number(accountEquity);
  const px   = Number(price);
  const wr   = mlConfidence !== null ? Math.max(0.01, Math.min(0.99, Number(mlConfidence))) : Math.max(0.01, Math.min(0.99, Number(winRate) / 100));
  const bWin = Math.max(0.001, Number(avgWinPct) / 100);
  const bLos = Math.max(0.001, Number(avgLossPct) / 100);
  const kf   = Math.max(0.01, Math.min(1, Number(kellyFraction)));
  const maxA = Math.max(1, Math.min(100, Number(maxAllocationPct))) / 100;

  if (!eq || !px) return null;

  // Full Kelly: f* = (p*b - q) / b  where b = avgWin/avgLoss odds ratio
  const odds     = bWin / bLos;
  const fullKelly = Math.max(0, (wr * odds - (1 - wr)) / odds);
  const cappedKelly = Math.min(fullKelly * kf, maxA);
  const notional = eq * cappedKelly;
  const shares   = Math.max(0, Math.floor(notional / px));
  const actualNotional = shares * px;

  return {
    method: 'capped_kelly',
    fullKelly:    round(fullKelly * 100, 2),   // %
    cappedKelly:  round(cappedKelly * 100, 2), // %
    odds:         round(odds, 3),
    notional:     round(notional, 2),
    shares,
    actualNotional: round(actualNotional, 2),
    usedMlConfidence: mlConfidence !== null,
    inputs: {
      accountEquity: eq, price: px,
      winRate: round(wr * 100, 2), avgWinPct: Number(avgWinPct), avgLossPct: Number(avgLossPct),
      kellyFraction: kf, maxAllocationPct: Number(maxAllocationPct),
      mlConfidence: mlConfidence !== null ? round(Number(mlConfidence) * 100, 1) : null,
    },
  };
}

// Apply a scenario shock to a position list and compute P&L impact
export function applyScenario(positions, scenario) {
  if (!Array.isArray(positions) || !positions.length) return null;
  const results = positions.map((pos) => {
    const notional = Number(pos.shares) * Number(pos.price);
    const assetClass = (pos.assetClass || 'equity').toLowerCase();
    const shock = scenario.shocks[assetClass] ?? scenario.shocks.equity ?? 0;
    const pnl = notional * shock;
    return { symbol: pos.symbol, shares: pos.shares, price: pos.price, notional: round(notional, 2), shock: round(shock * 100, 2), pnl: round(pnl, 2) };
  });
  const totalNotional = results.reduce((s, r) => s + r.notional, 0);
  const totalPnl      = results.reduce((s, r) => s + r.pnl, 0);
  const pctImpact     = totalNotional > 0 ? totalPnl / totalNotional : 0;
  return {
    scenarioId:   scenario.id,
    scenarioName: scenario.name,
    positions:    results,
    totalNotional: round(totalNotional, 2),
    totalPnl:     round(totalPnl, 2),
    pctImpact:    round(pctImpact * 100, 2),
    runAt:        new Date().toISOString(),
  };
}

function round(n, d) { return Math.round(n * 10 ** d) / 10 ** d; }

// ── Store ──────────────────────────────────────────────────────────────────────
export const useInstitutionalStore = create((set, get) => ({
  // ── Config ─────────────────────────────────────────────────────────────────
  accountEquity:    100000,
  riskPct:          1,
  mode:             'paper',

  // ── Vol sizing inputs ───────────────────────────────────────────────────────
  volSymbol:        'SPY',
  volPrice:         500,
  volAnnualizedVol: 16,  // %
  volHorizon:       1,
  volResult:        null,

  // ── Kelly sizing inputs ─────────────────────────────────────────────────────
  kellySymbol:      'SPY',
  kellyPrice:       500,
  kellyWinRate:     55,  // %
  kellyAvgWin:      2,   // %
  kellyAvgLoss:     1,   // %
  kellyFraction:    0.5,
  kellyMaxAlloc:    25,  // %
  kellyUseMl:       false,
  kellyMlConfidence: null,
  kellyResult:      null,

  // ── Scenario analysis ───────────────────────────────────────────────────────
  positions: [
    { symbol: 'SPY', shares: 100, price: 500, assetClass: 'equity' },
  ],
  selectedScenarios:  ['crisis_2008', 'covid_2020'],
  customShock:        -10,
  scenarioResults:    [],
  scenarioLoading:    false,
  scenarioError:      '',

  // ── Audit trail (session-local) ─────────────────────────────────────────────
  auditLog:           [],

  // ── Export ─────────────────────────────────────────────────────────────────
  exportLoading:      false,
  exportError:        '',

  // ── Server results ──────────────────────────────────────────────────────────
  serverSizingLoading:  false,
  serverSizingError:    '',
  serverScenarioLoading: false,
  serverScenarioError:   '',

  // ── Setters ─────────────────────────────────────────────────────────────────
  setAccountEquity: (v) => set({ accountEquity: Math.max(0, Number(v) || 0) }),
  setRiskPct:       (v) => set({ riskPct: Math.max(0.01, Math.min(50, Number(v) || 1)) }),
  setMode:          (v) => set({ mode: v }),
  setVolField:      (k, v) => set({ [k]: v }),
  setKellyField:    (k, v) => set({ [k]: v }),
  setKellyUseMl:    (v) => set({ kellyUseMl: v }),

  updatePosition: (idx, field, value) => set((s) => {
    const positions = [...s.positions];
    positions[idx] = { ...positions[idx], [field]: value };
    return { positions };
  }),
  addPosition: () => set((s) => ({
    positions: [...s.positions, { symbol: '', shares: 100, price: 100, assetClass: 'equity' }],
  })),
  removePosition: (idx) => set((s) => ({
    positions: s.positions.filter((_, i) => i !== idx),
  })),
  toggleScenario: (id) => set((s) => ({
    selectedScenarios: s.selectedScenarios.includes(id)
      ? s.selectedScenarios.filter((x) => x !== id)
      : [...s.selectedScenarios, id],
  })),
  setCustomShock: (v) => set({ customShock: Number(v) || 0 }),
  clearErrors: () => set({ scenarioError: '', exportError: '', serverSizingError: '', serverScenarioError: '' }),

  // ── Compute vol sizing (client-side + optional server persist) ─────────────
  computeVolSizing: () => {
    const s = get();
    const result = computeVolSizing({
      accountEquity: s.accountEquity, riskPct: s.riskPct,
      annualizedVol: s.volAnnualizedVol, price: s.volPrice, horizon: s.volHorizon,
    });
    if (!result) return;
    const entry = { id: uid(), type: 'vol_sizing', result, timestamp: new Date().toISOString(), mode: s.mode };
    set((st) => ({ volResult: result, auditLog: [entry, ...st.auditLog].slice(0, 50) }));

    // Optionally persist to server (fire and forget)
    api.persistInstitutionalAnalysis({ type: 'vol_sizing', inputs: result.inputs, outputs: result, mode: s.mode })
      .catch(() => {});
  },

  // ── Compute Kelly sizing (client-side + optional server persist) ─────────
  computeKellySizing: () => {
    const s = get();
    const mlConf = s.kellyUseMl && s.kellyMlConfidence !== null ? s.kellyMlConfidence : null;
    const result = computeKellySizing({
      accountEquity: s.accountEquity, price: s.kellyPrice,
      winRate: s.kellyWinRate, avgWinPct: s.kellyAvgWin, avgLossPct: s.kellyAvgLoss,
      kellyFraction: s.kellyFraction, maxAllocationPct: s.kellyMaxAlloc, mlConfidence: mlConf,
    });
    if (!result) return;
    const entry = { id: uid(), type: 'kelly_sizing', result, timestamp: new Date().toISOString(), mode: s.mode };
    set((st) => ({ kellyResult: result, auditLog: [entry, ...st.auditLog].slice(0, 50) }));

    api.persistInstitutionalAnalysis({ type: 'kelly_sizing', inputs: result.inputs, outputs: result, mode: s.mode })
      .catch(() => {});
  },

  // ── Set ML confidence from inference result ───────────────────────────────
  setMlConfidenceFromInference: (confidence) => set({ kellyMlConfidence: confidence }),

  // ── Run scenario analysis ──────────────────────────────────────────────────
  runScenarios: async () => {
    const { positions, selectedScenarios, customShock, accountEquity, mode } = get();
    set({ scenarioLoading: true, scenarioError: '', scenarioResults: [] });
    try {
      const scenarios = [
        ...SCENARIO_PACKS.filter((s) => selectedScenarios.includes(s.id)),
        ...(selectedScenarios.includes('custom') ? [{
          id: 'custom', name: `Custom Shock (${customShock > 0 ? '+' : ''}${customShock}%)`,
          description: 'User-defined shock', shocks: { equity: customShock / 100 },
        }] : []),
      ];
      const results = scenarios.map((sc) => applyScenario(positions, sc)).filter(Boolean);

      // Audit entries
      const entries = results.map((r) => ({
        id: uid(), type: 'scenario', scenarioId: r.scenarioId,
        result: r, timestamp: r.runAt, mode,
        meta: { accountEquity, positionCount: positions.length },
      }));

      set((s) => ({ scenarioResults: results, scenarioLoading: false, auditLog: [...entries, ...s.auditLog].slice(0, 50) }));

      // Server persist (optional)
      api.persistInstitutionalScenarios({ results, positions, mode, accountEquity })
        .catch(() => {});
    } catch (e) {
      set({ scenarioLoading: false, scenarioError: errMsg(e) });
    }
  },

  // ── Export ─────────────────────────────────────────────────────────────────
  exportReport: () => {
    const s = get();
    const report = {
      exportedAt: new Date().toISOString(),
      mode: s.mode,
      assumptions: {
        accountEquity: s.accountEquity,
        riskPct: s.riskPct,
      },
      volSizing: s.volResult,
      kellySizing: s.kellyResult,
      scenarioResults: s.scenarioResults,
      positions: s.positions,
      auditLog: s.auditLog.slice(0, 20),
    };

    // Trigger browser download
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `institutional-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // CSV export
    if (s.scenarioResults.length) {
      const rows = [['Scenario', 'Total Notional', 'P&L Impact', 'P&L %']];
      s.scenarioResults.forEach((r) => {
        rows.push([r.scenarioName, r.totalNotional, r.totalPnl, r.pctImpact]);
      });
      const csv = rows.map((r) => r.join(',')).join('\n');
      const csvBlob = new Blob([csv], { type: 'text/csv' });
      const csvUrl = URL.createObjectURL(csvBlob);
      const b = document.createElement('a');
      b.href = csvUrl;
      b.download = `scenarios-${new Date().toISOString().slice(0, 10)}.csv`;
      b.click();
      URL.revokeObjectURL(csvUrl);
    }
  },
}));

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }
