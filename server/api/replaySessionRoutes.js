const express = require('express');
const replayControlEngine = require('../realtime/replayControlEngine');

const router = express.Router();

router.post('/start', async (req, res) => {
  try {
    const { sessionId, symbol, options } = req.body;

    const result = await replayControlEngine.start(
      sessionId,
      symbol,
      options || {}
    );

    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

router.post('/pause', (req, res) => {
  const result = replayControlEngine.pause(req.body.sessionId);
  res.json({ success: true, result });
});

router.post('/resume', (req, res) => {
  const result = replayControlEngine.resume(req.body.sessionId);
  res.json({ success: true, result });
});

router.post('/stop', (req, res) => {
  const result = replayControlEngine.stop(req.body.sessionId);
  res.json({ success: true, result });
});

module.exports = router;
