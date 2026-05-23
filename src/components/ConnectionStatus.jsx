import { useEffect } from 'react';

import { useSocketStore } from '../store/socketStore';

export default function ConnectionStatus() {
  const {
    latency,
    stale,
    subscriptions,
    initialize,
  } = useSocketStore();

  useEffect(() => {
    initialize();
  }, []);

  return (
    <div
      style={{
        background: '#0b0b0b',
        border: '1px solid #1f1f1f',
        borderRadius: 12,
        padding: 12,
        display: 'grid',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>WebSocket</span>

        <span
          style={{
            color: stale ? '#ef4444' : '#22c55e',
            fontWeight: 700,
          }}
        >
          {stale ? 'STALE' : 'LIVE'}
        </span>
      </div>

      <div>Latency: {latency || '--'} ms</div>

      <div>
        Active Subscriptions:
        {' '}
        {subscriptions.length}
      </div>
    </div>
  );
}
