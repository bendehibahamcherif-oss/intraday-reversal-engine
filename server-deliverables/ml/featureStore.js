'use strict';

/**
 * In-memory feature snapshot store with optional JSON file persistence.
 *
 * Key: `${symbol}|${timeframe}|${asOf}|${featureVersion}|${provisional}`
 * Keeps last MAX_SNAPSHOTS per symbol for memory safety.
 *
 * canonical=true snapshots are the authoritative signal source.
 * provisional=true snapshots are live previews (never replace canonical).
 */

const MAX_SNAPSHOTS_PER_SYMBOL = 500;

// Map<key, snapshot>
const _store = new Map();
// Map<symbol, string[]>  — ordered keys for eviction
const _keysBySymbol = new Map();

function _key(symbol, timeframe, asOf, featureVersion, provisional) {
  return `${symbol}|${timeframe}|${asOf}|${featureVersion}|${provisional ? '1' : '0'}`;
}

function _symbolKey(snapshot) {
  return snapshot.symbol;
}

/**
 * Persist a feature snapshot.
 */
function save(snapshot) {
  const k = _key(
    snapshot.symbol,
    snapshot.timeframe,
    snapshot.asOf,
    snapshot.featureVersion,
    snapshot.provisional
  );
  _store.set(k, snapshot);

  const sym = _symbolKey(snapshot);
  if (!_keysBySymbol.has(sym)) _keysBySymbol.set(sym, []);
  const keys = _keysBySymbol.get(sym);
  if (!keys.includes(k)) keys.push(k);

  // Evict oldest if over limit (only non-provisional for size tracking)
  if (!snapshot.provisional && keys.length > MAX_SNAPSHOTS_PER_SYMBOL) {
    const oldest = keys.shift();
    _store.delete(oldest);
  }
}

/**
 * Get the latest canonical (provisional=false) snapshot for a symbol.
 */
function getLatestCanonical(symbol, timeframe = '1m', featureVersion = 'p1_v1') {
  const keys = _keysBySymbol.get(symbol) || [];
  // Scan backwards for most recent canonical
  for (let i = keys.length - 1; i >= 0; i--) {
    const snap = _store.get(keys[i]);
    if (snap && snap.timeframe === timeframe && snap.featureVersion === featureVersion && !snap.provisional) {
      return snap;
    }
  }
  return null;
}

/**
 * Get the latest snapshot (canonical or provisional).
 */
function getLatest(symbol, timeframe = '1m', featureVersion = 'p1_v1') {
  const keys = _keysBySymbol.get(symbol) || [];
  for (let i = keys.length - 1; i >= 0; i--) {
    const snap = _store.get(keys[i]);
    if (snap && snap.timeframe === timeframe && snap.featureVersion === featureVersion) {
      return snap;
    }
  }
  return null;
}

/**
 * Get last N canonical snapshots for a symbol (for dataset building).
 */
function getCanonicalHistory(symbol, timeframe = '1m', featureVersion = 'p1_v1', limit = 200) {
  const keys = _keysBySymbol.get(symbol) || [];
  const result = [];
  for (let i = keys.length - 1; i >= 0 && result.length < limit; i--) {
    const snap = _store.get(keys[i]);
    if (snap && snap.timeframe === timeframe && snap.featureVersion === featureVersion && !snap.provisional) {
      result.unshift(snap);
    }
  }
  return result;
}

/**
 * Count of canonical snapshots for symbol.
 */
function count(symbol, timeframe = '1m', featureVersion = 'p1_v1') {
  return getCanonicalHistory(symbol, timeframe, featureVersion, MAX_SNAPSHOTS_PER_SYMBOL).length;
}

function clear(symbol) {
  const keys = _keysBySymbol.get(symbol) || [];
  for (const k of keys) _store.delete(k);
  _keysBySymbol.delete(symbol);
}

function clearAll() {
  _store.clear();
  _keysBySymbol.clear();
}

function getStats() {
  const symbolCounts = {};
  for (const [sym, keys] of _keysBySymbol) symbolCounts[sym] = keys.length;
  return { totalSnapshots: _store.size, symbolCounts };
}

module.exports = { save, getLatestCanonical, getLatest, getCanonicalHistory, count, clear, clearAll, getStats };
