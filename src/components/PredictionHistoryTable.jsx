import { useState, useMemo } from 'react';

const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';

const SIGNAL_COLORS = { LONG: GREEN, SHORT: RED, NEUTRAL: MUTED };

/**
 * PredictionHistoryTable — scrollable table of past predictions.
 *
 * Props:
 *   predictions   Array<{ timestamp, symbol, signal, probability, confidence, outcome?, pnl? }>
 *   loading       bool
 *   error         string
 *   pageSize      number (default 25)
 */
export default function PredictionHistoryTable({ predictions, loading, error, pageSize = 25 }) {
  predictions = Array.isArray(predictions) ? predictions : [];
  const [page, setPage]           = useState(0);
  const [filterSymbol, setFilter] = useState('');
  const [filterSignal, setFSig]   = useState('');

  const filtered = useMemo(() => {
    let r = predictions;
    if (filterSymbol) r = r.filter((p) => p.symbol?.includes(filterSymbol.toUpperCase()));
    if (filterSignal) r = r.filter((p) => p.signal === filterSignal);
    return r;
  }, [predictions, filterSymbol, filterSignal]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  if (loading) return <div style={{ color: MUTED, padding: 20, textAlign: 'center', fontSize: 13 }}>Loading predictions…</div>;
  if (error)   return <div style={{ color: AMBER, fontSize: 12, padding: 10 }}>{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={filterSymbol}
          onChange={(e) => { setFilter(e.target.value); setPage(0); }}
          placeholder="Filter symbol…"
          style={{ background: '#050505', border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, padding: '5px 8px', fontSize: 11, width: 120 }}
        />
        <select
          value={filterSignal}
          onChange={(e) => { setFSig(e.target.value); setPage(0); }}
          style={{ background: '#050505', border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, padding: '5px 8px', fontSize: 11 }}
        >
          <option value="">All signals</option>
          <option value="LONG">LONG</option>
          <option value="NEUTRAL">NEUTRAL</option>
          <option value="SHORT">SHORT</option>
        </select>
        <span style={{ fontSize: 10, color: MUTED, alignSelf: 'center' }}>
          {filtered.length} predictions
        </span>
      </div>

      {/* Table */}
      {paged.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 12, textAlign: 'center', padding: 20 }}>No predictions found</div>
      ) : (
        <>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '140px 80px 90px 70px 70px 80px 80px',
            gap: 6, padding: '5px 10px',
            background: '#0a0a14', border: `1px solid ${BORDER}`,
            borderRadius: '8px 8px 0 0', borderBottom: 'none',
          }}>
            {['Time', 'Symbol', 'Signal', 'Prob', 'Conf', 'Outcome', 'PnL'].map((h) => (
              <span key={h} style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</span>
            ))}
          </div>

          <div style={{ border: `1px solid ${BORDER}`, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            {paged.map((p, i) => {
              const sigColor = SIGNAL_COLORS[p.signal] || MUTED;
              const pnlColor = p.pnl != null ? (p.pnl > 0 ? GREEN : p.pnl < 0 ? RED : MUTED) : MUTED;
              const outcomeColor = p.outcome === 'correct' ? GREEN : p.outcome === 'incorrect' ? RED : MUTED;
              const ts = p.timestamp ? new Date(p.timestamp).toLocaleTimeString() : '—';

              return (
                <div
                  key={i}
                  style={{
                    display: 'grid', gridTemplateColumns: '140px 80px 90px 70px 70px 80px 80px',
                    gap: 6, padding: '5px 10px', alignItems: 'center',
                    background: i % 2 === 0 ? SURFACE : '#0a0a14',
                    borderBottom: `1px solid ${BORDER}22`,
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: MUTED, fontFamily: 'monospace', fontSize: 10 }}>{ts}</span>
                  <span style={{ color: TEXT, fontWeight: 700 }}>{p.symbol || '—'}</span>
                  <span style={{
                    color: sigColor, fontWeight: 700,
                    background: `${sigColor}18`, border: `1px solid ${sigColor}44`,
                    borderRadius: 4, padding: '1px 6px', display: 'inline-block', textAlign: 'center',
                  }}>{p.signal || '—'}</span>
                  <span style={{ color: MUTED, fontFamily: 'monospace', textAlign: 'right' }}>
                    {p.probability != null ? (p.probability * 100).toFixed(0) + '%' : '—'}
                  </span>
                  <span style={{ color: MUTED, fontFamily: 'monospace', textAlign: 'right' }}>
                    {p.confidence != null ? (p.confidence * 100).toFixed(0) + '%' : '—'}
                  </span>
                  <span style={{ color: outcomeColor, textAlign: 'center' }}>
                    {p.outcome === 'correct' ? '✓' : p.outcome === 'incorrect' ? '✗' : '—'}
                  </span>
                  <span style={{ color: pnlColor, fontFamily: 'monospace', textAlign: 'right', fontWeight: p.pnl != null ? 700 : 400 }}>
                    {p.pnl != null ? (p.pnl > 0 ? '+' : '') + p.pnl.toFixed(2) : '—'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4 }}>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                style={{ background: '#111', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 6, padding: '3px 10px', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 11 }}>←</button>
              <span style={{ fontSize: 11, color: MUTED, alignSelf: 'center' }}>{page + 1}/{totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                style={{ background: '#111', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 6, padding: '3px 10px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 11 }}>→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
