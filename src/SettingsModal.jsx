import { useState, useEffect } from 'react';
import { MODELS, newWatchlistId } from './storage.js';
import { api, getToken, setToken } from './api.js';

const fonts = {
  display: "'Instrument Serif', 'Times New Roman', serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', 'Courier New', monospace",
  sans: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
};

export default function SettingsModal({ settings, onSave, onClose, onSyncWatchlists }) {
  const [draft, setDraft] = useState(settings);
  const [activeTab, setActiveTab] = useState('connection');
  const [claudeStatus, setClaudeStatus] = useState(null);
  const [tokenInput, setTokenInput] = useState(getToken());
  const [showToken, setShowToken] = useState(false);
  const [authTest, setAuthTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  const update = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const updateWatchlist = (id, changes) => {
    setDraft(d => ({ ...d, watchlists: d.watchlists.map(w => w.id === id ? { ...w, ...changes } : w) }));
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

  useEffect(() => {
    if (activeTab !== 'claude') return;
    api.claudeStatus().then(setClaudeStatus).catch(e => setClaudeStatus({ error: e.message }));
  }, [activeTab]);

  const testToken = async () => {
    setTesting(true); setAuthTest(null);
    setToken(tokenInput);
    try {
      await api.checkAuth();
      setAuthTest({ ok: true, msg: 'Connexion validée ✓' });
    } catch (e) {
      setAuthTest({ ok: false, msg: e.status === 401 ? 'Token rejeté par le serveur' : e.message });
    } finally { setTesting(false); }
  };

  const pullFromServer = async () => {
    setSyncStatus('Téléchargement...');
    try {
      const r = await api.getSetting('watchlists');
      if (r.value && Array.isArray(r.value)) {
        const activeId = (await api.getSetting('activeWatchlistId').catch(() => null))?.value;
        setDraft(d => ({
          ...d,
          watchlists: r.value,
          activeWatchlistId: activeId || r.value[0]?.id || d.activeWatchlistId,
        }));
        setSyncStatus(`✓ ${r.value.length} watchlists chargées du serveur`);
      } else {
        setSyncStatus('Aucune watchlist sur le serveur');
      }
    } catch (e) {
      setSyncStatus(`⚠ ${e.message}`);
    }
  };

  const pushToServer = async () => {
    setSyncStatus('Envoi...');
    try {
      await api.setSetting('watchlists', draft.watchlists);
      await api.setSetting('activeWatchlistId', draft.activeWatchlistId);
      setSyncStatus(`✓ ${draft.watchlists.length} watchlists sauvegardées sur le serveur`);
    } catch (e) {
      setSyncStatus(`⚠ ${e.message}`);
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) { alert('Notifications non supportées'); return; }
    const r = await Notification.requestPermission();
    if (r === 'granted') new Notification('Reversal Engine', { body: 'Notifications activées ✓' });
  };

  const handleSave = async () => {
    onSave(draft);
    // Auto-sync to server in background
    try {
      await api.setSetting('watchlists', draft.watchlists);
      await api.setSetting('activeWatchlistId', draft.activeWatchlistId);
    } catch {}
    onClose();
  };

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', maxWidth: '680px', width: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#e2e8f0' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ fontFamily: fonts.display, fontSize: '26px', color: '#f1f5f9', fontStyle: 'italic' }}>Paramètres</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', padding: '0 8px' }}>×</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', overflowX: 'auto' }}>
          {[['connection', '🔐 Connexion'], ['claude', 'IA Claude'], ['alerts', 'Alertes'], ['watchlists', 'Watchlists']].map(([k, label]) => (
            <button key={k} onClick={() => setActiveTab(k)} style={{
              flex: '1 0 auto', background: 'transparent', border: 'none',
              padding: '14px 20px', fontFamily: fonts.mono, fontSize: '11px',
              color: activeTab === k ? '#22c55e' : '#64748b',
              borderBottom: activeTab === k ? '2px solid #22c55e' : '2px solid transparent',
              cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>{label}</button>
          ))}
        </div>

        {/* CONNECTION TAB */}
        {activeTab === 'connection' && (
          <div style={{ padding: '24px' }}>
            <Field label="Token utilisateur" sublabel="Mot de passe partagé entre tes appareils. Configure-le côté serveur dans la variable USER_TOKEN.">
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type={showToken ? 'text' : 'password'} value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder="ton-mot-de-passe-secret"
                  style={inputStyle}
                />
                <button onClick={() => setShowToken(!showToken)} style={btnSecondary}>{showToken ? '🙈' : '👁'}</button>
              </div>
            </Field>

            <button onClick={testToken} disabled={testing || !tokenInput}
              style={{ ...btnSecondary, width: '100%', marginBottom: '12px' }}
            >{testing ? 'Test en cours...' : 'Tester et enregistrer'}</button>

            {authTest && (
              <div style={{
                padding: '10px 14px',
                background: authTest.ok ? 'rgba(34, 197, 94, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                border: `1px solid ${authTest.ok ? '#22c55e' : '#dc2626'}`,
                borderRadius: '4px', fontFamily: fonts.mono, fontSize: '12px',
                color: authTest.ok ? '#4ade80' : '#f87171', marginBottom: '16px',
              }}>{authTest.msg}</div>
            )}

            <div style={{ padding: '12px 14px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '4px', fontFamily: fonts.sans, fontSize: '11px', color: '#93c5fd', lineHeight: 1.5 }}>
              <strong>Comment ça marche</strong> : choisis un mot de passe (long et unique), mets-le sur Render dans la variable <code style={{ background: '#020617', padding: '1px 4px', borderRadius: '2px' }}>USER_TOKEN</code> du backend, et entre-le ici sur chaque appareil. Une fois entré, il est stocké dans le localStorage local et envoyé automatiquement avec chaque requête vers ton backend. Sans ce token, le backend refuse toutes les requêtes — donc personne ne peut utiliser ton API ni accéder à tes données.
            </div>
          </div>
        )}

        {/* CLAUDE TAB */}
        {activeTab === 'claude' && (
          <div style={{ padding: '24px' }}>
            <Field label="Statut du backend">
              {!claudeStatus ? (
                <div style={{ fontFamily: fonts.mono, fontSize: '12px', color: '#94a3b8' }}>Vérification...</div>
              ) : claudeStatus.error ? (
                <div style={{ padding: '12px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid #dc2626', borderRadius: '4px', fontFamily: fonts.mono, fontSize: '12px', color: '#f87171' }}>
                  ⚠ {claudeStatus.error}
                </div>
              ) : claudeStatus.configured ? (
                <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22c55e', borderRadius: '4px', fontFamily: fonts.mono, fontSize: '12px', color: '#4ade80' }}>
                  ✓ Clé API configurée sur le backend ({claudeStatus.rateLimitPerMin}/min)
                </div>
              ) : (
                <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', borderRadius: '4px', fontFamily: fonts.mono, fontSize: '12px', color: '#fbbf24' }}>
                  ⚠ Clé non configurée. Render → reversal-proxy → Environment → ajoute <code>ANTHROPIC_API_KEY</code>
                </div>
              )}
            </Field>

            <Field label="Modèle Claude">
              <select value={draft.claudeModel} onChange={e => update('claudeModel', e.target.value)} style={inputStyle}>
                {MODELS.map(m => <option key={m.id} value={m.id}>{m.name} — {m.desc}</option>)}
              </select>
            </Field>

            <div style={{ padding: '12px 14px', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={draft.useWebSearch} onChange={e => update('useWebSearch', e.target.checked)} />
                <span style={{ fontFamily: fonts.sans, fontSize: '13px', color: '#cbd5e1' }}>Recherche web</span>
              </label>
            </div>
          </div>
        )}

        {/* ALERTS TAB */}
        {activeTab === 'alerts' && (
          <div style={{ padding: '24px' }}>
            <Field label="Surveillance">
              <ToggleRow label="Alertes activées" checked={draft.alertsEnabled} onChange={v => update('alertsEnabled', v)} />
              <ToggleRow label="Son" checked={draft.alertSound} onChange={v => update('alertSound', v)} />
              <ToggleRow label="Notification navigateur" checked={draft.alertNotification} onChange={v => update('alertNotification', v)} />
            </Field>

            <Field label="Intervalle de scan">
              <select value={draft.alertScanIntervalSec} onChange={e => update('alertScanIntervalSec', parseInt(e.target.value))} style={inputStyle}>
                <option value={30}>30 secondes</option>
                <option value={60}>1 minute (recommandé)</option>
                <option value={120}>2 minutes</option>
                <option value={300}>5 minutes</option>
              </select>
            </Field>

            <button onClick={requestNotificationPermission} style={{ ...btnSecondary, width: '100%' }}>
              🔔 Autoriser notifications navigateur
            </button>
            <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginTop: '6px', textAlign: 'center' }}>
              Permission: {('Notification' in window) ? Notification.permission : 'non supporté'}
            </div>

            <div style={{ marginTop: '14px', padding: '12px 14px', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px', fontFamily: fonts.sans, fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
              💾 Toutes les alertes sont sauvegardées sur le backend. Tu les retrouves depuis n'importe quel appareil. Historique gardé 30 jours.
            </div>
          </div>
        )}

        {/* WATCHLISTS TAB */}
        {activeTab === 'watchlists' && (
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <button onClick={pullFromServer} style={{ ...btnSecondary, flex: 1 }}>⬇ Charger du serveur</button>
              <button onClick={pushToServer} style={{ ...btnSecondary, flex: 1 }}>⬆ Envoyer au serveur</button>
            </div>
            {syncStatus && (
              <div style={{ padding: '8px 12px', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px', fontFamily: fonts.mono, fontSize: '11px', color: '#94a3b8', marginBottom: '14px', textAlign: 'center' }}>
                {syncStatus}
              </div>
            )}
            <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginBottom: '14px', lineHeight: 1.5 }}>
              📡 Les watchlists sont auto-synchronisées au serveur quand tu cliques "Enregistrer". Sur un nouvel appareil, clique "Charger du serveur".
            </div>

            {draft.watchlists.map(wl => (
              <div key={wl.id} style={{ marginBottom: '14px', padding: '14px', background: '#020617', border: '1px solid #1e293b', borderRadius: '4px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input value={wl.name} onChange={e => updateWatchlist(wl.id, { name: e.target.value })}
                    placeholder="Nom" style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={() => removeWatchlist(wl.id)} style={btnDanger}>Suppr.</button>
                </div>
                <textarea value={wl.tickers.join(', ')}
                  onChange={e => updateWatchlist(wl.id, {
                    tickers: e.target.value.split(/[\s,]+/).filter(Boolean).map(s => s.toUpperCase().trim())
                  })}
                  placeholder="SPY, QQQ, AAPL..." rows={2}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: fonts.mono, fontSize: '12px' }}
                />
                <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginTop: '6px' }}>
                  {wl.tickers.length} ticker{wl.tickers.length > 1 ? 's' : ''}
                </div>
              </div>
            ))}
            <button onClick={addWatchlist} style={{ ...btnSecondary, width: '100%' }}>+ Ajouter une watchlist</button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 24px', borderTop: '1px solid #1e293b' }}>
          <button onClick={onClose} style={btnSecondary}>Annuler</button>
          <button onClick={handleSave} style={btnPrimary}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = { background: '#020617', border: '1px solid #334155', color: '#f1f5f9', padding: '10px 12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', borderRadius: '4px', width: '100%', outline: 'none' };
const btnPrimary = { background: '#22c55e', color: '#020617', border: 'none', padding: '10px 18px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' };
const btnSecondary = { background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', padding: '10px 18px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px' };
const btnDanger = { background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', padding: '6px 12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', cursor: 'pointer', borderRadius: '4px' };

function Field({ label, sublabel, children }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontFamily: fonts.sans, fontSize: '12px', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
      {sublabel && <div style={{ fontFamily: fonts.mono, fontSize: '10px', color: '#64748b', marginBottom: '8px', lineHeight: 1.5 }}>{sublabel}</div>}
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
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
    </label>
  );
}
