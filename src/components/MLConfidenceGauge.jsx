import { useEffect, useRef } from 'react';

const COLORS = {
  low:    '#ef4444', // < 40%
  mid:    '#f59e0b', // 40–65%
  high:   '#22c55e', // > 65%
  track:  '#1f2937',
  bg:     '#0d0d1a',
  text:   '#e0e0f0',
  muted:  '#6b7280',
};

/**
 * MLConfidenceGauge — circular SVG gauge (0–100%).
 *
 * Props:
 *   confidence   number 0-1
 *   size         number (px, default 80)
 *   label        string (default 'Confidence')
 *   animate      bool (default true)
 */
export default function MLConfidenceGauge({ confidence, size = 80, label = 'Confidence', animate = true }) {
  const prevRef = useRef(confidence);
  const pct = confidence != null ? Math.round(confidence * 100) : null;

  const r    = (size / 2) * 0.78;
  const cx   = size / 2;
  const cy   = size / 2;
  const circ = 2 * Math.PI * r;

  // Arc goes from 225° to 315° (270° sweep = ¾ circle)
  const SWEEP_DEG = 270;
  const SWEEP     = (SWEEP_DEG / 360) * circ;
  const GAP       = circ - SWEEP;

  const fill = pct != null ? (pct / 100) * SWEEP : 0;
  const color = pct == null ? COLORS.muted
    : pct < 40 ? COLORS.low
    : pct < 65 ? COLORS.mid
    : COLORS.high;

  const strokeDash = `${fill} ${circ - fill}`;

  // Rotation: start at 135deg (bottom-left), so 0% starts at 7:30 position
  const rotation = 135;

  useEffect(() => { prevRef.current = confidence; }, [confidence]);

  const fontSize = size < 60 ? 12 : size < 90 ? 16 : 22;
  const labelSize = size < 60 ? 8 : size < 90 ? 10 : 11;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block' }}
        aria-label={`${label}: ${pct != null ? pct + '%' : '—'}`}
      >
        {/* Background track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={COLORS.track}
          strokeWidth={size * 0.10}
          strokeDasharray={`${SWEEP} ${GAP}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${cx} ${cy})`}
        />
        {/* Value arc */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.10}
          strokeDasharray={strokeDash}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${cx} ${cy})`}
          style={animate ? { transition: 'stroke-dasharray 0.5s ease, stroke 0.3s ease' } : {}}
        />
        {/* Center text */}
        <text
          x={cx} y={cy + fontSize * 0.35}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight={700}
          fontFamily="monospace"
          fill={pct != null ? color : COLORS.muted}
        >
          {pct != null ? `${pct}%` : '—'}
        </text>
      </svg>
      {label && (
        <span style={{ fontSize: labelSize, color: COLORS.muted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {label}
        </span>
      )}
    </div>
  );
}
