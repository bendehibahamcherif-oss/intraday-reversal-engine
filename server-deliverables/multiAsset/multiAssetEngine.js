'use strict';

// Sector ETF proxies for rotation analytics
const SECTOR_ETFS = [
  { symbol: 'XLK',  name: 'Technology' },
  { symbol: 'XLF',  name: 'Financials' },
  { symbol: 'XLV',  name: 'Health Care' },
  { symbol: 'XLE',  name: 'Energy' },
  { symbol: 'XLI',  name: 'Industrials' },
  { symbol: 'XLY',  name: 'Consumer Discr.' },
  { symbol: 'XLC',  name: 'Communication' },
  { symbol: 'XLU',  name: 'Utilities' },
  { symbol: 'XLB',  name: 'Materials' },
  { symbol: 'XLRE', name: 'Real Estate' },
];

// ── Core math ─────────────────────────────────────────────────────────────────

function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    out.push(prev > 0 && curr > 0 ? Math.log(curr / prev) : 0);
  }
  return out;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

// Numerically stable Pearson correlation. Returns null when undefined (zero variance).
function pearsonCorrelation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num  += dx * dy;
    sx2  += dx * dx;
    sy2  += dy * dy;
  }
  const denom = Math.sqrt(sx2 * sy2);
  if (denom < 1e-12) return null; // guard: zero-variance series
  return Math.max(-1, Math.min(1, num / denom));
}

// CAPM beta and R² — returns null when benchmark has zero variance.
function betaAndR2(assetReturns, benchmarkReturns) {
  const n = Math.min(assetReturns.length, benchmarkReturns.length);
  if (n < 2) return { beta: null, r2: null };
  const ma = mean(assetReturns.slice(0, n));
  const mb = mean(benchmarkReturns.slice(0, n));
  let cov = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = assetReturns[i] - ma;
    const db = benchmarkReturns[i] - mb;
    cov  += da * db;
    varB += db * db;
  }
  if (varB < 1e-12) return { beta: null, r2: null }; // guard: zero-variance benchmark
  const beta = cov / varB;
  const corr = pearsonCorrelation(assetReturns.slice(0, n), benchmarkReturns.slice(0, n));
  const r2   = corr !== null ? corr * corr : null;
  return { beta, r2 };
}

// Rolling annualized volatility — sample std × sqrt(252).
function annualizedVol(returns, window = 20) {
  const slice = returns.slice(-window);
  if (slice.length < 2) return null;
  const m = mean(slice);
  const variance = slice.reduce((s, x) => s + (x - m) ** 2, 0) / (slice.length - 1);
  return Math.sqrt(variance * 252);
}

// ── Data access helper ─────────────────────────────────────────────────────────

async function fetchCloses(historicalStore, symbol, timeframe, limit) {
  try {
    const candles = await historicalStore.getCandles(symbol, timeframe, limit);
    if (!Array.isArray(candles) || !candles.length) return [];
    return candles.map((c) => Number(c.close ?? c.c ?? 0)).filter((v) => v > 0);
  } catch {
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

async function computeCorrelationMatrix(historicalStore, { symbols, window = 20, timeframe = '1d' }) {
  const limit = window + 10;
  const returnsMap = {};
  await Promise.all(symbols.map(async (sym) => {
    const closes = await fetchCloses(historicalStore, sym, timeframe, limit);
    returnsMap[sym] = logReturns(closes).slice(-window);
  }));

  const matrix = symbols.map((a) =>
    symbols.map((b) => {
      if (a === b) return 1;
      const corr = pearsonCorrelation(returnsMap[a], returnsMap[b]);
      return corr !== null ? parseFloat(corr.toFixed(4)) : null;
    })
  );

  return { symbols, matrix, window, timeframe, computedAt: new Date().toISOString() };
}

async function computeBeta(historicalStore, { symbol, benchmark = 'SPY', window = 20, timeframe = '1d' }) {
  const limit = window + 10;
  const [assetCloses, benchCloses] = await Promise.all([
    fetchCloses(historicalStore, symbol, timeframe, limit),
    fetchCloses(historicalStore, benchmark, timeframe, limit),
  ]);
  const assetRet = logReturns(assetCloses).slice(-window);
  const benchRet = logReturns(benchCloses).slice(-window);
  const { beta, r2 } = betaAndR2(assetRet, benchRet);
  return {
    symbol, benchmark, window, timeframe,
    beta: beta !== null ? parseFloat(beta.toFixed(4)) : null,
    r2:   r2   !== null ? parseFloat(r2.toFixed(4))   : null,
    computedAt: new Date().toISOString(),
  };
}

async function computeSectorRotation(historicalStore, { window = 20, timeframe = '1d' }) {
  const limit = window + 10;
  const raw = await Promise.all(SECTOR_ETFS.map(async ({ symbol, name }) => {
    const closes = await fetchCloses(historicalStore, symbol, timeframe, limit);
    if (closes.length < 2) return { symbol, name, return: null, vol: null };
    const returns = logReturns(closes).slice(-window);
    // cumulative return from window-start close
    const startIdx = Math.max(0, closes.length - window - 1);
    const cumReturn = (closes[closes.length - 1] / closes[startIdx]) - 1;
    const vol = annualizedVol(returns, window);
    return {
      symbol, name,
      return: parseFloat(cumReturn.toFixed(4)),
      vol:    vol !== null ? parseFloat(vol.toFixed(4)) : null,
    };
  }));

  const ranked   = raw.filter((r) => r.return !== null).sort((a, b) => b.return - a.return).map((r, i) => ({ ...r, rank: i + 1 }));
  const unranked = raw.filter((r) => r.return === null).map((r) => ({ ...r, rank: null }));

  return { sectors: [...ranked, ...unranked], window, timeframe, computedAt: new Date().toISOString() };
}

async function computeVolatility(historicalStore, { symbols, window = 20, timeframe = '1d' }) {
  const limit = window + 10;
  const results = await Promise.all(symbols.map(async (symbol) => {
    const closes = await fetchCloses(historicalStore, symbol, timeframe, limit);
    if (closes.length < 2) return { symbol, vol: null, annualizedVol: null, return: null };
    const returns = logReturns(closes).slice(-window);
    const vol  = annualizedVol(returns, window);
    const startIdx = Math.max(0, closes.length - window - 1);
    const cumReturn = (closes[closes.length - 1] / closes[startIdx]) - 1;
    return {
      symbol,
      vol:          vol !== null ? parseFloat(vol.toFixed(4))      : null,
      annualizedVol: vol !== null ? parseFloat(vol.toFixed(4))      : null,
      return:       parseFloat(cumReturn.toFixed(4)),
    };
  }));
  return { volatility: results, window, timeframe, computedAt: new Date().toISOString() };
}

module.exports = {
  computeCorrelationMatrix,
  computeBeta,
  computeSectorRotation,
  computeVolatility,
  SECTOR_ETFS,
  // exported for unit testing
  _internal: { logReturns, pearsonCorrelation, betaAndR2, annualizedVol },
};
