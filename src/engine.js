// ============ ENGINE: pure decision logic ============
// Calcule la décision bayésienne pour un ticker à partir des données Yahoo brutes.

import { api } from './api.js';

// ---- Indicators ----
export function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgG = gains / period, avgL = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

export function atr(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c),
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

export function avgRange(bars, period = 20) {
  if (bars.length < period) return null;
  const recent = bars.slice(-period);
  return recent.reduce((a, b) => a + (b.h - b.l), 0) / period;
}

export function firstHourOR(intradayBars) {
  if (!intradayBars.length) return null;
  const lastDay = new Date(intradayBars[intradayBars.length - 1].t).toISOString().slice(0, 10);
  const today = intradayBars.filter(b => new Date(b.t).toISOString().slice(0, 10) === lastDay);
  if (today.length < 1) return null;
  const firstTs = today[0].t;
  const firstHour = today.filter(b => b.t - firstTs <= 60 * 60 * 1000);
  if (!firstHour.length) return null;
  return {
    high: Math.max(...firstHour.map(b => b.h)),
    low: Math.min(...firstHour.map(b => b.l)),
    minutesElapsed: Math.round((today[today.length - 1].t - firstTs) / 60000),
  };
}

// ---- Yahoo parser ----
export function parseYahoo(data) {
  const result = data.chart.result[0];
  const ts = result.timestamp || [];
  const quote = result.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    if (quote.close[i] == null) continue;
    bars.push({
      t: ts[i] * 1000,
      o: quote.open[i], h: quote.high[i], l: quote.low[i], c: quote.close[i],
      v: quote.volume[i] || 0,
    });
  }
  return { bars, meta: result.meta };
}

export async function fetchYahoo(symbol, interval, range) {
  const data = await api.yahooChart(symbol, interval, range);
  if (!data?.chart?.result?.[0]) throw new Error('Empty result');
  return parseYahoo(data);
}

// ---- Per-timeframe indicators ----
export function computeTfIndicators(tfData) {
  const out = {};
  Object.entries(tfData).forEach(([k, data]) => {
    if (!data?.bars?.length) { out[k] = null; return; }
    const bars = data.bars;
    const closes = bars.map(b => b.c);
    const last = bars[bars.length - 1];
    const ema20 = ema(closes.slice(-50), 20);
    const ema50 = closes.length >= 50 ? ema(closes, 50) : null;
    const rsiVal = rsi(closes.slice(-30), 14);
    const change = bars.length > 1 ? (last.c - bars[bars.length - 2].c) : 0;
    const changePct = bars.length > 1 ? (change / bars[bars.length - 2].c) * 100 : 0;

    let trend = 'neutral';
    if (ema20 && ema50) {
      if (last.c > ema20 && ema20 > ema50) trend = 'up';
      else if (last.c < ema20 && ema20 < ema50) trend = 'down';
      else trend = 'mixed';
    } else if (ema20) {
      trend = last.c > ema20 ? 'up' : 'down';
    }
    out[k] = { last: last.c, ema20, ema50, rsi: rsiVal, trend, change, changePct };
  });
  return out;
}

// ---- Price selection based on market state ----
// Yahoo's marketState is unreliable in early pre-market (4h-6h ET) and late post-market.
// We use a hybrid approach: trust marketState when it says PRE/POST, but ALSO infer from timestamps
// — if preMarketTime > regularMarketTime, we're in pre-market regardless of marketState.
export function selectPrices(meta) {
  if (!meta) return { currentPrice: null, prevClose: null, priceSource: null };

  const marketState = meta.marketState || null;
  const hasPre = meta.preMarketPrice != null && meta.preMarketPrice > 0;
  const hasPost = meta.postMarketPrice != null && meta.postMarketPrice > 0;
  const regTime = meta.regularMarketTime || 0;
  const preTime = meta.preMarketTime || 0;
  const postTime = meta.postMarketTime || 0;

  // PRE-MARKET: trust marketState, OR infer from timestamps (preMarketTime more recent than regularMarketTime AND no post-market)
  const isPreMarketByState = (marketState === 'PRE' || marketState === 'PREPRE');
  const isPreMarketByTime = hasPre && preTime > regTime && !(hasPost && postTime > preTime);
  if ((isPreMarketByState || isPreMarketByTime) && hasPre) {
    return {
      currentPrice: meta.preMarketPrice,
      prevClose: meta.regularMarketPrice,
      priceSource: 'PRE-MARKET',
      priceTimestamp: meta.preMarketTime,
      marketState,
    };
  }

  // POST-MARKET
  const isPostMarketByState = (marketState === 'POST' || marketState === 'POSTPOST');
  const isPostMarketByTime = hasPost && postTime > regTime;
  if ((isPostMarketByState || isPostMarketByTime) && hasPost) {
    return {
      currentPrice: meta.postMarketPrice,
      prevClose: meta.regularMarketPrice,
      priceSource: isPostMarketByState ? 'POST-MARKET' : 'POST-MARKET (clos)',
      priceTimestamp: meta.postMarketTime,
      marketState,
    };
  }

  // LIVE regular session
  if (marketState === 'REGULAR') {
    return {
      currentPrice: meta.regularMarketPrice,
      prevClose: meta.previousClose,
      priceSource: 'LIVE',
      priceTimestamp: meta.regularMarketTime,
      marketState,
    };
  }

  // CLOSED fallback
  return {
    currentPrice: meta.regularMarketPrice,
    prevClose: meta.previousClose,
    priceSource: 'CLÔTURÉ',
    priceTimestamp: meta.regularMarketTime,
    marketState,
  };
}

