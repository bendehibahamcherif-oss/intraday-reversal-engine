import { useState } from 'react';
import { api } from './api.js';

const fonts = {
  display: "'Instrument Serif', 'Times New Roman', serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', 'Courier New', monospace",
  sans: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
};

export default function BacktestPanel({ ticker }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [threshold, setThreshold] = useState(0.65);
  const [lookback, setLookback] = useState(2);
  const [lrs, setLrs] = useState({
    vixLow: 0.9, vixOptimal: 1.4, vixCaution: 0.7,
    gapSmall: 1.3, gapModerate: 1.5, gapLarge: 0.8,
    trendLow: 1.5, trendModerate: 1.0,
  });

  const run = async () => {
    setRunning(true); setError(null); setResult(null);
    try {
      const data = await api.runBacktest(ticker, { lookbackMonths: lookback, threshold, lrs });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const applyCalibratedLRs = () => {
    if (!result?.bucketStats) return;
    const next = { ...lrs };
    const apply = (key, target) => {
      const lr = result.bucketStats[key]?.suggestedLR;
      if (lr != null && isFinite(lr) && lr > 0) next[target] = parseFloat(lr.toFixed(2));
    };
    apply('vix_low', 'vixLow'); apply('vix_optimal', 'vixOptimal'); apply('vix_caution', 'vixCaution');
    apply('gap_small', 'gapSmall'); apply('gap_moderate', 'gapModerate'); apply('gap_large', 'gapLarge');
    apply('trend_low', 'trendLow'); apply('trend_moderate', 'trendModerate');
    setLrs(next);
  };

  const fmt = (v, d = 2) => v == null || isNaN(v) ? '—' : Number(v).toFixed(d);
  const pct = (v, d = 1) => v == null || isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`;

  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontFamily: fonts.display, fontSize: '22px', color: '#e2e8f0', fontStyle: 'italic' }}>
            📊 Backtest — {ticker}
          </div>
          <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '4px' }}>
            Simulation historique sur données 5min · Yahoo limite ≈60 jours
          </div>
        </div>
        <button onClick={run} disabled={running}
          style={{
            background: '#0ea5e9', color: '#fff', border: 'none',
            padding: '12px 20px', fontFamily: fonts.mono, fontSize: '12px',
            fontWeight: 600, cursor: running ? 'wait' : 'pointer',
            borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          {running ? '⏳ Backtest en cours...' : '▶ Lancer le backtest'}
        </button>
      </div>

      {/* Params */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        <Param label="Lookback (mois, max 2)" value={lookback} onChange={v => setLookback(Math.min(Math.max(parseInt(v) || 1, 1), 2))} step="1" />
        <Param label="Seuil P(reversal)" value={threshold} onChange={v => setThreshold(parseFloat(v) || 0)} step="0.05" min={0.5} max={0.95} />
      </div>

      <details style={{ marginBottom: '14px' }}>
        <summary style={{ fontFamily: fonts.mono, fontSize: '11px', color: '#94a3b8', cursor: 'pointer', padding: '6px 0' }}>
          ⚙ LRs (likelihood ratios) — valeurs actuelles
        </summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginTop: '10px' }}>
          {Object.entries(lrs).map(([k, v]) => (
            <Param key={k} label={k} value={v} onChange={x => setLrs({ ...lrs, [k]: parseFloat(x) || 0 })} step="0.05" />
          ))}
        </div>
      </details>

      {error && (
        <div style={{ padding: '12px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid #dc2626', borderRadius: '4px', fontFamily: fonts.mono, fontSize: '12px', color: '#f87171', marginBottom: '12px' }}>
          ⚠ {error}
        </div>
      )}

      {result && (
        <div>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            <Stat label="Trades" value={result.tradesCount} />
            <Stat label="Win rate" value={pct(result.winRate)} color={result.winRate > 0.55 ? '#4ade80' : result.winRate < 0.45 ? '#f87171' : '#fbbf24'} />
            <Stat label="Expectancy" value={`${fmt(result.expectancy, 3)}%`} color={result.expectancy > 0 ? '#4ade80' : '#f87171'} />
            <Stat label="P&L cumulé" value={`${fmt(result.totalPnl, 2)}%`} color={result.totalPnl > 0 ? '#4ade80' : '#f87171'} />
            <Stat label="Avg win" value={`${fmt(result.avgWin, 2)}%`} color="#4ade80" />
            <Stat label="Avg loss" value={`${fmt(result.avgLoss, 2)}%`} color="#f87171" />
            <Stat label="Profit factor" value={fmt(result.profitFactor, 2)} color={result.profitFactor > 1.2 ? '#4ade80' : '#f87171'} />
          </div>

          {/* Verdict */}
          <div style={{
            padding: '14px',
            background: result.expectancy > 0.05 ? 'rgba(34, 197, 94, 0.1)' : result.expectancy < 0 ? 'rgba(220, 38, 38, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            border: `1px solid ${result.expectancy > 0.05 ? '#22c55e' : result.expectancy < 0 ? '#dc2626' : '#f59e0b'}`,
            borderRadius: '4px', fontFamily: fonts.sans, fontSize: '12px',
            color: result.expectancy > 0.05 ? '#4ade80' : result.expectancy < 0 ? '#f87171' : '#fbbf24',
            marginBottom: '16px', lineHeight: 1.5,
          }}>
            {result.expectancy > 0.05 ? `✓ Edge positif sur cet historique (${result.tradesCount} trades). Mais ${result.tradesCount} est-il suffisant pour conclure ? À recroiser avec plus de données et hors-échantillon.`
              : result.expectancy < 0 ? `✗ Edge négatif sur cet historique. Les paramètres actuels te feraient perdre de l'argent. Recalibre les LRs ou augmente le seuil.`
              : `⚬ Edge marginal. Le système n'est ni rentable ni perdant clairement. Volume de trades probablement insuffisant pour conclure.`}
          </div>

          {/* Calibration buckets */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <div style={{ fontFamily: fonts.mono, fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Win rate par bucket de signal (calibration des LRs)
              </div>
              <button onClick={applyCalibratedLRs}
                style={{ background: '#22c55e', color: '#020617', border: 'none', padding: '5px 12px', fontFamily: fonts.mono, fontSize: '10px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px', textTransform: 'uppercase' }}
              >Appliquer LRs calibrés</button>
            </div>
            <div style={{ overflowX: 'auto', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: fonts.mono, fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155' }}>
                    <th style={th}>BUCKET</th><th style={th}>N TRADES</th><th style={th}>WINS</th><th style={th}>WIN RATE</th><th style={th}>LR SUGGÉRÉ</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.bucketStats).map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={td}>{v.label}</td>
                      <td style={td}>{v.n}</td>
                      <td style={td}>{v.wins}</td>
                      <td style={{ ...td, color: v.winRate > 0.55 ? '#4ade80' : v.winRate < 0.45 ? '#f87171' : '#fbbf24' }}>{pct(v.winRate)}</td>
                      <td style={{ ...td, color: v.suggestedLR > 1.2 ? '#4ade80' : v.suggestedLR < 0.8 ? '#f87171' : '#fbbf24', fontWeight: 600 }}>
                        {v.suggestedLR != null ? `×${fmt(v.suggestedLR, 2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginTop: '6px', lineHeight: 1.5 }}>
              ⚠ Attention : avec moins de 20 trades par bucket, le LR estimé est très bruité. Ne calibre pas en aveugle, regarde le N.
            </div>
          </div>

          {/* Recent trades */}
          <details>
            <summary style={{ fontFamily: fonts.mono, fontSize: '11px', color: '#94a3b8', cursor: 'pointer', padding: '6px 0' }}>
              Voir les {result.trades?.length || 0} derniers trades
            </summary>
            <div style={{ overflowX: 'auto', maxHeight: '300px', overflowY: 'auto', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px', marginTop: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: fonts.mono, fontSize: '10px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#020617' }}>
                  <tr style={{ borderBottom: '1px solid #334155' }}>
                    <th style={th}>JOUR</th><th style={th}>DIR</th><th style={th}>GAP/ATR</th><th style={th}>OR%</th><th style={th}>VIX</th><th style={th}>P</th><th style={th}>EXIT</th><th style={th}>P&L%</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades?.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={td}>{t.day}</td>
                      <td style={{ ...td, color: t.direction === 'fade_up' ? '#f87171' : '#4ade80' }}>{t.direction === 'fade_up' ? '↓' : '↑'}</td>
                      <td style={td}>{fmt(t.gapAtrRatio, 2)}</td>
                      <td style={td}>{fmt(t.orPct, 0)}%</td>
                      <td style={td}>{fmt(t.vix, 1)}</td>
                      <td style={td}>{pct(t.posterior, 0)}</td>
                      <td style={{ ...td, color: t.exitType === 'target' ? '#4ade80' : t.exitType === 'stop' ? '#f87171' : '#94a3b8' }}>{t.exitType}</td>
                      <td style={{ ...td, color: t.pnlPct > 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{fmt(t.pnlPct, 2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      {!result && !error && !running && (
        <div style={{ padding: '14px', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px', fontFamily: fonts.sans, fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
          Le backtest rejoue la stratégie sur les 60 derniers jours (limite Yahoo pour les bars 5min).
          Il calcule pour chaque jour : gap, ATR, range 1ère heure, et simule une entrée fade avec stop/target selon les règles définies.
          Les LRs suggérés sont calculés empiriquement à partir des win rates observés par bucket — utile pour calibrer le système sur ton ticker.
        </div>
      )}
    </div>
  );
}

const th = { padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: '10px', letterSpacing: '0.1em' };
const td = { padding: '6px 10px', color: '#e2e8f0' };

function Param({ label, value, onChange, step, min, max }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#020617', border: '1px solid #1e293b', borderRadius: '3px' }}>
      <span style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#94a3b8' }}>{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} step={step} min={min} max={max}
        style={{ background: 'transparent', border: 'none', color: '#f1f5f9', fontFamily: fonts.mono, fontSize: '12px', textAlign: 'right', width: '60px' }} />
    </div>
  );
}

function Stat({ label, value, color = '#f1f5f9' }) {
  return (
    <div style={{ padding: '10px 12px', background: '#020617', border: '1px solid #1e293b', borderRadius: '3px' }}>
      <div style={{ fontFamily: fonts.mono, fontSize: '9px', color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontFamily: fonts.mono, fontSize: '18px', color, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
