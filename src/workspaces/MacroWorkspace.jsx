import PanelContainer from '../components/PanelContainer';
import MarketRegimePanel from '../MarketRegimePanel.jsx';
import VolatilityHeatmapPanel from '../VolatilityHeatmapPanel.jsx';
import SignalRankingPanel from '../SignalRankingPanel.jsx';

export default function MacroWorkspace({ marketData }) {
  return (
    <div>
      <PanelContainer title="Market Regime">
        <MarketRegimePanel marketData={marketData} />
      </PanelContainer>

      <PanelContainer title="Volatility Structure">
        <VolatilityHeatmapPanel marketData={marketData} />
      </PanelContainer>

      <PanelContainer title="Signal Ranking">
        <SignalRankingPanel marketData={marketData} />
      </PanelContainer>
    </div>
  );
}
