import { useState, useMemo } from 'react';

const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const BLUE    = '#60a5fa';
const AMBER   = '#f59e0b';

/**
 * FeatureImportanceTable — sortable table of feature importance scores.
 *
 * Props:
 *   features   Array<{ feature: string, importance: number, shap_value?: number }>
 *   loading    bool
 *   error      string
 *   pageSize   number (default 20)
 */
export default function FeatureImportanceTable({ features = [], loading, error, pageSize = 20 }) {
  const [sortKey, setSortKey]   = useState('importance');
  const [sortDir, setSortDir]   = useState('desc');
  const [page, setPage]         = useState(0);

  const sorted = useMemo(() => {
    const copy = [...features];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return copy;
  }, [features, sortKey, sortDir]);

  const maxImportance = sorted[0]?.importance || 1;
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); setPage(0); }
  }

  const SortBtn = ({ col, children }) => (
    <button
      onClick={() => handleSort(col)}
      style={{
        background: 'transparent', border: 'none', color: sortKey === col ? BLUE : MUTED,
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
        cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3,
      }}
    >
      {children} {sortKey === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </button>
  );

  if (loading) return <div style={{ color: MUTED, fontSize: 13, padding: 20, textAlign: 'center' }}>Loading…</div>;
  if (error)   return <div style={{ color: AMBER, fontSize: 12, padding: 10 }}>{error}</div>;
  if (!features.length) return <div style={{ color: MUTED, fontSize: 12, padding: 20, textAlign: 'center' }}>No feature importance data</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 140px 80px 70px',
        gap: 8, padding: '6px 12px',
        background: '#0a0a14', borderRadius: '8px 8px 0 0',
        border: `1px solid ${BORDER}`, borderBottom: 'none',
      }}>
        <SortBtn col="feature">Feature</SortBtn>
        <SortBtn col="importance">Importance</SortBtn>
        <SortBtn col="shap_value">SHAP</SortBtn>
        <SortBtn col="direction">Dir</SortBtn>
      </div>

      {/* Rows */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
        {paged.map((f, i) => {
          const bar = Math.round((f.importance / maxImportance) * 100);
          const shap = f.shap_value;
          const dir = shap != null ? (shap > 0 ? '↑' : shap < 0 ? '↓' : '—') : '—';
          const dirColor = dir === '↑' ? '#22c55e' : dir === '↓' ? '#ef4444' : MUTED;
          const isEven = i % 2 === 0;

          return (
            <div
              key={f.feature}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 140px 80px 70px',
                gap: 8, padding: '6px 12px', alignItems: 'center',
                background: isEven ? SURFACE : '#0a0a14',
                borderBottom: `1px solid ${BORDER}22`,
              }}
            >
              {/* Feature name */}
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.feature}
              </span>

              {/* Importance bar + value */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, height: 6, background: '#1f2937', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${bar}%`, height: '100%', background: BLUE, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: BLUE, width: 36, textAlign: 'right' }}>
                  {f.importance != null ? Number(f.importance).toFixed(2) : '—'}
                </span>
              </div>

              {/* SHAP */}
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: MUTED, textAlign: 'right' }}>
                {shap != null ? Number(shap).toFixed(4) : '—'}
              </span>

              {/* Direction */}
              <span style={{ fontSize: 12, fontWeight: 700, color: dirColor, textAlign: 'center' }}>{dir}</span>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            style={{ background: '#111', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 6, padding: '4px 10px', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 11 }}>
            ←
          </button>
          <span style={{ fontSize: 11, color: MUTED, alignSelf: 'center' }}>
            {page + 1} / {totalPages} ({sorted.length} features)
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            style={{ background: '#111', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 6, padding: '4px 10px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 11 }}>
            →
          </button>
        </div>
      )}
    </div>
  );
}
