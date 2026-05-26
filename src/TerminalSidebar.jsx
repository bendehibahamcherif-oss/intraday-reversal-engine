import { useWorkspaceStore } from './store/workspaceStore';

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
};

export default function TerminalSidebar({ watchlist = [], socketStatus = 'unknown' }) {
  const workspace = useWorkspaceStore((state) => state.workspace);

  const setWorkspace = useWorkspaceStore(
    (state) => state.setWorkspace
  );

  const nav = [
    'Dashboard',
    'Live Markets',
    'Quant Signals',
    'Risk Analytics',
    'Macro Intelligence',
    'Portfolio',
    'Replay',
    'Quant Lab',
    'Strategy Lab',
    'Strategy Builder',
    'Admin',
  ];

  return (
    <aside
      style={{
        width: 240,
        background: '#070707',
        borderRight: '1px solid #1a1a1a',
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div>
        <div style={{ color: '#9ca3af', fontSize: 11, letterSpacing: 1 }}>REVERSAL</div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>TERMINAL</div>
      </div>

      <div>
        <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>SYSTEM STATUS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: socketStatus === 'connected' ? '#22c55e' : socketStatus === 'connecting' ? '#f59e0b' : '#ef4444',
              display: 'inline-block',
            }}
          />
          <span style={{ textTransform: 'capitalize' }}>{socketStatus}</span>
        </div>
      </div>

      <nav style={{ display: 'grid', gap: 8 }}>
        {nav.map((item) => {
          const targetWorkspace = WORKSPACE_MAP[item];
          const active = workspace === targetWorkspace;
          const isConnected = Boolean(targetWorkspace);

          return (
            <button
              key={item}
              onClick={() => isConnected && setWorkspace(targetWorkspace)}
              title={isConnected ? `Open ${item} workspace` : 'Not connected yet: workspace coming soon'}
              style={{
                background: active ? '#2563eb' : '#111111',
                border: active
                  ? '1px solid #3b82f6'
                  : '1px solid #1f1f1f',
                borderRadius: 10,
                color: 'white',
                textAlign: 'left',
                padding: '10px 12px',
                cursor: isConnected ? 'pointer' : 'not-allowed',
                opacity: isConnected ? 1 : 0.6,
                fontWeight: 700,
                transition: 'all 0.2s ease',
              }}
            >
              {item}
              {!isConnected && (
                <span style={{ display: 'block', fontSize: 10, color: '#f59e0b', marginTop: 4 }}>
                  Not connected yet
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div>
        <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>WATCHLIST</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {watchlist.map((symbol) => (
            <div
              key={symbol}
              style={{
                background: '#050505',
                border: '1px solid #202020',
                borderRadius: 10,
                padding: '10px 12px',
                fontWeight: 800,
              }}
            >
              {symbol}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
