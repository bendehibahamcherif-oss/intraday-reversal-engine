import { useState } from 'react';
import { useWorkspaceStore } from './store/workspaceStore';
import { normalizeSymbol, useWatchlistStore } from './store/watchlistStore';

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
};

export default function TerminalSidebar({ watchlist = [], socketStatus = 'unknown', onSelectSymbol }) {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const addSymbol = useWatchlistStore((state) => state.addSymbol);
  const removeSymbol = useWatchlistStore((state) => state.removeSymbol);
  const [symbolInput, setSymbolInput] = useState('');

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
    'Paper Trading',
    'Live Data',
    'Chart / Orderflow',
    'AI Lab',
    'Admin',
  ];

  function handleAddSymbol() {
    const added = addSymbol(symbolInput);
    if (added) setSymbolInput('');
  }

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
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddSymbol();
            }}
            placeholder="Add ticker (SPY, BTC-USD, EURUSD=X)"
            style={{ flex: '1 1 140px', minWidth: 0, background: '#050505', border: '1px solid #202020', borderRadius: 8, color: 'white', padding: '8px 10px' }}
          />
          <button onClick={handleAddSymbol} style={{ background: '#2563eb', color: 'white', border: '1px solid #3b82f6', borderRadius: 8, padding: '8px 10px', fontWeight: 700 }}>
            Add
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {watchlist.map((symbol) => (
            <div
              key={symbol}
              style={{
                background: '#050505',
                border: '1px solid #202020',
                borderRadius: 10,
                padding: 8,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <button
                onClick={() => onSelectSymbol?.(normalizeSymbol(symbol))}
                style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 800, textAlign: 'left', cursor: 'pointer', flex: 1 }}
                title={`Open ${symbol}`}
              >
                {symbol}
              </button>
              <button
                onClick={() => removeSymbol(symbol)}
                style={{ background: '#111827', color: '#fca5a5', border: '1px solid #374151', borderRadius: 6, width: 28, height: 28, cursor: 'pointer' }}
                title={`Remove ${symbol}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
