export default function TerminalSidebar({ watchlist = [], socketStatus = 'unknown' }) {
  const nav = [
    'Dashboard',
    'Live Markets',
    'Quant Signals',
    'Risk Analytics',
    'Macro Intelligence',
    'Portfolio',
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
        {nav.map((item) => (
          <button
            key={item}
            style={{
              background: '#111111',
              border: '1px solid #1f1f1f',
              borderRadius: 10,
              color: 'white',
              textAlign: 'left',
              padding: '10px 12px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {item}
          </button>
        ))}
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
