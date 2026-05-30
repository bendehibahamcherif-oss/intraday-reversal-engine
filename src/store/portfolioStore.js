import { create } from 'zustand';
import { api } from '../api.js';

export const usePortfolioStore = create((set, get) => ({
  mode: 'paper',

  positions: [],
  positionsLoading: false,
  positionsError: '',

  pnl: null,
  pnlLoading: false,
  pnlError: '',

  exposure: null,
  exposureLoading: false,
  exposureError: '',

  drawdown: null,
  drawdownLoading: false,
  drawdownError: '',

  varResult: null,
  varLoading: false,
  varError: '',
  varConfig: { confidence: 0.95, method: 'historical', horizon: 1 },

  stressTestResult: null,
  stressTestLoading: false,
  stressTestError: '',

  riskStatus: null,
  riskStatusLoading: false,
  killSwitchLoading: false,

  setMode: (mode) => set({
    mode,
    positions: [], pnl: null, exposure: null, drawdown: null,
    varResult: null, stressTestResult: null,
    positionsError: '', pnlError: '', exposureError: '', drawdownError: '', varError: '', stressTestError: '',
  }),

  setVarConfig: (cfg) => set((s) => ({ varConfig: { ...s.varConfig, ...cfg } })),

  loadPositions: async () => {
    const { mode } = get();
    set({ positionsLoading: true, positionsError: '' });
    try {
      const data = await api.getPortfolioPositions(mode);
      const positions = Array.isArray(data?.positions) ? data.positions : Array.isArray(data) ? data : [];
      set({ positions, positionsLoading: false });
    } catch (e) {
      set({ positionsLoading: false, positionsError: e?.message || 'Failed to load positions' });
    }
  },

  loadPnL: async () => {
    const { mode } = get();
    set({ pnlLoading: true, pnlError: '' });
    try {
      const data = await api.getPortfolioPnL(mode);
      set({ pnl: data?.pnl ?? data ?? null, pnlLoading: false });
    } catch (e) {
      set({ pnlLoading: false, pnlError: e?.message || 'Failed to load P&L' });
    }
  },

  loadExposure: async () => {
    const { mode } = get();
    set({ exposureLoading: true, exposureError: '' });
    try {
      const data = await api.getPortfolioExposure(mode);
      set({ exposure: data?.exposure ?? data ?? null, exposureLoading: false });
    } catch (e) {
      set({ exposureLoading: false, exposureError: e?.message || 'Failed to load exposure' });
    }
  },

  loadDrawdown: async () => {
    const { mode } = get();
    set({ drawdownLoading: true, drawdownError: '' });
    try {
      const data = await api.getPortfolioDrawdown(mode);
      set({ drawdown: data?.drawdown ?? data ?? null, drawdownLoading: false });
    } catch (e) {
      set({ drawdownLoading: false, drawdownError: e?.message || 'Failed to load drawdown' });
    }
  },

  loadVaR: async () => {
    const { mode, varConfig } = get();
    set({ varLoading: true, varError: '' });
    try {
      const data = await api.getPortfolioVaR(mode, varConfig);
      set({ varResult: data?.var ?? data ?? null, varLoading: false });
    } catch (e) {
      set({ varLoading: false, varError: e?.message || 'Failed to compute VaR' });
    }
  },

  runStressTest: async (scenarios) => {
    const { mode } = get();
    set({ stressTestLoading: true, stressTestError: '' });
    try {
      const data = await api.runPortfolioStressTest(mode, { scenarios });
      set({ stressTestResult: data?.result ?? data ?? null, stressTestLoading: false });
    } catch (e) {
      set({ stressTestLoading: false, stressTestError: e?.message || 'Stress test failed' });
    }
  },

  loadRiskStatus: async () => {
    set({ riskStatusLoading: true });
    try {
      const data = await api.getPaperRiskStatus();
      set({ riskStatus: data ?? null, riskStatusLoading: false });
    } catch {
      set({ riskStatusLoading: false });
    }
  },

  enableKillSwitch: async () => {
    set({ killSwitchLoading: true });
    try {
      await api.enablePaperKillSwitch();
      await get().loadRiskStatus();
    } finally {
      set({ killSwitchLoading: false });
    }
  },

  disableKillSwitch: async () => {
    set({ killSwitchLoading: true });
    try {
      await api.disablePaperKillSwitch();
      await get().loadRiskStatus();
    } finally {
      set({ killSwitchLoading: false });
    }
  },

  loadAll: () => {
    const s = get();
    s.loadPositions();
    s.loadPnL();
    s.loadExposure();
    s.loadDrawdown();
    s.loadRiskStatus();
  },
}));
