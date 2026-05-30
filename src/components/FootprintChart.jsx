import { useFootprintStore, FOOTPRINT_SOURCES, IMBALANCE_CAPABLE_SOURCES } from '../store/footprintStore.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#FFB800';
const BLUE    = '#3b82f6';
const VIOLET  = '#a78bfa';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtVol(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtPrice(v, clusterSize) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  // Infer decimal places from clusterSize
  const decimals = clusterSize < 0.1 ? 3 : clusterSize < 1 ? 2 : clusterSize < 10 ? 1 : 0;
  return n.toFixed(decimals);
}

function fmtTime(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(typeof ts === 'number' ? ts : ts);
    return isNaN(d.getTime()) ? String(ts).slice(11, 16) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return String(ts).slice(0, 8); }
}

// Round a price to the nearest cluster boundary.
function snapPrice(price, clusterSize) {
  return Math.round(price / clusterSize) * clusterSize;
}

// ── Source badge ──────────────────────────────────────────────────────────────
function SourceBadge({ source, fallback }) {
  const label = FOOTPRINT_SOURCES[source] || source || 'unknown';
  const capable = IMBALANCE_CAPABLE_SOURCES.has(source);
  return (
    <span style={{
      background: capable ? GREEN + '22' : AMBER + '22',
      color:      capable ? GREEN : AMBER,
      border:     `1px solid ${capable ? GREEN + '55' : AMBER + '55'}`,
      borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '2px 6px',
    }}>
      {capable ? '✓ LIVE' : '⚠ SYNTHETIC'} · {label}
    </span>
  );
}

// ── Delta bar (bottom of each column) ────────────────────────────────────────
function DeltaCell({ bar }) {
  const delta = Number(bar.delta ?? 0);
  const color = delta > 0 ? GREEN : delta < 0 ? RED : MUTED;
  const stackColor = bar.stackedImbalance === 'ask' ? GREEN : bar.stackedImbalance === 'bid' ? RED : null;
  return (
    <div style={{
      padding: '3px 4px', textAlign: 'center', background: SURFACE,
      borderTop: `1px solid ${BORDER}`,
      borderLeft: stackColor ? `3px solid ${stackColor}` : undefined,
      fontSize: 10, fontFamily: 'monospace', color,
    }}>
      {bar.stackedImbalance && (
        <span style={{ color: stackColor, marginRight: 3, fontSize: 10 }} title={`Stacked ${bar.stackedImbalance} imbalance`}>≡</span>
      )}
      {delta > 0 ? '+' : ''}{fmtVol(delta)}
    </div>
  );
}

// ── Single price-level cell ────────────────────────────────────────────────────
function LevelCell({ level, isPOC, showImbalances, showAbsorption, fallback }) {
  if (!level) {
    return <div style={{ padding: '2px 4px', borderBottom: `1px solid ${BORDER}22`, minHeight: 18 }} />;
  }

  // Imbalances are only shown when source is capable AND user hasn't disabled them AND not fallback
  const showImbal = showImbalances && !fallback;
  const isAskImbal = showImbal && level.imbalance === 'ask';
  const isBidImbal = showImbal && level.imbalance === 'bid';
  const isAbsorption = showAbsorption && level.absorption;

  let bg = 'transparent';
  if (isAskImbal)   bg = GREEN + '20';
  if (isBidImbal)   bg = RED   + '20';
  if (isAbsorption) bg = BLUE  + '18';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      gap: 2,
      padding: '2px 4px',
      background: bg,
      borderBottom: `1px solid ${BORDER}22`,
      borderLeft: isPOC ? `2px solid ${AMBER}` : isAskImbal ? `2px solid ${GREEN}88` : isBidImbal ? `2px solid ${RED}88` : undefined,
      minHeight: 18,
      alignItems: 'center',
    }}>
      {/* Bid volume (left, red) */}
      <span style={{ textAlign: 'right', color: isBidImbal ? RED : MUTED, fontSize: 10, fontFamily: 'monospace' }}>
        {fmtVol(level.bidVol)}
      </span>

      {/* Imbalance/absorption marker (center) */}
      <span style={{ fontSize: 9, textAlign: 'center', width: 12, flexShrink: 0 }}>
        {isAskImbal  ? <span style={{ color: GREEN }}>▲</span>
         : isBidImbal ? <span style={{ color: RED }}>▼</span>
         : isAbsorption ? <span style={{ color: BLUE }}>⊕</span>
         : <span style={{ color: BORDER }}>·</span>}
      </span>

      {/* Ask volume (right, green) */}
      <span style={{ textAlign: 'left', color: isAskImbal ? GREEN : MUTED, fontSize: 10, fontFamily: 'monospace' }}>
        {fmtVol(level.askVol)}
      </span>
    </div>
  );
}

// ── Header cell for each bar column ───────────────────────────────────────────
function BarHeader({ bar }) {
  const up = bar.close >= bar.open;
  return (
    <div style={{ padding: '4px 4px 3px', background: SURFACE, borderBottom: `1px solid ${BORDER}`, textAlign: 'center', borderRight: `1px solid ${BORDER}` }}>
      <div style={{ fontSize: 9, color: MUTED }}>{fmtTime(bar.timestamp)}</div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: up ? GREEN : RED, marginTop: 1 }}>
        {up ? '▲' : '▼'} {fmtVol(Math.abs(bar.delta ?? 0))}
      </div>
    </div>
  );
}

