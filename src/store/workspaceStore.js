import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isValidWorkspace, DEFAULT_WORKSPACE } from '../config/workspaces.js';

export const useWorkspaceStore = create(
  persist(
    (set) => ({
      workspace: DEFAULT_WORKSPACE,

      setWorkspace: (id) => {
        if (!isValidWorkspace(id)) return;
        set({ workspace: id });
      },
    }),
    {
      name: 'reversal-workspace',
      onRehydrateStorage: () => (state) => {
        if (state && !isValidWorkspace(state.workspace)) {
          state.workspace = DEFAULT_WORKSPACE;
        }
      },
    }
  )
);
