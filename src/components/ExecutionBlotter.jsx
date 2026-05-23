import { useExecutionStore } from '../store/executionStore';

export default function ExecutionBlotter() {
  const fills = useExecutionStore(
    (state) => state.fills
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Fill</th>
            <th>Slippage</th>
          </tr>
        </thead>

        <tbody>
          {fills.map((fill) => (
            <tr key={fill.id}>
              <td>{fill.symbol}</td>
              <td>{fill.side}</td>
              <td>{fill.quantity}</td>
              <td>{fill.fillPrice}</td>
              <td>
                {fill.slippage.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
