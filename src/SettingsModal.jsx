import { useState } from 'react';
import { MODELS, newWatchlistId } from './storage.js';

const fonts = {
  display: "'Instrument Serif', 'Times New Roman', serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', 'Courier New', monospace",
  sans: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
};

export default function SettingsModal({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(settings);
  const [activeTab, setActiveTab] = useState('api');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const update = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const updateWatchlist = (id, changes) => {
    setDraft(d => ({
      ...d,
      watchlists: d.watchlists.map(w => w.id === id ? { ...w, ...changes } : w),
    }));
  };

  const addWatchlist = () => {
    const id = newWatchlistId();
    setDraft(d => ({
      ...d,
      watchlists: [...d.watchlists, { id, name: 'Nouvelle liste', tickers: [] }],
      activeWatchlistId: id,
    }));
  };

  const removeWatchlist = (id) => {
    if (draft.watchlists.length <= 1) return alert('Garde au moins une watchlist.');
    setDraft(d => ({
      ...d,
      watchlists: d.watchlists.filter(w => w.id !== id),
      activeWatchlistId: d.activeWatchlistId === id ? d.watchlists[0].id : d.activeWatchlistId,
    }));
  };

  const testApiKey = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': draft.claudeApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: draft.claudeModel,
          max_tokens: 50,
          messages: [{ role: 'user', content: 'Réponds juste "OK"' }],
        }),
      });
      if (res.ok) setTestResult({ ok: true, msg: 'Clé API valide ✓' });
      else {
        const err = await res.json().catch(() => ({}));
        setTestResult({ ok: false, msg: `Erreur ${res.status}: ${err.error?.message || 'clé invalide'}` });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: `Erreur réseau: ${e.message}` });
    } finally { setTesting(false); }
  };

  const handleSave = () => { onSave(draft); onClose(); };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(4px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f172a', border: '1px solid #334155', borderRadius: '8px',
          maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
          color: '#e2e8f0',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ fontFamily: fonts.display, fontSize: '26px', color: '#f1f5f9', fontStyle: 'italic' }}>Paramètres</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', padding: '0 8px' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
          {[['api', 'API Claude'], ['watchlists', 'Watchlists']].map(([k, label]) => (
            <button key={k} onClick={() => setActiveTab(k)} style={{
              flex: 1, background: 'transparent', border: 'none',
              padding: '14px', fontFamily: fonts.mono, fontSize: '11px',
              color: activeTab === k ? '#22c55e' : '#64748b',
              borderBottom: activeTab === k ? '2px solid #22c55e' : '2px solid transparent',
              cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>{label}</button>
          ))}
        </div>

        {/* API Tab */}
        {activeTab === 'api' && (
          <div style={{ padding: '24px' }}>
            <Field label="Clé API Claude" sublabel="Format: sk-ant-...">
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={draft.claudeApiKey}
                  onChange={(e) => update('claudeApiKey', e.target.value)}
                  placeholder="sk-ant-..."
                  style={inputStyle}
                />
                <button onClick={() => setShowApiKey(!showApiKey)} style={btnSecondary}>{showApiKey ? '🙈' : '👁'}</button>
              </div>
            </Field>

            <Field label="Modèle Claude" sublabel="Sonnet recommandé pour le ratio coût/qualité">
              <select
                value={draft.claudeModel}
                onChange={(e) => update('claudeModel', e.target.value)}
                style={inputStyle}
              >
                {MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name} — {m.desc}</option>
                ))}
              </select>
            </Field>

            <div style={{ padding: '12px 14px', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={draft.useWebSearch} onChange={(e) => update('useWebSearch', e.target.checked)} />
                <span style={{ fontFamily: fonts.sans, fontSize: '13px', color: '#cbd5e1' }}>Recherche web activée</span>
              </label>
              <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginTop: '6px', marginLeft: '24px' }}>
                Permet à Claude d'aller chercher les news actualité du ticker. Plus lent, mais l'analyse est beaucoup plus pertinente.
              </div>
            </div>

            <button onClick={testApiKey} disabled={!draft.claudeApiKey || testing} style={{ ...btnSecondary, width: '100%', marginBottom: '12px' }}>
              {testing ? 'Test en cours...' : 'Tester la clé API'}
            </button>

            {testResult && (
              <div style={{
                padding: '10px 14px',
                background: testResult.ok ? 'rgba(34, 197, 94, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                border: `1px solid ${testResult.ok ? '#22c55e' : '#dc2626'}`,
                borderRadius: '4px', fontFamily: fonts.mono, fontSize: '12px',
                color: testResult.ok ? '#4ade80' : '#f87171',
                marginBottom: '16px',
              }}>{testResult.msg}</div>
            )}

            <div style={{ padding: '12px 14px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '4px', fontFamily: fonts.sans, fontSize: '11px', color: '#fbbf24', lineHeight: 1.5 }}>
              ⚠ La clé est stockée dans le localStorage de ton navigateur. Les requêtes Claude partent directement de ton browser vers l'API Anthropic. Ne partage pas cet appareil avec quelqu'un en qui tu n'as pas confiance.
            </div>
          </div>
        )}

        {/* Watchlists Tab */}
        {activeTab === 'watchlists' && (
          <div style={{ padding: '24px' }}>
            {draft.watchlists.map(wl => (
              <div key={wl.id} style={{ marginBottom: '16px', padding: '14px', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    value={wl.name}
                    onChange={(e) => updateWatchlist(wl.id, { name: e.target.value })}
                    placeholder="Nom de la watchlist"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={() => removeWatchlist(wl.id)} style={{ ...btnDanger }}>Suppr.</button>
                </div>
                <textarea
                  value={wl.tickers.join(', ')}
                  onChange={(e) => updateWatchlist(wl.id, {
                    tickers: e.target.value.split(/[\s,]+/).filter(Boolean).map(s => s.toUpperCase().trim())
                  })}
                  placeholder="SPY, QQQ, AAPL, MSFT..."
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: fonts.mono, fontSize: '12px' }}
                />
                <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginTop: '6px' }}>
                  {wl.tickers.length} ticker{wl.tickers.length > 1 ? 's' : ''} · séparés par virgule ou espace
                </div>
              </div>
            ))}
            <button onClick={addWatchlist} style={{ ...btnSecondary, width: '100%' }}>+ Ajouter une watchlist</button>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 24px', borderTop: '1px solid #1e293b' }}>
          <button onClick={onClose} style={btnSecondary}>Annuler</button>
          <button onClick={handleSave} style={btnPrimary}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  background: '#020617', border: '1px solid #334155', color: '#f1f5f9',
  padding: '10px 12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px',
  borderRadius: '4px', width: '100%', outline: 'none',
};

const btnPrimary = {
  background: '#22c55e', color: '#020617', border: 'none',
  padding: '10px 18px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px',
  fontWeight: 600, cursor: 'pointer', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em',
};

const btnSecondary = {
  background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155',
  padding: '10px 18px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px',
  fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
};

const btnDanger = {
  background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d',
  padding: '6px 12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px',
  cursor: 'pointer', borderRadius: '4px',
};

function Field({ label, sublabel, children }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontFamily: fonts.sans, fontSize: '12px', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
      {sublabel && <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginBottom: '8px' }}>{sublabel}</div>}
      {children}
    </div>
  );
}
