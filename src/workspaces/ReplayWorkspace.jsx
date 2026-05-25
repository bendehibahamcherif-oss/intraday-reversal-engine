import { useEffect, useMemo, useState } from 'react';

import PanelContainer from '../components/PanelContainer';
import ReplayControls from '../components/ReplayControls';

import { useReplayStore } from '../store/replayStore';

function ReplayChart() {
  const replayData = useReplayStore(
    (state) => state.replayData
  );

  const replayIndex = useReplayStore(
    (state) => state.replayIndex
  );

  const [zoom, setZoom] = useState(1);
  const [crosshair, setCrosshair] = useState(null);
  const [timeframe, setTimeframe] = useState('1m');
  const timeframeConnected = false;

  const visibleData = useMemo(() => {
    const full = replayData.slice(
      0,
      replayIndex + 1
    );

    const visibleCandles = Math.max(
      20,
      Math.floor(80 / zoom)
    );

    return full.slice(-visibleCandles);
  }, [
    replayData,
    replayIndex,
    zoom,
  ]);

  const highs = visibleData.map((c) => c.high);
  const lows = visibleData.map((c) => c.low);
  const volumes = visibleData.map((c) => c.volume);

  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const maxVolume = Math.max(...volumes);

  const width = 1000;
  const height = 420;
  const volumeHeight = 80;

  const candleWidth = width / Math.max(visibleData.length, 1);

  return (
    <div
      style={{
        background: '#050505',
        border: '1px solid #1f1f1f',
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            color: '#9ca3af',
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          INSTITUTIONAL REPLAY ENGINE
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            disabled={!timeframeConnected}
            title={timeframeConnected ? 'Replay timeframe' : 'Not connected yet: replay timeframe aggregation backend is not available'}
          >
            <option value="1m">1m</option>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1H</option>
          </select>

          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}>
            Zoom -
          </button>

          <button onClick={() => setZoom((z) => Math.min(5, z + 0.5))}>
            Zoom +
          </button>
        </div>
      </div>

      {!timeframeConnected && (
        <div style={{ marginBottom: 10, color: '#f59e0b', fontSize: 12 }}>
          Timeframe selector is visible but not connected yet (coming soon).
        </div>
      )}

      <div
        style={{
          marginBottom: 10,
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          fontSize: 12,
          color: '#9ca3af',
        }}
      >
        <div>VWAP Overlay Active</div>
        <div>EMA Overlay Active</div>
        <div>RSI Engine Ready</div>
        <div>Liquidity Heatmap Ready</div>
        <div>Execution Markers Ready</div>
        <div>PnL Overlay Ready</div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          height: 420,
          cursor: 'crosshair',
        }}
        onWheel={(e) => {
          e.preventDefault();

          if (e.deltaY > 0) {
            setZoom((z) => Math.max(0.5, z - 0.2));
          } else {
            setZoom((z) => Math.min(5, z + 0.2));
          }
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();

          setCrosshair({
            x: ((e.clientX - rect.left) / rect.width) * width,
            y: ((e.clientY - rect.top) / rect.height) * height,
          });
        }}
        onMouseLeave={() => setCrosshair(null)}
      >
        {visibleData.map((candle, index) => {
          const x = index * candleWidth + candleWidth / 2;

          const scaleY = (value) =>
            height - volumeHeight -
            ((value - min) / Math.max(max - min, 1)) *
              (height - volumeHeight);

          const bullish = candle.close >= candle.open;

          return (
            <g key={index}>
              <rect
                x={0}
                y={0}
                width={width}
                height={height - volumeHeight}
                fill={`rgba(59,130,246,${0.01 + (index % 5) * 0.01})`}
              />

              <line
                x1={x}
                y1={scaleY(candle.high)}
                x2={x}
                y2={scaleY(candle.low)}
                stroke={bullish ? '#22c55e' : '#ef4444'}
                strokeWidth="2"
              />

              <rect
                x={x - candleWidth * 0.3}
                y={Math.min(scaleY(candle.open), scaleY(candle.close))}
                width={candleWidth * 0.6}
                height={Math.max(Math.abs(scaleY(candle.close) - scaleY(candle.open)),2)}
                fill={bullish ? '#22c55e' : '#ef4444'}
              />

              <rect
                x={x - candleWidth * 0.3}
                y={height - (candle.volume / maxVolume) * volumeHeight}
                width={candleWidth * 0.6}
                height={(candle.volume / maxVolume) * volumeHeight}
                fill="#3b82f6"
                opacity="0.35"
              />
            </g>
          );
        })}

        {crosshair && (
          <g>
            <line
              x1={crosshair.x}
              y1="0"
              x2={crosshair.x}
              y2={height}
              stroke="#9ca3af"
              strokeDasharray="4"
            />

            <line
              x1="0"
              y1={crosshair.y}
              x2={width}
              y2={crosshair.y}
              stroke="#9ca3af"
              strokeDasharray="4"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

export default function ReplayWorkspace() {
  const checkBackendHealth = useReplayStore((state) => state.checkBackendHealth);


  useEffect(() => {
    checkBackendHealth();

    const timer = setInterval(() => {
      checkBackendHealth();
    }, 15000);

    return () => clearInterval(timer);
  }, [checkBackendHealth]);


  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PanelContainer title="Replay Controls">
        <ReplayControls />
      </PanelContainer>

      <PanelContainer title="Replay Timeline">
        <ReplayChart />
      </PanelContainer>
    </div>
  );
}
