import PanelContainer from '../components/PanelContainer';
import PortfolioRiskPanel from '../PortfolioRiskPanel.jsx';
import RiskAnalyticsPanel from '../RiskAnalyticsPanel.jsx';
import LiquidityPanel from '../LiquidityPanel.jsx';

export default function RiskWorkspace({ marketData }) {
  return (
    <div>
      <PanelContainer title="Risk Analytics">
        <RiskAnalyticsPanel marketData={marketData} />
      </PanelContainer>

      <PanelContainer title="Portfolio Risk">
        <PortfolioRiskPanel marketData={marketData} />
      </PanelContainer>

      <PanelContainer title="Liquidity">
        <LiquidityPanel marketData={marketData} />
      </PanelContainer>
    </div>
  );
}
