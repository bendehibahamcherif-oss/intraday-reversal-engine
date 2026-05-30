'use strict';

const logger = require('../observability/logger');

/**
 * US equity market session guardrails.
 *
 * US Regular Trading Hours (RTH): Mon–Fri 09:30–16:00 America/New_York.
 * Uses Intl.DateTimeFormat — no external deps.
 *
 * Functions:
 *   getSessionState()  — { state, isOpen, etTime, nextEvent }
 *   guardLiveOrder()   — Express middleware: rejects live orders outside RTH
 *   isMarketOpen()     — boolean (synchronous, cheap)
 */

const TRADING_DAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

// US market holidays 2026 (extend as needed)
const HOLIDAYS_2026 = new Set([
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-11-27', // Thanksgiving (Friday)
  '2026-12-25', // Christmas
]);

function getETComponents(now = new Date()) {
  // Use Intl to get New York time parts — handles DST automatically
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  return {
    weekday:   parts.weekday,                                  // 'Mon', 'Tue', ...
    dateStr:   `${parts.year}-${parts.month}-${parts.day}`,   // 'YYYY-MM-DD'
    hour:      parseInt(parts.hour, 10),                       // 0–23
    minute:    parseInt(parts.minute, 10),
    second:    parseInt(parts.second, 10),
    etString:  fmt.format(now),
  };
}

function getSessionState(now = new Date()) {
  const { weekday, dateStr, hour, minute, etString } = getETComponents(now);

  const minutesFromMidnight = hour * 60 + minute;
  const openMinutes  = 9 * 60 + 30;   // 09:30
  const closeMinutes = 16 * 60;        // 16:00

  const isWeekday  = TRADING_DAYS.has(weekday);
  const isHoliday  = HOLIDAYS_2026.has(dateStr);
  const isTradeDay = isWeekday && !isHoliday;

  let state, isOpen;
  if (!isTradeDay) {
    state  = isHoliday ? 'HOLIDAY' : 'WEEKEND';
    isOpen = false;
  } else if (minutesFromMidnight < openMinutes) {
    state  = 'PRE_MARKET';
    isOpen = false;
  } else if (minutesFromMidnight < closeMinutes) {
    state  = 'OPEN';
    isOpen = true;
  } else {
    state  = 'AFTER_HOURS';
    isOpen = false;
  }

  // Next event timestamp
  let nextEvent = null;
  if (isTradeDay) {
    if (minutesFromMidnight < openMinutes) {
      nextEvent = { event: 'open',  minutesAway: openMinutes  - minutesFromMidnight };
    } else if (minutesFromMidnight < closeMinutes) {
      nextEvent = { event: 'close', minutesAway: closeMinutes - minutesFromMidnight };
    }
  }

  return { state, isOpen, etString, weekday, dateStr, hour, minute, nextEvent };
}

function isMarketOpen(now = new Date()) {
  return getSessionState(now).isOpen;
}

/**
 * Express middleware: rejects live order requests outside market hours.
 * Apply only to routes that route live orders:
 *   app.use('/api/execution/order', guardLiveOrder());
 *
 * Paper mode is always allowed — checks req.query.mode or req.body.mode.
 */
function guardLiveOrder() {
  const blocked = process.env.BLOCK_LIVE_OUTSIDE_HOURS !== 'false'; // default: block

  return function marketSessionGuard(req, res, next) {
    const mode = req.query?.mode || req.body?.mode || 'paper';
    if (mode !== 'live') return next(); // paper always passes

    if (blocked && !isMarketOpen()) {
      const session = getSessionState();
      logger.warn('live_order_blocked_outside_hours', {
        correlationId: req.correlationId,
        session: session.state,
        etTime: session.etString,
      });
      return res.status(403).json({
        error: 'Live order routing is only permitted during US equity market hours (09:30–16:00 ET, Mon–Fri)',
        session: session.state,
        etTime: session.etString,
        nextEvent: session.nextEvent,
      });
    }

    next();
  };
}

module.exports = { getSessionState, isMarketOpen, guardLiveOrder, getETComponents };
