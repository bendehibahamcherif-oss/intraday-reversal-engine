import { useEffect } from 'react';
import { useExecutionStore } from '../store/executionStore';
import { useOMSStore, OMS_TERMINAL } from '../store/omsStore';
import OrderTicket from '../components/OrderTicket.jsx';

const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';
const BLUE    = '#2563eb';
const VIOLET  = '#a78bfa';

const panel = { background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 };

function fmtN(v, d = 2) {
  if (v == null) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}
function fmtMoney(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `$${Math.abs(n).toFixed(2)}`;
}
function fmtPct(v, d = 2) {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const pct = n <= 1.001 ? n * 100 : n;
  return `${pct.toFixed(d)}%`;
}
function fmtTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString(); } catch { return String(ts).slice(0, 8); }
}

// ── Order status badge ────────────────────────────────────────────────────────
const STATUS_COLOR = {
  pending:   AMBER,
  open:      BLUE,
  partial:   VIOLET,
  filled:    GREEN,
  cancelled: MUTED,
  rejected:  RED,
};

function StatusBadge({ status }) {
  const s = String(status || 'unknown').toLowerCase();
  const color = STATUS_COLOR[s] || MUTED;
  return (
    <span style={{ background: color + '22', color, border: `1px solid ${color}55`, borderRadius: 4, fontSize: 10, padding: '2px 7px', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {s.toUpperCase()}
    </span>
  );
}

// ── Mode badge / selector ─────────────────────────────────────────────────────
function ModeBadge({ mode, liveUnlocked, setMode }) {
  const isLive = mode === 'live';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => setMode('paper')}
        style={{ background: !isLive ? BLUE + '22' : SURFACE, color: !isLive ? BLUE : MUTED, border: `1px solid ${!isLive ? BLUE + '66' : BORDER}`, borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '4px 12px', cursor: 'pointer' }}
      >
        ◎ PAPER
      </button>
      <button
        onClick={() => liveUnlocked && setMode('live')}
        title={!liveUnlocked ? 'Live execution locked — Phase 12 OMS reconciliation required' : undefined}
        style={{ background: isLive ? RED + '22' : SURFACE, color: isLive ? RED : MUTED, border: `1px solid ${isLive ? RED + '66' : BORDER}`, borderRadius: 6, fontSize: 12, fontWeight: 700, padding: '4px 12px', cursor: liveUnlocked ? 'pointer' : 'not-allowed', opacity: liveUnlocked ? 1 : 0.45 }}
      >
        ● LIVE {!liveUnlocked && '🔒'}
      </button>
    </div>
  );
}

