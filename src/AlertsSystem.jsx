import { useEffect, useRef, useCallback } from 'react';
import { scanTicker } from './engine.js';
import { api } from './api.js';

const fonts = {
  display: "'Instrument Serif', 'Times New Roman', serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', 'Courier New', monospace",
  sans: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
};

const ALERT_DECISIONS = new Set(['ACHETER', 'ACHETER 1/2']);
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.frequency.value = 1320;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc2.start(); osc2.stop(ctx.currentTime + 0.3);
    }, 200);
  } catch (e) {}
}

function showNotification(symbol, decision, posterior) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(`🎯 ${decision} — ${symbol}`, {
      body: `P(retournement): ${(posterior * 100).toFixed(1)}%`,
      tag: `reversal-${symbol}`, requireInteraction: false,
    });
  } catch (e) {}
}

export function useAlertScanner({ enabled, tickers, intervalSec, useSound, useNotification, onAlert, onTickerStatus }) {
  const intervalRef = useRef(null);
  const lastAlertRef = useRef({});
  const scanningRef = useRef(false);

  const scan = useCallback(async () => {
    if (scanningRef.current) return;
    if (!tickers || tickers.length === 0) return;
    scanningRef.current = true;

    let vixVal = null;
    try {
      const vixData = await scanTicker('^VIX').catch(() => null);
      vixVal = vixData?.currentPrice ?? null;
    } catch {}

    for (const symbol of tickers) {
      try {
        const result = await scanTicker(symbol, vixVal);
        onTickerStatus?.(symbol, result);

        if (ALERT_DECISIONS.has(result.decision)) {
          const lastAlert = lastAlertRef.current[symbol];
          const now = Date.now();
          const shouldAlert = !lastAlert
            || lastAlert.decision !== result.decision
            || (now - lastAlert.timestamp) > ALERT_COOLDOWN_MS;

          if (shouldAlert) {
            lastAlertRef.current[symbol] = { decision: result.decision, timestamp: now };
            const alertObj = {
              symbol, decision: result.decision, posterior: result.posterior,
              currentPrice: result.currentPrice, reason: result.decisionReason,
              marketState: result.marketState, timestamp: now,
            };
            if (useSound) playBeep();
            if (useNotification) showNotification(symbol, result.decision, result.posterior);
            // Persist to backend
            api.recordAlert(alertObj).catch(e => console.warn('Failed to persist alert:', e.message));
            onAlert?.(alertObj);
          }
        }
        await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        onTickerStatus?.(symbol, { symbol, error: e.message });
      }
    }
    scanningRef.current = false;
  }, [tickers, useSound, useNotification, onAlert, onTickerStatus]);

  useEffect(() => {
    if (!enabled || !tickers?.length) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    scan();
    intervalRef.current = setInterval(scan, intervalSec * 1000);
    return () => clearInterval(intervalRef.current);
  }, [enabled, tickers, intervalSec, scan]);
}

export function AlertsPanel({ enabled, tickers, scanInterval, statuses, alerts, onToggle, onClear, onReload }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '16px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontFamily: fonts.display, fontSize: '20px', color: '#e2e8f0', fontStyle: 'italic' }}>
            🚨 Scanner d'alertes
          </div>
          <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '4px' }}>
            {enabled ? `actif · ${tickers.length} tickers · scan ${scanInterval}s` : 'désactivé'} · 💾 persistance backend
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {onReload && (
            <button onClick={onReload}
              style={{ background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', padding: '8px 14px', fontFamily: fonts.mono, fontSize: '11px', cursor: 'pointer', borderRadius: '4px' }}
            >↻ Recharger</button>
          )}
          <button onClick={onToggle}
            style={{
              background: enabled ? '#dc2626' : '#22c55e',
              color: enabled ? '#fff' : '#020617',
              border: 'none', padding: '8px 16px',
              fontFamily: fonts.mono, fontSize: '11px', fontWeight: 600,
              cursor: 'pointer', borderRadius: '4px',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}
          >{enabled ? '⏸ Arrêter' : '▶ Démarrer'}</button>
        </div>
      </div>

      {enabled && tickers.length > 0 && (
        <div style={{ marginBottom: '12px', maxHeight: '200px', overflowY: 'auto', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: fonts.mono, fontSize: '11px' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#020617' }}>
              <tr style={{ borderBottom: '1px solid #334155' }}>
                <th style={thStyle}>TICKER</th>
                <th style={thStyle}>PRIX</th>
                <th style={thStyle}>SOURCE</th>
                <th style={thStyle}>P(rev)</th>
                <th style={thStyle}>DÉCISION</th>
              </tr>
            </thead>
            <tbody>
              {tickers.map(t => {
                const s = statuses[t];
                const decisionColor = s?.decisionColor === 'buy' ? '#4ade80'
                  : s?.decisionColor === 'buy_small' ? '#a3e635'
                  : s?.decisionColor === 'wait' ? '#fbbf24'
                  : s?.decisionColor === 'block' ? '#f87171'
                  : '#64748b';
                return (
                  <tr key={t} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 600 }}>{t}</td>
                    <td style={tdStyle}>{s?.currentPrice ? s.currentPrice.toFixed(2) : '—'}</td>
                    <td style={{ ...tdStyle, color: '#94a3b8', fontSize: '10px' }}>{s?.priceSource || '—'}</td>
                    <td style={{ ...tdStyle, color: decisionColor }}>{s?.posterior ? `${(s.posterior * 100).toFixed(0)}%` : '—'}</td>
                    <td style={{ ...tdStyle, color: decisionColor, fontWeight: 600 }}>
                      {s?.error ? `⚠ ${s.error.slice(0, 30)}` : s?.decision || '...'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {alerts.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Historique ({alerts.length})
            </div>
            <button onClick={onClear} style={{ background: 'transparent', border: 'none', color: '#64748b', fontFamily: fonts.mono, fontSize: '10px', cursor: 'pointer' }}>effacer tout</button>
          </div>
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {alerts.slice().reverse().map((a, i) => {
              const color = a.decision === 'ACHETER' ? '#4ade80' : '#a3e635';
              return (
                <div key={a.id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '4px', marginBottom: '4px', fontFamily: fonts.mono, fontSize: '11px' }}>
                  <span><span style={{ color, fontWeight: 600 }}>{a.decision}</span> · <span style={{ color: '#f1f5f9' }}>{a.symbol}</span> @ {a.current_price?.toFixed?.(2) || a.currentPrice?.toFixed?.(2) || '—'}$ · P={((a.posterior) * 100).toFixed(1)}%</span>
                  <span style={{ color: '#64748b' }}>{new Date(a.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {alerts.length === 0 && (
        <div style={{ padding: '12px', textAlign: 'center', fontFamily: fonts.mono, fontSize: '11px', color: '#64748b' }}>
          {enabled ? 'Scanner en cours, en attente de la première alerte...' : 'Aucune alerte en historique. Active le scanner pour commencer.'}
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 500, fontSize: '10px', letterSpacing: '0.1em' };
const tdStyle = { padding: '8px 10px', color: '#e2e8f0' };
