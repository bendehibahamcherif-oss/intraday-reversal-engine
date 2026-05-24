const express = require('express');
const runtimeStatusAggregator = require('./runtimeStatusAggregator');

const router = express.Router();

router.get('/runtime-status', (req, res) => {
  res.json({
    success: true,
    status: runtimeStatusAggregator.aggregate(),
  });
});

module.exports = router;
