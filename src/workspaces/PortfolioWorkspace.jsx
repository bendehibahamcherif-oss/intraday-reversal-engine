import PanelContainer from '../components/PanelContainer';
import PortfolioPanel from '../components/PortfolioPanel';

export default function PortfolioWorkspace() {
  return (
    <div>
      <PanelContainer title="Portfolio Exposure">
        <PortfolioPanel />
      </PanelContainer>

      <PanelContainer title="PnL Analytics">
        <div>
          Realtime Profit & Loss Engine
        </div>
      </PanelContainer>

      <PanelContainer title="Factor Risk">
        <div>
          Portfolio Factor Exposure
        </div>
      </PanelContainer>
    </div>
  );
}
