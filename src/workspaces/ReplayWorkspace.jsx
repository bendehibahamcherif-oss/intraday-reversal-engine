import PanelContainer from '../components/PanelContainer';
import ReplayControls from '../components/ReplayControls';

export default function ReplayWorkspace() {
  return (
    <div>
      <PanelContainer title="Replay Controls">
        <ReplayControls />
      </PanelContainer>

      <PanelContainer title="Replay Timeline">
        <div>
          Historical playback and candle replay
        </div>
      </PanelContainer>
    </div>
  );
}
