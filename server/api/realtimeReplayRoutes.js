const express = require('express');
const replayCoordinator = require('../realtime/replayCoordinator');

const router = express.Router();

router.post('/start', async (req, res) => {
  try {
    const {
      symbol,
      timeframe,
      speed,
    } = req.body;

    const result = await replayCoordinator.startFullReplay(
      symbol,
      {
        timeframe,
        speed,
      }
    );

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: 'Replay start failed',
    });
  }
});

module.exports = router;
