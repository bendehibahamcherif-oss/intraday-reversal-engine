import { useExecutionStore } from '../store/executionStore';

export default function ExecutionPanel() {
  const orders = useExecutionStore(
    (state) => state.orders || []
  );

  const fills = useExecutionStore(
    (state) => state.fills || []
  );

  return (
    <div>
      <h3>Orders</h3>

      {orders.map((order, index) => (
        <div key={index}>
          {order.symbol} - {order.side}
        </div>
      ))}

      <h3 style={{ marginTop: 20 }}>
        Fills
      </h3>

      {fills.map((fill, index) => (
        <div key={index}>
          {fill.symbol} - {fill.fillPrice}
        </div>
      ))}
    </div>
  );
}
