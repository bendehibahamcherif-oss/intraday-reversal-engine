import { useEffect } from 'react';
import { useOMSStore, OMS_TERMINAL } from '../store/omsStore';

const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT     = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';
const BLUE    = '#2563eb';
const VIOLET  = '#a78bfa';

const panel = { background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 };

// OMS state machine color map
const OMS_STATE_COLOR = {
  PENDING_NEW:    AMBER,
  SENT_TO_BROKER: BLUE,
  ACKNOWLEDGED:   BLUE,
  OPEN:           BLUE,
  PARTIAL_FILL:   VIOLET,
  FILLED:         GREEN,
  PENDING_CANCEL: AMBER,
  CANCELLED:      MUTED,
  REJECTED:       RED,
  EXPIRED:        MUTED,
};

function OMSStateBadge({ state }) {
  const s = String(state || 'UNKNOWN').toUpperCase();
  const color = OMS_STATE_COLOR[s] || MUTED;
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 4, fontSize: 10, padding: '2px 7px', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {s}
    </span>
  );
}

function fmtN(v, d = 2) {
  if (v == null) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}
function fmtMoney(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toFixed(2)}`;
}
function fmtTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString(); } catch { return String(ts).slice(0, 8); }
}
function fmtDateTime(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } catch { return String(ts); }
}

// ── OMS Stats panel ────────────────────────────────────────────────────────────
function StatsPanel({ stats, loading }) {
  if (loading) return <div style={{ color: MUTED, fontSize: 12 }}>Loading stats…</div>;
  if (!stats)  return <div style={{ color: MUTED, fontSize: 12 }}>No stats available. Click ↻ Refresh.</div>;

  const chips = [
    { label: 'Total Orders',   value: fmtN(stats.totalOrders ?? stats.total_orders, 0),                   color: TEXT,   testId: 'oms-stats-total' },
    { label: 'Active',         value: fmtN(stats.activeOrders ?? stats.active_orders, 0),                  color: BLUE  },
    { label: 'Filled',         value: fmtN(stats.filledOrders ?? stats.filled_orders, 0),                  color: GREEN },
    { label: 'Cancelled',      value: fmtN(stats.cancelledOrders ?? stats.cancelled_orders, 0),            color: MUTED },
    { label: 'Rejected',       value: fmtN(stats.rejectedOrders ?? stats.rejected_orders, 0),              color: RED   },
    { label: 'Partial Fills',  value: fmtN(stats.partialFills ?? stats.partial_fills, 0),                  color: VIOLET},
    { label: 'Fill Rate',      value: stats.fillRate != null ? `${(Number(stats.fillRate) * 100).toFixed(1)}%` : '—', color: GREEN, testId: 'oms-stats-fill-rate' },
    { label: 'Pending Recon',  value: fmtN(stats.pendingReconciliation ?? stats.pending_reconciliation, 0), color: stats?.pendingReconciliation > 0 ? AMBER : MUTED },
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

// ── OMS Orders table ──────────────────────────────────────────────────────────
function OMSOrdersTable({ orders, selectedOrderId, onSelect }) {
  if (!orders.length) return <div data-testid="oms-orders-empty" style={{ color: MUTED, fontSize: 12 }}>No OMS orders found.</div>;

  const th = { padding: '6px 10px', fontSize: 11, color: MUTED, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
  const td = { padding: '5px 8px', fontSize: 12, borderBottom: `1px solid ${BORDER}22`, verticalAlign: 'middle', cursor: 'pointer' };

  return (
    <div style={{ overflowX: 'auto', maxHeight: 420 }}>
      <table data-testid="oms-orders-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
        <thead>
          <tr>
            <th style={th}>OMS ID</th>
            <th style={th}>Symbol</th>
            <th style={th}>Side</th>
            <th style={{ ...th, textAlign: 'right' }}>Qty</th>
            <th style={{ ...th, textAlign: 'right' }}>Filled</th>
            <th style={{ ...th, textAlign: 'right' }}>Avg Fill</th>
            <th style={th}>Type</th>
            <th style={th}>OMS State</th>
            <th style={th}>Broker ID</th>
            <th style={th}>Created</th>
            <th style={th}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o, i) => {
            const oid = o.orderId || o.id || o.clientOrderId;
            const isSelected = selectedOrderId === oid;
            const side = String(o.side || '').toUpperCase();
            const isTerminal = OMS_TERMINAL.has(String(o.omsState || o.state || '').toUpperCase());
            return (
              <tr
                data-testid="oms-order-row"
                key={oid || i}
                onClick={() => onSelect(isSelected ? null : oid)}
                style={{ background: isSelected ? BLUE + '11' : 'transparent', outline: isSelected ? `1px solid ${BLUE}44` : 'none' }}
              >
                <td style={{ ...td, fontFamily: 'monospace', color: MUTED, fontSize: 10 }}>…{String(oid || '').slice(-10)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{o.symbol || '—'}</td>
                <td style={{ ...td, color: side === 'BUY' ? GREEN : RED, fontWeight: 700 }}>{side}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtN(o.quantity ?? o.qty, 0)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: MUTED }}>{fmtN(o.filledQty ?? o.filled_qty, 0)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtMoney(o.avgFillPrice ?? o.avg_fill_price)}</td>
                <td style={{ ...td, color: MUTED, fontSize: 11 }}>{o.orderType || o.order_type || '—'}</td>
                <td style={td}><OMSStateBadge state={o.omsState ?? o.state ?? o.status} /></td>
                <td style={{ ...td, fontFamily: 'monospace', color: isTerminal ? MUTED : TEXT, fontSize: 10 }}>
                  {o.brokerOrderId ? `…${String(o.brokerOrderId).slice(-8)}` : <span style={{ color: MUTED }}>—</span>}
                </td>
                <td style={{ ...td, color: MUTED, fontSize: 10 }}>{fmtTime(o.createdAt || o.created_at)}</td>
                <td style={{ ...td, color: MUTED, fontSize: 10 }}>{fmtTime(o.updatedAt || o.updated_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>Click a row to view event journal</div>
    </div>
  );
}

// ── Event journal ─────────────────────────────────────────────────────────────
function EventJournal({ events, loading, error, orderId }) {
  if (!orderId) return null;

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <strong>Event Journal</strong>
        {loading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
        <span style={{ fontSize: 11, color: MUTED, fontFamily: 'monospace' }}>…{String(orderId).slice(-10)}</span>
        <span style={{ fontSize: 11, color: MUTED }}>{events.length} event{events.length !== 1 ? 's' : ''}</span>
      </div>

      {error && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{error}</div>}

      {!events.length && !loading && (
        <div style={{ color: MUTED, fontSize: 12 }}>No events recorded for this order.</div>
      )}

      {events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
          {events.map((ev, i) => {
            const evType = String(ev.eventType || ev.event_type || ev.type || 'UNKNOWN').toUpperCase();
            const prevState = ev.prevState || ev.prev_state;
            const nextState = ev.nextState || ev.next_state || ev.state;
            const ts = ev.timestamp || ev.createdAt || ev.created_at;
            return (
              <div key={ev.id || ev.eventId || i} style={{
                background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px',
                display: 'flex', alignItems: 'flex-start', gap: 12,
              }}>
                {/* Timeline dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                  background: OMS_STATE_COLOR[nextState] || BLUE,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: TEXT }}>{evType}</span>
                    {prevState && nextState && prevState !== nextState && (
                      <span style={{ fontSize: 11, color: MUTED }}>
                        <OMSStateBadge state={prevState} />
                        <span style={{ margin: '0 4px' }}>→</span>
                        <OMSStateBadge state={nextState} />
                      </span>
                    )}
                    {(!prevState || prevState === nextState) && nextState && (
                      <OMSStateBadge state={nextState} />
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: MUTED, fontFamily: 'monospace', flexShrink: 0 }}>
                      {fmtDateTime(ts)}
                    </span>
                  </div>
                  {(ev.fillQty != null || ev.fillPrice != null) && (
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
                      {ev.fillQty != null && <span>Qty: <strong style={{ color: TEXT }}>{fmtN(ev.fillQty, 0)}</strong></span>}
                      {ev.fillQty != null && ev.fillPrice != null && <span style={{ margin: '0 8px' }}>·</span>}
                      {ev.fillPrice != null && <span>Price: <strong style={{ color: TEXT }}>{fmtMoney(ev.fillPrice)}</strong></span>}
                    </div>
                  )}
                  {ev.reason && (
                    <div style={{ fontSize: 11, color: AMBER, marginTop: 3 }}>{ev.reason}</div>
                  )}
                  {ev.brokerOrderId && (
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 2, fontFamily: 'monospace' }}>
                      Broker ID: {ev.brokerOrderId}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Reconciliation panel ──────────────────────────────────────────────────────
function ReconciliationPanel({ reconciliation, loading, error, running, runError, onRun }) {
  const divergences = Array.isArray(reconciliation?.divergences) ? reconciliation.divergences : [];
  const hasDivergences = divergences.length > 0;

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <strong>OMS Reconciliation</strong>
        {loading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
        {reconciliation?.runAt && (
          <span style={{ fontSize: 11, color: MUTED }}>Last run: {fmtDateTime(reconciliation.runAt)}</span>
        )}
        {hasDivergences && (
          <span style={{
            background: AMBER + '22', color: AMBER, border: `1px solid ${AMBER}55`,
            borderRadius: 4, fontSize: 10, padding: '2px 7px', fontWeight: 700,
          }}>
            ⚠ {divergences.length} DIVERGENCE{divergences.length !== 1 ? 'S' : ''}
          </span>
        )}
        {reconciliation && !hasDivergences && (
          <span style={{
            background: GREEN + '22', color: GREEN, border: `1px solid ${GREEN}55`,
            borderRadius: 4, fontSize: 10, padding: '2px 7px', fontWeight: 700,
          }}>
            ✓ IN SYNC
          </span>
        )}
        <button
          onClick={onRun}
          disabled={running}
          style={{
            marginLeft: 'auto', background: running ? SURFACE : AMBER + '22', color: running ? MUTED : AMBER,
            border: `1px solid ${AMBER}55`, borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700,
            cursor: running ? 'default' : 'pointer', opacity: running ? 0.7 : 1,
          }}
        >
          {running ? 'Running…' : '⟳ Run Reconciliation'}
        </button>
      </div>

      {(error || runError) && (
        <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{error || runError}</div>
      )}

      {reconciliation && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          {reconciliation.totalChecked != null && (
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 14px' }}>
              <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>CHECKED</div>
              <div style={{ fontWeight: 800, color: TEXT, fontFamily: 'monospace' }}>{fmtN(reconciliation.totalChecked, 0)}</div>
            </div>
          )}
          {reconciliation.totalSynced != null && (
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 14px' }}>
              <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>SYNCED</div>
              <div style={{ fontWeight: 800, color: GREEN, fontFamily: 'monospace' }}>{fmtN(reconciliation.totalSynced, 0)}</div>
            </div>
          )}
          {hasDivergences && (
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 14px' }}>
              <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>DIVERGENCES</div>
              <div style={{ fontWeight: 800, color: AMBER, fontFamily: 'monospace' }}>{divergences.length}</div>
            </div>
          )}
        </div>
      )}

      {hasDivergences && (
        <>
          <div style={{ fontSize: 11, color: AMBER, fontWeight: 700, marginBottom: 6 }}>Divergences requiring attention:</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
              <thead>
                <tr>
                  {['Order ID', 'Symbol', 'OMS State', 'Broker State', 'Action'].map((h) => (
                    <th key={h} style={{ padding: '5px 8px', fontSize: 10, color: MUTED, textAlign: 'left', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {divergences.map((d, i) => (
                  <tr key={d.orderId || i}>
                    <td style={{ padding: '4px 8px', fontSize: 10, fontFamily: 'monospace', color: MUTED }}>…{String(d.orderId || '').slice(-10)}</td>
                    <td style={{ padding: '4px 8px', fontSize: 12, fontWeight: 700 }}>{d.symbol || '—'}</td>
                    <td style={{ padding: '4px 8px' }}><OMSStateBadge state={d.omsState} /></td>
                    <td style={{ padding: '4px 8px' }}><OMSStateBadge state={d.brokerState} /></td>
                    <td style={{ padding: '4px 8px', fontSize: 11, color: AMBER }}>{d.action || d.resolution || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!reconciliation && !loading && (
        <div style={{ color: MUTED, fontSize: 12 }}>No reconciliation data. Click Run Reconciliation to sync OMS state with broker.</div>
      )}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({ filterSymbol, filterStatus, setFilterSymbol, setFilterStatus, onSearch }) {
  const iStyle = {
    background: BG, color: TEXT, border: `1px solid ${BORDER}`,
    borderRadius: 6, padding: '5px 8px', fontSize: 12,
  };
  const OMS_STATES = ['', 'PENDING_NEW', 'SENT_TO_BROKER', 'ACKNOWLEDGED', 'OPEN', 'PARTIAL_FILL', 'FILLED', 'PENDING_CANCEL', 'CANCELLED', 'REJECTED', 'EXPIRED'];

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        value={filterSymbol}
        onChange={(e) => setFilterSymbol(e.target.value.toUpperCase())}
        placeholder="Symbol filter…"
        style={{ ...iStyle, width: 120 }}
      />
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...iStyle }}>
        {OMS_STATES.map((s) => (
          <option key={s} value={s}>{s || 'All States'}</option>
        ))}
      </select>
      <button
        onClick={onSearch}
        style={{ background: BLUE + '22', color: BLUE, border: `1px solid ${BLUE}55`, borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
      >
        Search
      </button>
    </div>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────────
export default function OMSWorkspace() {
  const {
    orders, ordersLoading, ordersError,
    selectedOrderId, events, eventsLoading, eventsError,
    reconciliation, reconciliationLoading, reconciliationError,
    reconciliationRunning, reconciliationRunError,
    stats, statsLoading,
    filterSymbol, filterStatus,
    setFilterSymbol, setFilterStatus,
    selectOrder, loadOrders, runReconciliation,
    refreshAll, clearErrors,
  } = useOMSStore();

  useEffect(() => { refreshAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = orders.filter((o) => !OMS_TERMINAL.has(String(o.omsState ?? o.state ?? o.status ?? '').toUpperCase())).length;

  return (
    <section style={{ display: 'grid', gap: 12 }}>

      {/* Header */}
      <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>Order Management System</strong>
        <span style={{
          background: BLUE + '22', color: BLUE, border: `1px solid ${BLUE}55`,
          borderRadius: 4, fontSize: 10, padding: '2px 7px', fontWeight: 700,
        }}>
          OMS v12
        </span>
        {activeCount > 0 && (
          <span style={{
            background: AMBER + '22', color: AMBER, border: `1px solid ${AMBER}55`,
            borderRadius: 4, fontSize: 10, padding: '2px 7px', fontWeight: 700,
          }}>
            {activeCount} ACTIVE
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
      {ordersError && (
        <div style={{ ...panel, borderColor: '#7f1d1d', color: '#fecaca', display: 'flex', gap: 10, alignItems: 'center' }}>
          {ordersError}
          <button onClick={clearErrors} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #7f1d1d', borderRadius: 5, color: '#fecaca', cursor: 'pointer', padding: '2px 10px' }}>Dismiss</button>
        </div>
      )}

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ marginBottom: 12 }}><strong>OMS Statistics</strong></div>
        <StatsPanel stats={stats} loading={statsLoading} />
      </div>

      {/* ── Order Book ─────────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <strong>Canonical Order Book</strong>
          {ordersLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
          <span data-testid="oms-orders-count" style={{ fontSize: 11, color: MUTED }}>{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
          <div style={{ marginLeft: 'auto' }}>
            <FilterBar
              filterSymbol={filterSymbol}
              filterStatus={filterStatus}
              setFilterSymbol={setFilterSymbol}
              setFilterStatus={setFilterStatus}
              onSearch={loadOrders}
            />
          </div>
        </div>
        <OMSOrdersTable orders={orders} selectedOrderId={selectedOrderId} onSelect={selectOrder} />
      </div>

      {/* ── Event Journal (shown when an order is selected) ──────────────── */}
      {selectedOrderId && (
        <EventJournal
          events={events}
          loading={eventsLoading}
          error={eventsError}
          orderId={selectedOrderId}
        />
      )}

      {/* ── Reconciliation ──────────────────────────────────────────────────  */}
      <ReconciliationPanel
        reconciliation={reconciliation}
        loading={reconciliationLoading}
        error={reconciliationError}
        running={reconciliationRunning}
        runError={reconciliationRunError}
        onRun={runReconciliation}
      />

    </section>
  );
}