// ---- Bayesian engine ----
// Takes pre-computed data and toggle states, returns { decision, posterior, ... }.
// This is the pure function; UI handles its own state.
export function computeDecision({
  currentPrice, prevClose, atr14, avgDailyRange20, vix,
  firstHourHigh, firstHourLow, minutesSinceOpen,
  direction, premarketBreadth,
  tfIndicators,
  // Filter toggles
  isFomc = false, isEarnings = false, isMacroData = false,
  isOpex = false, isMonthEnd = false, isVixExpiry = false,
  // Confirmations (manual)
  failedRetest = false, volumeDivergence = false, rejectionCandle = false,
}) {
  if (currentPrice == null || prevClose == null || atr14 == null || avgDailyRange20 == null) {
    return { decision: 'EN ATTENTE', decisionColor: 'wait', decisionReason: 'Données insuffisantes', posterior: 0.5, signals: [], hardBlocked: true };
  }

  const gap = currentPrice - prevClose;
  const gapPct = (gap / prevClose) * 100;
  const gapAtrRatio = Math.abs(gap) / atr14;
  const firstHourRange = (firstHourHigh && firstHourLow) ? firstHourHigh - firstHourLow : 0;
  const firstHourPctOfDaily = firstHourRange > 0 ? (firstHourRange / avgDailyRange20) * 100 : 0;

  // Regimes
  const vixVal = vix ?? 18;
  let vixRegime, vixLR;
  if (vixVal < 12) { vixRegime = 'too_low'; vixLR = 0.9; }
  else if (vixVal <= 25) { vixRegime = 'optimal'; vixLR = 1.4; }
  else if (vixVal <= 30) { vixRegime = 'caution'; vixLR = 0.7; }
  else { vixRegime = 'too_high'; vixLR = 0.4; }

  let gapRegime, gapLR;
  if (gapAtrRatio < 0.5) { gapRegime = 'small'; gapLR = 1.3; }
  else if (gapAtrRatio < 1.0) { gapRegime = 'moderate'; gapLR = 1.5; }
  else if (gapAtrRatio < 1.5) { gapRegime = 'large'; gapLR = 0.8; }
  else { gapRegime = 'extreme'; gapLR = 0.3; }

  let trendRisk, trendLR;
  if (firstHourPctOfDaily === 0) { trendRisk = 'unknown'; trendLR = 1.0; }
  else if (firstHourPctOfDaily < 30) { trendRisk = 'low'; trendLR = 1.5; }
  else if (firstHourPctOfDaily < 50) { trendRisk = 'moderate'; trendLR = 1.0; }
  else { trendRisk = 'high'; trendLR = 0.4; }

  let breadthRegime, breadthLR;
  if (premarketBreadth < 60) { breadthRegime = 'mixed'; breadthLR = 1.3; }
  else if (premarketBreadth < 75) { breadthRegime = 'leaning'; breadthLR = 0.9; }
  else { breadthRegime = 'one_sided'; breadthLR = 0.5; }

  // MTF alignment
  let mtfAlignment = 'neutral';
  const tfTrends = ['5m', '15m', '30m', '1h'].map(k => tfIndicators?.[k]?.trend).filter(Boolean);
  if (tfTrends.length >= 3) {
    const upCount = tfTrends.filter(t => t === 'up').length;
    const downCount = tfTrends.filter(t => t === 'down').length;
    if (direction === 'fade_up') {
      if (upCount === tfTrends.length) mtfAlignment = 'against_fade';
      else if (downCount >= tfTrends.length / 2) mtfAlignment = 'supports_fade';
    } else {
      if (downCount === tfTrends.length) mtfAlignment = 'against_fade';
      else if (upCount >= tfTrends.length / 2) mtfAlignment = 'supports_fade';
    }
  }
  const mtfLR = mtfAlignment === 'supports_fade' ? 1.5 : mtfAlignment === 'against_fade' ? 0.5 : 1.0;

  // RSI intraday extreme
  const rsi5m = tfIndicators?.['5m']?.rsi;
  const rsi15m = tfIndicators?.['15m']?.rsi;
  let rsiExtremeLR = 1.0;
  if (direction === 'fade_up') {
    if ((rsi5m && rsi5m > 75) || (rsi15m && rsi15m > 70)) rsiExtremeLR = 1.5;
    else if ((rsi5m && rsi5m < 55) && (rsi15m && rsi15m < 55)) rsiExtremeLR = 0.7;
  } else {
    if ((rsi5m && rsi5m < 25) || (rsi15m && rsi15m < 30)) rsiExtremeLR = 1.5;
    else if ((rsi5m && rsi5m > 45) && (rsi15m && rsi15m > 45)) rsiExtremeLR = 0.7;
  }

  const newsBlock = isFomc || isEarnings || isMacroData;
  const cautionDay = isOpex || isMonthEnd || isVixExpiry;
  const vixBlock = vixRegime === 'too_high';
  const gapBlock = gapRegime === 'extreme';
  const trendBlock = trendRisk === 'high';
  const timeBlock = minutesSinceOpen < 60;
  const mtfBlock = mtfAlignment === 'against_fade';
  const hardBlocked = newsBlock || vixBlock || gapBlock || trendBlock || timeBlock;

  const prior = 0.55;
  let odds = prior / (1 - prior);
  const signals = [
    { name: 'VIX', lr: vixLR },
    { name: 'Gap/ATR', lr: gapLR },
    { name: 'Range 1H', lr: trendLR },
    { name: 'Breadth', lr: breadthLR },
    { name: 'MTF', lr: mtfLR },
    { name: 'RSI', lr: rsiExtremeLR },
  ];
  if (failedRetest) signals.push({ name: 'Retest', lr: 2.0 });
  if (volumeDivergence) signals.push({ name: 'Volume', lr: 1.6 });
  if (rejectionCandle) signals.push({ name: 'Candle', lr: 1.4 });
  signals.forEach(s => { odds *= s.lr; });
  const posterior = odds / (1 + odds);

  let decision, decisionColor, decisionReason, sizeMultiplier = 0;
  if (newsBlock) { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = 'News/earnings/FOMC.'; }
  else if (timeBlock) { decision = 'ATTENDRE'; decisionColor = 'wait'; decisionReason = `Trop tôt (${60 - minutesSinceOpen}min restantes).`; }
  else if (vixBlock) { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = 'VIX > 30.'; }
  else if (gapBlock) { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = 'Gap > 1.5× ATR.'; }
  else if (trendBlock) { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = 'Trend day probable.'; }
  else if (mtfBlock) { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = 'MTF contre le fade.'; }
  else if (!failedRetest || !rejectionCandle) { decision = 'ATTENDRE SETUP'; decisionColor = 'wait'; decisionReason = 'Setup pas confirmé.'; }
  else if (posterior >= 0.75) { decision = 'ACHETER'; decisionColor = 'buy'; sizeMultiplier = 1.0; decisionReason = `P=${(posterior*100).toFixed(1)}%.`; }
  else if (posterior >= 0.65) { decision = 'ACHETER 1/2'; decisionColor = 'buy_small'; sizeMultiplier = 0.5; decisionReason = `P=${(posterior*100).toFixed(1)}%.`; }
  else { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = `P=${(posterior*100).toFixed(1)}% insuffisant.`; }
  if (cautionDay && sizeMultiplier > 0) sizeMultiplier *= 0.5;

  return {
    gap, gapPct, gapAtrRatio, firstHourRange, firstHourPctOfDaily,
    vixRegime, gapRegime, trendRisk, breadthRegime, mtfAlignment,
    hardBlocked, signals, prior, posterior,
    decision, decisionColor, decisionReason, sizeMultiplier,
  };
}

