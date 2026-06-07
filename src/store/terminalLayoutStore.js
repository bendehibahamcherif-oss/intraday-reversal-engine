import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const DEFAULT_STATE = {
  leftVisible: true,
  rightVisible: true,
  bottomVisible: true,
  sidebarCollapsed: false,
  layoutPreset: 'default',
  panelSizes: { left: 15, center: 55, right: 20, bottom: 10 },
  fullscreenPanel: null,
};

const safeJsonStorage = {
  getItem: (name) => { try { return localStorage.getItem(name); } catch { return null; } },
  setItem: (name, value) => { try { localStorage.setItem(name, value); } catch {} },
  removeItem: (name) => { try { localStorage.removeItem(name); } catch {} },
};

const PRESETS = {
  default: {
    leftVisible: true,
    rightVisible: true,
    bottomVisible: true,
    layoutPreset: 'default',
    panelSizes: { left: 15, center: 55, right: 20, bottom: 10 },
  },
  'chart-only': {
    leftVisible: false,
    rightVisible: false,
    bottomVisible: false,
    layoutPreset: 'chart-only',
    panelSizes: { left: 0, center: 100, right: 0, bottom: 0 },
  },
  '2-chart': {
    leftVisible: true,
    rightVisible: true,
    bottomVisible: false,
    layoutPreset: '2-chart',
    panelSizes: { left: 10, center: 60, right: 30, bottom: 0 },
  },
  '4-chart': {
    leftVisible: false,
    rightVisible: false,
    bottomVisible: false,
    layoutPreset: '4-chart',
    panelSizes: { left: 0, center: 100, right: 0, bottom: 0 },
  },
};

export const useTerminalLayoutStore = create(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      toggleLeft: () =>
        set((s) => ({ leftVisible: !s.leftVisible })),

      toggleRight: () =>
        set((s) => ({ rightVisible: !s.rightVisible })),

      toggleBottom: () =>
        set((s) => ({ bottomVisible: !s.bottomVisible })),

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setFullscreen: (panelId) =>
        set({ fullscreenPanel: panelId }),

      exitFullscreen: () =>
        set({ fullscreenPanel: null }),

      toggleFullscreen: (panelId) =>
        set((s) => ({
          fullscreenPanel: s.fullscreenPanel === panelId ? null : panelId,
        })),

      setPanelSizes: (partial) =>
        set((s) => ({
          panelSizes: { ...s.panelSizes, ...partial },
        })),

      resetLayout: () =>
        set({ ...DEFAULT_STATE }),

      setPreset: (preset) => {
        const config = PRESETS[preset];
        if (!config) return;
        set({ ...config, fullscreenPanel: null });
      },
    }),
    {
      name: 'reversal-terminal-layout',
      version: 2,
      storage: createJSONStorage(() => safeJsonStorage),
      merge: (persistedState, currentState) => {
        const next = { ...currentState, ...(persistedState && typeof persistedState === 'object' ? persistedState : {}) };
        const preset = PRESETS[next.layoutPreset] ? next.layoutPreset : DEFAULT_STATE.layoutPreset;
        return {
          ...next,
          layoutPreset: preset,
          panelSizes: { ...DEFAULT_STATE.panelSizes, ...(next.panelSizes && typeof next.panelSizes === 'object' ? next.panelSizes : {}) },
          fullscreenPanel: null,
        };
      },
      partialize: (state) => ({
        leftVisible: state.leftVisible,
        rightVisible: state.rightVisible,
        bottomVisible: state.bottomVisible,
        sidebarCollapsed: state.sidebarCollapsed,
        layoutPreset: state.layoutPreset,
        panelSizes: state.panelSizes,
      }),
    }
  )
);
