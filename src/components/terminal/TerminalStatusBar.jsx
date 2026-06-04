import { useState, useEffect } from 'react';
import { useSocketStore } from '../../store/socketStore.js';
import { useMarketRuntimeStore } from '../../store/marketRuntimeStore.js';

const styles = {
  bar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    height: 'var(--t-statusbar-h)',
    background: 'var(--t-bg-2)',
    borderTop: '1px solid var(--t-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    fontSize: 10,
    color: 'var(--t-text-2)',
    userSelect: 'none',
  },
  section: {
    display: 'flex',
    alignItems: 'center',
  },
  left: {
    gap: 12,
  },
  right: {
    gap: 12,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },
};

function dot(color) {
  return {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: color,
    display: 'inline-block',
    marginRight: 4,
    flexShrink: 0,
  };
}

function ConnectionDot({ connected, stale }) {
  let color = 'var(--t-bear)';
  let label = 'WS:DISC';
  if (connected && stale) {
    color = 'var(--t-neutral)';
    label = 'WS:STALE';
  } else if (connected) {
    color = 'var(--t-bull)';
    label = 'WS:LIVE';
  }
  return (
    <span style={styles.item}>
      <span style={dot(color)} />
      <span style={{ fontFamily: 'var(--t-font-mono)', color }}>
        {label}
      </span>
    </span>
  );
}

function SymbolList({ symbols }) {
  if (!symbols || symbols.length === 0) {
    return <span style={{ color: 'var(--t-text-3)' }}>—</span>;
  }
  let display;
  if (symbols.length > 5) {
    const shown = symbols.slice(0, 4);
    const remaining = symbols.length - 4;
    display = shown.join(' · ') + ` +${remaining}`;
  } else {
    display = symbols.join(' · ');
  }
  return (
    <span style={{ fontFamily: 'var(--t-font-mono)', color: 'var(--t-text-2)' }}>
      {display}
    </span>
  );
}

function Clock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    function tick() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      setTime(`${hh}:${mm}:${ss}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span style={{ fontFamily: 'var(--t-font-mono)', color: 'var(--t-text-2)' }}>
      {time}
    </span>
  );
}

export default function TerminalStatusBar() {
  const { connected, latency, reconnectCount, stale } = useSocketStore();
  const { activeProvider, subscribedSymbols, source } = useMarketRuntimeStore();

  return (
    <div style={styles.bar}>
      {/* LEFT */}
      <div style={{ ...styles.section, ...styles.left }}>
        <ConnectionDot connected={connected} stale={stale} />

        <span
          style={{
            ...styles.item,
            fontFamily: 'var(--t-font-mono)',
            color: 'var(--t-text-3)',
          }}
        >
          {latency != null ? `LAT: ${latency}ms` : 'LAT: —'}
        </span>

        {reconnectCount > 0 && (
          <span
            style={{
              ...styles.item,
              color: 'var(--t-neutral)',
              fontFamily: 'var(--t-font-mono)',
            }}
          >
            ↺ {reconnectCount}
          </span>
        )}
      </div>

      {/* CENTER */}
      <div style={{ ...styles.section }}>
        <SymbolList symbols={subscribedSymbols} />
      </div>

      {/* RIGHT */}
      <div style={{ ...styles.section, ...styles.right }}>
        <span
          style={{
            fontFamily: 'var(--t-font-mono)',
            color: 'var(--t-text-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {(activeProvider || source || '—').toUpperCase()}
        </span>
        <Clock />
      </div>
    </div>
  );
}
