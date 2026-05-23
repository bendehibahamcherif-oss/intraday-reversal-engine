const express = require('express');

const historicalStore = require('../persistence/historicalStore');

const router = express.Router();

router.get('/candles/:symbol', async (req, res) => {
  try {
    const candles = await historicalStore.getCandles(
      req.params.symbol,
      req.query.timeframe || '1m',
      Number(req.query.limit || 500)
    );

    res.json({
      success: true,
      candles,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: 'Failed to load candles',
    });
  }
});

router.get('/ticks/:symbol', async (req, res) => {
  try {
    const ticks = await historicalStore.getTicks(
      req.params.symbol,
      Number(req.query.limit || 1000)
    );

    res.json({
      success: true,
      ticks,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: 'Failed to load ticks',
    });
  }
});

module.exports = router;
