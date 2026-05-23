import { create } from 'zustand';

export const useWorkspaceStore = create((set) => ({
  workspace: 'Risk',

  setWorkspace: (workspace) =>
    set({ workspace }),
}));
