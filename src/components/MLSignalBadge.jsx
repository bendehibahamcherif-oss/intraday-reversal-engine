/**
 * MLSignalBadge — compact LONG / NEUTRAL / SHORT badge.
 *
 * Props:
 *   signal       { class, confidence, provisional, modelVersion }
 *   size         'sm' | 'md' (default 'md')
 *   showConf     bool (default true)
 */

const CLASS_COLOR = {
  LONG:    { bg: '#22c55e22', border: '#22c55e55', text: '#22c55e' },
  SHORT:   { bg: '#ef444422', border: '#ef444455', text: '#ef4444' },
  NEUTRAL: { bg: '#6b728022', border: '#6b728055', text: '#9ca3af' },
};

export default function MLSignalBadge({ signal, size = 'md', showConf = true }) {
  if (!signal?.class) {
    return (
      <span style={{ fontSize: size === 'sm' ? 10 : 11, color: '#4b5563', fontFamily: 'monospace' }}>
        —
      </span>
    );
  }

  const cls    = signal.class;
  const colors = CLASS_COLOR[cls] || CLASS_COLOR.NEUTRAL;
  const conf   = signal.confidence != null ? Math.round(signal.confidence * 100) : null;
  const isSm   = size === 'sm';

  // Intensity from confidence: 0.33 → dim, 0.7+ → bright
  const alpha  = signal.confidence != null ? Math.min(1, (signal.confidence - 0.33) / 0.4 + 0.4) : 0.6;
  const color  = colors.text;

  return (
    <span style={{
      display:       'inline-flex',
      alignItems:    'center',
      gap:           isSm ? 3 : 5,
      background:    colors.bg,
      border:        `1px solid ${colors.border}`,
      borderRadius:  isSm ? 3 : 4,
      padding:       isSm ? '1px 5px' : '2px 8px',
      fontFamily:    'monospace',
      fontSize:      isSm ? 10 : 12,
      fontWeight:    700,
      color,
      opacity:       alpha,
      letterSpacing: 0.5,
      whiteSpace:    'nowrap',
    }}>
      {cls}
      {showConf && conf != null && (
        <span style={{ fontSize: isSm ? 9 : 10, fontWeight: 400, opacity: 0.85 }}>
          {conf}%
        </span>
      )}
      {signal.provisional && (
        <span style={{ fontSize: isSm ? 8 : 9, opacity: 0.6, fontWeight: 400 }} title="Preview — not canonical">
          P
        </span>
      )}
    </span>
  );
}
