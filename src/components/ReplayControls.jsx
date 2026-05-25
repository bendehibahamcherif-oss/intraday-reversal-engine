import { useReplayStore } from '../store/replayStore';

const SHOW_REPLAY_DEBUG = import.meta.env.DEV || import.meta.env.VITE_REPLAY_DEBUG === 'true';

export default function ReplayControls() {
  const {
    replayMode,
    replayIndex,
    replayData,
    playbackSpeed,
    playing,
    startReplay,
    pauseReplay,
    resumeReplay,
    stopReplay,
    setReplayMode,
    setPlaybackSpeed,
    backendAvailable,
    backendHealthLastUrl,
    backendHealthLastError,
    backendHealthLastResponse,
    currentCandle,
  } = useReplayStore();

  const candle = currentCandle();

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setReplayMode(!replayMode)}>
          {replayMode ? 'Disable Replay' : 'Enable Replay'}
        </button>

        <button onClick={startReplay}>Start</button>
        <button onClick={pauseReplay}>Pause</button>
        <button onClick={resumeReplay}>Resume</button>
        <button onClick={stopReplay}>Stop</button>

        <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}>
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
        </select>

        <span style={{ color: playing ? '#22c55e' : '#9ca3af' }}>{playing ? 'RUNNING' : 'PAUSED'}</span>
      </div>

      <div style={{ color: backendAvailable ? '#22c55e' : '#f59e0b' }}>
        Backend: {backendAvailable ? 'Available' : 'Unavailable'}
      </div>

      {SHOW_REPLAY_DEBUG && (
        <div style={{ color: '#9ca3af', fontSize: 12, display: 'grid', gap: 4 }}>
          <div>healthUrl: {backendHealthLastUrl || 'n/a'}</div>
          <div>backendAvailable: {String(backendAvailable)}</div>
          <div>lastHealthError: {backendHealthLastError || 'n/a'}</div>
          <div>lastHealthResponse: {backendHealthLastResponse ? JSON.stringify(backendHealthLastResponse) : 'n/a'}</div>
        </div>
      )}

      <div>Replay Candle: {replayIndex + 1}/{replayData.length}</div>

      {candle && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
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
