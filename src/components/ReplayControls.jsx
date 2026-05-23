import { useReplayStore } from '../store/replayStore';

export default function ReplayControls() {
  const {
    replayMode,
    replayIndex,
    stepReplay,
    setReplayMode,
  } = useReplayStore();

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <button
        onClick={() =>
          setReplayMode(!replayMode)
        }
      >
        {replayMode
          ? 'Disable Replay'
          : 'Enable Replay'}
      </button>

      <button onClick={stepReplay}>
        Next Candle
      </button>

      <div>
        Replay Index: {replayIndex}
      </div>
    </div>
  );
}
