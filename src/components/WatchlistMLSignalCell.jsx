/**
 * WatchlistMLSignalCell — compact ML signal badge for watchlist rows.
 *
 * Props:
 *   symbol    string
 *   signal    object from mlSignalStore.signalBySymbol[symbol]
 *   loading   bool
 */

import MLSignalBadge from './MLSignalBadge.jsx';

export default function WatchlistMLSignalCell({ symbol, signal, loading }) {
  if (loading) {
    return <span style={{ fontSize: 10, color: '#4b5563', fontFamily: 'monospace' }}>…</span>;
  }

  if (!signal?.class) {
    return <span style={{ fontSize: 10, color: '#374151', fontFamily: 'monospace' }}>—</span>;
  }

  return (
    <span title={[
      `Model: ${signal.modelVersion || '—'}`,
      `Confidence: ${signal.confidence != null ? Math.round(signal.confidence * 100) + '%' : '—'}`,
      `AsOf: ${signal.asOf ? new Date(signal.asOf).toLocaleTimeString() : '—'}`,
      signal.provisional ? 'Preview (provisional)' : 'Canonical',
    ].join('\n')}>
      <MLSignalBadge signal={signal} size="sm" showConf />
    </span>
  );
}
