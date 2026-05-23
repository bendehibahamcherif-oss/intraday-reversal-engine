import PanelContainer from '../components/PanelContainer';

export default function PortfolioWorkspace() {
  return (
    <div>
      <PanelContainer title="Portfolio Exposure">
        <div>
          Gross Exposure Analytics
        </div>
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