// ── Active orders table ────────────────────────────────────────────────────────
function ActiveOrdersTable({ orders, onCancel }) {
  const active = orders.filter((o) => !['filled', 'cancelled', 'rejected'].includes(String(o.status || '').toLowerCase()));
  if (!active.length) return <div data-testid="exec-active-empty" style={{ color: MUTED, fontSize: 12 }}>No active orders.</div>;
  const th = { padding: '6px 10px', fontSize: 11, color: MUTED, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
  const td = { padding: '5px 8px', fontSize: 12, borderBottom: `1px solid ${BORDER}22`, verticalAlign: 'middle' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table data-testid="exec-active-orders" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
        <thead>
          <tr>
            <th style={th}>Order ID</th>
            <th style={th}>Symbol</th>
            <th style={th}>Side</th>
            <th style={{ ...th, textAlign: 'right' }}>Qty</th>
            <th style={{ ...th, textAlign: 'right' }}>Filled</th>
            <th style={{ ...th, textAlign: 'right' }}>Price</th>
            <th style={th}>Type</th>
            <th style={th}>Status</th>
            <th style={th}>Time</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {active.map((o, i) => {
            const oid = o.orderId || o.id || o.clientOrderId;
            const side = String(o.side || '').toUpperCase();
            return (
              <tr data-testid="exec-active-row" key={oid || i}>
                <td style={{ ...td, fontFamily: 'monospace', color: MUTED, fontSize: 10 }}>…{String(oid || '').slice(-10)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{o.symbol || '—'}</td>
                <td style={{ ...td, color: side === 'BUY' ? GREEN : RED, fontWeight: 700 }}>{side}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtN(o.quantity ?? o.qty, 0)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: MUTED }}>{fmtN(o.filledQty ?? o.filled_qty, 0)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtMoney(o.limitPrice ?? o.price)}</td>
                <td style={{ ...td, color: MUTED, fontSize: 11 }}>{o.orderType || o.order_type || '—'}</td>
                <td style={td}><StatusBadge status={o.status} /></td>
                <td style={{ ...td, color: MUTED, fontSize: 10 }}>{fmtTime(o.createdAt || o.created_at || o.timestamp)}</td>
                <td style={td}>
                  <button
                    onClick={() => onCancel(oid)}
                    style={{ background: RED + '22', color: RED, border: `1px solid ${RED}44`, borderRadius: 4, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Fills blotter ─────────────────────────────────────────────────────────────
function FillsBlotter({ fills }) {
  if (!fills.length) return <div style={{ color: MUTED, fontSize: 12 }}>No fills yet.</div>;
  const th = { padding: '6px 10px', fontSize: 11, color: MUTED, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
  const td = { padding: '5px 8px', fontSize: 12, borderBottom: `1px solid ${BORDER}22`, verticalAlign: 'middle' };
  return (
    <div style={{ overflowX: 'auto', maxHeight: 320 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            <th style={th}>Symbol</th>
            <th style={th}>Side</th>
            <th style={{ ...th, textAlign: 'right' }}>Qty</th>
            <th style={{ ...th, textAlign: 'right' }}>Fill Price</th>
            <th style={{ ...th, textAlign: 'right' }}>Expected</th>
            <th style={{ ...th, textAlign: 'right' }}>Slippage (bps)</th>
            <th style={th}>Fill Time</th>
          </tr>
        </thead>
        <tbody>
          {fills.map((f, i) => {
            const slip = Number(f.slippage ?? f.slippageBps ?? 0);
            const slipColor = Math.abs(slip) > 10 ? AMBER : Math.abs(slip) > 25 ? RED : GREEN;
            const side = String(f.side || '').toUpperCase();
            return (
              <tr key={f.id || f.fillId || i}>
                <td style={{ ...td, fontWeight: 700 }}>{f.symbol || '—'}</td>
                <td style={{ ...td, color: side === 'BUY' ? GREEN : RED, fontWeight: 700 }}>{side}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtN(f.quantity ?? f.qty, 0)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtMoney(f.fillPrice ?? f.fill_price)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: MUTED }}>{fmtMoney(f.expectedPrice ?? f.benchmarkPrice)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: slipColor }}>
                  {Number.isFinite(slip) ? slip.toFixed(1) : '—'}
                </td>
                <td style={{ ...td, color: MUTED, fontSize: 10 }}>{fmtTime(f.filledAt ?? f.filled_at ?? f.timestamp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Execution analytics panel ─────────────────────────────────────────────────
function AnalyticsPanel({ analytics }) {
  if (!analytics) return <div style={{ color: MUTED, fontSize: 12 }}>No analytics yet. Click ↻ Refresh to load.</div>;
  const chips = [
    { label: 'Fill Rate',       value: fmtPct(analytics.fillRate ?? analytics.fill_rate),                           color: GREEN,  testId: 'exec-fill-rate' },
    { label: 'Avg Slippage',    value: `${fmtN(analytics.avgSlippage ?? analytics.avg_slippage, 1)} bps`,           color: Math.abs(Number(analytics.avgSlippage)) > 15 ? AMBER : GREEN },
    { label: 'Total Orders',    value: fmtN(analytics.totalOrders ?? analytics.total_orders, 0),                    color: TEXT  },
    { label: 'Total Fills',     value: fmtN(analytics.totalFills  ?? analytics.total_fills,  0),                    color: TEXT  },
    { label: 'Gross Notional',  value: fmtMoney(analytics.grossNotional ?? analytics.gross_notional),              color: TEXT  },
    { label: 'VWAP Outperform', value: fmtPct(analytics.vwapOutperformance ?? analytics.vwap_outperformance),      color: Number(analytics.vwapOutperformance ?? 0) >= 0 ? GREEN : RED },
    { label: 'Best Fill Δ',     value: `${fmtN(analytics.bestSlippage ?? analytics.best_slippage, 1)} bps`,        color: GREEN },
    { label: 'Worst Fill Δ',    value: `${fmtN(analytics.worstSlippage ?? analytics.worst_slippage, 1)} bps`,      color: RED   },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
      {chips.map(({ label, value, color, testId }) => (
        <div key={label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
          <div data-testid={testId} style={{ fontWeight: 800, fontFamily: 'monospace', color, fontSize: 14 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Order history (completed orders) ─────────────────────────────────────────
function OrderHistory({ orders }) {
  const done = orders.filter((o) => ['filled', 'cancelled', 'rejected'].includes(String(o.status || '').toLowerCase()));
  if (!done.length) return <div style={{ color: MUTED, fontSize: 12 }}>No completed orders yet.</div>;
  const th = { padding: '6px 10px', fontSize: 11, color: MUTED, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
  const td = { padding: '5px 8px', fontSize: 12, borderBottom: `1px solid ${BORDER}22` };
  return (
    <div style={{ overflowX: 'auto', maxHeight: 260 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
        <thead>
          <tr>
            <th style={th}>Symbol</th>
            <th style={th}>Side</th>
            <th style={{ ...th, textAlign: 'right' }}>Qty</th>
            <th style={{ ...th, textAlign: 'right' }}>Avg Fill</th>
            <th style={th}>Status</th>
            <th style={th}>Completed</th>
          </tr>
        </thead>
        <tbody>
          {done.slice(0, 30).map((o, i) => {
            const oid = o.orderId || o.id || o.clientOrderId;
            const side = String(o.side || '').toUpperCase();
            return (
              <tr key={oid || i}>
                <td style={{ ...td, fontWeight: 700 }}>{o.symbol || '—'}</td>
                <td style={{ ...td, color: side === 'BUY' ? GREEN : RED }}>{side}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtN(o.quantity ?? o.qty, 0)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtMoney(o.avgFillPrice ?? o.fillPrice ?? o.avg_fill_price)}</td>
                <td style={td}><StatusBadge status={o.status} /></td>
                <td style={{ ...td, color: MUTED, fontSize: 10 }}>{fmtTime(o.updatedAt ?? o.completedAt ?? o.timestamp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────────
export default function ExecutionWorkspace() {
  const {
    mode, liveUnlocked, setMode,
    orders, fills, analytics,
    ordersLoading, fillsLoading, analyticsLoading,
    ordersError, fillsError, analyticsError,
    cancelOrder, refreshAll, clearErrors,
  } = useExecutionStore();

  const omsOrders = useOMSStore((s) => s.orders);
  const omsReconciliation = useOMSStore((s) => s.reconciliation);
  const omsActiveCount = omsOrders.filter((o) => !OMS_TERMINAL.has(String(o.omsState ?? o.state ?? o.status ?? '').toUpperCase())).length;
  const omsDivergences = Array.isArray(omsReconciliation?.divergences) ? omsReconciliation.divergences.length : 0;

  useEffect(() => { refreshAll(); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLive = mode === 'live';

  return (
    <section style={{ display: 'grid', gap: 12 }}>

      {/* Header */}
      <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong style={{ fontSize: 15 }}>Execution Layer</strong>
        <ModeBadge mode={mode} liveUnlocked={liveUnlocked} setMode={setMode} />
        {isLive && liveUnlocked && (
          <span style={{ background: RED + '22', color: RED, border: `1px solid ${RED}55`, borderRadius: 6, fontSize: 11, padding: '3px 10px', fontWeight: 700 }}>
            ● LIVE ORDERS ACTIVE
          </span>
        )}
        {omsActiveCount > 0 && (
          <span style={{
            background: BLUE + '11', color: BLUE, border: `1px solid ${BLUE}44`,
            borderRadius: 6, fontSize: 11, padding: '3px 10px', fontWeight: 700,
          }}>
            OMS {omsActiveCount} active
          </span>
        )}
        {omsDivergences > 0 && (
          <span style={{
            background: AMBER + '22', color: AMBER, border: `1px solid ${AMBER}55`,
            borderRadius: 6, fontSize: 11, padding: '3px 10px', fontWeight: 700,
          }}>
            ⚠ {omsDivergences} OMS divergence{omsDivergences !== 1 ? 's' : ''}
          </span>
        )}
        <button
          onClick={refreshAll}
          style={{ marginLeft: 'auto', background: BLUE, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Error bar */}
      {(ordersError || fillsError || analyticsError) && (
        <div style={{ ...panel, borderColor: '#7f1d1d', color: '#fecaca', display: 'flex', gap: 10, alignItems: 'center' }}>
          {ordersError || fillsError || analyticsError}
          <button onClick={clearErrors} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #7f1d1d', borderRadius: 5, color: '#fecaca', cursor: 'pointer', padding: '2px 10px' }}>Dismiss</button>
        </div>
      )}

      {/* ── Order Ticket ─────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <strong>Order Ticket</strong>
          <span style={{
            background: isLive ? RED + '22' : BLUE + '22',
            color: isLive ? RED : BLUE,
            border: `1px solid ${isLive ? RED + '55' : BLUE + '55'}`,
            borderRadius: 4, fontSize: 10, padding: '2px 7px', fontWeight: 700,
          }}>
            {isLive ? 'LIVE' : 'PAPER'}
          </span>
        </div>
        <OrderTicket />
      </div>

      {/* ── Active Orders ────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Active Orders</strong>
          {ordersLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
          <span data-testid="exec-active-count" style={{ fontSize: 11, color: MUTED }}>
            {orders.filter((o) => !['filled', 'cancelled', 'rejected'].includes(String(o.status || '').toLowerCase())).length} active
          </span>
        </div>
        <ActiveOrdersTable orders={orders} onCancel={cancelOrder} />
      </div>

      {/* ── Execution Blotter (fills) ────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Execution Blotter</strong>
          {fillsLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
          <span style={{ fontSize: 11, color: MUTED }}>{fills.length} fill{fills.length !== 1 ? 's' : ''}</span>
        </div>
        <FillsBlotter fills={fills} />
      </div>

      {/* ── Execution Analytics ──────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Execution Quality</strong>
          {analyticsLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
        </div>
        <AnalyticsPanel analytics={analytics} />
      </div>

      {/* ── Order History ────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Order History</strong>
          <span style={{ fontSize: 11, color: MUTED }}>
            {orders.filter((o) => ['filled', 'cancelled', 'rejected'].includes(String(o.status || '').toLowerCase())).length} completed
          </span>
        </div>
        <OrderHistory orders={orders} />
      </div>

    </section>
  );
}
