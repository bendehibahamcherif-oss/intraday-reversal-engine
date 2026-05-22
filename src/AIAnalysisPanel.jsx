import { useState } from 'react';
import { api } from './api.js';

const fonts = {
  display: "'Instrument Serif', 'Times New Roman', serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', 'Courier New', monospace",
  sans: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
};

function renderResponse(text) {
  const lines = text.split('\n');
  const elements = [];
  let key = 0;
  for (const line of lines) {
    if (!line.trim()) { elements.push(<div key={key++} style={{ height: '8px' }} />); continue; }
    if (/^\*\*[^*]+\*\*$/.test(line.trim()) || /^#{1,3} /.test(line.trim())) {
      const txt = line.trim().replace(/^\*\*|\*\*$|^#{1,3} /g, '');
      elements.push(<div key={key++} style={{ fontFamily: fonts.display, fontSize: '18px', color: '#4ade80', fontStyle: 'italic', marginTop: '14px', marginBottom: '6px' }}>{txt}</div>);
      continue;
    }
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    elements.push(
      <p key={key++} style={{ fontFamily: fonts.sans, fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6, margin: '4px 0' }}>
        {parts.map((p, i) => p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} style={{ color: '#f1f5f9' }}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>)}
      </p>
    );
  }
  return elements;
}

export default function AIAnalysisPanel({ settings, ticker, derived, calc, tfIndicators, onOpenSettings }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const runAnalysis = async () => {
    if (!derived.currentPrice) { setError('Charge un ticker d\'abord.'); return; }
    setLoading(true); setError(null); setAnalysis(null);

    try {
      const payload = {
        ticker,
        currentPrice: derived.currentPrice,
        prevClose: derived.prevClose,
        priceSource: derived.priceSource,
        priceTimestamp: derived.priceTimestamp,
        vix: derived.vix,
        gap: calc.gap, gapPct: calc.gapPct, gapAtrRatio: calc.gapAtrRatio,
        firstHourPctOfDaily: calc.firstHourPctOfDaily,
        direction: derived.direction,
        mtfAlignment: calc.mtfAlignment,
        decision: calc.decision,
        decisionReason: calc.decisionReason,
        posterior: calc.posterior,
        tfIndicators: Object.fromEntries(
          Object.entries(tfIndicators || {}).map(([k, v]) => [
            k,
            v ? { last: v.last, rsi: v.rsi, trend: v.trend, changePct: v.changePct } : null,
          ])
        ),
        model: settings.claudeModel,
        useWebSearch: settings.useWebSearch,
      };

      const data = await api.claudeAnalyze(payload);
      setAnalysis(data);
      setLastRun(new Date());
    } catch (e) {
      if (e.status === 503) {
        setError('Clé API non configurée sur le backend. Va dans ⚙ Paramètres > IA Claude.');
      } else if (e.status === 401) {
        setError('Token utilisateur invalide. Va dans ⚙ Paramètres pour le saisir.');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontFamily: fonts.display, fontSize: '22px', color: '#e2e8f0', fontStyle: 'italic' }}>
            🤖 Analyse IA — Claude
          </div>
          <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '4px' }}>
            {settings.claudeModel}{settings.useWebSearch ? ' · web search ON' : ' · web search OFF'} · 🔒 backend
            {lastRun && ` · dernière ${lastRun.toLocaleTimeString('fr-FR')}`}
          </div>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          style={{
            background: '#4f46e5', color: '#fff', border: 'none',
            padding: '12px 20px', fontFamily: fonts.mono, fontSize: '12px',
            fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
            borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          {loading ? '⏳ Analyse en cours...' : `⚡ Analyser ${ticker}`}
        </button>
      </div>

      {error && (
        <div style={{ padding: '14px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid #dc2626', borderRadius: '4px', fontFamily: fonts.mono, fontSize: '12px', color: '#f87171' }}>
          ⚠ {error}
        </div>
      )}

      {loading && (
        <div style={{ padding: '20px', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px', fontFamily: fonts.mono, fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
          Réflexion en cours...
          {settings.useWebSearch && <div style={{ fontSize: '10px', marginTop: '8px', color: '#64748b' }}>La recherche web peut prendre 15-30 secondes</div>}
        </div>
      )}

      {analysis && !loading && (
        <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '4px', padding: '18px' }}>
          {renderResponse(analysis.text)}
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', fontFamily: fonts.mono, fontSize: '10px', color: '#64748b' }}>
            <span>
              {analysis.usage && `${analysis.usage.input_tokens} in + ${analysis.usage.output_tokens} out tokens`}
              {analysis.searchCount > 0 && ` · ${analysis.searchCount} recherche${analysis.searchCount > 1 ? 's' : ''} web`}
            </span>
            <span>{lastRun?.toLocaleString('fr-FR')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