// ---- Full ticker scan: fetches, computes, returns decision ----
export async function scanTicker(symbol, vix = null) {
  const configs = [['1m', '1m', '1d'], ['5m', '5m', '5d'], ['15m', '15m', '1mo'], ['30m', '30m', '1mo'], ['1h', '60m', '3mo'], ['1d', '1d', '6mo']];
  const results = await Promise.allSettled(
    configs.map(([k, interval, range]) => fetchYahoo(symbol, interval, range).then(r => [k, r]))
  );
  const tfData = {};
  results.forEach(r => { if (r.status === 'fulfilled') tfData[r.value[0]] = r.value[1]; });
  if (!tfData['1d'] || !tfData['5m']) throw new Error(`Données insuffisantes pour ${symbol}`);

  const daily = tfData['1d'].bars;
  const intraday = tfData['5m'].bars;
  const meta = tfData['1d'].meta || tfData['5m'].meta;
  const { currentPrice, prevClose, priceSource, priceTimestamp, marketState } = selectPrices(meta);
  const atr14 = atr(daily.slice(-30), 14);
  const avgDailyRange20 = avgRange(daily, 20);
  const or = firstHourOR(intraday);
  const tfIndicators = computeTfIndicators(tfData);

  const direction = currentPrice > prevClose ? 'fade_up' : 'fade_down';

  const calc = computeDecision({
    currentPrice, prevClose, atr14, avgDailyRange20, vix,
    firstHourHigh: or?.high, firstHourLow: or?.low,
    minutesSinceOpen: or?.minutesElapsed ?? 0,
    direction, premarketBreadth: 62,
    tfIndicators,
    // Filter/confirmation toggles default to false in scan mode (no user input for non-active tickers)
  });

  return {
    symbol, currentPrice, prevClose, priceSource, priceTimestamp, marketState,
    direction, posterior: calc.posterior, decision: calc.decision, decisionColor: calc.decisionColor,
    decisionReason: calc.decisionReason, calc, tfIndicators, atr14, or,
  };
}
