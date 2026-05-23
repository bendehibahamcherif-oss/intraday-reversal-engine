import { useEffect } from 'react';

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

  const visibleData = replayData.slice(
    0,
    replayIndex + 1
  );

  const closes = visibleData.map(
    (c) => c.close
  );

  const min = Math.min(...closes);
  const max = Math.max(...closes);

  const width = 900;
  const height = 320;

  const points = visibleData
    .map((candle, index) => {
      const x =
        (index /
          Math.max(
            visibleData.length - 1,
            1
          )) *
        width;

      const y =
        height -
        ((candle.close - min) /
          Math.max(max - min, 1)) *
          height;

      return `${x},${y}`;
    })
    .join(' ');

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
          marginBottom: 12,
          color: '#9ca3af',
          fontSize: 12,
          letterSpacing: 1,
        }}
      >
        REPLAY CANDLE STREAM
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          height: 320,
        }}
      >
        <polyline
          fill="none"
          stroke="#3b82f6"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
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
