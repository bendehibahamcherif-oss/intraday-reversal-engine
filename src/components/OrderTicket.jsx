import { useExecutionStore } from '../store/executionStore';

const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';
const BLUE    = '#2563eb';

const iStyle = { background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 13, width: '100%' };
const field  = { display: 'flex', flexDirection: 'column' };
const label  = { fontSize: 11, color: MUTED, marginBottom: 3 };

export default function OrderTicket() {
  const {
    mode, liveUnlocked,
    ticket, setTicket,
    riskCheck, riskCheckLoading, riskCheckError,
    placing, placeError,
    runRiskCheck, placeOrder,
  } = useExecutionStore();

  const isLive    = mode === 'live';
  const liveLocked = isLive && !liveUnlocked;
  const riskFailed = riskCheck && riskCheck.passed === false;
  const canPlace  = !placing && !liveLocked && !riskFailed;
  const buyColor  = ticket.side === 'buy' ? GREEN : SURFACE;
  const sellColor = ticket.side === 'sell' ? RED : SURFACE;

  return (
    <div>
      {/* Phase 12 live lock banner */}
      {isLive && !liveUnlocked && (
        <div style={{ background: RED + '15', border: `1px solid ${RED}44`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
          <strong style={{ color: RED }}>⛔ LIVE ORDER ROUTING LOCKED</strong>
          <span style={{ color: MUTED, marginLeft: 8 }}>
            Live execution requires Phase 12 OMS reconciliation. Paper mode is active.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
        {/* Symbol */}
        <div style={field}>
          <span style={label}>Symbol</span>
          <input
            data-testid="exec-symbol-input"
            value={ticket.symbol}
            onChange={(e) => setTicket({ symbol: e.target.value.toUpperCase() })}
            style={{ ...iStyle, fontWeight: 700 }}
          />
        </div>

        {/* Side */}
        <div style={field}>
          <span style={label}>Side</span>
          <div style={{ display: 'flex', gap: 4, height: 34 }}>
            <button
              data-testid="exec-buy-btn"
              onClick={() => setTicket({ side: 'buy' })}
              style={{ flex: 1, border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12, background: buyColor, color: ticket.side === 'buy' ? '#000' : MUTED }}
            >
              BUY
            </button>
            <button
              data-testid="exec-sell-btn"
              onClick={() => setTicket({ side: 'sell' })}
              style={{ flex: 1, border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12, background: sellColor, color: ticket.side === 'sell' ? '#fff' : MUTED }}
            >
              SELL
            </button>
          </div>
        </div>

        {/* Order type */}
        <div style={field}>
          <span style={label}>Type</span>
          <select data-testid="exec-type-select" value={ticket.orderType} onChange={(e) => setTicket({ orderType: e.target.value })} style={{ ...iStyle, padding: '6px 6px' }}>
            <option value="market">Market</option>
            <option value="limit">Limit</option>
            <option value="stop">Stop</option>
            <option value="stop_limit">Stop Limit</option>
          </select>
        </div>

        {/* Quantity */}
        <div style={field}>
          <span style={label}>Quantity</span>
          <input
            data-testid="exec-qty-input"
            type="number" min="1" step="1"
            value={ticket.quantity}
            onChange={(e) => setTicket({ quantity: Math.max(1, Number(e.target.value) || 1) })}
            style={iStyle}
          />
        </div>

        {/* Limit price (limit / stop_limit) */}
        {(ticket.orderType === 'limit' || ticket.orderType === 'stop_limit') && (
          <div style={field}>
            <span style={label}>Limit Price</span>
            <input
              type="number" step="0.01"
              value={ticket.limitPrice}
              onChange={(e) => setTicket({ limitPrice: e.target.value })}
              placeholder="0.00"
              style={iStyle}
            />
          </div>
        )}

        {/* Stop price (stop / stop_limit) */}
        {(ticket.orderType === 'stop' || ticket.orderType === 'stop_limit') && (
          <div style={field}>
            <span style={label}>Stop Price</span>
            <input
              type="number" step="0.01"
              value={ticket.stopPrice}
              onChange={(e) => setTicket({ stopPrice: e.target.value })}
              placeholder="0.00"
              style={iStyle}
            />
          </div>
        )}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={runRiskCheck}
          disabled={riskCheckLoading}
          style={{ background: AMBER + '22', color: AMBER, border: `1px solid ${AMBER}55`, borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: riskCheckLoading ? 'default' : 'pointer', opacity: riskCheckLoading ? 0.7 : 1 }}
        >
          {riskCheckLoading ? 'Checking…' : '⚠ Risk Check'}
        </button>

        <button
          data-testid="exec-place-btn"
          onClick={placeOrder}
          disabled={!canPlace}
          style={{
            background: liveLocked ? BORDER : (ticket.side === 'buy' ? GREEN : RED),
            color: liveLocked ? MUTED : (ticket.side === 'buy' ? '#000' : '#fff'),
            border: 'none', borderRadius: 7, padding: '7px 20px', fontSize: 13, fontWeight: 700,
            cursor: canPlace ? 'pointer' : 'default', opacity: canPlace ? 1 : 0.5,
          }}
        >
          {placing ? 'Placing…' : `${ticket.side.toUpperCase()} ${ticket.quantity} ${ticket.symbol}`}
        </button>

        {riskCheckError && <span style={{ color: RED, fontSize: 12 }}>{riskCheckError}</span>}
        {placeError     && <span style={{ color: RED, fontSize: 12 }}>{placeError}</span>}
      </div>

      {/* Risk check result */}
      {riskCheck && (
        <div style={{
          marginTop: 12,
          background: riskCheck.passed ? GREEN + '11' : RED + '11',
          border: `1px solid ${riskCheck.passed ? GREEN + '44' : RED + '44'}`,
          borderRadius: 8, padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ color: riskCheck.passed ? GREEN : RED }}>
              {riskCheck.passed ? '✓ Risk check passed' : '✗ Risk check failed'}
            </strong>
            {riskCheck.reason && <span style={{ color: MUTED, fontSize: 12 }}>{riskCheck.reason}</span>}
          </div>
          {riskCheck.details && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: MUTED, marginTop: 6 }}>
              {riskCheck.details.notionalValue   != null && <span>Notional: <strong style={{ color: TEXT }}>${Number(riskCheck.details.notionalValue).toFixed(2)}</strong></span>}
              {riskCheck.details.positionLimit   != null && <span>Limit: <strong style={{ color: TEXT }}>${Number(riskCheck.details.positionLimit).toFixed(0)}</strong></span>}
              {riskCheck.details.availableCapital != null && <span>Available: <strong style={{ color: TEXT }}>${Number(riskCheck.details.availableCapital).toFixed(2)}</strong></span>}
              {riskCheck.details.leverage        != null && <span>Leverage: <strong style={{ color: TEXT }}>{Number(riskCheck.details.leverage).toFixed(2)}x</strong></span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
