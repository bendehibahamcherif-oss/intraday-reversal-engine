'use strict';

const { Router } = require('express');
const router = Router();
const engine = require('../institutional/institutionalEngine');

// POST /api/institutional/analysis — persist a sizing analysis with audit trail
router.post('/analysis', (req, res) => {
  try {
    const { type, inputs, outputs, mode = 'paper' } = req.body || {};
    if (!type || !inputs || !outputs) return res.status(400).json({ error: 'type, inputs, outputs required' });

    // Paper/live gate: never record live without explicit mode flag
    if (mode === 'live' && !req.body.liveConfirmed) {
      return res.status(403).json({ error: 'Live mode analysis requires liveConfirmed flag' });
    }

    const auditEntry = {
      id:       `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      mode,
      inputs,
      outputs,
      user:     req.headers['x-user-token'] ? 'authenticated' : 'anonymous',
    };
    engine.recordAudit(auditEntry);

    const exported = engine.buildExport({ type, inputs, outputs, mode });
    res.json({ ok: true, auditId: auditEntry.id, export: exported });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/institutional/sizing/vol — compute and persist vol-based sizing
router.post('/sizing/vol', (req, res) => {
  try {
    const { accountEquity, riskPct, annualizedVol, price, horizon = 1, mode = 'paper' } = req.body || {};
    const result = engine.computeVolSizing({ accountEquity, riskPct, annualizedVol, price, horizon });
    const auditEntry = {
      id:   `vol-${Date.now()}`,
      type: 'vol_sizing', mode,
      inputs: result.inputs, outputs: result,
    };
    engine.recordAudit(auditEntry);
    res.json({ ...result, auditId: auditEntry.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/institutional/sizing/kelly — compute and persist Kelly sizing
router.post('/sizing/kelly', (req, res) => {
  try {
    const { accountEquity, price, winRate, avgWinPct, avgLossPct, kellyFraction, maxAllocationPct, mlConfidence = null, mode = 'paper' } = req.body || {};
    const result = engine.computeKellySizing({ accountEquity, price, winRate, avgWinPct, avgLossPct, kellyFraction, maxAllocationPct, mlConfidence });
    const auditEntry = {
      id:   `kelly-${Date.now()}`,
      type: 'kelly_sizing', mode,
      inputs: result.inputs, outputs: result,
    };
    engine.recordAudit(auditEntry);
    res.json({ ...result, auditId: auditEntry.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/institutional/scenarios — run and persist scenario analysis
router.post('/scenarios', (req, res) => {
  try {
    const { positions, scenarioIds = [], customShock, mode = 'paper', accountEquity } = req.body || {};
    if (!Array.isArray(positions) || !positions.length) return res.status(400).json({ error: 'positions required' });

    const scenariosToRun = [
      ...Object.values(engine.SCENARIO_PACKS).filter((s) => scenarioIds.includes(s.id)),
      ...(scenarioIds.includes('custom') && customShock != null ? [{
        id: 'custom', name: `Custom Shock (${customShock}%)`,
        description: 'User-defined shock', shocks: { equity: Number(customShock) / 100 },
      }] : []),
    ];

    const results = scenariosToRun.map((sc) => engine.applyScenario(positions, sc));

    const auditEntry = {
      id:   `scenario-${Date.now()}`,
      type: 'scenario', mode,
      inputs: { positions, scenarioIds, accountEquity },
      outputs: results,
    };
    engine.recordAudit(auditEntry);

    res.json({ results, auditId: auditEntry.id, runAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/institutional/scenarios — list available scenario packs
router.get('/scenarios', (req, res) => {
  res.json({ scenarios: Object.values(engine.SCENARIO_PACKS) });
});

// GET /api/institutional/audit — retrieve audit log
router.get('/audit', (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  res.json({ entries: engine.getAudit(limit), total: engine.getAudit(200).length });
});

module.exports = router;
