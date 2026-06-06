import { writeFileSync } from 'node:fs';
import {
  getImplementedWorkspaces,
  getMobileMoreWorkspaces,
  getMobilePrimaryWorkspaces,
  sortedWorkspaces,
} from '../src/config/workspaces.js';

const validComponentKeys = new Set([
  'Risk',
  'Macro',
  'Portfolio',
  'Execution',
  'Replay',
  'QuantLab',
  'StrategyLab',
  'StrategyBuilder',
  'PaperTrading',
  'LiveData',
  'ChartOrderflow',
  'AILab',
  'Alerts',
  'OMS',
  'Institutional',
  'Ops',
  'MLEngine',
  'HistoricalData',
]);

const mobileAccessibleIds = new Set([
  ...getMobilePrimaryWorkspaces().map((workspace) => workspace.id),
  ...getMobileMoreWorkspaces().map((workspace) => workspace.id),
]);

const implementedWorkspaces = getImplementedWorkspaces();
const mobileMissingWorkspaces = implementedWorkspaces
  .filter((workspace) => !mobileAccessibleIds.has(workspace.id))
  .map((workspace) => ({ id: workspace.id, label: workspace.label }));

const unimplementedWorkspaces = sortedWorkspaces
  .filter((workspace) => !workspace.implemented)
  .map((workspace) => ({ id: workspace.id, label: workspace.label }));

const invalidWorkspaceMappings = sortedWorkspaces
  .filter((workspace) => !workspace.id || !workspace.label || !workspace.componentKey)
  .map((workspace) => ({ id: workspace.id ?? null, label: workspace.label ?? null, componentKey: workspace.componentKey ?? null }));

const missingComponents = sortedWorkspaces
  .filter((workspace) => workspace.implemented && !validComponentKeys.has(workspace.componentKey))
  .map((workspace) => ({ id: workspace.id, label: workspace.label, componentKey: workspace.componentKey }));

const duplicateIds = sortedWorkspaces
  .map((workspace) => workspace.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);

const results = {
  ok: mobileMissingWorkspaces.length === 0 && invalidWorkspaceMappings.length === 0 && missingComponents.length === 0 && duplicateIds.length === 0,
  totalWorkspaceCount: sortedWorkspaces.length,
  mobileAccessibleCount: mobileAccessibleIds.size,
  mobilePrimaryCount: getMobilePrimaryWorkspaces().length,
  mobileMoreCount: getMobileMoreWorkspaces().length,
  mobileMissingWorkspaces,
  unimplementedWorkspaces,
  invalidWorkspaceMappings,
  missingComponents,
  duplicateIds,
};

writeFileSync('MOBILE_NAVIGATION_SMOKE_RESULTS.json', `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));

if (!results.ok) {
  process.exitCode = 1;
}
