import { workspaceDefinitions } from '../../../src/config/workspaces.js';

export const implementedWorkspaces = workspaceDefinitions
  .filter((workspace) => workspace.implemented)
  .sort((a, b) => a.order - b.order);

export const desktopWorkspaces = implementedWorkspaces.filter((workspace) => workspace.desktopVisible);
export const mobileWorkspaces = implementedWorkspaces.filter((workspace) => workspace.mobileVisible);
export const mobilePrimaryWorkspaces = mobileWorkspaces.filter((workspace) => workspace.mobilePrimary);
export const mobileMoreWorkspaces = mobileWorkspaces.filter((workspace) => !workspace.mobilePrimary);

export function workspaceById(id: string) {
  const canonicalMatch = implementedWorkspaces.find((workspace) => workspace.id === id);
  if (canonicalMatch) return canonicalMatch;

  const aliasMatches = implementedWorkspaces.filter((workspace) => workspace.aliases?.includes(id));
  if (aliasMatches.length > 1) {
    throw new Error(`Workspace alias "${id}" maps to multiple implemented workspaces: ${aliasMatches.map((workspace) => workspace.id).join(', ')}`);
  }

  return aliasMatches[0];
}

export function requiredWorkspaceLabels(ids: string[]) {
  return ids.map((id) => {
    const workspace = workspaceById(id);
    if (!workspace) throw new Error(`Missing implemented workspace metadata for ${id}`);
    return workspace.label;
  });
}

export function requiredWorkspaceNavLabels(ids: string[]) {
  return ids.map((id) => {
    const workspace = workspaceById(id);
    if (!workspace) throw new Error(`Missing implemented workspace metadata for ${id}`);
    return workspace.ariaLabel || workspace.label;
  });
}

export const invalidTextPatterns = [
  /API endpoint not found/i,
  /Endpoint not available/i,
  /Invalid JSON response/i,
  /\bundefined\b/i,
  /\bNaN\b/i,
  /\bInfinity\b/i,
  /\[object Object\]/i,
  /Cannot read properties/i,
  /is not a function/i,
  /NetworkError/i,
  /\b404\b/,
  /\b500\b/,
  /TypeError/i,
  /ReferenceError/i,
  /Unhandled Promise Rejection/i,
  /at\s+\w+\s*\([^)]*\.jsx?:\d+:\d+\)/,
];

export function duplicateLabels(labels: string[]) {
  const counts = new Map<string, number>();
  for (const label of labels.map((value) => value.trim()).filter(Boolean)) {
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([label, count]) => ({ label, count }));
}
