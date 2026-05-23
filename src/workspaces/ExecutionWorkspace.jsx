import PanelContainer from '../components/PanelContainer';

export default function ExecutionWorkspace() {
  return (
    <div>
      <PanelContainer title="Execution Blotter">
        <div>
          Institutional execution monitoring
        </div>
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
