import PanelContainer from '../components/PanelContainer';
import ExecutionBlotter from '../components/ExecutionBlotter';
import ExecutionPanel from '../components/ExecutionPanel';

export default function ExecutionWorkspace() {
  return (
    <div>
      <PanelContainer title="Execution Blotter">
        <ExecutionBlotter />
      </PanelContainer>

      <PanelContainer title="Orders & Fills">
        <ExecutionPanel />
      </PanelContainer>

      <PanelContainer title="Slippage Analytics">
        <div>
          Execution quality analytics
        </div>
      </PanelContainer>

      <PanelContainer title="Order Flow">
        <div>
          Realtime order flow monitoring
        </div>
      </PanelContainer>
    </div>
  );
}
