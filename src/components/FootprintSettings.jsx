import { useFootprintStore } from '../store/footprintStore.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = '#050505';
const BORDER = '#1f2937';
const TEXT   = '#e0e0f0';
const MUTED  = '#6b7280';
const GREEN  = '#22c55e';
const AMBER  = '#FFB800';
const BLUE   = '#2563eb';

const iStyle = { background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 8px', fontSize: 12 };
const labelStyle = { fontSize: 11, color: MUTED, display: 'block', marginBottom: 2 };
const field = { display: 'flex', flexDirection: 'column', minWidth: 90 };

const CLUSTER_OPTIONS = [0.05, 0.10, 0.25, 0.50, 1.00, 2.00, 5.00];
const TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '1h'];
const MAX_BARS_OPTIONS = [5, 10, 15, 20, 25, 30];

export default function FootprintSettings() {
  const {
    visible, toggleVisible,
    clusterSize, setClusterSize,
    imbalanceThreshold, setImbalanceThreshold,
    maxBars, setMaxBars,
    timeframe, setTimeframe,
    showImbalances, toggleImbalances,
    showAbsorption, toggleAbsorption,
    loading, loadFootprint, fallback,
  } = useFootprintStore();

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, background: '#0a0a0a', overflow: 'hidden' }}>
      {/* Toggle header */}
      <button
        onClick={toggleVisible}
        style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}
      >
        <span style={{ color: BLUE, fontSize: 13 }}>{visible ? '▼' : '▶'}</span>
        <strong style={{ color: TEXT, fontSize: 13 }}>Footprint Chart</strong>
        {fallback && (
          <span style={{ marginLeft: 6, background: AMBER + '22', color: AMBER, border: `1px solid ${AMBER}55`, borderRadius: 4, fontSize: 10, padding: '2px 6px', fontWeight: 700 }}>
            ⚠ SYNTHETIC
          </span>
        )}
        {!visible && <span style={{ marginLeft: 'auto', color: MUTED, fontSize: 11 }}>click to expand</span>}
      </button>

      {visible && (
        <div style={{ padding: '0 14px 14px', display: 'grid', gap: 12 }}>
          {/* Controls row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>

            <div style={field}>
              <span style={labelStyle}>Timeframe</span>
              <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={iStyle}>
                {TIMEFRAME_OPTIONS.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
              </select>
            </div>

            <div style={field}>
              <span style={labelStyle}>Cluster size</span>
              <select value={clusterSize} onChange={(e) => setClusterSize(e.target.value)} style={iStyle}>
                {CLUSTER_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div style={{ ...field, minWidth: 130 }}>
              <span style={labelStyle}>
                Imbalance threshold
                <span style={{ color: MUTED + 'aa', marginLeft: 4, fontSize: 10 }}>(≥ 1.0)</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="range"
                  min="1.0" max="4.0" step="0.1"
                  value={imbalanceThreshold}
                  onChange={(e) => setImbalanceThreshold(e.target.value)}
                  style={{ width: 90, accentColor: BLUE }}
                />
                <span style={{ color: TEXT, fontFamily: 'monospace', fontSize: 12, minWidth: 28 }}>{Number(imbalanceThreshold).toFixed(1)}</span>
              </div>
            </div>

            <div style={field}>
              <span style={labelStyle}>Max bars</span>
              <select value={maxBars} onChange={(e) => setMaxBars(e.target.value)} style={iStyle}>
                {MAX_BARS_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', paddingBottom: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: showImbalances ? GREEN : MUTED }}>
                <input type="checkbox" checked={showImbalances} onChange={toggleImbalances} style={{ accentColor: GREEN }} />
                Imbalances
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: showAbsorption ? BLUE : MUTED }}>
                <input type="checkbox" checked={showAbsorption} onChange={toggleAbsorption} style={{ accentColor: BLUE }} />
                Absorption
              </label>
            </div>

            <button
              onClick={loadFootprint}
              disabled={loading}
              style={{ background: BLUE, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1, alignSelf: 'flex-end' }}
            >
              {loading ? 'Loading…' : '↻ Load'}
            </button>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, color: MUTED }}>
            <span><span style={{ color: GREEN }}>■</span> Ask imbalance (buy pressure)</span>
            <span><span style={{ color: '#ef4444' }}>■</span> Bid imbalance (sell pressure)</span>
            <span><span style={{ color: AMBER }}>◆</span> POC (Point of Control)</span>
            <span><span style={{ color: BLUE }}>⊕</span> Absorption</span>
            <span><span style={{ color: '#a78bfa' }}>≡</span> Stacked imbalance</span>
          </div>
        </div>
      )}
    </div>
  );
}
