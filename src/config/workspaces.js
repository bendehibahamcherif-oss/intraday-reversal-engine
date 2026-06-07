export const DEFAULT_WORKSPACE_ID = 'ChartOrderflow';

const workspaceNavigationOverrides = {
  ChartOrderflow: { ariaLabel: 'Chart', navTestId: 'workspace-nav-chart' },
  Macro: { ariaLabel: 'Markets', navTestId: 'workspace-nav-markets' },
  LiveData: { ariaLabel: 'Live Data', navTestId: 'workspace-nav-live-data' },
  AILab: { ariaLabel: 'AI Lab', navTestId: 'workspace-nav-ai-lab' },
  MLEngine: { ariaLabel: 'ML Signal Engine', navTestId: 'workspace-nav-ml' },
  MacroMultiAsset: { ariaLabel: 'Macro', navTestId: 'workspace-nav-macro' },
  Backtesting: { ariaLabel: 'Backtesting', navTestId: 'workspace-nav-backtesting' },
  Portfolio: { ariaLabel: 'Portfolio', navTestId: 'workspace-nav-portfolio' },
  Risk: { ariaLabel: 'Risk', navTestId: 'workspace-nav-risk' },
};

const toNavTestId = (workspaceId) => `workspace-nav-${workspaceId.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;

const baseWorkspaceDefinitions = [
  { id: 'ChartOrderflow', label: 'Chart', shortLabel: 'CH', icon: '▤', componentKey: 'ChartOrderflow', group: 'Primary', mobileVisible: true, desktopVisible: true, implemented: true, order: 10, mobilePrimary: true, aliases: ['Chart / Orderflow'] },
  { id: 'Macro', label: 'Markets', shortLabel: 'MK', icon: '◎', componentKey: 'Macro', group: 'Markets', mobileVisible: true, desktopVisible: true, implemented: true, order: 20, mobilePrimary: true, aliases: ['Macro / Multi-Asset', 'Live Markets'] },
  { id: 'Alerts', label: 'Alerts', shortLabel: 'AL', icon: '▲', componentKey: 'Alerts', group: 'Primary', mobileVisible: true, desktopVisible: true, implemented: true, order: 30, mobilePrimary: true },
  { id: 'AILab', label: 'AI Lab', shortLabel: 'AI', icon: '◆', componentKey: 'AILab', group: 'ML', mobileVisible: true, desktopVisible: true, implemented: true, order: 40, mobilePrimary: true },
  { id: 'Risk', label: 'Risk', shortLabel: 'RK', icon: '◇', componentKey: 'Risk', group: 'Risk', mobileVisible: true, desktopVisible: true, implemented: true, order: 50, aliases: ['Dashboard / Risk', 'Risk / Dashboard'] },
  { id: 'LiveData', label: 'Live Data', shortLabel: 'LD', icon: '◌', componentKey: 'LiveData', group: 'Data', mobileVisible: true, desktopVisible: true, implemented: true, order: 60 },
  { id: 'Providers', label: 'Providers', shortLabel: 'PR', icon: '◌', componentKey: 'LiveData', group: 'Data', mobileVisible: true, desktopVisible: true, implemented: true, order: 70, aliases: ['Provider Setup'] },
  { id: 'Credentials', label: 'Credentials', shortLabel: 'CR', icon: '◌', componentKey: 'LiveData', group: 'Data', mobileVisible: true, desktopVisible: true, implemented: true, order: 80, aliases: ['Provider Credentials'] },
  { id: 'StreamStatus', label: 'Stream Status', shortLabel: 'SS', icon: '◌', componentKey: 'LiveData', group: 'Data', mobileVisible: true, desktopVisible: true, implemented: true, order: 90 },
  { id: 'ProviderDiagnostics', label: 'Provider Diagnostics', shortLabel: 'PD', icon: '◌', componentKey: 'LiveData', group: 'Data', mobileVisible: true, desktopVisible: true, implemented: true, order: 100 },
  { id: 'VolumeProfile', label: 'Volume Profile', shortLabel: 'VP', icon: '▥', componentKey: 'ChartOrderflow', group: 'Chart', mobileVisible: true, desktopVisible: true, implemented: true, order: 110 },
  { id: 'MLEngine', label: 'ML Dashboard', shortLabel: 'ML', icon: '◆', componentKey: 'MLEngine', group: 'ML', mobileVisible: true, desktopVisible: true, implemented: true, order: 120, aliases: ['ML Engine'] },
  { id: 'MLModelCard', label: 'ML Model Card', shortLabel: 'MC', icon: '◆', componentKey: 'MLEngine', group: 'ML', mobileVisible: true, desktopVisible: true, implemented: true, order: 130 },
  { id: 'MLTrainingRuns', label: 'ML Training Runs', shortLabel: 'TR', icon: '◆', componentKey: 'MLEngine', group: 'ML', mobileVisible: true, desktopVisible: true, implemented: true, order: 140 },
  { id: 'MLPredictions', label: 'ML Predictions', shortLabel: 'MP', icon: '◆', componentKey: 'MLEngine', group: 'ML', mobileVisible: true, desktopVisible: true, implemented: true, order: 150 },
  { id: 'MLDiagnosticsDrift', label: 'ML Diagnostics & Drift', shortLabel: 'DR', icon: '◆', componentKey: 'MLEngine', group: 'ML', mobileVisible: true, desktopVisible: true, implemented: true, order: 160 },
  { id: 'MLChampionInference', label: 'ML Champion Inference', shortLabel: 'CI', icon: '◆', componentKey: 'AILab', group: 'ML', mobileVisible: true, desktopVisible: true, implemented: true, order: 170 },
  { id: 'HistoricalData', label: 'Historical Data', shortLabel: 'HD', icon: '▦', componentKey: 'HistoricalData', group: 'Data', mobileVisible: true, desktopVisible: true, implemented: true, order: 180 },
  { id: 'Execution', label: 'Execution', shortLabel: 'EX', icon: '↯', componentKey: 'Execution', group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 190, aliases: ['Quant Signals'] },
  { id: 'Backtesting', label: 'Backtesting', shortLabel: 'BT', icon: '↺', componentKey: 'StrategyBuilder', group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 200 },
  { id: 'PaperTrading', label: 'Paper Trading', shortLabel: 'PT', icon: '◧', componentKey: 'PaperTrading', group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 210 },
  { id: 'Portfolio', label: 'Portfolio', shortLabel: 'PF', icon: '▣', componentKey: 'Portfolio', group: 'Risk', mobileVisible: true, desktopVisible: true, implemented: true, order: 220 },
  { id: 'MacroMultiAsset', label: 'Macro / Multi-Asset', shortLabel: 'MA', icon: '◎', componentKey: 'Macro', group: 'Markets', mobileVisible: true, desktopVisible: true, implemented: true, order: 230 },
  { id: 'Correlation', label: 'Correlation', shortLabel: 'CO', icon: '◎', componentKey: 'Macro', group: 'Markets', mobileVisible: true, desktopVisible: true, implemented: true, order: 240 },
  { id: 'Beta', label: 'Beta', shortLabel: 'BE', icon: 'β', componentKey: 'Macro', group: 'Markets', mobileVisible: true, desktopVisible: true, implemented: true, order: 250 },
  { id: 'StrategyLab', label: 'Strategy Lab', shortLabel: 'SL', icon: '☷', componentKey: 'StrategyLab', group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 260 },
  { id: 'QuantLab', label: 'Quant Lab', shortLabel: 'QL', icon: '∑', componentKey: 'QuantLab', group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 270 },
  { id: 'StrategyBuilder', label: 'Strategy Builder', shortLabel: 'SB', icon: '☷', componentKey: 'StrategyBuilder', group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 280 },
  { id: 'Replay', label: 'Replay', shortLabel: 'RP', icon: '◀', componentKey: 'Replay', group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 290 },
  { id: 'Settings', label: 'Settings / More', shortLabel: 'ST', icon: '⚙', componentKey: 'Ops', group: 'System', mobileVisible: true, desktopVisible: false, implemented: true, order: 300, aliases: ['Settings'] },
  { id: 'OMS', label: 'OMS', shortLabel: 'OM', icon: '▤', componentKey: 'OMS', group: 'Trading', mobileVisible: true, desktopVisible: true, implemented: true, order: 310 },
  { id: 'Institutional', label: 'Institutional', shortLabel: 'IN', icon: '▧', componentKey: 'Institutional', group: 'System', mobileVisible: true, desktopVisible: true, implemented: true, order: 320 },
  { id: 'Ops', label: 'Operations', shortLabel: 'OP', icon: '⚙', componentKey: 'Ops', group: 'System', mobileVisible: true, desktopVisible: true, implemented: true, order: 330 },
];

export const workspaceDefinitions = baseWorkspaceDefinitions.map((workspace) => ({
  ...workspace,
  ariaLabel: workspaceNavigationOverrides[workspace.id]?.ariaLabel ?? workspace.label,
  navTestId: workspaceNavigationOverrides[workspace.id]?.navTestId ?? toNavTestId(workspace.id),
}));

export const sortedWorkspaces = [...workspaceDefinitions].sort((a, b) => a.order - b.order);
export const workspaceIds = new Set(workspaceDefinitions.map((workspace) => workspace.id));
export const workspaceById = Object.fromEntries(workspaceDefinitions.map((workspace) => [workspace.id, workspace]));
export const isValidWorkspaceId = (workspaceId) => workspaceIds.has(workspaceId);
export const getWorkspace = (workspaceId) => workspaceById[workspaceId] ?? workspaceById[DEFAULT_WORKSPACE_ID];
export const normalizeWorkspaceId = (workspaceId) => isValidWorkspaceId(workspaceId) ? workspaceId : DEFAULT_WORKSPACE_ID;
export const getDesktopWorkspaces = () => sortedWorkspaces.filter((workspace) => workspace.desktopVisible);
export const getMobilePrimaryWorkspaces = () => sortedWorkspaces.filter((workspace) => workspace.mobileVisible && workspace.mobilePrimary);
export const getMobileMoreWorkspaces = () => sortedWorkspaces.filter((workspace) => workspace.mobileVisible && !workspace.mobilePrimary);
export const getImplementedWorkspaces = () => sortedWorkspaces.filter((workspace) => workspace.implemented);
