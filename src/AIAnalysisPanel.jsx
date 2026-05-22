import { useState } from 'react';

const fonts = {
  display: "'Instrument Serif', 'Times New Roman', serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', 'Courier New', monospace",
  sans: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
};

function buildPrompt({ ticker, derived, calc, tfIndicators }) {
  const fmt = (v, d = 2) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(d));
  const tfLine = (k) => {
    const t = tfIndicators[k];
    if (!t) return `${k}: —`;
    return `${k}: prix ${fmt(t.last)}, RSI ${fmt(t.rsi, 1)}, trend ${t.trend}, ${t.changePct >= 0 ? '+' : ''}${fmt(t.changePct, 2)}%`;
  };

  return `Tu es un analyste quantitatif spécialisé en stratégies contrarian intraday sur options (3M ATM, gap fade).

CONTEXTE DU MARCHÉ — ${ticker}
- Prix: ${fmt(derived.currentPrice)} (${derived.priceSource || 'N/A'}${derived.priceTimestamp ? ` à ${new Date(derived.priceTimestamp * 1000).toLocaleTimeString('fr-FR')}` : ''})
- Clôture référence: ${fmt(derived.prevClose)}
- Gap: ${calc.gap >= 0 ? '+' : ''}${fmt(calc.gap)}$ (${fmt(calc.gapPct)}%), ratio ${fmt(calc.gapAtrRatio)}× ATR
- VIX: ${fmt(derived.vix, 1)}
- Range 1ère heure: ${fmt(calc.firstHourPctOfDaily, 0)}% du daily moyen
- Direction fade envisagée: ${derived.direction === 'fade_up' ? 'baissière (puts)' : 'haussière (calls)'}

INDICATEURS MULTI-TIMEFRAME
${['1m','5m','15m','30m','1h','1d'].map(tfLine).join('\n')}
- Alignement MTF: ${calc.mtfAlignment}

MOTEUR BAYÉSIEN
- Probabilité de retournement: ${fmt(calc.posterior * 100, 1)}%
- Décision: ${calc.decision}
- Raison: ${calc.decisionReason}

TÂCHE
Fournis une analyse en 4 sections compactes (max 2-3 phrases chacune, ton de tradeur direct, pas de disclaimers génériques).

**1. Sentiment marché**
Contexte du sous-jacent et de son secteur aujourd'hui. Si tu as accès à la recherche web, vérifie les news récentes pertinentes pour ${ticker} (catalyseurs, événements, sentiment analyste).

**2. Facteurs spécifiques**
Points particuliers sur ce ticker à surveiller : niveaux techniques clés, catalyseurs à venir (earnings, ex-div, conférences), positionnement options inhabituel, dynamique sectorielle.

**3. Validation du setup quantitatif**
La décision du moteur (${calc.decision}, ${fmt(calc.posterior * 100, 1)}%) est-elle cohérente avec le contexte fondamental et technique? Identifier les angles morts éventuels du modèle quantitatif sur ce trade précis.

**4. Recommandation finale**
Confirme ou contredit la décision automatique. Indique ton niveau de confiance: FAIBLE / MODÉRÉ / FORT. Si tu confirmes, suggère un ajustement de taille ou de timing si pertinent.`;
}

async function callClaude({ apiKey, model, useWebSearch, prompt, onProgress }) {
  const body = {
    model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  };
  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  }

  onProgress?.('Appel API Claude...');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  // Extract text blocks (web_search tool_use/tool_result are server-handled, final text is in text blocks)
  const text = data.content.filter(c => c.type === 'text').map(c => c.text).join('\n\n');
  // Count web search calls if any
  const searchCount = data.content.filter(c => c.type === 'server_tool_use' || c.type === 'web_search_tool_result').length;
  return { text, raw: data, searchCount, usage: data.usage };
}

function renderResponse(text) {
  // Simple markdown-ish renderer: bold + paragraphs + sections
  const lines = text.split('\n');
  const elements = [];
  let key = 0;
  for (const line of lines) {
    if (!line.trim()) { elements.push(<div key={key++} style={{ height: '8px' }} />); continue; }
    // Headers like **Section** or ### Section
    if (/^\*\*[^*]+\*\*$/.test(line.trim()) || /^#{1,3} /.test(line.trim())) {
      const txt = line.trim().replace(/^\*\*|\*\*$|^#{1,3} /g, '');
      elements.push(<div key={key++} style={{ fontFamily: fonts.display, fontSize: '18px', color: '#4ade80', fontStyle: 'italic', marginTop: '14px', marginBottom: '6px' }}>{txt}</div>);
      continue;
    }
    // Inline bold
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
  const [progress, setProgress] = useState('');
  const [lastRun, setLastRun] = useState(null);

  const hasApiKey = !!settings.claudeApiKey;

  const runAnalysis = async () => {
    if (!hasApiKey) { onOpenSettings(); return; }
    if (!derived.currentPrice) { setError('Charge un ticker d\'abord.'); return; }

    setLoading(true); setError(null); setAnalysis(null); setProgress('Préparation du prompt...');
    try {
      const prompt = buildPrompt({ ticker, derived, calc, tfIndicators });
      const result = await callClaude({
        apiKey: settings.claudeApiKey,
        model: settings.claudeModel,
        useWebSearch: settings.useWebSearch,
        prompt,
        onProgress: setProgress,
      });
      setAnalysis(result);
      setLastRun(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false); setProgress('');
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
            {settings.claudeModel}{settings.useWebSearch ? ' · web search ON' : ' · web search OFF'}
            {lastRun && ` · dernière analyse ${lastRun.toLocaleTimeString('fr-FR')}`}
          </div>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          style={{
            background: hasApiKey ? '#4f46e5' : '#1e293b',
            color: hasApiKey ? '#fff' : '#94a3b8',
            border: hasApiKey ? 'none' : '1px solid #334155',
            padding: '12px 20px', fontFamily: fonts.mono, fontSize: '12px',
            fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
            borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          {loading ? '⏳ ' + (progress || 'En cours...') : hasApiKey ? '⚡ Analyser ' + ticker : '⚙ Configurer API'}
        </button>
      </div>

      {!hasApiKey && (
        <div style={{ padding: '14px', background: '#020617', border: '1px solid #334155', borderRadius: '4px', fontFamily: fonts.sans, fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
          Aucune clé API configurée. Clique sur le bouton ci-dessus ou l'icône ⚙ en haut pour ajouter ta clé Claude.
        </div>
      )}

      {error && (
        <div style={{ padding: '14px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid #dc2626', borderRadius: '4px', fontFamily: fonts.mono, fontSize: '12px', color: '#f87171' }}>
          ⚠ {error}
        </div>
      )}

      {loading && (
        <div style={{ padding: '20px', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px', fontFamily: fonts.mono, fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
          {progress || 'Réflexion en cours...'}
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
