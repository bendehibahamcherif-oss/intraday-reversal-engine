import { useEffect } from 'react';
import PanelContainer from '../components/PanelContainer';
import { usePaperTradingStore } from '../store/paperTradingStore';
import { toArray, safeNumber, valueOrDash } from '../store/paperTradingStore';

const cell = { padding: '8px 6px', borderBottom: '1px solid #1f2937', fontSize: 13, textAlign: 'left', verticalAlign: 'top' };
const tableWrap = { overflowX: 'auto' };
const muted = { color: '#9ca3af' };

function formatNumber(value, digits = 2) {
  const num = safeNumber(value, NaN);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatBoolean(value, trueLabel = 'Enabled', falseLabel = 'Disabled') {
  if (value === undefined || value === null) return '—';
  return value ? trueLabel : falseLabel;
}

function statusColor(status) {
  const normalized = String(status || '').toUpperCase();
  if (['FILLED', 'EXECUTED', 'SUCCESS'].includes(normalized)) return '#22c55e';
  if (['CANCELLED', 'CANCELED', 'REJECTED', 'FAILED'].includes(normalized)) return '#ef4444';
  return '#e5e7eb';
}

function pnlColor(value) {
  const num = safeNumber(value, NaN);
  if (!Number.isFinite(num)) return '#e5e7eb';
  if (num > 0) return '#22c55e';
  if (num < 0) return '#ef4444';
  return '#e5e7eb';
}

function formatWarnings(warnings) {
  const list = Array.isArray(warnings) ? warnings : (warnings ? [warnings] : []);
  if (list.length === 0) return '—';
  return list.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(', ');
}

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
    : null;

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
        {!riskStatus ? <div>Risk status unavailable</div> : (
          <div style={tableWrap}>
            <table style={{ width: '100%', minWidth: 520 }}>
              <tbody>
                <tr><th style={cell}>Kill Switch</th><td style={cell}>{formatBoolean(riskStatus.killSwitchEnabled ?? riskStatus.killSwitchActive, 'Enabled', 'Disabled')}</td></tr>
                <tr><th style={cell}>Max Order Size</th><td style={cell}>{formatNumber(riskStatus.maxOrderSize)}</td></tr>
                <tr><th style={cell}>Max Position Size</th><td style={cell}>{formatNumber(riskStatus.maxPositionSize)}</td></tr>
                <tr><th style={cell}>Max Daily Loss</th><td style={cell}>{formatNumber(riskStatus.maxDailyLoss)}</td></tr>
                <tr><th style={cell}>Allow Short</th><td style={cell}>{formatBoolean(riskStatus.allowShort, 'Yes', 'No')}</td></tr>
                <tr><th style={cell}>Status</th><td style={{ ...cell, color: statusColor(riskStatus.status) }}>{valueOrDash(riskStatus.status)}</td></tr>
                <tr><th style={cell}>Message</th><td style={cell}>{valueOrDash(riskStatus.message)}</td></tr>
                <tr><th style={cell}>Warnings</th><td style={cell}>{formatWarnings(riskStatus.warnings)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={store.enableKillSwitch}>Enable Kill Switch</button>
          <button onClick={store.disableKillSwitch}>Disable Kill Switch</button>
        </div>
      </PanelContainer>

      <PanelContainer title="Positions">
        {positions.length === 0 ? <div>No paper positions yet</div> : (
          <div style={tableWrap}><table style={{ width: '100%', minWidth: 900 }}><thead><tr><th style={cell}>Symbol</th><th style={cell}>Qty</th><th style={cell}>Avg Price</th><th style={cell}>Market Price</th><th style={cell}>Unrealized PnL</th><th style={cell}>Realized PnL</th><th style={cell}>Updated At</th><th style={cell}>Action</th></tr></thead><tbody>
            {positions.map((p, index) => <tr key={p.symbol || `position-${index}`}><td style={cell}>{valueOrDash(p.symbol)}</td><td style={cell}>{formatNumber(p.quantity ?? p.qty)}</td><td style={cell}>{formatNumber(p.averagePrice)}</td><td style={cell}>{formatNumber(p.marketPrice)}</td><td style={{ ...cell, color: pnlColor(p.unrealizedPnL) }}>{formatNumber(p.unrealizedPnL)}</td><td style={{ ...cell, color: pnlColor(p.realizedPnL) }}>{formatNumber(p.realizedPnL)}</td><td style={cell}>{formatDateTime(p.updatedAt)}</td><td style={cell}><button disabled={!p.symbol} onClick={() => p.symbol && store.closePosition(p.symbol)}>Close</button></td></tr>)}
          </tbody></table></div>
        )}
      </PanelContainer>

      <PanelContainer title="Orders">
        {orders.length === 0 ? <div>No paper orders yet</div> : (
          <div style={tableWrap}><table style={{ width: '100%', minWidth: 1300 }}><thead><tr><th style={cell}>ID</th><th style={cell}>Symbol</th><th style={cell}>Side</th><th style={cell}>Type</th><th style={cell}>Quantity</th><th style={cell}>Requested Price</th><th style={cell}>Status</th><th style={cell}>Created At</th><th style={cell}>Filled At</th><th style={cell}>Fill Price</th><th style={cell}>Strategy ID</th><th style={cell}>Source</th><th style={cell}>Warnings</th><th style={cell}>Action</th></tr></thead><tbody>
            {orders.map((o, index) => {
              const orderId = o.id || o.orderId;
              return <tr key={orderId || `order-${index}`}><td style={cell}>{valueOrDash(orderId)}</td><td style={cell}>{valueOrDash(o.symbol)}</td><td style={cell}>{valueOrDash(o.side)}</td><td style={cell}>{valueOrDash(o.type)}</td><td style={cell}>{formatNumber(o.quantity)}</td><td style={cell}>{formatNumber(o.requestedPrice)}</td><td style={{ ...cell, color: statusColor(o.status) }}>{valueOrDash(o.status)}</td><td style={cell}>{formatDateTime(o.createdAt)}</td><td style={cell}>{formatDateTime(o.filledAt)}</td><td style={cell}>{formatNumber(o.fillPrice)}</td><td style={cell}>{valueOrDash(o.strategyId)}</td><td style={cell}>{valueOrDash(o.source)}</td><td style={cell}>{formatWarnings(o.warnings)}</td><td style={cell}><button disabled={!orderId} onClick={() => orderId && store.cancelOrder(orderId)}>Cancel</button></td></tr>;
            })}
          </tbody></table></div>
        )}
      </PanelContainer>

      <PanelContainer title="Fills">
        {fills.length === 0 ? <div>No paper fills yet</div> : (
          <div style={tableWrap}><table style={{ width: '100%', minWidth: 980 }}><thead><tr><th style={cell}>ID</th><th style={cell}>Order ID</th><th style={cell}>Symbol</th><th style={cell}>Side</th><th style={cell}>Quantity</th><th style={cell}>Price</th><th style={cell}>Timestamp</th><th style={cell}>Commission</th><th style={cell}>Slippage</th></tr></thead><tbody>
            {fills.map((f, index) => <tr key={f.id || `fill-${index}`}><td style={cell}>{valueOrDash(f.id)}</td><td style={cell}>{valueOrDash(f.orderId)}</td><td style={cell}>{valueOrDash(f.symbol)}</td><td style={cell}>{valueOrDash(f.side)}</td><td style={cell}>{formatNumber(f.quantity)}</td><td style={cell}>{formatNumber(f.price)}</td><td style={cell}>{formatDateTime(f.timestamp)}</td><td style={cell}>{formatNumber(f.commission)}</td><td style={cell}>{formatNumber(f.slippage)}</td></tr>)}
          </tbody></table></div>
        )}
      </PanelContainer>

      <PanelContainer title="Account Controls">
        <button onClick={store.resetAccount}>Reset Paper Account</button>
        <p style={muted}>All paper-trading controls remain enabled.</p>
      </PanelContainer>
    </div>
  );
}
