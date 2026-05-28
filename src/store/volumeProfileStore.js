import { create } from 'zustand';
import { api } from '../api.js';
import { useActiveSymbolStore } from './activeSymbolStore.js';
import { useChartStore } from './chartStore.js';

const STORAGE_KEY = 'vp_settings_v1';

function loadPersistedSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function persistSettings(patch) {
  try {
    const current = loadPersistedSettings();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {}
}

// Normalize poc/vah/val/hvn/lvn — backend may return {price:X} or a raw number
function normPrice(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'object'
    ? Number(v?.price ?? v?.priceLevel ?? v?.level ?? NaN)
    : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Module-level state to avoid React closure issues
let _vpAbort = null;
let _vpDebounce = null;
let _vpLastRefresh = 0;

// Extension point: future WebSocket profile update handler (TPO, Delta, Composite)
export let _vpWsUpdateHandler = null;

const saved = loadPersistedSettings();

export const useVolumeProfileStore = create((set, get) => ({
  // Profile data
  profile: [],
  poc: null,
  vah: null,
  val: null,
  hvn: [],
  lvn: [],

  // Request state
  loading: false,
  error: null,
  lastUpdate: null,
  symbol: null,
  timeframe: null,
  source: null,

  // Persisted UI settings (survive reload)
  visible: saved.visible !== undefined ? Boolean(saved.visible) : true,
  mode: saved.mode || 'visible_range',
  bins: Number(saved.bins) || 50,

  // Extension points for future profile types — NOT implemented, reserved
  _profileType: 'volume',    // future: 'tpo' | 'delta' | 'composite'
  _wsConnected: false,       // future: true when WS profile stream is live
  _setWsConnected: (v) => set({ _wsConnected: Boolean(v) }),

  loadVolumeProfile: async () => {
    const symbol = useActiveSymbolStore.getState().symbol;
    const timeframe = useChartStore.getState().timeframe;
    if (!symbol) return;

    if (_vpAbort) _vpAbort.abort();
    _vpAbort = new AbortController();

    // Mark load time so refreshVolumeProfile's 30s throttle suppresses duplicate calls
    // triggered shortly after (e.g. chart subscription fires right after mount effect).
    _vpLastRefresh = Date.now();

    console.debug('[volumeProfile] loading', { symbol, timeframe, mode: get().mode, bins: get().bins });
    set({ loading: true, error: null });

    const t0 = performance.now();
    try {
      const data = await api.getVolumeProfile(symbol, _vpAbort.signal, { mode: get().mode, bins: get().bins });

      // Stale guard: discard if symbol changed while fetch was in flight
      const currentSym = useActiveSymbolStore.getState().symbol;
      if (currentSym !== symbol) {
        console.debug('[volumeProfile] stale response ignored', { requested: symbol, current: currentSym });
        set({ loading: false });
        return;
      }

      const profile = Array.isArray(data.profile) ? data.profile : [];
      const poc = normPrice(data.poc);
      const vah = normPrice(data.vah);
      const val = normPrice(data.val);
      const hvn = Array.isArray(data.hvn) ? data.hvn.map(normPrice).filter(Boolean) : [];
      const lvn = Array.isArray(data.lvn) ? data.lvn.map(normPrice).filter(Boolean) : [];

      console.debug('[volumeProfile] loaded', {
        symbol,
        bins: profile.length,
        poc,
        vah,
        val,
        hvnCount: hvn.length,
        lvnCount: lvn.length,
        source: data.source,
        renderMs: (performance.now() - t0).toFixed(1),
      });

      set({
        profile,
        poc,
        vah,
        val,
        hvn,
        lvn,
        loading: false,
        error: null,
        lastUpdate: new Date().toISOString(),
        symbol: data.symbol || symbol,
        timeframe: data.timeframe || timeframe,
        source: data.source || null,
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        console.debug('[volumeProfile] request aborted cleanly');
        return;
      }
      console.warn('[volumeProfile] API failure', { message: err?.message, symbol });
      set({ loading: false, error: err?.message || 'Failed to load volume profile' });
    }
  },

  // Throttled refresh for realtime / chart-update triggers (max once per 30s)
  refreshVolumeProfile: () => {
    const now = Date.now();
    if (now - _vpLastRefresh < 30000) {
      console.debug('[volumeProfile] refresh throttled', { silenceMs: now - _vpLastRefresh });
      return;
    }
    _vpLastRefresh = now;
    console.debug('[volumeProfile] refresh triggered');
    get().loadVolumeProfile();
  },

  setVisible: (visible) => {
    set({ visible: Boolean(visible) });
    persistSettings({ visible: Boolean(visible) });
  },

  setMode: (mode) => {
    set({ mode });
    persistSettings({ mode });
    get().loadVolumeProfile();
  },

  setBins: (n) => {
    const bins = Math.max(10, Math.min(200, Number(n) || 50));
    set({ bins });
    persistSettings({ bins });
    get().loadVolumeProfile();
  },
}));

// Auto-reload when active symbol changes (debounced 300ms)
useActiveSymbolStore.subscribe((state) => {
  const vp = useVolumeProfileStore.getState();
  if (vp.symbol !== state.symbol) {
    clearTimeout(_vpDebounce);
    _vpDebounce = setTimeout(() => {
      console.debug('[volumeProfile] symbol change → reload', { symbol: state.symbol });
      useVolumeProfileStore.getState().loadVolumeProfile();
    }, 300);
  }
});

// Refresh when chart data updates (timeframe change, manual refresh) — throttled to 30s
useChartStore.subscribe((state, prevState) => {
  if (state.lastUpdated && state.lastUpdated !== prevState?.lastUpdated) {
    useVolumeProfileStore.getState().refreshVolumeProfile();
  }
});
