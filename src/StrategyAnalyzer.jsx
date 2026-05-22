import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { loadSettings, saveSettings } from './storage.js';
import SettingsModal from './SettingsModal.jsx';
import AIAnalysisPanel from './AIAnalysisPanel.jsx';

// ============ DATA FETCHING ============
// Backend URL configurable via env var (VITE_API_BASE). Fallback to localhost in dev.
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:10000';

// Fallback public proxies (used only if backend is unreachable)
const PUBLIC_PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

async function fetchYahooChart(symbol, interval, range) {
  // Primary: our own backend proxy
  try {
    const res = await fetch(`${API_BASE}/yahoo/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
    const data = await res.json();
    if (data?.chart?.error) throw new Error(data.chart.error.description);
    if (!data?.chart?.result?.[0]) throw new Error('Empty result');
    return parseYahooResponse(data);
  } catch (backendErr) {
    console.warn('Backend failed, falling back to public proxies:', backendErr.message);
  }

  // Fallback: public CORS proxies
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}&includePrePost=false`;
  let lastErr;
  for (const proxy of PUBLIC_PROXIES) {
    try {
      const res = await fetch(proxy(url), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.chart?.error) throw new Error(data.chart.error.description);
      if (!data?.chart?.result?.[0]) throw new Error('Empty result');
      return parseYahooResponse(data);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Aucun proxy ne répond');
}

function parseYahooResponse(data) {
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

// ============ INDICATORS ============
function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(closes, period = 14) {
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
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

function atr(bars, period = 14) {
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

function avgRange(bars, period = 20) {
  if (bars.length < period) return null;
  const recent = bars.slice(-period);
  return recent.reduce((a, b) => a + (b.h - b.l), 0) / period;
}

// Compute first-hour high/low from intraday bars (today's session)
function firstHourOR(intradayBars) {
  if (!intradayBars.length) return null;
  // Today = same UTC day as the latest bar
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
    firstBarTime: firstTs,
    lastBarTime: today[today.length - 1].t,
    barsToday: today.length,
  };
}

// ============ MAIN COMPONENT ============
export default function StrategyAnalyzer() {
  const [ticker, setTicker] = useState('SPY');
  const [tickerInput, setTickerInput] = useState('SPY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoFade, setAutoFade] = useState(true);

  // Persisted settings (API key, watchlists, model)
  const [settings, setSettings] = useState(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };
  const activeWatchlist = settings.watchlists.find(w => w.id === settings.activeWatchlistId) || settings.watchlists[0];

  // Fetched data per timeframe
  const [tf, setTf] = useState({
    '1m': null, '5m': null, '15m': null, '30m': null, '1h': null, '1d': null,
  });
  const [vixData, setVixData] = useState(null);

  // Manual overrides
  const [override, setOverride] = useState({});
  const setOv = (k, v) => setOverride(o => ({ ...o, [k]: v }));

  // Filters & setup
  const [isFomc, setIsFomc] = useState(false);
  const [isEarnings, setIsEarnings] = useState(false);
  const [isMacroData, setIsMacroData] = useState(false);
  const [isOpex, setIsOpex] = useState(false);
  const [isMonthEnd, setIsMonthEnd] = useState(false);
  const [isVixExpiry, setIsVixExpiry] = useState(false);

  const [failedRetest, setFailedRetest] = useState(false);
  const [volumeDivergence, setVolumeDivergence] = useState(false);
  const [rejectionCandle, setRejectionCandle] = useState(false);

  // Sizing
  const [optionPremium, setOptionPremium] = useState(18.5);
  const [optionDelta, setOptionDelta] = useState(0.52);
  const [accountSize, setAccountSize] = useState(50000);
  const [riskPct, setRiskPct] = useState(1.0);

  // ============ FETCH ============
  const fetchAll = useCallback(async (sym) => {
    setLoading(true); setError(null);
    try {
      const configs = [
        ['1m', '1m', '1d'],
        ['5m', '5m', '5d'],
        ['15m', '15m', '1mo'],
        ['30m', '30m', '1mo'],
        ['1h', '60m', '3mo'],
        ['1d', '1d', '6mo'],
      ];
      const results = await Promise.allSettled(
        configs.map(([k, interval, range]) => fetchYahooChart(sym, interval, range).then(r => [k, r]))
      );
      const next = {};
      let anyOk = false;
      results.forEach(r => {
        if (r.status === 'fulfilled') { next[r.value[0]] = r.value[1]; anyOk = true; }
      });
      if (!anyOk) throw new Error('Aucune donnée récupérée. Le proxy CORS est peut-être saturé — réessayer.');
      setTf(prev => ({ ...prev, ...next }));

      // VIX
      try {
        const vix = await fetchYahooChart('^VIX', '1d', '5d');
        setVixData(vix);
      } catch (e) { /* non-critical */ }

      setLastFetch(new Date());
      setOverride({}); // reset overrides on fresh fetch
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(ticker); }, [ticker, fetchAll]);

  // Auto-refresh
  const intervalRef = useRef();
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchAll(ticker), 30000);
      return () => clearInterval(intervalRef.current);
    }
  }, [autoRefresh, ticker, fetchAll]);

  // ============ DERIVED DATA ============
  const derived = useMemo(() => {
    const daily = tf['1d']?.bars || [];
    const intraday5m = tf['5m']?.bars || [];
    const meta = tf['1d']?.meta || tf['5m']?.meta;

    // Determine current price and reference close based on Yahoo's marketState
    // marketState can be: PRE, PREPRE, REGULAR, POST, POSTPOST, CLOSED
    const marketState = meta?.marketState || null;
    let currentPriceFromMeta = null;
    let prevCloseFromMeta = null;
    let priceSource = null;
    let priceTimestamp = null;

    if (meta) {
      const hasPre = meta.preMarketPrice != null && meta.preMarketPrice > 0;
      const hasPost = meta.postMarketPrice != null && meta.postMarketPrice > 0;

      if ((marketState === 'PRE' || marketState === 'PREPRE') && hasPre) {
        // Pre-market session: latest = preMarketPrice, reference = last regular close (= regularMarketPrice while session not yet started)
        currentPriceFromMeta = meta.preMarketPrice;
        prevCloseFromMeta = meta.regularMarketPrice;
        priceSource = 'PRE-MARKET';
        priceTimestamp = meta.preMarketTime;
      } else if ((marketState === 'POST' || marketState === 'POSTPOST') && hasPost) {
        // Post-market session: latest = postMarketPrice, reference = today's regular close (= regularMarketPrice)
        currentPriceFromMeta = meta.postMarketPrice;
        prevCloseFromMeta = meta.regularMarketPrice;
        priceSource = 'POST-MARKET';
        priceTimestamp = meta.postMarketTime;
      } else if (marketState === 'REGULAR') {
        // Live regular session
        currentPriceFromMeta = meta.regularMarketPrice;
        prevCloseFromMeta = meta.previousClose;
        priceSource = 'LIVE';
        priceTimestamp = meta.regularMarketTime;
      } else {
        // CLOSED, or PRE/POST without extended-hours tick yet: fall back to most recent complete session
        // Prefer post-market if available (latest tick of yesterday), else regular close
        if (hasPost) {
          currentPriceFromMeta = meta.postMarketPrice;
          prevCloseFromMeta = meta.regularMarketPrice;
          priceSource = 'POST-MARKET (clos)';
          priceTimestamp = meta.postMarketTime;
        } else {
          currentPriceFromMeta = meta.regularMarketPrice;
          prevCloseFromMeta = meta.previousClose;
          priceSource = 'CLÔTURÉ';
          priceTimestamp = meta.regularMarketTime;
        }
      }
    }

    const currentPrice = override.currentPrice ?? currentPriceFromMeta ?? (intraday5m.length ? intraday5m[intraday5m.length - 1].c : null);
    const prevClose = override.prevClose ?? prevCloseFromMeta ?? (daily.length > 1 ? daily[daily.length - 2].c : null);
    const atr14 = override.atr14 ?? (daily.length >= 15 ? atr(daily.slice(-30), 14) : null);
    const avgDailyRange20 = override.avgDailyRange20 ?? (daily.length >= 20 ? avgRange(daily, 20) : null);

    const vix = override.vix ?? (vixData?.bars?.length ? vixData.bars[vixData.bars.length - 1].c : null);

    const or = firstHourOR(intraday5m);
    const firstHourHigh = override.firstHourHigh ?? or?.high ?? null;
    const firstHourLow = override.firstHourLow ?? or?.low ?? null;
    const minutesSinceOpen = override.minutesSinceOpen ?? or?.minutesElapsed ?? 0;

    // Auto direction detection
    let autoDirection = 'fade_up';
    if (currentPrice && prevClose) {
      autoDirection = currentPrice > prevClose ? 'fade_up' : 'fade_down';
    }
    const direction = override.direction ?? (autoFade ? autoDirection : 'fade_up');

    // Pre-market breadth - has to be manual (would need full universe data)
    const premarketBreadth = override.premarketBreadth ?? 62;

    return {
      currentPrice, prevClose, atr14, avgDailyRange20, vix,
      firstHourHigh, firstHourLow, minutesSinceOpen,
      direction, autoDirection, premarketBreadth,
      or, daily, intraday5m,
      priceSource, priceTimestamp, marketState,
    };
  }, [tf, vixData, override, autoFade]);

  // Per-timeframe indicators
  const tfIndicators = useMemo(() => {
    const out = {};
    Object.entries(tf).forEach(([k, data]) => {
      if (!data?.bars?.length) { out[k] = null; return; }
      const bars = data.bars;
      const closes = bars.map(b => b.c);
      const last = bars[bars.length - 1];
      const ema20 = ema(closes.slice(-50), 20);
      const ema50 = closes.length >= 50 ? ema(closes, 50) : null;
      const rsiVal = rsi(closes.slice(-30), 14);
      const atrVal = atr(bars.slice(-20), 14);
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

      let rsiSignal = 'neutral';
      if (rsiVal != null) {
        if (rsiVal > 70) rsiSignal = 'overbought';
        else if (rsiVal < 30) rsiSignal = 'oversold';
        else if (rsiVal > 55) rsiSignal = 'bullish';
        else if (rsiVal < 45) rsiSignal = 'bearish';
      }

      out[k] = { last: last.c, ema20, ema50, rsi: rsiVal, atr: atrVal, trend, rsiSignal, change, changePct, barCount: bars.length };
    });
    return out;
  }, [tf]);

  // ============ DECISION ENGINE ============
  const calc = useMemo(() => {
    const { currentPrice, prevClose, atr14, avgDailyRange20, vix, firstHourHigh, firstHourLow, minutesSinceOpen, direction, premarketBreadth } = derived;

    if (currentPrice == null || prevClose == null || atr14 == null || avgDailyRange20 == null) {
      return { decision: 'EN ATTENTE DE DONNÉES', decisionColor: 'wait', decisionReason: 'Charge en cours ou données manquantes.', posterior: 0.5, signals: [], hardBlocked: true };
    }

    const gap = currentPrice - prevClose;
    const gapPct = (gap / prevClose) * 100;
    const gapAtrRatio = Math.abs(gap) / atr14;
    const firstHourRange = (firstHourHigh && firstHourLow) ? firstHourHigh - firstHourLow : 0;
    const firstHourPctOfDaily = firstHourRange > 0 ? (firstHourRange / avgDailyRange20) * 100 : 0;

    // Regimes
    let vixRegime, vixLR, vixLabel;
    const vixVal = vix ?? 18;
    if (vixVal < 12) { vixRegime = 'too_low'; vixLR = 0.9; vixLabel = 'Trop bas'; }
    else if (vixVal <= 25) { vixRegime = 'optimal'; vixLR = 1.4; vixLabel = 'Optimal'; }
    else if (vixVal <= 30) { vixRegime = 'caution'; vixLR = 0.7; vixLabel = 'Tendu'; }
    else { vixRegime = 'too_high'; vixLR = 0.4; vixLabel = 'Panique'; }

    let gapRegime, gapLR, gapLabel;
    if (gapAtrRatio < 0.5) { gapRegime = 'small'; gapLR = 1.3; gapLabel = 'Petit gap'; }
    else if (gapAtrRatio < 1.0) { gapRegime = 'moderate'; gapLR = 1.5; gapLabel = 'Gap fadable'; }
    else if (gapAtrRatio < 1.5) { gapRegime = 'large'; gapLR = 0.8; gapLabel = 'Gap large'; }
    else { gapRegime = 'extreme'; gapLR = 0.3; gapLabel = 'Gap extrême'; }

    let trendRisk, trendLR, trendLabel;
    if (firstHourPctOfDaily === 0) { trendRisk = 'unknown'; trendLR = 1.0; trendLabel = 'Pas de range 1H'; }
    else if (firstHourPctOfDaily < 30) { trendRisk = 'low'; trendLR = 1.5; trendLabel = 'Range 1H faible'; }
    else if (firstHourPctOfDaily < 50) { trendRisk = 'moderate'; trendLR = 1.0; trendLabel = 'Range 1H modéré'; }
    else { trendRisk = 'high'; trendLR = 0.4; trendLabel = 'Trend day'; }

    let breadthRegime, breadthLR, breadthLabel;
    if (premarketBreadth < 60) { breadthRegime = 'mixed'; breadthLR = 1.3; breadthLabel = 'Mixte'; }
    else if (premarketBreadth < 75) { breadthRegime = 'leaning'; breadthLR = 0.9; breadthLabel = 'Penchée'; }
    else { breadthRegime = 'one_sided'; breadthLR = 0.5; breadthLabel = 'Unilatérale'; }

    // Multi-timeframe contradiction check
    let mtfAlignment = 'neutral';
    const tfTrends = ['5m', '15m', '30m', '1h'].map(k => tfIndicators[k]?.trend).filter(Boolean);
    if (tfTrends.length >= 3) {
      const upCount = tfTrends.filter(t => t === 'up').length;
      const downCount = tfTrends.filter(t => t === 'down').length;
      // If fading up (price went up), we want most TFs NOT to be solidly trending up
      if (direction === 'fade_up') {
        if (upCount === tfTrends.length) mtfAlignment = 'against_fade';
        else if (downCount >= tfTrends.length / 2) mtfAlignment = 'supports_fade';
        else mtfAlignment = 'neutral';
      } else {
        if (downCount === tfTrends.length) mtfAlignment = 'against_fade';
        else if (upCount >= tfTrends.length / 2) mtfAlignment = 'supports_fade';
        else mtfAlignment = 'neutral';
      }
    }
    const mtfLR = mtfAlignment === 'supports_fade' ? 1.5 : mtfAlignment === 'against_fade' ? 0.5 : 1.0;

    // RSI extreme on intraday timeframes (5m, 15m) supports a fade
    const rsi5m = tfIndicators['5m']?.rsi;
    const rsi15m = tfIndicators['15m']?.rsi;
    let rsiExtremeLR = 1.0;
    let rsiExtremeLabel = 'Neutre';
    if (direction === 'fade_up') {
      if ((rsi5m && rsi5m > 75) || (rsi15m && rsi15m > 70)) { rsiExtremeLR = 1.5; rsiExtremeLabel = 'Surachat intraday'; }
      else if ((rsi5m && rsi5m < 55) && (rsi15m && rsi15m < 55)) { rsiExtremeLR = 0.7; rsiExtremeLabel = 'Pas de surextension'; }
    } else {
      if ((rsi5m && rsi5m < 25) || (rsi15m && rsi15m < 30)) { rsiExtremeLR = 1.5; rsiExtremeLabel = 'Survente intraday'; }
      else if ((rsi5m && rsi5m > 45) && (rsi15m && rsi15m > 45)) { rsiExtremeLR = 0.7; rsiExtremeLabel = 'Pas de surextension'; }
    }

    // Hard blocks
    const newsBlock = isFomc || isEarnings || isMacroData;
    const cautionDay = isOpex || isMonthEnd || isVixExpiry;
    const vixBlock = vixRegime === 'too_high';
    const gapBlock = gapRegime === 'extreme';
    const trendBlock = trendRisk === 'high';
    const timeBlock = minutesSinceOpen < 60;
    const mtfBlock = mtfAlignment === 'against_fade';
    const hardBlocked = newsBlock || vixBlock || gapBlock || trendBlock || timeBlock;

    // Bayesian
    const prior = 0.55;
    let odds = prior / (1 - prior);
    const signals = [
      { name: 'Régime VIX', value: `${vixVal.toFixed(1)} — ${vixLabel}`, lr: vixLR },
      { name: 'Taille gap', value: `${gapAtrRatio.toFixed(2)}× ATR — ${gapLabel}`, lr: gapLR },
      { name: 'Range 1H', value: `${firstHourPctOfDaily.toFixed(0)}% daily — ${trendLabel}`, lr: trendLR },
      { name: 'Breadth pré-marché', value: `${premarketBreadth}% — ${breadthLabel}`, lr: breadthLR },
      { name: 'Alignement MTF', value: mtfAlignment === 'supports_fade' ? 'Soutient le fade' : mtfAlignment === 'against_fade' ? 'Contre le fade' : 'Mixte', lr: mtfLR },
      { name: 'RSI intraday', value: rsiExtremeLabel + (rsi5m ? ` (5m: ${rsi5m.toFixed(0)}, 15m: ${rsi15m?.toFixed(0) ?? '—'})` : ''), lr: rsiExtremeLR },
    ];
    if (failedRetest) signals.push({ name: 'Retest échoué OR', value: 'Confirmé', lr: 2.0 });
    if (volumeDivergence) signals.push({ name: 'Divergence volume', value: 'Confirmée', lr: 1.6 });
    if (rejectionCandle) signals.push({ name: 'Candle de rejet', value: 'Confirmée', lr: 1.4 });

    signals.forEach(s => { odds *= s.lr; });
    const posterior = odds / (1 + odds);

    // Decision
    let decision, decisionColor, decisionReason, sizeMultiplier = 0;
    if (newsBlock) { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = 'Jour de news / earnings / FOMC — filtre dur.'; }
    else if (timeBlock) { decision = 'ATTENDRE'; decisionColor = 'wait'; decisionReason = `Trop tôt — attendre encore ${60 - minutesSinceOpen} min.`; }
    else if (vixBlock) { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = 'VIX > 30 — régime de panique.'; }
    else if (gapBlock) { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = 'Gap > 1.5× ATR — événement probable.'; }
    else if (trendBlock) { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = 'Range 1ère heure > 50% du daily — trend day probable.'; }
    else if (mtfBlock) { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = 'Toutes les timeframes intraday trendent dans le sens du mouvement — pas de fade.'; }
    else if (!failedRetest || !rejectionCandle) { decision = 'ATTENDRE SETUP'; decisionColor = 'wait'; decisionReason = 'Conditions OK, attendre confirmation (retest échoué + candle de rejet).'; }
    else if (posterior >= 0.75) { decision = 'ACHETER'; decisionColor = 'buy'; sizeMultiplier = 1.0; decisionReason = `Probabilité ${(posterior*100).toFixed(1)}% — entrée pleine taille.`; }
    else if (posterior >= 0.65) { decision = 'ACHETER 1/2'; decisionColor = 'buy_small'; sizeMultiplier = 0.5; decisionReason = `Probabilité ${(posterior*100).toFixed(1)}% — taille réduite.`; }
    else { decision = 'NO TRADE'; decisionColor = 'block'; decisionReason = `Probabilité ${(posterior*100).toFixed(1)}% insuffisante.`; }
    if (cautionDay && sizeMultiplier > 0) { sizeMultiplier *= 0.5; decisionReason += ' Jour OPEX/fin mois → taille -50%.'; }

    // Trade plan
    const isFadingUp = direction === 'fade_up';
    const entryPrice = currentPrice;
    const stopUnderlying = (firstHourHigh && firstHourLow) ? (isFadingUp ? firstHourHigh + 0.2 * atr14 : firstHourLow - 0.2 * atr14) : currentPrice;
    const targetMidpoint = (firstHourHigh && firstHourLow) ? (firstHourHigh + firstHourLow) / 2 : currentPrice;
    const targetExtreme = (firstHourHigh && firstHourLow) ? (isFadingUp ? firstHourLow : firstHourHigh) : currentPrice;
    const stopDistance = Math.abs(entryPrice - stopUnderlying);
    const targetDistMid = Math.abs(targetMidpoint - entryPrice);
    const rrRatio = stopDistance > 0 ? targetDistMid / stopDistance : 0;
    const riskAmount = accountSize * (riskPct / 100);
    const lossPerContract = stopDistance * optionDelta * 100;
    const maxContracts = lossPerContract > 0 ? Math.floor(riskAmount / lossPerContract) : 0;
    const suggestedContracts = Math.max(0, Math.floor(maxContracts * sizeMultiplier));
    const positionCost = suggestedContracts * optionPremium * 100;

    return {
      gap, gapPct, gapAtrRatio, firstHourRange, firstHourPctOfDaily,
      vixRegime, gapRegime, trendRisk, breadthRegime, mtfAlignment,
      hardBlocked, signals, prior, posterior,
      decision, decisionColor, decisionReason, sizeMultiplier,
      entryPrice, stopUnderlying, targetMidpoint, targetExtreme,
      stopDistance, targetDistMid, rrRatio,
      suggestedContracts, positionCost,
      riskAmount, lossPerContract,
    };
  }, [derived, tfIndicators, isFomc, isEarnings, isMacroData, isOpex, isMonthEnd, isVixExpiry, failedRetest, volumeDivergence, rejectionCandle, optionPremium, optionDelta, accountSize, riskPct]);

  // ============ STYLES ============
  const fonts = {
    display: "'Instrument Serif', 'Times New Roman', serif",
    mono: "'IBM Plex Mono', 'JetBrains Mono', 'Courier New', monospace",
    sans: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
  };
  const decisionStyles = {
    buy: { bg: '#0a2818', border: '#22c55e', text: '#4ade80', glow: 'rgba(34, 197, 94, 0.25)' },
    buy_small: { bg: '#1a2410', border: '#84cc16', text: '#a3e635', glow: 'rgba(132, 204, 22, 0.2)' },
    wait: { bg: '#2a1f08', border: '#f59e0b', text: '#fbbf24', glow: 'rgba(245, 158, 11, 0.2)' },
    block: { bg: '#2a0e10', border: '#dc2626', text: '#f87171', glow: 'rgba(220, 38, 38, 0.2)' },
  };
  const ds = decisionStyles[calc.decisionColor] || decisionStyles.wait;

  const handleTickerSubmit = (e) => {
    e.preventDefault?.();
    if (tickerInput.trim() && tickerInput.toUpperCase() !== ticker) {
      setTicker(tickerInput.trim().toUpperCase());
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#e2e8f0', padding: '20px', fontFamily: fonts.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&family=Instrument+Serif:ital@0;1&display=swap');
        @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 30px ${ds.glow}; } 50% { box-shadow: 0 0 50px ${ds.glow}; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus { outline: none; border-color: #22c55e !important; }
      `}</style>

      <div style={{ maxWidth: '1500px', margin: '0 auto' }}>

        {/* ============ HEADER ============ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #1e293b', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Intraday Reversal Engine · live</div>
            <div style={{ fontFamily: fonts.display, fontSize: '38px', color: '#f1f5f9', lineHeight: 1, marginTop: '6px', fontStyle: 'italic' }}>
              Multi-Timeframe Gap Fade Analyzer
            </div>
            <div style={{ fontFamily: fonts.mono, fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
              Yahoo Finance · 1m / 5m / 15m / 30m / 1h / 1d · Bayesian aggregation
            </div>
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <form onSubmit={handleTickerSubmit} style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              <div>
                <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', letterSpacing: '0.1em' }}>TICKER</div>
                <input
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleTickerSubmit(e)}
                  style={{
                    background: 'transparent', border: 'none', borderBottom: '2px solid #22c55e',
                    color: '#22c55e', fontFamily: fonts.mono, fontSize: '26px', fontWeight: 600,
                    textAlign: 'right', padding: '4px 0', width: '120px',
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleTickerSubmit}
                style={{ background: '#22c55e', color: '#020617', border: 'none', padding: '8px 14px', fontFamily: fonts.mono, fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >Charger</button>
              <button
                type="button"
                onClick={() => fetchAll(ticker)}
                disabled={loading}
                style={{ background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', padding: '8px 14px', fontFamily: fonts.mono, fontSize: '11px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                {loading ? <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span> : '↻'} Refresh
              </button>
            </form>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: fonts.mono, fontSize: '11px', color: '#94a3b8' }}>
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              Auto-refresh 30s
            </label>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              title="Paramètres (clé API, watchlists)"
              style={{ background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', padding: '8px 14px', fontFamily: fonts.mono, fontSize: '14px', cursor: 'pointer', borderRadius: '4px' }}
            >⚙</button>
          </div>
        </div>

        {/* ============ WATCHLIST BAR ============ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <select
            value={settings.activeWatchlistId}
            onChange={(e) => handleSaveSettings({ ...settings, activeWatchlistId: e.target.value })}
            style={{ background: '#020617', border: '1px solid #334155', color: '#cbd5e1', padding: '6px 10px', fontFamily: fonts.mono, fontSize: '11px', borderRadius: '4px', cursor: 'pointer' }}
          >
            {settings.watchlists.map(wl => (
              <option key={wl.id} value={wl.id}>{wl.name} ({wl.tickers.length})</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
            {activeWatchlist?.tickers.map(t => (
              <button
                key={t}
                onClick={() => { setTickerInput(t); setTicker(t); }}
                style={{
                  background: ticker === t ? 'rgba(34, 197, 94, 0.15)' : '#020617',
                  color: ticker === t ? '#4ade80' : '#cbd5e1',
                  border: `1px solid ${ticker === t ? '#22c55e' : '#334155'}`,
                  padding: '5px 10px', fontFamily: fonts.mono, fontSize: '11px', fontWeight: 600,
                  cursor: 'pointer', borderRadius: '3px',
                }}
              >{t}</button>
            ))}
            {activeWatchlist?.tickers.length === 0 && (
              <span style={{ fontFamily: fonts.mono, fontSize: '11px', color: '#64748b' }}>Liste vide — ajoute des tickers dans ⚙ Paramètres</span>
            )}
          </div>
          <button
            onClick={() => setShowSettings(true)}
            style={{ background: 'transparent', color: '#64748b', border: '1px dashed #334155', padding: '5px 10px', fontFamily: fonts.mono, fontSize: '10px', cursor: 'pointer', borderRadius: '3px' }}
          >+ éditer</button>
        </div>

        {/* ============ STATUS BAR ============ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: '11px', color: error ? '#f87171' : '#94a3b8' }}>
            {error ? `⚠ ${error}` : lastFetch ? `✓ Données récupérées à ${lastFetch.toLocaleTimeString('fr-FR')}` : 'Chargement initial...'}
          </div>
          {derived.currentPrice != null && (
            <div style={{ display: 'flex', gap: '16px', fontFamily: fonts.mono, fontSize: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              {derived.priceSource && (() => {
                const badgeStyles = {
                  'LIVE': { bg: 'rgba(34, 197, 94, 0.15)', text: '#4ade80', border: '#22c55e' },
                  'PRE-MARKET': { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: '#3b82f6' },
                  'POST-MARKET': { bg: 'rgba(249, 115, 22, 0.15)', text: '#fb923c', border: '#f97316' },
                  'POST-MARKET (clos)': { bg: 'rgba(249, 115, 22, 0.1)', text: '#fb923c', border: '#9a3412' },
                  'CLÔTURÉ': { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8', border: '#64748b' },
                };
                const s = badgeStyles[derived.priceSource] || badgeStyles['CLÔTURÉ'];
                return (
                  <span style={{
                    background: s.bg, color: s.text, border: `1px solid ${s.border}`,
                    padding: '3px 8px', borderRadius: '3px', fontSize: '10px',
                    fontWeight: 600, letterSpacing: '0.05em',
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                  }}>
                    {derived.priceSource === 'LIVE' && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.text, boxShadow: `0 0 6px ${s.text}` }} />}
                    {derived.priceSource}
                    {derived.priceTimestamp && (
                      <span style={{ opacity: 0.7, fontWeight: 400 }}>
                        {new Date(derived.priceTimestamp * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </span>
                );
              })()}
              <span style={{ color: '#64748b' }}>PRIX <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '14px' }}>{derived.currentPrice.toFixed(2)}</span></span>
              <span style={{ color: '#64748b' }}>{derived.priceSource === 'POST-MARKET' || derived.priceSource === 'POST-MARKET (clos)' ? 'CLÔTURE JOUR' : 'VEILLE'} <span style={{ color: '#f1f5f9' }}>{derived.prevClose?.toFixed(2)}</span></span>
              <span style={{ color: '#64748b' }}>GAP <span style={{ color: calc.gap >= 0 ? '#4ade80' : '#f87171' }}>{calc.gap >= 0 ? '+' : ''}{calc.gap?.toFixed(2)} ({calc.gapPct?.toFixed(2)}%)</span></span>
              <span style={{ color: '#64748b' }}>VIX <span style={{ color: '#f1f5f9' }}>{derived.vix?.toFixed(1) ?? '—'}</span></span>
            </div>
          )}
        </div>

        {/* ============ DECISION BANNER ============ */}
        <div style={{
          background: ds.bg, border: `2px solid ${ds.border}`, borderRadius: '8px',
          padding: '24px 28px', marginBottom: '20px',
          animation: calc.decisionColor === 'buy' ? 'pulse-glow 2s ease-in-out infinite' : 'none',
          boxShadow: `0 0 30px ${ds.glow}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
            <div style={{ flex: '1 1 400px' }}>
              <div style={{ fontFamily: fonts.mono, fontSize: '11px', color: ds.text, opacity: 0.7, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Décision</div>
              <div style={{ fontFamily: fonts.display, fontSize: '52px', color: ds.text, lineHeight: 1, marginTop: '4px', fontWeight: 400 }}>{calc.decision}</div>
              <div style={{ fontFamily: fonts.sans, fontSize: '14px', color: '#cbd5e1', marginTop: '12px', maxWidth: '600px', lineHeight: 1.5 }}>{calc.decisionReason}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: fonts.mono, fontSize: '11px', color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>P(retournement)</div>
              <div style={{ fontFamily: fonts.mono, fontSize: '56px', color: ds.text, fontWeight: 300, lineHeight: 1, marginTop: '4px' }}>
                {(calc.posterior * 100).toFixed(1)}<span style={{ fontSize: '24px', opacity: 0.6 }}>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* ============ AI ANALYSIS PANEL ============ */}
        <AIAnalysisPanel
          settings={settings}
          ticker={ticker}
          derived={derived}
          calc={calc}
          tfIndicators={tfIndicators}
          onOpenSettings={() => setShowSettings(true)}
        />

        {/* ============ MULTI-TIMEFRAME PANEL ============ */}
        <Section title="Vue multi-timeframe" subtitle="Trend / RSI / variation par fréquence" fonts={fonts}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: fonts.mono, fontSize: '12px', minWidth: '700px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <th style={thStyle}>TIMEFRAME</th>
                  <th style={thStyle}>PRIX</th>
                  <th style={thStyle}>VAR</th>
                  <th style={thStyle}>EMA20</th>
                  <th style={thStyle}>EMA50</th>
                  <th style={thStyle}>RSI(14)</th>
                  <th style={thStyle}>TREND</th>
                  <th style={thStyle}>SIGNAL RSI</th>
                </tr>
              </thead>
              <tbody>
                {['1m', '5m', '15m', '30m', '1h', '1d'].map(k => {
                  const ind = tfIndicators[k];
                  if (!ind) return (
                    <tr key={k}><td style={tdStyle}>{k}</td><td colSpan={7} style={{ ...tdStyle, color: '#64748b' }}>— pas de données —</td></tr>
                  );
                  const trendColor = ind.trend === 'up' ? '#4ade80' : ind.trend === 'down' ? '#f87171' : '#fbbf24';
                  const rsiColor = ind.rsiSignal === 'overbought' || ind.rsiSignal === 'oversold' ? '#fbbf24' : ind.rsiSignal === 'bullish' ? '#4ade80' : ind.rsiSignal === 'bearish' ? '#f87171' : '#94a3b8';
                  return (
                    <tr key={k} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 600 }}>{k.toUpperCase()}</td>
                      <td style={tdStyle}>{ind.last.toFixed(2)}</td>
                      <td style={{ ...tdStyle, color: ind.changePct >= 0 ? '#4ade80' : '#f87171' }}>{ind.changePct >= 0 ? '+' : ''}{ind.changePct.toFixed(2)}%</td>
                      <td style={{ ...tdStyle, color: '#94a3b8' }}>{ind.ema20?.toFixed(2) ?? '—'}</td>
                      <td style={{ ...tdStyle, color: '#94a3b8' }}>{ind.ema50?.toFixed(2) ?? '—'}</td>
                      <td style={{ ...tdStyle, color: rsiColor }}>{ind.rsi?.toFixed(1) ?? '—'}</td>
                      <td style={{ ...tdStyle, color: trendColor }}>
                        {ind.trend === 'up' ? '↑ HAUSSE' : ind.trend === 'down' ? '↓ BAISSE' : '— MIXTE'}
                      </td>
                      <td style={{ ...tdStyle, color: rsiColor, fontSize: '11px' }}>
                        {ind.rsiSignal === 'overbought' ? 'SURACHAT' : ind.rsiSignal === 'oversold' ? 'SURVENTE' : ind.rsiSignal === 'bullish' ? 'haussier' : ind.rsiSignal === 'bearish' ? 'baissier' : 'neutre'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '14px', padding: '10px 12px', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px' }}>
            <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', letterSpacing: '0.1em', marginBottom: '4px' }}>ALIGNEMENT POUR FADE {derived.direction === 'fade_up' ? '↓' : '↑'}</div>
            <div style={{ fontFamily: fonts.sans, fontSize: '12px', color: calc.mtfAlignment === 'supports_fade' ? '#4ade80' : calc.mtfAlignment === 'against_fade' ? '#f87171' : '#fbbf24' }}>
              {calc.mtfAlignment === 'supports_fade' ? '✓ Les timeframes intraday divergent du mouvement — le fade est cohérent' :
               calc.mtfAlignment === 'against_fade' ? '✗ Toutes les TF intraday trendent dans le sens du mouvement — ne pas fade' :
               '⚬ Signaux MTF mixtes — pas de confirmation claire'}
            </div>
          </div>
        </Section>

        {/* ============ MAIN GRID ============ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '14px' }}>

          <div>
            <Section title="Données auto-remplies" subtitle="Yahoo · éditable" fonts={fonts}>
              <InputRow label="Prix actuel" value={derived.currentPrice ?? 0} onChange={(v) => setOv('currentPrice', v)} suffix="$" fonts={fonts} />
              <InputRow label="Clôture veille" value={derived.prevClose ?? 0} onChange={(v) => setOv('prevClose', v)} suffix="$" fonts={fonts} />
              <InputRow label="ATR(14) daily" value={derived.atr14 ?? 0} onChange={(v) => setOv('atr14', v)} suffix="$" fonts={fonts} />
              <InputRow label="Range moyen 20j" value={derived.avgDailyRange20 ?? 0} onChange={(v) => setOv('avgDailyRange20', v)} suffix="$" fonts={fonts} />
              <InputRow label="VIX" value={derived.vix ?? 0} onChange={(v) => setOv('vix', v)} fonts={fonts} />
            </Section>

            <Section title="Opening Range" subtitle={`${derived.minutesSinceOpen} min écoulées · ${derived.or?.barsToday ?? 0} bars 5m today`} fonts={fonts}>
              <InputRow label="Plus haut 1H" value={derived.firstHourHigh ?? 0} onChange={(v) => setOv('firstHourHigh', v)} suffix="$" fonts={fonts} />
              <InputRow label="Plus bas 1H" value={derived.firstHourLow ?? 0} onChange={(v) => setOv('firstHourLow', v)} suffix="$" fonts={fonts} />
              <InputRow label="Minutes depuis open" value={derived.minutesSinceOpen} onChange={(v) => setOv('minutesSinceOpen', v)} suffix="min" fonts={fonts} />
              <InputRow label="Breadth pré-marché" value={derived.premarketBreadth} onChange={(v) => setOv('premarketBreadth', v)} suffix="%" fonts={fonts} sublabel="Manuel — % du secteur dans la direction du gap" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
                <div>
                  <div style={{ fontFamily: fonts.sans, fontSize: '12px', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Direction fade</div>
                  {autoFade && <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginTop: '2px' }}>auto: {derived.autoDirection}</div>}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <label style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b' }}>
                    <input type="checkbox" checked={autoFade} onChange={e => setAutoFade(e.target.checked)} /> auto
                  </label>
                  <select
                    value={derived.direction} onChange={(e) => { setAutoFade(false); setOv('direction', e.target.value); }}
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '6px 10px', fontFamily: fonts.mono, fontSize: '12px', borderRadius: '4px' }}
                  >
                    <option value="fade_up">Fade ↑ (puts)</option>
                    <option value="fade_down">Fade ↓ (calls)</option>
                  </select>
                </div>
              </div>
            </Section>
          </div>

          <div>
            <Section title="Filtres jour" subtitle="Hard blocks · cautions" fonts={fonts}>
              <Toggle label="FOMC / Annonce Fed" checked={isFomc} onChange={setIsFomc} danger fonts={fonts} />
              <Toggle label="Jour d'earnings" checked={isEarnings} onChange={setIsEarnings} danger fonts={fonts} />
              <Toggle label="Data macro (CPI, NFP, PMI)" checked={isMacroData} onChange={setIsMacroData} danger fonts={fonts} />
              <Toggle label="OPEX (3e vendredi)" checked={isOpex} onChange={setIsOpex} fonts={fonts} />
              <Toggle label="Fin de mois / trimestre" checked={isMonthEnd} onChange={setIsMonthEnd} fonts={fonts} />
              <Toggle label="VIX expiry" checked={isVixExpiry} onChange={setIsVixExpiry} fonts={fonts} />
            </Section>

            <Section title="Confirmations setup" subtitle="Triggers d'entrée" fonts={fonts}>
              <Toggle label="Retest échoué OR" checked={failedRetest} onChange={setFailedRetest} fonts={fonts} />
              <Toggle label="Divergence volume / CVD" checked={volumeDivergence} onChange={setVolumeDivergence} fonts={fonts} />
              <Toggle label="Candle de rejet" checked={rejectionCandle} onChange={setRejectionCandle} fonts={fonts} />
            </Section>

            <Section title="Position & risque" subtitle="3M ATM" fonts={fonts}>
              <InputRow label="Premium option" value={optionPremium} onChange={setOptionPremium} suffix="$" fonts={fonts} />
              <InputRow label="Delta" value={optionDelta} onChange={setOptionDelta} step="0.01" fonts={fonts} />
              <InputRow label="Compte" value={accountSize} onChange={setAccountSize} suffix="$" step="1000" fonts={fonts} />
              <InputRow label="Risque par trade" value={riskPct} onChange={setRiskPct} suffix="%" fonts={fonts} />
            </Section>
          </div>

          <div>
            <Section title="Décomposition bayésienne" subtitle="P(reversal | signaux)" fonts={fonts}>
              <div style={{ fontFamily: fonts.mono, fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #334155', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '10px' }}>
                  <span>Signal</span><span>LR</span>
                </div>
                <div style={{ padding: '8px 0', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>Prior</span><span>{(calc.prior * 100).toFixed(0)}%</span>
                </div>
                {calc.signals.map((s, i) => {
                  const lrColor = s.lr > 1.2 ? '#4ade80' : s.lr < 0.8 ? '#f87171' : s.lr === 1.0 ? '#64748b' : '#fbbf24';
                  return (
                    <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#cbd5e1', fontSize: '11px' }}>{s.name}</div>
                        <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>{s.value}</div>
                      </div>
                      <span style={{ color: lrColor, fontWeight: 600 }}>×{s.lr.toFixed(2)}</span>
                    </div>
                  );
                })}
                <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'space-between', color: ds.text, fontSize: '13px', fontWeight: 600 }}>
                  <span>POSTERIOR</span><span>{(calc.posterior * 100).toFixed(1)}%</span>
                </div>
              </div>
            </Section>

            <Section title="Plan de trade" subtitle="Exécution si validé" fonts={fonts}>
              <PlanRow label="Entrée" value={`${calc.entryPrice?.toFixed(2) ?? '—'}$`} fonts={fonts} />
              <PlanRow label="Stop" value={`${calc.stopUnderlying?.toFixed(2) ?? '—'}$`} sub={`distance ${calc.stopDistance?.toFixed(2) ?? '—'}$`} fonts={fonts} />
              <PlanRow label="Target 1 (mid OR)" value={`${calc.targetMidpoint?.toFixed(2) ?? '—'}$`} sub={`R:R ${calc.rrRatio?.toFixed(2) ?? '—'}`} fonts={fonts} />
              <PlanRow label="Target 2 (extrême OR)" value={`${calc.targetExtreme?.toFixed(2) ?? '—'}$`} fonts={fonts} />
              <PlanRow label="Time stop" value="14h30" sub="avant accélération theta + MOC" fonts={fonts} />
              <div style={{ height: '8px' }} />
              <PlanRow label="Contrats" value={calc.suggestedContracts} highlight fonts={fonts} />
              <PlanRow label="Coût position" value={`${calc.positionCost?.toFixed(0) ?? '—'}$`} sub={`${((calc.positionCost / accountSize) * 100).toFixed(2)}% compte`} fonts={fonts} />
              <PlanRow label="Risque max" value={`${(calc.riskAmount * calc.sizeMultiplier).toFixed(0)}$`} fonts={fonts} />
            </Section>
          </div>
        </div>

        <div style={{ marginTop: '20px', padding: '14px 18px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px' }}>
          <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>Notes</div>
          <div style={{ fontFamily: fonts.sans, fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 }}>
            Données via Yahoo Finance par proxy CORS public (corsproxy.io). Les proxies publics peuvent être rate-limited ou tomber — pour de la production sérieuse, faire tourner ton propre proxy ou utiliser Polygon/Twelve Data avec une clé API. Le retard est typiquement de 15-20 min sur les actions US (données différées). Les seuils (LRs, 0.65 / 0.75) sont à calibrer sur ton journal de trades. Le breadth pré-marché doit être saisi manuellement (nécessiterait toute l'univers du secteur).
          </div>
        </div>
      </div>

      {/* ============ SETTINGS MODAL ============ */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ============ SUB-COMPONENTS ============
const thStyle = { padding: '10px 8px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: '10px', letterSpacing: '0.1em' };
const tdStyle = { padding: '10px 8px', color: '#e2e8f0' };

function Section({ title, subtitle, children, fonts }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '16px', marginBottom: '14px' }}>
      <div style={{ marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontFamily: fonts.display, fontSize: '20px', color: '#e2e8f0', fontStyle: 'italic' }}>{title}</div>
        {subtitle && <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function InputRow({ label, value, onChange, suffix, step = '0.01', sublabel, fonts }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: fonts.sans, fontSize: '12px', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        {sublabel && <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{sublabel}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          type="number" value={value} step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '6px 10px', fontFamily: fonts.mono, fontSize: '13px', width: '95px', textAlign: 'right', borderRadius: '4px' }}
        />
        {suffix && <span style={{ fontFamily: fonts.mono, fontSize: '11px', color: '#64748b', minWidth: '20px' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, danger, fonts }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid #1e293b' }}>
      <span style={{ fontFamily: fonts.sans, fontSize: '12px', color: checked ? (danger ? '#f87171' : '#fbbf24') : '#cbd5e1' }}>{label}</span>
      <span style={{ display: 'inline-block', width: '36px', height: '20px', borderRadius: '10px', background: checked ? (danger ? '#dc2626' : '#f59e0b') : '#334155', position: 'relative', transition: 'background 0.2s' }}>
        <span style={{ position: 'absolute', top: '2px', left: checked ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#f1f5f9', transition: 'left 0.2s' }} />
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ display: 'none' }} />
    </label>
  );
}

function PlanRow({ label, value, sub, highlight, fonts }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: fonts.sans, fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontFamily: fonts.mono, fontSize: highlight ? '20px' : '14px', color: highlight ? '#4ade80' : '#f1f5f9', fontWeight: highlight ? 600 : 400 }}>{value}</span>
      </div>
      {sub && <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginTop: '2px', textAlign: 'right' }}>{sub}</div>}
    </div>
  );
}