// ── Main chart ────────────────────────────────────────────────────────────────
export default function FootprintChart() {
  const {
    bars, maxBars, clusterSize, showImbalances, showAbsorption,
    fallback, source, loading, error, liveUpdate, lastUpdated,
    loadFootprint, visible,
  } = useFootprintStore();

  if (!visible) return null;

  if (loading) {
    return <div style={{ color: MUTED, fontSize: 12, padding: '12px 0' }}>Loading footprint data…</div>;
  }

  if (error) {
    return (
      <div style={{ background: '#1a0000', border: `1px solid ${RED}44`, borderRadius: 6, padding: '8px 12px', color: RED, fontSize: 12 }}>
        {error}
        <button onClick={loadFootprint} style={{ marginLeft: 10, background: 'transparent', border: `1px solid ${RED}`, borderRadius: 5, color: RED, fontSize: 11, cursor: 'pointer', padding: '2px 8px' }}>Retry</button>
      </div>
    );
  }

  const visibleBars = bars.slice(-maxBars);

  if (!visibleBars.length) {
    return (
      <div style={{ color: MUTED, fontSize: 12, padding: '8px 0' }}>
        No footprint data. Click <strong>↻ Load</strong> in the settings above.
      </div>
    );
  }

  // ── Build unified price grid ────────────────────────────────────────────────
  // Collect every price level that appears in any visible bar, quantize, deduplicate.
  const priceSet = new Set();
  visibleBars.forEach((bar) => {
    bar.levels.forEach((l) => priceSet.add(snapPrice(l.price, clusterSize)));
  });
  // Sort descending (highest price at top)
  const priceGrid = Array.from(priceSet).sort((a, b) => b - a);

  // Per-bar lookup: Map(price → level)
  const levelMaps = visibleBars.map((bar) => {
    const m = new Map();
    bar.levels.forEach((l) => m.set(snapPrice(l.price, clusterSize), l));
    return m;
  });

  // Per-bar POC price (snapped)
  const pocPrices = visibleBars.map((bar) => bar.poc != null ? snapPrice(bar.poc, clusterSize) : null);

  const colW = 94;   // px per bar column
  const priceColW = 52;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SourceBadge source={source} fallback={fallback} />
        {liveUpdate && (
          <span style={{ fontSize: 10, color: BLUE, background: BLUE + '22', border: `1px solid ${BLUE}55`, borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>● LIVE</span>
        )}
        <span style={{ fontSize: 10, color: MUTED, marginLeft: 'auto' }}>
          {visibleBars.length} bar{visibleBars.length !== 1 ? 's' : ''} · {priceGrid.length} levels · updated {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}
        </span>
      </div>

      {/* Fallback banner — explains why imbalances are hidden */}
      {fallback && (
        <div style={{ background: AMBER + '11', border: `1px solid ${AMBER}44`, borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
          <strong style={{ color: AMBER }}>⚠ Imbalances disabled in synthetic mode.</strong>
          <span style={{ color: MUTED, marginLeft: 6 }}>
            {source === 'l1_midpoint'
              ? 'CVD source is L1 midpoint approximation — bid/ask split is estimated, not real. Imbalance signals may be misleading.'
              : source === 'ohlcv_synthetic'
                ? 'CVD source is OHLCV synthetic — bid/ask volumes are inferred from candle structure. Imbalance detection requires real tick-level data.'
                : 'Data source does not provide reliable bid/ask split. Imbalance markers are hidden to prevent false signals.'}
          </span>
        </div>
      )}

      {/* Grid */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 480, borderRadius: 8, border: `1px solid ${BORDER}` }}>
        <div style={{ display: 'inline-flex', minWidth: priceColW + colW * visibleBars.length }}>

          {/* Price label column (sticky left) */}
          <div style={{ width: priceColW, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3, background: BG }}>
            {/* Header spacer */}
            <div style={{ height: 38, background: SURFACE, borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}` }} />
            {priceGrid.map((price) => (
              <div key={price} style={{
                padding: '2px 6px', borderBottom: `1px solid ${BORDER}22`, borderRight: `1px solid ${BORDER}`,
                fontSize: 10, fontFamily: 'monospace', color: MUTED, textAlign: 'right', minHeight: 18,
                background: BG, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              }}>
                {fmtPrice(price, clusterSize)}
              </div>
            ))}
            {/* Delta row label */}
            <div style={{ padding: '3px 6px', background: SURFACE, borderTop: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, fontSize: 10, color: MUTED, textAlign: 'right' }}>Δ</div>
          </div>

          {/* Bar columns */}
          {visibleBars.map((bar, colIdx) => (
            <div key={`bar-${bar.timestamp || colIdx}`} style={{ width: colW, flexShrink: 0, borderRight: `1px solid ${BORDER}` }}>
              <BarHeader bar={bar} />
              {priceGrid.map((price) => (
                <LevelCell
                  key={price}
                  level={levelMaps[colIdx].get(price)}
                  isPOC={pocPrices[colIdx] === price}
                  showImbalances={showImbalances}
                  showAbsorption={showAbsorption}
                  fallback={fallback}
                />
              ))}
              <DeltaCell bar={bar} />
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 10, color: MUTED }}>
        {!fallback && showImbalances && <>
          <span><span style={{ color: GREEN }}>▲</span> Ask imbalance</span>
          <span><span style={{ color: RED }}>▼</span> Bid imbalance</span>
          <span><span style={{ color: VIOLET }}>≡</span> Stacked imbalance</span>
        </>}
        {showAbsorption && <span><span style={{ color: BLUE }}>⊕</span> Absorption</span>}
        <span><span style={{ color: AMBER }}>│</span> POC</span>
        <span style={{ color: MUTED }}>Left col = Bid · Right col = Ask</span>
      </div>
    </div>
  );
}
