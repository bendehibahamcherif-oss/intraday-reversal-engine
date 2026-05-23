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

  const highs = visibleData.map(
    (c) => c.high
  );

  const lows = visibleData.map(
    (c) => c.low
  );

  const volumes = visibleData.map(
    (c) => c.volume
  );

  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const maxVolume = Math.max(...volumes);

  const width = 1000;
  const height = 420;
  const volumeHeight = 80;

  const candleWidth =
    width /
    Math.max(visibleData.length, 1);

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

        <div
          style={{
            display: 'flex',
            gap: 8,
          }}
        >
          <button
            onClick={() =>
              setZoom((z) =>
                Math.max(0.5, z - 0.5)
              )
            }
          >
            Zoom -
          </button>

          <button
            onClick={() =>
              setZoom((z) =>
                Math.min(5, z + 0.5)
              )
            }
          >
            Zoom +
          </button>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          height: 420,
          cursor: 'crosshair',
        }}
        onMouseMove={(e) => {
          const rect =
            e.currentTarget.getBoundingClientRect();

          setCrosshair({
            x:
              ((e.clientX - rect.left) /
                rect.width) *
              width,
            y:
              ((e.clientY - rect.top) /
                rect.height) *
              height,
          });
        }}
        onMouseLeave={() =>
          setCrosshair(null)
        }
      >
        {visibleData.map((candle, index) => {
          const x =
            index * candleWidth +
            candleWidth / 2;

          const highY =
            height -
            volumeHeight -
            ((candle.high - min) /
              Math.max(max - min, 1)) *
              (height - volumeHeight);

          const lowY =
            height -
            volumeHeight -
            ((candle.low - min) /
              Math.max(max - min, 1)) *
              (height - volumeHeight);

          const openY =
            height -
            volumeHeight -
            ((candle.open - min) /
              Math.max(max - min, 1)) *
              (height - volumeHeight);

          const closeY =
            height -
            volumeHeight -
            ((candle.close - min) /
              Math.max(max - min, 1)) *
              (height - volumeHeight);

          const volumeY =
            height -
            (candle.volume / maxVolume) *
              volumeHeight;

          const bullish =
            candle.close >= candle.open;

          return (
            <g key={index}>
              <line
                x1={x}
                y1={highY}
                x2={x}
                y2={lowY}
                stroke={
                  bullish
                    ? '#22c55e'
                    : '#ef4444'
                }
                strokeWidth="2"
              />

              <rect
                x={x - candleWidth * 0.3}
                y={Math.min(openY, closeY)}
                width={candleWidth * 0.6}
                height={Math.max(
                  Math.abs(closeY - openY),
                  2
                )}
                fill={
                  bullish
                    ? '#22c55e'
                    : '#ef4444'
                }
                rx="2"
              />

              <rect
                x={x - candleWidth * 0.3}
                y={volumeY}
                width={candleWidth * 0.6}
                height={height - volumeY}
                fill="#3b82f6"
                opacity="0.45"
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
  const replayMode = useReplayStore(
    (state) => state.replayMode
  );

  const playing = useReplayStore(
    (state) => state.playing
  );

  const replayIndex = useReplayStore(
    (state) => state.replayIndex
  );

  useEffect(() => {
    if (replayMode && playing) {
      console.log(
        `Replay live sync candle ${replayIndex}`
      );
    }
  }, [
    replayMode,
    playing,
    replayIndex,
  ]);

  return (
    <div
      style={{
        display: 'grid',
        gap: 20,
      }}
    >
      <PanelContainer title="Replay Controls">
        <ReplayControls />
      </PanelContainer>

      <PanelContainer title="Replay Timeline">
        <ReplayChart />
      </PanelContainer>
    </div>
  );
}
