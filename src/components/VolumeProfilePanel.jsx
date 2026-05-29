import { useState, useEffect } from 'react';
import { useVolumeProfileStore } from '../store/volumeProfileStore.js';

const MAX_BAR_WIDTH = 130; // px — profile bars extend leftward from right edge of chart

const panelStyle = {
  background: '#0a0a0a',
  border: '1px solid #1f2937',
  borderRadius: 10,
  padding: 12,
};

const rowStyle = {
  display: 'grid',
  gridTemplateColumns: '160px 1fr',
  padding: '3px 0',
  borderBottom: '1px solid #111',
  fontSize: 12,
};

// Normalize a profile bin's price field — backend may use price, priceLevel, or level
function binPrice(bin) {
  return Number(bin?.price ?? bin?.priceLevel ?? bin?.level ?? 0);
}

function binVolume(bin) {
  return Number(bin?.volume ?? bin?.vol ?? bin?.size ?? 0);
}

// ── SVG overlay rendered inside CandlestickChart ──────────────────────────────
// Props mirror the chart's own coordinate system so bars align to the price scale.
export function VolumeProfileOverlay({ minPrice, maxPrice, chartWidth, candleHeight }) {
  const { profile, poc, vah, val, hvn, lvn, visible } = useVolumeProfileStore();

  if (!visible || !profile.length) return null;

  const pRange = Math.max(maxPrice - minPrice, 0.000001);

  // Same mapping as CandlestickChart's y()
  const toY = (price) => {
    const pct = (Number(price) - minPrice) / pRange;
    return candleHeight - pct * (candleHeight - 12) + 6;
  };

  // Normalize and filter bins
  const bins = profile
    .map((bin) => ({ price: binPrice(bin), volume: binVolume(bin) }))
    .filter((b) => Number.isFinite(b.price) && b.price > 0);

  if (!bins.length) return null;

  const maxVol = Math.max(...bins.map((b) => b.volume), 1);

  const hvnSet = new Set(hvn);
  const lvnSet = new Set(lvn);

  // Sort ascending by price for sequential bin-height computation
  const sorted = [...bins].sort((a, b) => a.price - b.price);

  // Compute bin height from spacing between adjacent price levels
  const getBinH = (i) => {
    const curr = sorted[i];
    const next = sorted[i + 1];
    const prev = sorted[i - 1];
    if (next) return Math.max(1.5, Math.abs(toY(curr.price) - toY(next.price)));
    if (prev) return Math.max(1.5, Math.abs(toY(curr.price) - toY(prev.price)));
    return 4;
  };

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Volume bars — right-anchored, proportional width */}
      {sorted.map((bin, i) => {
        const barW = (bin.volume / maxVol) * MAX_BAR_WIDTH;
        const yPos = toY(bin.price);
        const binH = getBinH(i);
        const isHvn = hvnSet.has(bin.price);
        const isLvn = lvnSet.has(bin.price);
        const fill = isHvn
          ? 'rgba(255,184,0,0.6)'      // HVN — amber
          : isLvn
          ? 'rgba(100,100,120,0.3)'    // LVN — dim gray
          : 'rgba(80,120,200,0.35)';   // normal — blue

        return (
          <rect
            key={i}
            x={chartWidth - barW}
            y={yPos - binH / 2}
            width={Math.max(1, barW)}
            height={binH}
            fill={fill}
            rx={1}
          />
        );
      })}

      {/* POC — brightest line, Point of Control */}
      {poc !== null && Number.isFinite(toY(poc)) && (
        <line
          x1={0} x2={chartWidth}
          y1={toY(poc)} y2={toY(poc)}
          stroke="#FFB800" strokeWidth={1.5} opacity={0.95}
        />
      )}

      {/* VAH — Value Area High */}
      {vah !== null && Number.isFinite(toY(vah)) && (
        <line
          x1={0} x2={chartWidth}
          y1={toY(vah)} y2={toY(vah)}
          stroke="rgba(0,200,100,0.9)" strokeWidth={1} strokeDasharray="5 3" opacity={0.78}
        />
      )}

      {/* VAL — Value Area Low */}
      {val !== null && Number.isFinite(toY(val)) && (
        <line
          x1={0} x2={chartWidth}
          y1={toY(val)} y2={toY(val)}
          stroke="rgba(220,50,50,0.9)" strokeWidth={1} strokeDasharray="5 3" opacity={0.78}
        />
      )}

      {/* Legend chip — top-right of chart */}
      <rect x={chartWidth - MAX_BAR_WIDTH - 2} y={4} width={MAX_BAR_WIDTH + 2} height={82} fill="rgba(0,0,0,0.6)" rx={4} />
      <text x={chartWidth - MAX_BAR_WIDTH + 4} y={18} fill="#FFB800" fontSize={10} fontFamily="monospace">─ POC</text>
      <text x={chartWidth - MAX_BAR_WIDTH + 4} y={32} fill="rgba(0,200,100,0.9)" fontSize={10} fontFamily="monospace">- VAH</text>
      <text x={chartWidth - MAX_BAR_WIDTH + 4} y={46} fill="rgba(220,50,50,0.9)" fontSize={10} fontFamily="monospace">- VAL</text>
      <text x={chartWidth - MAX_BAR_WIDTH + 4} y={60} fill="rgba(255,184,0,0.9)" fontSize={10} fontFamily="monospace">■ HVN</text>
      <text x={chartWidth - MAX_BAR_WIDTH + 4} y={74} fill="#646478" fontSize={10} fontFamily="monospace">□ LVN</text>
    </g>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────
