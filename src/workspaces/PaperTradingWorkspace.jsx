import { useEffect } from 'react';
import PanelContainer from '../components/PanelContainer';
import { usePaperTradingStore } from '../store/paperTradingStore';
import { toArray, safeNumber, valueOrDash } from '../store/paperTradingStore';

const cell = { padding: '8px 6px', borderBottom: '1px solid #1f2937', fontSize: 13 };

export default function PaperTradingWorkspace() {
  const store = usePaperTradingStore();

  useEffect(() => {
    store.refreshAll();
  }, [store.symbol]);

  const killSwitchOn = Boolean(store.riskStatus?.killSwitchEnabled || store.riskStatus?.killSwitchActive);
  const orders = toArray(store.orders).filter((order) => order && typeof order === 'object');
  const fills = toArray(store.fills).filter((fill) => fill && typeof fill === 'object');
  const positions = toArray(store.positions).filter((position) => position && typeof position === 'object');
  const riskStatus = store.riskStatus && typeof store.riskStatus === 'object'
    ? store.riskStatus
    : { message: 'Risk status unavailable' };

  return (
    <div>
      <PanelContainer title="PAPER TRADING ONLY">
        <div style={{ background: '#3f1d00', border: '1px solid #f59e0b', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <strong>PAPER TRADING ONLY</strong> — No real orders are sent.
        </div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr auto' }}>
          <input value={store.symbol} onChange={(e) => store.setSymbol(e.target.value)} placeholder="Symbol" />
          <button onClick={store.refreshAll}>Refresh</button>
        </div>
        {store.error ? <p style={{ color: '#fca5a5' }}>{store.error}</p> : null}
      </PanelContainer>

      <PanelContainer title="Order Ticket (Simulated)">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(5, minmax(110px, 1fr))' }}>
          <select value={store.orderTicket.side} onChange={(e) => store.updateOrderTicket('side', e.target.value)}><option>BUY</option><option>SELL</option></select>
          <select value={store.orderTicket.type} onChange={(e) => store.updateOrderTicket('type', e.target.value)}><option>MARKET</option><option>LIMIT</option></select>
          <input type="number" min="1" value={store.orderTicket.quantity} onChange={(e) => store.updateOrderTicket('quantity', e.target.value)} placeholder="Qty" />
          <input type="number" step="0.01" value={store.orderTicket.requestedPrice} onChange={(e) => store.updateOrderTicket('requestedPrice', e.target.value)} placeholder="Requested Price" />
          <input value={store.orderTicket.strategyId} onChange={(e) => store.updateOrderTicket('strategyId', e.target.value)} placeholder="Strategy ID (optional)" />
        </div>
        <button style={{ marginTop: 12 }} disabled={store.loading || killSwitchOn} onClick={store.placeOrder}>Place Paper Order</button>
        {killSwitchOn ? <p style={{ color: '#fbbf24' }}>Kill switch is enabled; paper order placement is blocked.</p> : null}
      </PanelContainer>

      <PanelContainer title="Risk Status">
        <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(riskStatus, null, 2)}</pre>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={store.enableKillSwitch}>Enable Kill Switch</button>
          <button onClick={store.disableKillSwitch}>Disable Kill Switch</button>
        </div>
      </PanelContainer>

      <PanelContainer title="Positions">
        {positions.length === 0 ? <div>No paper positions yet</div> : (
          <table style={{ width: '100%' }}><thead><tr><th style={cell}>Symbol</th><th style={cell}>Qty</th><th style={cell}>Action</th></tr></thead><tbody>
            {positions.map((p, index) => <tr key={p.symbol || `position-${index}`}><td style={cell}>{valueOrDash(p.symbol)}</td><td style={cell}>{valueOrDash(safeNumber(p.quantity ?? p.qty, NaN) || p.quantity || p.qty)}</td><td style={cell}><button disabled={!p.symbol} onClick={() => p.symbol && store.closePosition(p.symbol)}>Close</button></td></tr>)}
          </tbody></table>
        )}
      </PanelContainer>

      <PanelContainer title="Orders">
        {orders.length === 0 ? <div>No paper orders yet</div> : (
          <table style={{ width: '100%' }}><thead><tr><th style={cell}>ID</th><th style={cell}>Symbol</th><th style={cell}>Side</th><th style={cell}>Qty</th><th style={cell}>Status</th><th style={cell}>Action</th></tr></thead><tbody>
            {orders.map((o, index) => {
              const orderId = o.id || o.orderId;
              return <tr key={orderId || `order-${index}`}><td style={cell}>{valueOrDash(orderId)}</td><td style={cell}>{valueOrDash(o.symbol)}</td><td style={cell}>{valueOrDash(o.side)}</td><td style={cell}>{valueOrDash(o.quantity)}</td><td style={cell}>{valueOrDash(o.status)}</td><td style={cell}><button disabled={!orderId} onClick={() => orderId && store.cancelOrder(orderId)}>Cancel</button></td></tr>;
            })}
          </tbody></table>
        )}
      </PanelContainer>

      <PanelContainer title="Fills">
        {fills.length === 0 ? <div>No paper fills yet</div> : <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(fills, null, 2)}</pre>}
      </PanelContainer>

      <PanelContainer title="Account Controls">
        <button onClick={store.resetAccount}>Reset Paper Account</button>
      </PanelContainer>
    </div>
  );
}
