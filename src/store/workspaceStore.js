import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_WORKSPACE_ID, normalizeWorkspaceId } from '../config/workspaces.js';

const safeWorkspaceStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Persistence is best-effort; navigation must keep working.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Ignore storage failures.
    }
  },
};

export const useWorkspaceStore = create(
  persist(
    (set, get) => ({
      workspace: DEFAULT_WORKSPACE_ID,

      setWorkspace: (workspace) => {
        const nextWorkspace = normalizeWorkspaceId(workspace);
        set({ workspace: nextWorkspace });
        return nextWorkspace;
      },

      validateWorkspace: () => {
        const workspace = normalizeWorkspaceId(get().workspace);
        if (workspace !== get().workspace) set({ workspace });
        return workspace;
      },
    }),
    {
      name: 'reversal-workspace',
      storage: createJSONStorage(() => safeWorkspaceStorage),
      partialize: (state) => ({ workspace: normalizeWorkspaceId(state.workspace) }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...persistedState,
        workspace: normalizeWorkspaceId(persistedState?.workspace),
      }),
      onRehydrateStorage: () => (state) => {
        state?.validateWorkspace?.();
      },
    }
  )
);
