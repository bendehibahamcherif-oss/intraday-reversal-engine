export const DEFAULT_WORKSPACE_ID = 'ChartOrderflow';

const workspaceNavigationOverrides = {
  ChartOrderflow:  { ariaLabel: 'Chart',               navTestId: 'workspace-nav-chart' },
  MacroMultiAsset: { ariaLabel: 'Macro / Multi-Asset', navTestId: 'workspace-nav-macro' },
  LiveData:        { ariaLabel: 'Live Data',            navTestId: 'workspace-nav-live-data' },
  Providers:       { ariaLabel: 'Providers',            navTestId: 'workspace-nav-providers' },
  AILab:           { ariaLabel: 'AI Lab',               navTestId: 'workspace-nav-ai-lab' },
  MLEngine:        { ariaLabel: 'ML Dashboard',         navTestId: 'workspace-nav-ml' },
  Backtesting:     { ariaLabel: 'Backtesting',          navTestId: 'workspace-nav-backtesting' },
  Portfolio:       { ariaLabel: 'Portfolio',            navTestId: 'workspace-nav-portfolio' },
  Risk:            { ariaLabel: 'Risk',                 navTestId: 'workspace-nav-risk' },
};

const toNavTestId = (workspaceId) => `workspace-nav-${workspaceId.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;

// ── Canonical workspace registry ─────────────────────────────────────────────
// ONE ENTRY PER BUSINESS CAPABILITY.
// Functional duplicates have been merged into tabs/sections inside the canonical module.
//
// Removed entries (merged into tabs):
//   VolumeProfile       → tab inside ChartOrderflow
//   Macro               → duplicate of MacroMultiAsset (labeled 'Markets')
//   Correlation         → tab inside MacroMultiAsset
//   Beta                → tab inside MacroMultiAsset
//   Credentials         → tab inside Providers
//   StreamStatus        → tab inside LiveData
//   ProviderDiagnostics → tab inside Providers
//   MLChampionInference → merged into AILab
//   MLModelCard         → tab inside MLEngine
//   MLTrainingRuns      → tab inside MLEngine
//   MLPredictions       → tab inside MLEngine
//   MLDiagnosticsDrift  → tab inside MLEngine
//   StrategyBuilder     → duplicate of Backtesting
//   Settings            → duplicate of Ops (Ops is already mobileVisible)

const baseWorkspaceDefinitions = [
  // ── Primary ────────────────────────────────────────────────────────────────
  { id: 'ChartOrderflow', label: 'Chart',               shortLabel: 'CH', icon: '▤', componentKey: 'ChartOrderflow', group: 'Primary', mobileVisible: true, desktopVisible: true, implemented: true, order: 10, mobilePrimary: true, aliases: ['Chart / Orderflow'] },
  { id: 'MacroMultiAsset',label: 'Macro / Multi-Asset', shortLabel: 'MA', icon: '◎', componentKey: 'Macro',           group: 'Markets', mobileVisible: true, desktopVisible: true, implemented: true, order: 20, mobilePrimary: true, aliases: ['Macro', 'macro', 'MACRO', 'MA', 'MultiAsset', 'multiAsset', 'MacroMultiAsset', 'macroMultiAsset', 'Live Markets', 'Correlation', 'Beta'] },
  { id: 'Alerts',          label: 'Alerts',              shortLabel: 'AL', icon: '▲', componentKey: 'Alerts',          group: 'Primary', mobileVisible: true, desktopVisible: true, implemented: true, order: 30, mobilePrimary: true },
  { id: 'AILab',           label: 'AI Lab',              shortLabel: 'AI', icon: '◆', componentKey: 'AILab',           group: 'ML',      mobileVisible: true, desktopVisible: true, implemented: true, order: 40, mobilePrimary: true, aliases: ['ML Champion Inference'] },
  { id: 'Risk',            label: 'Risk',                shortLabel: 'RK', icon: '◇', componentKey: 'Risk',            group: 'Risk',    mobileVisible: true, desktopVisible: true, implemented: true, order: 50, aliases: ['Dashboard / Risk', 'Risk / Dashboard'] },
  // ── Data ──────────────────────────────────────────────────────────────────
  { id: 'LiveData',        label: 'Live Data',           shortLabel: 'LD', icon: '◌', componentKey: 'LiveData',        group: 'Data',    mobileVisible: true, desktopVisible: true, implemented: true, order: 60, aliases: ['Stream Status'] },
  { id: 'Providers',       label: 'Providers',           shortLabel: 'PR', icon: '◌', componentKey: 'LiveData',        group: 'Data',    mobileVisible: true, desktopVisible: true, implemented: true, order: 70, aliases: ['Provider Setup', 'Credentials', 'Provider Credentials', 'Provider Diagnostics'] },
  { id: 'HistoricalData',  label: 'Historical Data',     shortLabel: 'HD', icon: '▦', componentKey: 'HistoricalData',  group: 'Data',    mobileVisible: true, desktopVisible: true, implemented: true, order: 80 },
  // ── ML ────────────────────────────────────────────────────────────────────
  { id: 'MLEngine',        label: 'ML Dashboard',        shortLabel: 'ML', icon: '◆', componentKey: 'MLEngine',        group: 'ML',      mobileVisible: true, desktopVisible: true, implemented: true, order: 90, aliases: ['ML Engine', 'ML Model Card', 'ML Training Runs', 'ML Predictions', 'ML Diagnostics & Drift'] },
  // ── Trading ───────────────────────────────────────────────────────────────
  { id: 'Execution',       label: 'Execution',           shortLabel: 'EX', icon: '↯', componentKey: 'Execution',       group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 100, aliases: ['Quant Signals'] },
  { id: 'Backtesting',     label: 'Backtesting',         shortLabel: 'BT', icon: '↺', componentKey: 'StrategyBuilder', group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 110, aliases: ['Strategy Builder'] },
  { id: 'PaperTrading',    label: 'Paper Trading',       shortLabel: 'PT', icon: '◧', componentKey: 'PaperTrading',    group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 120 },
  { id: 'StrategyLab',     label: 'Strategy Lab',        shortLabel: 'SL', icon: '☷', componentKey: 'StrategyLab',     group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 130 },
  { id: 'QuantLab',        label: 'Quant Lab',           shortLabel: 'QL', icon: '∑', componentKey: 'QuantLab',         group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 140 },
  { id: 'Replay',          label: 'Replay',              shortLabel: 'RP', icon: '◀', componentKey: 'Replay',           group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 150 },
  // ── Risk / Portfolio ──────────────────────────────────────────────────────
  { id: 'Portfolio',       label: 'Portfolio',           shortLabel: 'PF', icon: '▣', componentKey: 'Portfolio',        group: 'Risk',    mobileVisible: true, desktopVisible: true, implemented: true, order: 160 },
  // ── System ────────────────────────────────────────────────────────────────
  { id: 'OMS',             label: 'OMS',                 shortLabel: 'OM', icon: '▤', componentKey: 'OMS',              group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 170 },
  { id: 'Institutional',   label: 'Institutional',       shortLabel: 'IN', icon: '▧', componentKey: 'Institutional',    group: 'System',  mobileVisible: true, desktopVisible: true, implemented: true, order: 180 },
  { id: 'Ops',             label: 'Operations',          shortLabel: 'OP', icon: '⚙', componentKey: 'Ops',              group: 'System',  mobileVisible: true, desktopVisible: true, implemented: true, order: 190, aliases: ['Settings / More', 'Settings'] },
];

export const workspaceDefinitions = baseWorkspaceDefinitions.map((workspace) => {
  const ariaLabel = workspaceNavigationOverrides[workspace.id]?.ariaLabel ?? workspace.label;
  const navTestId = workspaceNavigationOverrides[workspace.id]?.navTestId ?? toNavTestId(workspace.id);

  return {
    ...workspace,
    route: `/workspace/${workspace.id}`,
    component: workspace.componentKey,
    category: workspace.group,
    testId: navTestId,
    ariaLabel,
    navTestId,
    mobilePriority: workspace.mobilePrimary ? workspace.order : null,
    canonicalCapability: workspace.id,
    aliases: workspace.aliases ?? [],
  };
});

export const sortedWorkspaces = [...workspaceDefinitions].sort((a, b) => a.order - b.order);
export const workspaceIds = new Set(workspaceDefinitions.map((workspace) => workspace.id));
export const workspaceById = Object.fromEntries(workspaceDefinitions.map((workspace) => [workspace.id, workspace]));

const workspaceAliasEntries = workspaceDefinitions.flatMap((workspace) =>
  (workspace.aliases ?? [])
    .filter((alias) => alias && alias !== workspace.id)
    .map((alias) => [alias, workspace])
);

export const workspaceAliases = workspaceAliasEntries.reduce((aliases, [alias, workspace]) => {
  const existing = aliases[alias];
  if (existing && existing.id !== workspace.id) {
    throw new Error(`Workspace alias "${alias}" maps to multiple canonical workspaces: ${existing.id}, ${workspace.id}`);
  }
  aliases[alias] = workspace;
  return aliases;
}, {});

export const resolveWorkspaceId = (workspaceId) => {
  if (workspaceById[workspaceId]) return workspaceId;
  return workspaceAliases[workspaceId]?.id;
};

export const isValidWorkspaceId = (workspaceId) => Boolean(resolveWorkspaceId(workspaceId));
export const getWorkspace = (workspaceId) => workspaceById[resolveWorkspaceId(workspaceId)] ?? workspaceById[DEFAULT_WORKSPACE_ID];
export const normalizeWorkspaceId = (workspaceId) => resolveWorkspaceId(workspaceId) ?? DEFAULT_WORKSPACE_ID;
export const getDesktopWorkspaces = () => sortedWorkspaces.filter((workspace) => workspace.desktopVisible);
export const getMobilePrimaryWorkspaces = () => sortedWorkspaces.filter((workspace) => workspace.mobileVisible && workspace.mobilePrimary);
export const getMobileMoreWorkspaces = () => sortedWorkspaces.filter((workspace) => workspace.mobileVisible && !workspace.mobilePrimary);
export const getImplementedWorkspaces = () => sortedWorkspaces.filter((workspace) => workspace.implemented);
