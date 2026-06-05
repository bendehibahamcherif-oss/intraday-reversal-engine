'use strict';

/**
 * Portfolio & Paper-Trading REST routes.
 *
 * Mount at:
 *   app.use('/api/portfolio', portfolioRoutes);
 *   app.use('/api/paper',     portfolioRoutes);
 *
 * These routes return stable empty shapes when no live paper-trading
 * engine is running, ensuring the frontend never receives HTTP 404.
 *
 * GET  /api/portfolio/positions    — open positions list
 * GET  /api/portfolio/pnl          — P&L summary
 * GET  /api/portfolio/exposure     — gross/net/long/short exposure
 * GET  /api/portfolio/drawdown     — drawdown series + max
 * POST /api/portfolio/var          — Value-at-Risk calculation
 * POST /api/portfolio/stress-test  — scenario stress test
 * GET  /api/paper/risk/status      — kill switch & risk state
 * POST /api/paper/risk/kill-switch — enable kill switch
 * DELETE /api/paper/risk/kill-switch — disable kill switch
 */

const { Router } = require('express');

const router = Router();

// ── In-memory kill-switch state (resets on server restart) ───────────────────
let _killSwitchActive = false;

// ── Utility: parse mode query param ─────────────────────────────────────────
function getMode(req) {
  const m = String(req.query?.mode || 'paper').toLowerCase();
  return m === 'live' ? 'live' : 'paper';
}


function portfolioSummary(mode) {
  return {
    ok: true,
    mode,
    summary: {
      equity: 0,
      cash: 0,
      marketValue: 0,
      realized: 0,
      unrealized: 0,
      totalPnl: 0,
      currency: 'USD',
    },
    status: 'no_positions',
    message: 'No portfolio activity yet. Paper trading positions will appear here.',
  };
}

// ── GET /api/portfolio/summary ───────────────────────────────────────────────
router.get('/summary', (req, res) => {
  try { res.json(portfolioSummary(getMode(req))); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /api/portfolio/positions ─────────────────────────────────────────────
router.get('/positions', (req, res) => {
  try {
    const mode = getMode(req);
    res.json({
      ok:        true,
      mode,
      positions: [],
      status:    'no_positions',
      message:   'No open positions. Start paper trading to see positions here.',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/portfolio/pnl ───────────────────────────────────────────────────
router.get('/pnl', (req, res) => {
  try {
    const mode = getMode(req);
    res.json({
      ok:   true,
      mode,
      pnl:  {
        realized:    0,
        unrealized:  0,
        total:       0,
        dailyPnL:    0,
        winRate:     0,
        tradeCount:  0,
        currency:    'USD',
      },
      status:  'no_data',
      message: 'No P&L history. Trades recorded in paper mode will appear here.',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/portfolio/exposure ──────────────────────────────────────────────
router.get('/exposure', (req, res) => {
  try {
    const mode = getMode(req);
    res.json({
      ok:       true,
      mode,
      exposure: {
        gross:    0,
        net:      0,
        long:     0,
        short:    0,
        leverage: 0,
        currency: 'USD',
      },
      status:  'no_positions',
      message: 'No open positions; exposure is zero.',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/portfolio/drawdown ──────────────────────────────────────────────
router.get('/drawdown', (req, res) => {
  try {
    const mode = getMode(req);
    res.json({
      ok:       true,
      mode,
      drawdown: {
        current: 0,
        max:     0,
        currentDrawdown: 0,
        maxDrawdown:     0,
        series:          [],
        currency:        'USD',
      },
      status:  'no_history',
      message: 'No trade history; drawdown series unavailable.',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// ── GET /api/portfolio/history ───────────────────────────────────────────────
router.get('/history', (req, res) => {
  try {
    const mode = getMode(req);
    res.json({ ok: true, mode, history: [], status: 'no_history', message: 'No portfolio history yet.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/portfolio/var ──────────────────────────────────────────────────
router.post('/var', (req, res) => {
  try {
    const mode = getMode(req);
    const { confidence = 0.95, horizon = 1 } = req.body || {};
    res.json({
      ok:   true,
      mode,
      var:  {
        value:      0,
        confidence: Number(confidence),
        method:     'historical',
        horizon:    Number(horizon),
        currency:   'USD',
      },
      status:  'no_positions',
      message: 'VaR is zero — no open positions.',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/portfolio/stress-test ──────────────────────────────────────────
router.post('/stress-test', (req, res) => {
  try {
    const mode = getMode(req);
    res.json({
      ok:     true,
      mode,
      result: {
        scenarios: [],
        runAt:     new Date().toISOString(),
      },
      status:  'no_positions',
      message: 'No open positions; stress test has no effect.',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/paper/risk/status ────────────────────────────────────────────────
router.get('/risk/status', (req, res) => {
  try {
    res.json({
      ok:          true,
      killSwitch:  _killSwitchActive,
      riskLevel:   'normal',
      mode:        'paper',
      positionCount: 0,
      grossExposure: 0,
      timestamp:   new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/paper/risk/kill-switch ─────────────────────────────────────────
router.post('/risk/kill-switch', (req, res) => {
  try {
    _killSwitchActive = true;
    res.json({ ok: true, killSwitch: true, message: 'Kill switch activated (paper mode).', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /api/paper/risk/kill-switch ───────────────────────────────────────
router.delete('/risk/kill-switch', (req, res) => {
  try {
    _killSwitchActive = false;
    res.json({ ok: true, killSwitch: false, message: 'Kill switch deactivated (paper mode).', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
