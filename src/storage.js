// ============ STORAGE ============
// localStorage avec fallback in-memory (pour navigation privée).
// IMPORTANT: la clé API Claude N'EST PAS stockée ici — elle est en variable d'env sur le backend.

const STORAGE_KEY = 'reversal_engine_v2';

let memoryFallback = null;
function safeStorage() {
  try {
    const t = '__test__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    if (!memoryFallback) {
      memoryFallback = {
        _data: {},
        getItem(k) { return this._data[k] ?? null; },
        setItem(k, v) { this._data[k] = v; },
        removeItem(k) { delete this._data[k]; },
      };
    }
    return memoryFallback;
  }
}

export const DEFAULT_SETTINGS = {
  claudeModel: 'claude-sonnet-4-6',
  useWebSearch: true,
  watchlists: [
    { id: 'indices', name: 'Indices US', tickers: ['SPY', 'QQQ', 'IWM', 'DIA'] },
    { id: 'tech', name: 'Tech megacaps', tickers: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'TSLA'] },
    { id: 'semis', name: 'Semiconducteurs', tickers: ['NVDA', 'AMD', 'TSM', 'AVGO', 'ASML'] },
  ],
  activeWatchlistId: 'indices',
  // Alerts
  alertsEnabled: false,
  alertSound: true,
  alertNotification: true,
  alertScanIntervalSec: 60,
  alertedKeys: {}, // {ticker_decision: timestamp} pour éviter de re-spam le même alert
};

export const MODELS = [
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', desc: 'Le plus puissant, plus lent et plus cher' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', desc: 'Très bon, génération précédente' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', desc: 'Équilibré (recommandé)' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', desc: 'Rapide et économique' },
];

export function loadSettings() {
  try {
    const raw = safeStorage().getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    safeStorage().setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error('saveSettings failed:', e);
    return false;
  }
}

export function newWatchlistId() {
  return 'wl_' + Math.random().toString(36).slice(2, 9);
}
