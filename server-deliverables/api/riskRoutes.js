'use strict';

const { Router } = require('express');

const router = Router();

const emptyRisk = {
  status: 'not_enough_data',
  var95: null,
  expectedShortfall: null,
  grossExposure: 0,
  netExposure: 0,
  maxDrawdown: 0,
};

router.get('/summary', (_req, res) => res.json({ ok: true, risk: { ...emptyRisk }, status: 'not_enough_data' }));
router.get('/limits', (_req, res) => res.json({ ok: true, limits: [], status: 'not_configured' }));
router.get('/var', (_req, res) => res.json({ ok: true, var: { confidence: 0.95, value: null, currency: 'USD', status: 'not_enough_data' } }));
router.get('/drawdown', (_req, res) => res.json({ ok: true, drawdown: { current: 0, max: 0, series: [] }, status: 'no_history' }));
router.get('/exposure', (_req, res) => res.json({ ok: true, exposure: { gross: 0, net: 0, long: 0, short: 0 }, risk: { ...emptyRisk }, status: 'no_positions' }));
router.get('/alerts', (_req, res) => res.json({ ok: true, alerts: [], status: 'no_alerts' }));

module.exports = router;
