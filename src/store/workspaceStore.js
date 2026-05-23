import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useWorkspaceStore = create(
  persist(
    (set) => ({
      workspace: 'Risk',

      setWorkspace: (workspace) =>
        set({ workspace }),
    }),
    {
      name: 'reversal-workspace',
    }
  )
);
