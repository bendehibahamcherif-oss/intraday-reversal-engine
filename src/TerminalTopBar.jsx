import { useState, useEffect } from 'react';
import { clearSession } from './api.js';
import { useActiveSymbolStore } from './store/activeSymbolStore.js';
import { useChartStore } from './store/chartStore.js';
import { useWorkspaceStore } from './store/workspaceStore.js';
import { useSocketStore } from './store/socketStore.js';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

function getMarketSession() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();

  // Convert to EST = UTC - 5
  const estMinutes = utcHour * 60 + utcMin - 5 * 60;
  // Normalise to [0, 1440)
  const estMod = ((estMinutes % 1440) + 1440) % 1440;
  const estHour = Math.floor(estMod / 60);
  const estMinute = estMod % 60;

  const isWeekday = day >= 1 && day <= 5;

  if (!isWeekday) return { label: 'CLOSED', color: 'var(--t-text-3)' };

  // NY OPEN: 9:30 – 16:00
  const minuteOfDay = estHour * 60 + estMinute;
  if (minuteOfDay >= 9 * 60 + 30 && minuteOfDay < 16 * 60) {
    return { label: 'NY OPEN', color: 'var(--t-bull)' };
  }
  // NY PRE: 4:00 – 9:30
  if (minuteOfDay >= 4 * 60 && minuteOfDay < 9 * 60 + 30) {
    return { label: 'NY PRE', color: 'var(--t-neutral)' };
  }
  // NY POST: 16:00 – 20:00
  if (minuteOfDay >= 16 * 60 && minuteOfDay < 20 * 60) {
    return { label: 'NY POST', color: 'var(--t-neutral)' };
  }
  return { label: 'CLOSED', color: 'var(--t-text-3)' };
}

function truncateEmail(email, max = 12) {
  if (!email) return '—';
  if (email.length <= max) return email;
  return email.slice(0, max) + '...';
}

const inputStyle = {
  height: 28,
  background: 'var(--t-bg-1)',
  border: '1px solid var(--t-border)',
  color: 'var(--t-text)',
  fontFamily: 'var(--t-font-mono)',
  fontSize: 12,
  padding: '0 8px',
  borderRadius: 2,
  outline: 'none',
};

const selectStyle = {
  ...inputStyle,
  width: 60,
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  paddingRight: 4,
};

function useIsCompactTouch() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setCompact(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return compact;
}

export default function TerminalTopBar({ user, onLogout }) {
  const { symbol, setSymbol } = useActiveSymbolStore();
  const { timeframe, setTimeframe } = useChartStore();
  const { workspace } = useWorkspaceStore();
  const { connected, stale, latency } = useSocketStore();

  const [localSymbol, setLocalSymbol] = useState(symbol || '');
  const compactTouch = useIsCompactTouch();
  const [session, setSession] = useState(getMarketSession());

  // Keep local symbol in sync when store changes externally
  useEffect(() => {
    setLocalSymbol(symbol || '');
  }, [symbol]);

  // Update session indicator every minute
  useEffect(() => {
    setSession(getMarketSession());
    const id = setInterval(() => setSession(getMarketSession()), 60_000);
    return () => clearInterval(id);
  }, []);

  function commitSymbol(value) {
    const upper = value.toUpperCase().trim();
    if (upper) setSymbol(upper);
    setLocalSymbol(upper || symbol || '');
  }

  function handleSymbolKeyDown(e) {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
      commitSymbol(e.currentTarget.value);
    }
  }

  function handleSymbolBlur(e) {
    commitSymbol(e.currentTarget.value);
  }

  function handleLogout() {
    clearSession();
    onLogout();
  }

  // Connection status
  let wsDotColor = 'var(--t-bear)';
  let wsLabel = 'DISC';
  if (connected && stale) {
    wsDotColor = 'var(--t-neutral)';
    wsLabel = 'STALE';
  } else if (connected) {
    wsDotColor = 'var(--t-bull)';
    wsLabel = 'LIVE';
  }

  return (
    <div
      style={{
        height: 'var(--t-topbar-h)',
        minHeight: 'var(--t-topbar-h)',
        background: 'var(--t-bg-2)',
        borderBottom: '1px solid var(--t-border)',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        position: 'relative',
        zIndex: 50,
        userSelect: 'none',
        overflowX: 'hidden',
      }}
    >
      {/* ── LEFT ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: compactTouch ? 0 : 240,
          flexShrink: compactTouch ? 1 : 0,
          padding: compactTouch ? '0 6px' : '0 10px',
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 28,
            height: 28,
            background: 'var(--t-accent)',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 900,
            color: 'white',
            flexShrink: 0,
            letterSpacing: '-0.5px',
          }}
        >
          R
        </div>

        {/* Symbol Input */}
        <input
          type="text"
          value={localSymbol}
          onChange={(e) => setLocalSymbol(e.target.value.toUpperCase())}
          onKeyDown={handleSymbolKeyDown}
          onBlur={handleSymbolBlur}
          style={{ ...inputStyle, width: compactTouch ? 72 : 100, textTransform: 'uppercase' }}
          placeholder="SYMBOL"
          spellCheck={false}
          autoComplete="off"
        />

        {/* Timeframe Selector */}
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          style={{ ...selectStyle, width: compactTouch ? 52 : 60 }}
        >
          {TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf}>{tf}</option>
          ))}
        </select>
      </div>

      {/* ── CENTER ── */}
      <div
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          display: compactTouch ? 'none' : 'flex',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--t-text-3)',
          }}
        >
          {workspace || 'DEFAULT'}
        </span>
      </div>

      {/* ── RIGHT ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: compactTouch ? 6 : 12,
          paddingRight: compactTouch ? 6 : 12,
          flexShrink: 0,
        }}
      >
        {/* Connection Pill */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontFamily: 'var(--t-font-mono)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: wsDotColor,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span style={{ color: wsDotColor }}>WS:{wsLabel}</span>
        </span>

        {/* Latency */}
        {!compactTouch && latency != null && (
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--t-font-mono)',
              color: 'var(--t-text-3)',
            }}
          >
            LAT: {latency}ms
          </span>
        )}

        {/* Market Session */}
        <span
          style={{
            fontSize: 10,
            fontFamily: 'var(--t-font-mono)',
            color: session.color,
            letterSpacing: '0.04em',
          }}
        >
          {session.label}
        </span>

        {/* User email */}
        {!compactTouch && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--t-text-2)',
            }}
          >
            {truncateEmail(user?.email)}
          </span>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          style={{
            minHeight: compactTouch ? 44 : 24,
            minWidth: compactTouch ? 44 : undefined,
            height: compactTouch ? 44 : 24,
            padding: compactTouch ? '0 12px' : '0 8px',
            background: 'transparent',
            border: '1px solid var(--t-border)',
            color: 'var(--t-text-2)',
            borderRadius: 2,
            fontSize: 10,
            cursor: 'pointer',
            fontFamily: 'var(--t-font-ui)',
            letterSpacing: '0.04em',
            transition: 'border-color 0.1s ease, color 0.1s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--t-text-3)';
            e.currentTarget.style.color = 'var(--t-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--t-border)';
            e.currentTarget.style.color = 'var(--t-text-2)';
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
