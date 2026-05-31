import { create } from 'zustand';
import { api } from '../api.js';

const errMsg = (err) => err?.message || 'ML signal request failed';

/**
 * ML Signal store — P1 signal engine state.
 *
 * Separate from aiLabStore to keep the real-time signal surface
 * independent from the training/registry workflow.
 *
 * Tracks:
 *   - Current signal per symbol (canonical + provisional)
 *   - Feature snapshot per symbol
 *   - Model info (champion)
 *   - Diagnostics + drift
 */
export const useMLSignalStore = create((set, get) => ({
  // ── Signals (keyed by symbol) ─────────────────────────────────────────────
  signalBySymbol:   {},    // symbol → signal response
  signalLoading:    {},    // symbol → bool
  signalError:      {},    // symbol → string

  // ── Features (keyed by symbol) ────────────────────────────────────────────
  featuresBySymbol: {},
  featuresLoading:  {},
  featuresError:    {},

  // ── Model info ─────────────────────────────────────────────────────────────
  models:           [],
  modelsLoading:    false,
  modelsError:      '',
  activeModelVersion: null,

  // ── Diagnostics ───────────────────────────────────────────────────────────
  diagnostics:      null,
  diagnosticsLoading: false,
  diagnosticsError:   '',

  lastUpdated: null,

  // ── Actions ───────────────────────────────────────────────────────────────

  loadSignal: async (symbol, timeframe = '1m') => {
    const sym = (symbol || 'SPY').toUpperCase();
    set((s) => ({ signalLoading: { ...s.signalLoading, [sym]: true }, signalError: { ...s.signalError, [sym]: '' } }));
    try {
      const data = await api.getMLSignal(sym, timeframe);
      set((s) => ({
        signalBySymbol: { ...s.signalBySymbol, [sym]: data },
        signalLoading:  { ...s.signalLoading, [sym]: false },
        lastUpdated:    new Date().toISOString(),
        activeModelVersion: data?.modelVersion || s.activeModelVersion,
      }));
    } catch (err) {
      set((s) => ({
        signalLoading: { ...s.signalLoading, [sym]: false },
        signalError:   { ...s.signalError, [sym]: errMsg(err) },
      }));
    }
  },

  loadFeatures: async (symbol, timeframe = '1m') => {
    const sym = (symbol || 'SPY').toUpperCase();
    set((s) => ({ featuresLoading: { ...s.featuresLoading, [sym]: true }, featuresError: { ...s.featuresError, [sym]: '' } }));
    try {
      const data = await api.getMLFeatures(sym, timeframe);
      set((s) => ({
        featuresBySymbol: { ...s.featuresBySymbol, [sym]: data },
        featuresLoading:  { ...s.featuresLoading, [sym]: false },
      }));
    } catch (err) {
      set((s) => ({
        featuresLoading: { ...s.featuresLoading, [sym]: false },
        featuresError:   { ...s.featuresError, [sym]: errMsg(err) },
      }));
    }
  },

  refreshAll: async (symbol, timeframe = '1m') => {
    const sym = (symbol || 'SPY').toUpperCase();
    await Promise.allSettled([
      get().loadSignal(sym, timeframe),
      get().loadFeatures(sym, timeframe),
    ]);
  },

  loadModels: async (symbol) => {
    set({ modelsLoading: true, modelsError: '' });
    try {
      const data = await api.getMLModels(symbol);
      const models = Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
      set({ models, modelsLoading: false });
    } catch (err) {
      set({ modelsLoading: false, modelsError: errMsg(err) });
    }
  },

  promoteModel: async (modelVersion) => {
    try {
      await api.promoteMLModel(modelVersion);
      await get().loadModels();
    } catch (err) {
      set({ modelsError: errMsg(err) });
    }
  },

  loadDiagnostics: async () => {
    set({ diagnosticsLoading: true, diagnosticsError: '' });
    try {
      const data = await api.getMLMetrics();
      set({ diagnostics: data, diagnosticsLoading: false });
    } catch (err) {
      set({ diagnosticsLoading: false, diagnosticsError: errMsg(err) });
    }
  },

  // Update signal from WS push (canonical or provisional)
  handleWsSignal: (msg) => {
    if (!msg?.symbol || !msg?.class) return;
    const sym = msg.symbol.toUpperCase();
    set((s) => ({
      signalBySymbol: { ...s.signalBySymbol, [sym]: msg },
      lastUpdated:    new Date().toISOString(),
    }));
  },

  clearSymbol: (symbol) => {
    const sym = symbol.toUpperCase();
    set((s) => {
      const { [sym]: _, ...signalBySymbol }   = s.signalBySymbol;
      const { [sym]: __, ...featuresBySymbol } = s.featuresBySymbol;
      return { signalBySymbol, featuresBySymbol };
    });
  },
}));
