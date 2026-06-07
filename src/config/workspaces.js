/**
 * Canonical workspace registry.
 * Both TerminalSidebar (desktop) and MobileBottomNav (mobile) read from here.
 * Workspace IDs must match the case keys in App.jsx WorkspaceSwitch.
 */

export const WORKSPACES = [
  // ── Charts ──────────────────────────────────────────────────────────────────
  { id: 'ChartOrderflow',  label: 'Chart / Orderflow',   shortLabel: 'Chart',    abbr: 'CH', icon: '▤', group: 'Charts',   order: 1,  implemented: true },
  // ── Markets ─────────────────────────────────────────────────────────────────
  { id: 'Macro',           label: 'Live Markets',         shortLabel: 'Markets',  abbr: 'MK', icon: '◎', group: 'Markets',  order: 2,  implemented: true },
  { id: 'LiveData',        label: 'Live Data',            shortLabel: 'Live Data',abbr: 'LD', icon: '◉', group: 'Markets',  order: 3,  implemented: true },
  { id: 'Execution',       label: 'Quant Signals',        shortLabel: 'Signals',  abbr: 'EX', icon: '⚡', group: 'Markets',  order: 4,  implemented: true },
  // ── Trading ─────────────────────────────────────────────────────────────────
  { id: 'Portfolio',       label: 'Portfolio',            shortLabel: 'Portfolio',abbr: 'PF', icon: '◧', group: 'Trading',  order: 5,  implemented: true },
  { id: 'PaperTrading',    label: 'Paper Trading',        shortLabel: 'Paper',    abbr: 'PT', icon: '◳', group: 'Trading',  order: 6,  implemented: true },
  { id: 'OMS',             label: 'Order Management',     shortLabel: 'OMS',      abbr: 'OM', icon: '◪', group: 'Trading',  order: 7,  implemented: true },
  { id: 'Alerts',          label: 'Alerts',               shortLabel: 'Alerts',   abbr: 'AL', icon: '▲', group: 'Trading',  order: 8,  implemented: true },
  // ── Risk ────────────────────────────────────────────────────────────────────
  { id: 'Risk',            label: 'Risk / Dashboard',     shortLabel: 'Risk',     abbr: 'RK', icon: '⬡', group: 'Risk',     order: 9,  implemented: true },
  // ── ML / AI ─────────────────────────────────────────────────────────────────
  { id: 'MLEngine',        label: 'ML Engine',            shortLabel: 'ML',       abbr: 'ML', icon: '◆', group: 'ML / AI',  order: 10, implemented: true },
  { id: 'AILab',           label: 'AI Lab',               shortLabel: 'AI Lab',   abbr: 'AI', icon: '◈', group: 'ML / AI',  order: 11, implemented: true },
  // ── Data ────────────────────────────────────────────────────────────────────
  { id: 'HistoricalData',  label: 'Historical Data',      shortLabel: 'Hist Data',abbr: 'HD', icon: '◫', group: 'Data',     order: 12, implemented: true },
  // ── Strategy ────────────────────────────────────────────────────────────────
  { id: 'QuantLab',        label: 'Quant Lab / Backtest', shortLabel: 'Quant Lab',abbr: 'QL', icon: '◰', group: 'Strategy', order: 13, implemented: true },
  { id: 'StrategyLab',     label: 'Strategy Lab',         shortLabel: 'Strategy', abbr: 'SL', icon: '◱', group: 'Strategy', order: 14, implemented: true },
  { id: 'StrategyBuilder', label: 'Strategy Builder',     shortLabel: 'Builder',  abbr: 'SB', icon: '◲', group: 'Strategy', order: 15, implemented: true },
  { id: 'Replay',          label: 'Replay',               shortLabel: 'Replay',   abbr: 'RP', icon: '◁', group: 'Strategy', order: 16, implemented: true },
  // ── Advanced ────────────────────────────────────────────────────────────────
  { id: 'Institutional',   label: 'Institutional',        shortLabel: 'Instit.',  abbr: 'IN', icon: '◩', group: 'Advanced', order: 17, implemented: true },
  { id: 'Ops',             label: 'Ops / Observability',  shortLabel: 'Ops',      abbr: 'OP', icon: '◬', group: 'Advanced', order: 18, implemented: true },
];

export const WORKSPACE_IDS = new Set(WORKSPACES.map((w) => w.id));

export const DEFAULT_WORKSPACE = 'Risk';

export function isValidWorkspace(id) {
  return WORKSPACE_IDS.has(id);
}

export function getWorkspace(id) {
  return WORKSPACES.find((w) => w.id === id) || null;
}

// ── Mobile navigation ────────────────────────────────────────────────────────

/** IDs shown as primary tabs in the mobile bottom bar. */
export const MOBILE_PRIMARY_TAB_IDS = ['ChartOrderflow', 'Macro', 'Alerts', 'MLEngine'];

/** All workspaces that appear in the mobile "More" drawer. */
export const MOBILE_MORE_WORKSPACES = WORKSPACES.filter(
  (w) => !MOBILE_PRIMARY_TAB_IDS.includes(w.id),
);
