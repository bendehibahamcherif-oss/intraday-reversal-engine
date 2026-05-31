'use strict';

/**
 * Live signal scheduler.
 *
 * Canonical signals: fired on each 1m candle close (provisional=false).
 * Preview signals:   fired on tick/CVD/VP/footprint updates (provisional=true), throttled.
 *
 * Consumers register via onCanonicalSignal(fn) / onPreviewSignal(fn).
 * The scheduler does NOT fetch data — callers push data via the update methods.
 */

const PREVIEW_THROTTLE_MS = 3_000; // max 1 preview per 3s per symbol

const _canonicalHandlers = new Set();
const _previewHandlers   = new Set();
const _lastPreview       = new Map(); // symbol → timestamp
const _lastCanonical     = new Map(); // symbol → { asOf, signal }

function onCanonicalSignal(fn) { _canonicalHandlers.add(fn); return () => _canonicalHandlers.delete(fn); }
function onPreviewSignal(fn)   { _previewHandlers.add(fn);   return () => _previewHandlers.delete(fn); }

function _emit(handlers, payload) {
  for (const fn of handlers) { try { fn(payload); } catch {} }
}

/**
 * Call this when a 1m bar closes.
 * Triggers canonical inference.
 *
 * @param {string} symbol
 * @param {object} marketData  { candles, vwap, vwapTimestamp, poc, volumeProfileTimestamp, cvdHistory, footprintBars, asOf, timeframe }
 * @param {Function} inferFn   async (symbol, marketData, provisional) => signalResult
 */
async function onCandleClose(symbol, marketData, inferFn) {
  try {
    const signal = await inferFn(symbol, marketData, false);
    _lastCanonical.set(symbol, { asOf: signal.asOf, signal });
    _emit(_canonicalHandlers, signal);
  } catch (err) {
    _emit(_canonicalHandlers, { symbol, error: err.message, provisional: false });
  }
}

/**
 * Call this on tick, CVD, VP or footprint update.
 * Fires throttled provisional inference.
 */
async function onLiveUpdate(symbol, marketData, inferFn) {
  const now  = Date.now();
  const last = _lastPreview.get(symbol) || 0;
  if (now - last < PREVIEW_THROTTLE_MS) return; // throttle
  _lastPreview.set(symbol, now);

  try {
    const signal = await inferFn(symbol, marketData, true);
    _emit(_previewHandlers, signal);
  } catch (err) {
    _emit(_previewHandlers, { symbol, error: err.message, provisional: true });
  }
}

/**
 * Schedule nightly retraining after market close (16:00 ET).
 * Returns a cancel function.
 */
function scheduleNightlyRetraining(retrainFn) {
  let timer = null;

  function scheduleNext() {
    const now = new Date();
    const et  = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(now);
    const etParts = Object.fromEntries(et.map((p) => [p.type, Number(p.value)]));
    const etH = etParts.hour || 0;
    const etM = etParts.minute || 0;

    // Target: 16:30 ET (30 min after close)
    let msUntilTarget;
    if (etH < 16 || (etH === 16 && etM < 30)) {
      // Today at 16:30 ET
      const target = new Date(now);
      target.setHours(target.getHours() + (16 - etH));
      target.setMinutes(30 - etM);
      msUntilTarget = target.getTime() - now.getTime();
    } else {
      // Tomorrow at 16:30 ET
      msUntilTarget = (24 - etH + 16) * 3600_000 + (30 - etM) * 60_000;
    }

    timer = setTimeout(async () => {
      try { await retrainFn(); } catch {}
      scheduleNext();
    }, msUntilTarget);
  }

  scheduleNext();
  return () => { if (timer) clearTimeout(timer); };
}

/**
 * Get last canonical signal for a symbol.
 */
function getLastCanonical(symbol) {
  return _lastCanonical.get(symbol)?.signal || null;
}

module.exports = {
  onCanonicalSignal,
  onPreviewSignal,
  onCandleClose,
  onLiveUpdate,
  scheduleNightlyRetraining,
  getLastCanonical,
};