export function VolumeProfileSettings() {
  const { visible, mode, bins, loading, error, loadVolumeProfile, setVisible, setMode, setBins } =
    useVolumeProfileStore();

  // Local draft for bins — avoids firing loadVolumeProfile() on every keystroke.
  // Committed on blur or Enter; clamped to [5, 200] on commit.
  const [binsDraft, setBinsDraft] = useState(String(bins));

  // Keep draft in sync when bins changes externally (e.g. persisted reload).
  useEffect(() => {
    setBinsDraft(String(bins));
  }, [bins]);

  const commitBins = () => {
    const n = Math.max(5, Math.min(200, parseInt(binsDraft, 10) || bins));
    console.log('[VP] bins committed', n);
    setBinsDraft(String(n));
    if (n !== bins) setBins(n);
  };

  const handleModeChange = (e) => {
    console.log('[VP] mode selected', e.target.value);
    setMode(e.target.value);
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontSize: 13 }}>Volume Profile</strong>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          <span style={{ fontSize: 12, color: '#d1d5db' }}>Show overlay</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Mode</div>
          <select
            value={mode}
            onChange={handleModeChange}
            style={{ background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
          >
            <option value="visible_range">Visible Range</option>
            <option value="daily">Daily</option>
            <option value="session">Session</option>
            <option value="fixed_range">Fixed Range</option>
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Bins (5–200)</div>
          {/*
            inputMode="numeric" opens the numeric keyboard on Android/iOS.
            pattern="[0-9]*"   further hints mobile browsers to use a number pad.
            draft state prevents firing API on every keystroke; commit on blur/Enter.
          */}
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min="5"
            max="200"
            value={binsDraft}
            onChange={(e) => {
              console.log('[VP] bins input', e.target.value);
              setBinsDraft(e.target.value);
            }}
            onBlur={commitBins}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.target.blur(); commitBins(); }
            }}
            style={{ width: 72, background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
          />
        </div>

        <button
          onClick={() => {
            commitBins();
            loadVolumeProfile();
          }}
          disabled={loading}
          style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 8 }}>Error: {error}</div> : null}
    </div>
  );
}

// ── Diagnostics panel (temporary debug, shown in LiveData → Volume Profile tab) ──
export function VolumeProfileDiagnostics() {
  const {
    symbol, timeframe, mode, poc, vah, val, profile, source,
    lastUpdate, loading, error, hvn, lvn, bins, visible,
  } = useVolumeProfileStore();

  const fmt = (v) => (v === null || v === undefined || v === '') ? '—' : String(v);
  const fmtPrice = (v) => (v !== null && Number.isFinite(v)) ? Number(v).toFixed(4) : '—';
  const fmtDate = (v) => { if (!v) return '—'; try { return new Date(v).toLocaleString(); } catch { return String(v); } };

  const rows = [
    { label: 'Symbol', value: fmt(symbol) },
    { label: 'Timeframe', value: fmt(timeframe) },
    { label: 'Mode', value: fmt(mode) },
    { label: 'Bins (configured)', value: fmt(bins) },
    { label: 'Profile bins (returned)', value: fmt(profile.length) },
    { label: 'POC price', value: fmtPrice(poc) },
    { label: 'VAH price', value: fmtPrice(vah) },
    { label: 'VAL price', value: fmtPrice(val) },
    { label: 'HVN nodes', value: fmt(hvn.length) },
    { label: 'LVN nodes', value: fmt(lvn.length) },
    { label: 'Source', value: fmt(source) },
    { label: 'Last update', value: fmtDate(lastUpdate) },
    { label: 'Overlay visible', value: visible ? 'Yes' : 'No' },
    { label: 'Loading', value: loading ? 'Yes' : 'No' },
  ];

  return (
    <div style={panelStyle}>
      <h4 style={{ marginTop: 0, marginBottom: 10, fontSize: 14 }}>Volume Profile Diagnostics</h4>

      {error ? (
        <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 10, padding: '6px 8px', background: '#1a0000', borderRadius: 6 }}>
          Error: {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 0 }}>
        {rows.map(({ label, value }) => (
          <div key={label} style={rowStyle}>
            <span style={{ color: '#9ca3af' }}>{label}</span>
            <span style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{value}</span>
          </div>
        ))}
      </div>

      <p style={{ color: '#4b5563', fontSize: 11, marginBottom: 0, marginTop: 12 }}>
        Architecture supports future: TPO Profile · Delta Profile · Composite · WebSocket stream
      </p>
    </div>
  );
}

// ── Default export: combined settings + diagnostics for LiveData tab ───────────
export default function VolumeProfilePanel() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <VolumeProfileSettings />
      <VolumeProfileDiagnostics />
    </div>
  );
}
