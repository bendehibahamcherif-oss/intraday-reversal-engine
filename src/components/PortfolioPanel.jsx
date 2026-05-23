import { usePortfolioStore } from '../store/portfolioStore';

export default function PortfolioPanel() {
  const positions = usePortfolioStore(
    (state) => state.positions || []
  );

  const exposure = usePortfolioStore(
    (state) => state.exposure || {}
  );

  return (
    <div>
      <h3>Exposure</h3>

      <div>Gross: {exposure.gross || 0}</div>
      <div>Net: {exposure.net || 0}</div>

      <h3 style={{ marginTop: 20 }}>
        Positions
      </h3>

      {positions.map((position, index) => (
        <div key={index}>
          {position.symbol} - {position.quantity}
        </div>
      ))}
    </div>
  );
}
