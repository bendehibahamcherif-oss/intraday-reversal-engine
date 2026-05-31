/**
 * MLProbabilityBar — three horizontal bars for LONG / NEUTRAL / SHORT probabilities.
 *
 * Props:
 *   probabilities  { LONG: number, NEUTRAL: number, SHORT: number }
 *   animate        bool (default true)
 *   compact        bool (default false) — tighter layout
 */

const CLASS_CONFIG = [
  { key: 'LONG',    label: 'Long',    color: '#22c55e', bg: '#22c55e18' },
  { key: 'NEUTRAL', label: 'Neutral', color: '#6b7280', bg: '#6b728018' },
  { key: 'SHORT',   label: 'Short',   color: '#ef4444', bg: '#ef444418' },
];

export default function MLProbabilityBar({ probabilities, animate = true, compact = false }) {
  const has = probabilities && (
    probabilities.LONG != null || probabilities.NEUTRAL != null || probabilities.SHORT != null
  );

  const gap   = compact ? 4 : 6;
  const h     = compact ? 6 : 8;
  const fSize = compact ? 10 : 11;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, width: '100%' }}>
      {CLASS_CONFIG.map(({ key, label, color, bg }) => {
        const raw = probabilities?.[key];
        const pct = has && raw != null ? Math.round(raw * 100) : null;

        return (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: fSize, color, fontWeight: 700, letterSpacing: 0.5 }}>{label}</span>
              <span style={{ fontSize: fSize, color: '#9ca3af', fontFamily: 'monospace' }}>
                {pct != null ? `${pct}%` : '—'}
              </span>
            </div>
            <div style={{
              width: '100%', height: h, background: '#1f2937',
              borderRadius: h, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width:  pct != null ? `${pct}%` : '0%',
                background: color,
                borderRadius: h,
                transition: animate ? 'width 0.4s ease' : 'none',
                minWidth: pct != null && pct > 0 ? 4 : 0,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
