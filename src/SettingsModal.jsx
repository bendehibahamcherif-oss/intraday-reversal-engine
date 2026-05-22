import { useState, useEffect } from 'react';
import { MODELS, newWatchlistId } from './storage.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:10000';

const fonts = {
  display: "'Instrument Serif', 'Times New Roman', serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', 'Courier New', monospace",
  sans: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
};

export default function SettingsModal({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(settings);
  const [activeTab, setActiveTab] = useState('claude');
  const [claudeStatus, setClaudeStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

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

  // Check Claude API config on mount
  useEffect(() => {
    if (activeTab !== 'claude') return;
    setStatusLoading(true);
    fetch(`${API_BASE}/claude/status`)
      .then(r => r.json())
      .then(data => setClaudeStatus(data))
      .catch(e => setClaudeStatus({ error: e.message }))
      .finally(() => setStatusLoading(false));
  }, [activeTab]);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('Notifications non supportées par ce navigateur.');
      return;
    }
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      new Notification('Reversal Engine', { body: 'Notifications activées ✓' });
    }
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
          {[['claude', 'IA Claude'], ['alerts', 'Alertes'], ['watchlists', 'Watchlists']].map(([k, label]) => (
            <button key={k} onClick={() => setActiveTab(k)} style={{
              flex: 1, background: 'transparent', border: 'none',
              padding: '14px', fontFamily: fonts.mono, fontSize: '11px',
              color: activeTab === k ? '#22c55e' : '#64748b',
              borderBottom: activeTab === k ? '2px solid #22c55e' : '2px solid transparent',
              cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>{label}</button>
          ))}
        </div>

        {/* Claude Tab */}
        {activeTab === 'claude' && (
          <div style={{ padding: '24px' }}>
            <Field label="Statut du backend">
              {statusLoading ? (
                <div style={{ fontFamily: fonts.mono, fontSize: '12px', color: '#94a3b8' }}>Vérification en cours...</div>
              ) : claudeStatus?.error ? (
                <div style={{
                  padding: '12px', background: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid #dc2626', borderRadius: '4px',
                  fontFamily: fonts.mono, fontSize: '12px', color: '#f87171',
                }}>
                  ⚠ Backend inaccessible: {claudeStatus.error}
                </div>
              ) : claudeStatus?.configured ? (
                <div style={{
                  padding: '12px', background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid #22c55e', borderRadius: '4px',
                  fontFamily: fonts.mono, fontSize: '12px', color: '#4ade80',
                }}>
                  ✓ Clé API configurée sur le backend<br />
                  <span style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Rate limit: {claudeStatus.rateLimitPerMin} analyses/min
                  </span>
                </div>
              ) : (
                <div style={{
                  padding: '12px', background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid #f59e0b', borderRadius: '4px',
                  fontFamily: fonts.mono, fontSize: '12px', color: '#fbbf24',
                }}>
                  ⚠ Clé API non configurée sur le backend.<br />
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px', display: 'block', lineHeight: 1.5 }}>
                    Sur Render → ton service "reversal-proxy" → Environment → ajoute la variable <code style={{ background: '#020617', padding: '1px 4px', borderRadius: '2px' }}>ANTHROPIC_API_KEY</code> avec ta clé sk-ant-... → redéploie.
                  </span>
                </div>
              )}
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
                Permet à Claude d'aller chercher les news actuelles du ticker. Plus lent, mais l'analyse devient beaucoup plus pertinente.
              </div>
            </div>

            <div style={{ padding: '12px 14px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '4px', fontFamily: fonts.sans, fontSize: '11px', color: '#4ade80', lineHeight: 1.5 }}>
              🔒 Sécurité maximale activée : la clé API est sur le backend Render uniquement. Elle n'apparaît jamais dans ton navigateur ni dans le code source du frontend.
            </div>
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div style={{ padding: '24px' }}>
            <Field label="Surveillance automatique" sublabel="Scan en arrière-plan des tickers de la watchlist active">
              <ToggleRow label="Alertes activées" checked={draft.alertsEnabled} onChange={(v) => update('alertsEnabled', v)} />
              <ToggleRow label="Son" checked={draft.alertSound} onChange={(v) => update('alertSound', v)} />
              <ToggleRow label="Notification navigateur" checked={draft.alertNotification} onChange={(v) => update('alertNotification', v)} />
            </Field>

            <Field label="Intervalle de scan" sublabel="Délai entre 2 vérifications complètes (toute la watchlist)">
              <select
                value={draft.alertScanIntervalSec}
                onChange={(e) => update('alertScanIntervalSec', parseInt(e.target.value))}
                style={inputStyle}
              >
                <option value={30}>30 secondes</option>
                <option value={60}>1 minute (recommandé)</option>
                <option value={120}>2 minutes</option>
                <option value={300}>5 minutes</option>
              </select>
            </Field>

            <div style={{ marginBottom: '16px' }}>
              <button onClick={requestNotificationPermission} style={{ ...btnSecondary, width: '100%' }}>
                🔔 Autoriser les notifications navigateur
              </button>
              <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginTop: '6px', textAlign: 'center' }}>
                Permission actuelle: {('Notification' in window) ? Notification.permission : 'non supporté'}
              </div>
            </div>

            <div style={{ padding: '12px 14px', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px', fontFamily: fonts.sans, fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
              📡 Comment ça marche : le système charge en arrière-plan tous les tickers de la watchlist active toutes les X secondes et calcule leur score bayésien. Quand un ticker passe en <strong style={{ color: '#4ade80' }}>ACHETER</strong> ou <strong style={{ color: '#a3e635' }}>ACHETER 1/2</strong>, tu reçois une notification. Le même ticker ne re-déclenche pas avant 15 min ou changement de décision.
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
                  <button onClick={() => removeWatchlist(wl.id)} style={btnDanger}>Suppr.</button>
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

function ToggleRow({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', cursor: 'pointer', borderBottom: '1px solid #1e293b' }}>
      <span style={{ fontFamily: fonts.sans, fontSize: '12px', color: '#cbd5e1' }}>{label}</span>
      <span style={{ display: 'inline-block', width: '36px', height: '20px', borderRadius: '10px', background: checked ? '#22c55e' : '#334155', position: 'relative', transition: 'background 0.2s' }}>
        <span style={{ position: 'absolute', top: '2px', left: checked ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#f1f5f9', transition: 'left 0.2s' }} />
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ display: 'none' }} />
    </label>
  );
}
