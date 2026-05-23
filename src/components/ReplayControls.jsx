import { useReplayStore } from '../store/replayStore';

export default function ReplayControls() {
  const {
    replayMode,
    replayIndex,
    replayData,
    playbackSpeed,
    playing,
    stepReplay,
    previousCandle,
    resetReplay,
    playReplay,
    pauseReplay,
    setReplayMode,
    setPlaybackSpeed,
    currentCandle,
  } = useReplayStore();

  const candle = currentCandle();

  return (
    <div
      style={{
        display: 'grid',
        gap: 18,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
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

        <button onClick={previousCandle}>
          Previous Candle
        </button>

        <button onClick={stepReplay}>
          Next Candle
        </button>

        {!playing ? (
          <button onClick={playReplay}>
            Play
          </button>
        ) : (
          <button onClick={pauseReplay}>
            Pause
          </button>
        )}

        <button onClick={resetReplay}>
          Reset
        </button>

        <select
          value={playbackSpeed}
          onChange={(e) =>
            setPlaybackSpeed(Number(e.target.value))
          }
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
        </select>
      </div>

      <div>
        Replay Candle:
        {' '}
        {replayIndex + 1}
        /
        {replayData.length}
      </div>

      {candle && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 12,
          }}
        >
          <div>Time: {candle.time}</div>
          <div>Open: {candle.open}</div>
          <div>High: {candle.high}</div>
          <div>Low: {candle.low}</div>
          <div>Close: {candle.close}</div>
          <div>Volume: {candle.volume}</div>
        </div>
      )}
    </div>
  );
}
