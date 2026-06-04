import { useEffect } from 'react';
import { useWorkspaceStore } from './store/workspaceStore.js';
import { useWatchlistStore } from './store/watchlistStore.js';
import { useMLSignalStore } from './store/mlSignalStore.js';

const WORKSPACE_MAP = {
  Dashboard: 'Risk',
  'Live Markets': 'Macro',
  'Quant Signals': 'Execution',
  'Risk Analytics': 'Risk',
  'Macro Intelligence': 'Macro',
  Portfolio: 'Portfolio',
  Replay: 'Replay',
  'Quant Lab': 'QuantLab',
  'Strategy Lab': 'StrategyLab',
  'Strategy Builder': 'StrategyBuilder',
  'Paper Trading': 'PaperTrading',
  'Live Data': 'LiveData',
  'Chart / Orderflow': 'ChartOrderflow',
  'AI Lab': 'AILab',
  'ML Engine': 'MLEngine',
};

const NAV_ITEMS = [
  { id: 'ChartOrderflow',  abbr: 'CH', title: 'Chart / Orderflow', shortcut: 'Alt+1' },
  { id: 'Risk',            abbr: 'RK', title: 'Risk / Dashboard',  shortcut: 'Alt+6' },
  { id: 'Macro',           abbr: 'MK', title: 'Live Markets',      shortcut: '' },
  { id: 'Execution',       abbr: 'EX', title: 'Quant Signals',     shortcut: 'Alt+2' },
  { id: 'Portfolio',       abbr: 'PF', title: 'Portfolio',         shortcut: 'Alt+5' },
  { id: 'LiveData',        abbr: 'LD', title: 'Live Data',         shortcut: '' },
  { id: 'Alerts',          abbr: 'AL', title: 'Alerts',            shortcut: 'Alt+3' },
  { id: 'MLEngine',        abbr: 'ML', title: 'ML Engine',         shortcut: 'Alt+4' },
  { id: 'AILab',           abbr: 'AI', title: 'AI Lab',            shortcut: '' },
  { id: 'QuantLab',        abbr: 'QL', title: 'Quant Lab',         shortcut: '' },
  { id: 'StrategyLab',     abbr: 'SL', title: 'Strategy Lab',      shortcut: '' },
  { id: 'StrategyBuilder', abbr: 'SB', title: 'Strategy Builder',  shortcut: '' },
  { id: 'PaperTrading',    abbr: 'PT', title: 'Paper Trading',     shortcut: '' },
  { id: 'Replay',          abbr: 'RP', title: 'Replay',            shortcut: '' },
];

export default function TerminalSidebar({ watchlist = [], socketStatus = 'unknown', onSelectSymbol }) {
  const workspace    = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const mlStore      = useMLSignalStore();

  // Load ML signals for all watchlist symbols
  useEffect(() => {
    for (const sym of watchlist) mlStore.loadSignal(sym);
  }, [watchlist.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  function navButtonStyle(active) {
    return {
      width: 40,
      height: 40,
      margin: '2px auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 3,
      background: active ? 'var(--t-accent)' : 'transparent',
      color: active ? 'white' : 'var(--t-text-3)',
      border: active ? '1px solid var(--t-accent-hover)' : '1px solid transparent',
      fontSize: 10,
      fontWeight: 700,
      fontFamily: 'monospace',
      cursor: 'pointer',
      position: 'relative',
    };
  }

  return (
    <aside
      style={{
        width: 48,
        background: 'var(--t-bg-2)',
        borderRight: '1px solid var(--t-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 48,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 900,
          color: 'var(--t-accent)',
          flexShrink: 0,
        }}
        title="Reversal Terminal"
      >
        R
      </div>

      {/* Nav items */}
      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          scrollbarWidth: 'none',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = workspace === item.id;
          const tooltip = item.shortcut ? `${item.title} (${item.shortcut})` : item.title;
          return (
            <button
              key={item.id}
              onClick={() => setWorkspace(item.id)}
              style={navButtonStyle(active)}
              data-tooltip={tooltip}
              title={tooltip}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'var(--t-bg-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {item.abbr}
            </button>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ borderTop: '1px solid var(--t-border)', margin: '4px 0' }} />
        <button
          onClick={() => setWorkspace('Admin')}
          style={navButtonStyle(workspace === 'Admin')}
          data-tooltip="Admin"
          title="Admin"
          onMouseEnter={(e) => {
            if (workspace !== 'Admin') {
              e.currentTarget.style.background = 'var(--t-bg-hover)';
            }
          }}
          onMouseLeave={(e) => {
            if (workspace !== 'Admin') {
              e.currentTarget.style.background = 'transparent';
            }
          }}
        >
          AD
        </button>
      </div>
    </aside>
  );
}
