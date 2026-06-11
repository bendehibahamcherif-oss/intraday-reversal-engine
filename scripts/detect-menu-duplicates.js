#!/usr/bin/env node
import fs from 'node:fs';
import { workspaceDefinitions, DEFAULT_WORKSPACE_ID } from '../src/config/workspaces.js';

const componentSource = fs.readFileSync(new URL('../src/config/workspaceComponents.jsx', import.meta.url), 'utf8');
const componentKeys = [...componentSource.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]);
const errors = [];
const warnings = [];
const by = (items, keyFn) => items.reduce((map, item) => { const key = keyFn(item); map.set(key, [...(map.get(key) || []), item]); return map; }, new Map());

for (const [id, items] of by(workspaceDefinitions, (workspace) => workspace.id)) {
  if (items.length > 1) errors.push({ code: 'DUPLICATE_WORKSPACE_ID', id, items });
}
for (const [label, items] of by(workspaceDefinitions.filter((w) => w.desktopVisible || w.mobileVisible), (workspace) => workspace.label.trim())) {
  if (items.length > 1 && !items.every((item) => Array.isArray(item.aliases) && item.aliases.includes(label))) errors.push({ code: 'DUPLICATE_VISIBLE_LABEL', label, ids: items.map((item) => item.id) });
}
for (const workspace of workspaceDefinitions.filter((w) => w.implemented)) {
  for (const field of ['id','label','route','component','componentKey','category','group','testId','navTestId','ariaLabel','canonicalCapability']) {
    if (!workspace[field]) errors.push({ code: 'WORKSPACE_METADATA_MISSING', id: workspace.id, field });
  }
  if (workspace.route !== `/workspace/${workspace.id}`) errors.push({ code: 'WORKSPACE_ROUTE_MISMATCH', id: workspace.id, route: workspace.route });
  if (workspace.component !== workspace.componentKey) errors.push({ code: 'WORKSPACE_COMPONENT_ALIAS_MISMATCH', id: workspace.id, component: workspace.component, componentKey: workspace.componentKey });
  if (workspace.category !== workspace.group) errors.push({ code: 'WORKSPACE_CATEGORY_MISMATCH', id: workspace.id, category: workspace.category, group: workspace.group });
  if (workspace.testId !== workspace.navTestId) errors.push({ code: 'WORKSPACE_TEST_ID_MISMATCH', id: workspace.id, testId: workspace.testId, navTestId: workspace.navTestId });
  if (workspace.canonicalCapability !== workspace.id) errors.push({ code: 'WORKSPACE_CAPABILITY_MISMATCH', id: workspace.id, canonicalCapability: workspace.canonicalCapability });
  if (!Array.isArray(workspace.aliases)) errors.push({ code: 'WORKSPACE_ALIASES_MISSING', id: workspace.id });
  if (workspace.desktopVisible && !workspace.mobileVisible) errors.push({ code: 'DESKTOP_WORKSPACE_MISSING_MOBILE', id: workspace.id, label: workspace.label });
  if (workspace.mobileVisible && !workspace.desktopVisible) warnings.push({ code: 'MOBILE_ONLY_WORKSPACE', id: workspace.id, label: workspace.label });
  if (!componentKeys.includes(workspace.componentKey)) errors.push({ code: 'UNRESOLVED_COMPONENT_KEY', id: workspace.id, componentKey: workspace.componentKey });
}
const mobileById = new Map(workspaceDefinitions.filter((w) => w.mobileVisible).map((w) => [w.id, w]));
for (const desktop of workspaceDefinitions.filter((w) => w.desktopVisible)) {
  const mobile = mobileById.get(desktop.id);
  if (mobile && mobile.componentKey !== desktop.componentKey) errors.push({ code: 'MOBILE_STALE_COMPONENT', id: desktop.id, desktopComponent: desktop.componentKey, mobileComponent: mobile.componentKey });
}
const visible = workspaceDefinitions.filter((w) => w.desktopVisible || w.mobileVisible);
// Canonical duplicate checks — these patterns should never appear more than once
const exactAiLab = visible.filter((w) => /^(AI Lab|ML)$/i.test(w.label));
if (exactAiLab.length > 1) errors.push({ code: 'DUPLICATE_AI_LAB_MENU', ids: exactAiLab.map((w) => w.id) });
const exactMacro = visible.filter((w) => /^Macro\s*\/\s*Multi-Asset$/i.test(w.label));
if (exactMacro.length > 1) errors.push({ code: 'DUPLICATE_MACRO_MENU', ids: exactMacro.map((w) => w.id) });
const exactBacktest = visible.filter((w) => /^Backtesting$/i.test(w.label));
if (exactBacktest.length > 1) errors.push({ code: 'DUPLICATE_BACKTESTING_MENU', ids: exactBacktest.map((w) => w.id) });
// Verify no stale removed component names are re-registered
const staleNames = ['LegacyMLWorkspace', 'OldMacroWorkspace', 'BacktestPanel'];
for (const stale of staleNames) {
  if (componentSource.includes(stale)) errors.push({ code: 'STALE_WORKSPACE_COMPONENT_REGISTERED', component: stale });
}
// Verify functional duplicates that were removed do not reappear as top-level workspace IDs
const removedIds = ['VolumeProfile','Macro','Correlation','Beta','Credentials','StreamStatus',
  'ProviderDiagnostics','MLChampionInference','MLModelCard','MLTrainingRuns','MLPredictions',
  'MLDiagnosticsDrift','StrategyBuilder','Settings'];
for (const id of removedIds) {
  if (workspaceDefinitions.some((w) => w.id === id)) errors.push({ code: 'REMOVED_DUPLICATE_REREGISTERED', id });
}
const aliasOwners = new Map();
for (const workspace of workspaceDefinitions) {
  for (const alias of workspace.aliases ?? []) {
    if (alias === workspace.id) continue;
    const owner = aliasOwners.get(alias);
    if (owner && owner !== workspace.id) errors.push({ code: 'DUPLICATE_WORKSPACE_ALIAS', alias, ids: [owner, workspace.id] });
    aliasOwners.set(alias, workspace.id);
  }
}
const macro = workspaceDefinitions.find((workspace) => workspace.id === 'MacroMultiAsset');
if (!macro) errors.push({ code: 'CANONICAL_MACRO_MISSING' });
else {
  for (const alias of ['Macro', 'macro', 'MACRO', 'MA', 'MultiAsset', 'macroMultiAsset', 'MacroMultiAsset']) {
    if (alias !== macro.id && !macro.aliases.includes(alias)) errors.push({ code: 'MACRO_ALIAS_MISSING', alias });
  }
}
if (!workspaceDefinitions.some((workspace) => workspace.id === DEFAULT_WORKSPACE_ID)) errors.push({ code: 'DEFAULT_WORKSPACE_MISSING', id: DEFAULT_WORKSPACE_ID });

const results = { generatedAt: new Date().toISOString(), ok: errors.length === 0, counts: { workspaces: workspaceDefinitions.length, components: componentKeys.length }, errors, warnings };
fs.writeFileSync('MENU_DUPLICATION_RESULTS.json', JSON.stringify(results, null, 2));
if (!results.ok) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log(`Menu duplicate detector passed (${workspaceDefinitions.length} workspaces).`);
