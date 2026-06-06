import { useEffect } from 'react';
import { useAILabStore } from '../store/aiLabStore.js';
import { useMLSignalStore } from '../store/mlSignalStore.js';
import { useHistoricalDataStore } from '../store/historicalDataStore.js';
import MLSignalPanel from '../components/MLSignalPanel.jsx';
import MLDiagnosticsPanel from '../components/MLDiagnosticsPanel.jsx';

const BG      = '#050505';
const SURFACE = '#0d0d1a';
const BORDER  = '#1f2937';
const TEXT    = '#e0e0f0';
const MUTED   = '#6b7280';
const GREEN   = '#22c55e';
const RED     = '#ef4444';
const AMBER   = '#f59e0b';
const BLUE    = '#2563eb';
const VIOLET  = '#a78bfa';

const panel  = { background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 };
const iStyle = { background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 8px', fontSize: 12 };

function fmtDate(v) { return v ? new Date(v).toLocaleString() : '—'; }
function shortId(id) { return id ? String(id).slice(-10) : '—'; }

function fmtPct(v, d = 1) {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const pct = n <= 1.001 ? n * 100 : n;
  return `${pct.toFixed(d)}%`;
}

function fmtN(v, d = 3) {
  if (v == null) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}

// ── Feature Importance Chart (SVG horizontal bars) ────────────────────────────
function FeatureImportanceChart({ importance }) {
  const features = Array.isArray(importance?.features) ? importance.features : [];
  if (!features.length) {
    return <div style={{ color: MUTED, fontSize: 12 }}>No importance data. Click "Importance" on a model in the registry.</div>;
  }
  const sorted = [...features].sort((a, b) => Number(b.importance) - Number(a.importance)).slice(0, 15);
  const maxImp = Math.max(...sorted.map((f) => Number(f.importance)), 0.000001);
  const rowH = 20, gap = 3, labelW = 150, barMaxW = 280, valW = 54;
  const W = labelW + barMaxW + valW + 10;
  const svgH = sorted.length * (rowH + gap) + 8;

  return (
    <svg viewBox={`0 0 ${W} ${svgH}`} style={{ width: '100%', maxWidth: W, display: 'block', background: BG, borderRadius: 8 }}>
      {sorted.map((f, i) => {
        const y = i * (rowH + gap) + 4;
        const barW = Math.max(2, (Number(f.importance) / maxImp) * barMaxW);
        const color = i === 0 ? VIOLET : i < 3 ? BLUE : MUTED;
        const name = String(f.name || f.feature || '');
        return (
          <g key={name + i}>
            <text x={labelW - 5} y={y + rowH * 0.7} textAnchor="end" fill={MUTED} fontSize="10">
              {name.length > 20 ? `${name.slice(0, 19)}…` : name}
            </text>
            <rect x={labelW} y={y + 3} width={barW} height={rowH - 6} fill={color} opacity="0.75" rx="2" />
            <text x={labelW + barW + 5} y={y + rowH * 0.7} fill={TEXT} fontSize="10">
              {fmtN(f.importance, 4)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── PSI colour helpers ────────────────────────────────────────────────────────
function psiColor(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return MUTED;
  if (n < 0.10) return GREEN;
  if (n < 0.20) return AMBER;
  return RED;
}

function psiLabel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n < 0.10) return 'Stable';
  if (n < 0.20) return 'Slight';
  return 'Significant';
}

// ── PSI Drift table ───────────────────────────────────────────────────────────
function DriftTable({ driftReport }) {
  if (!driftReport) {
    return <div style={{ color: MUTED, fontSize: 12 }}>Not enough prediction history for drift monitoring.</div>;
  }
  const features = Array.isArray(driftReport.features) ? driftReport.features
    : Array.isArray(driftReport.psi) ? driftReport.psi : [];
  if (!features.length) return <div style={{ color: MUTED, fontSize: 12 }}>No PSI features in report.</div>;
  const sorted = [...features].sort((a, b) => Number(b.psi ?? b.value ?? 0) - Number(a.psi ?? a.value ?? 0));
  const th = { padding: '6px 10px', fontSize: 11, color: MUTED, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
  const td = { padding: '5px 10px', fontSize: 12, borderBottom: `1px solid ${BORDER}22` };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Feature</th>
            <th style={{ ...th, textAlign: 'right' }}>PSI</th>
            <th style={{ ...th, textAlign: 'center' }}>Status</th>
            <th style={{ ...th, textAlign: 'right' }}>Ref Mean</th>
            <th style={{ ...th, textAlign: 'right' }}>Mon Mean</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f, i) => {
            const psi = f.psi ?? f.value ?? 0;
            const color = psiColor(psi);
            return (
              <tr key={f.feature || f.name || i}>
                <td style={{ ...td, fontFamily: 'monospace', color: TEXT }}>{f.feature || f.name || '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color }}>{fmtN(psi, 4)}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <span style={{ background: color + '22', color, border: `1px solid ${color}55`, borderRadius: 4, fontSize: 10, padding: '2px 6px', fontWeight: 700 }}>
                    {psiLabel(psi)}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right', color: MUTED, fontFamily: 'monospace' }}>
                  {fmtN(f.refMean ?? f.reference_mean, 3)}
                </td>
                <td style={{ ...td, textAlign: 'right', color: MUTED, fontFamily: 'monospace' }}>
                  {fmtN(f.monMean ?? f.monitor_mean, 3)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(driftReport.monitoringPeriod || driftReport.referencePeriod) && (
        <div style={{ fontSize: 10, color: MUTED, marginTop: 6 }}>
          Reference: {driftReport.referencePeriod || '—'} · Monitoring: {driftReport.monitoringPeriod || '—'}
        </div>
      )}
    </div>
  );
}

// ── Champion/Challenger comparison table ──────────────────────────────────────
const CMP_METRICS = [
  { key: 'accuracy',      label: 'Accuracy',     higher: true },
  { key: 'precision',     label: 'Precision',    higher: true },
  { key: 'recall',        label: 'Recall',       higher: true },
  { key: 'f1',            label: 'F1',           higher: true },
  { key: 'oos_accuracy',  label: 'OOS Accuracy', higher: true },
  { key: 'sharpe',        label: 'Sharpe',       higher: true },
  { key: 'log_loss',      label: 'Log Loss',     higher: false },
];

function ComparisonTable({ result }) {
  if (!result) return <div style={{ color: MUTED, fontSize: 12 }}>Select a challenger model and click Compare.</div>;
  const champ = result.champion || {};
  const chall = result.challenger || {};
  const th = { padding: '6px 10px', fontSize: 11, color: MUTED, borderBottom: `1px solid ${BORDER}`, textAlign: 'right' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Metric</th>
            <th style={th}>Champion</th>
            <th style={th}>Challenger</th>
            <th style={{ ...th, textAlign: 'center' }}>Winner</th>
          </tr>
        </thead>
        <tbody>
          {CMP_METRICS.map(({ key, label, higher }) => {
            const cv  = Number(champ[key] ?? champ.metrics?.[key]);
            const clv = Number(chall[key] ?? chall.metrics?.[key]);
            const valid = Number.isFinite(cv) && Number.isFinite(clv);
            const champWins = valid && (higher ? cv >= clv : cv <= clv);
            const challWins = valid && (higher ? clv > cv : clv < cv);
            const td = (wins) => ({
              padding: '5px 10px', fontSize: 12, fontFamily: 'monospace',
              textAlign: 'right', borderBottom: `1px solid ${BORDER}22`,
              color: wins ? GREEN : TEXT, fontWeight: wins ? 700 : 400,
            });
            return (
              <tr key={key}>
                <td style={{ padding: '5px 10px', fontSize: 12, color: MUTED, borderBottom: `1px solid ${BORDER}22` }}>{label}</td>
                <td style={td(champWins)}>{Number.isFinite(cv) ? cv.toFixed(4) : '—'}</td>
                <td style={td(challWins)}>{Number.isFinite(clv) ? clv.toFixed(4) : '—'}</td>
                <td style={{ padding: '5px 10px', textAlign: 'center', borderBottom: `1px solid ${BORDER}22`, fontSize: 11 }}>
                  {champWins ? <span style={{ color: BLUE }}>Champion</span>
                   : challWins ? <span style={{ color: VIOLET }}>Challenger</span>
                   : <span style={{ color: MUTED }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {result.recommendation && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: SURFACE, borderRadius: 6, fontSize: 12, color: TEXT }}>
          <strong>Recommendation:</strong> {result.recommendation}
        </div>
      )}
    </div>
  );
}

// ── Live Inference display ────────────────────────────────────────────────────
function InferenceDisplay({ r }) {
  if (!r) return <div style={{ color: MUTED, fontSize: 12 }}>No inference result. Load a champion model and click ▶ Run Inference.</div>;
  const dir   = String(r.direction || r.signal || 'NEUTRAL').toUpperCase();
  const conf  = Number(r.confidence ?? r.probability ?? 0);
  const expRet = Number(r.expectedReturn ?? r.expected_return ?? 0);
  const dirColor = dir === 'LONG' ? GREEN : dir === 'SHORT' ? RED : MUTED;
  const contribs = Array.isArray(r.topFeatures) ? r.topFeatures : Array.isArray(r.contributions) ? r.contributions : [];

  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ background: dirColor + '22', border: `1px solid ${dirColor}66`, borderRadius: 10, padding: '14px 22px', textAlign: 'center', minWidth: 120 }}>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Signal</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: dirColor }}>{dir}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
          Confidence: <strong style={{ color: TEXT }}>{fmtPct(conf, 1)}</strong>
        </div>
      </div>

      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 16px' }}>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Expected Return (T+{r.horizon || '?'})</div>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: expRet >= 0 ? GREEN : RED }}>
          {expRet >= 0 ? '+' : ''}{fmtN(expRet, 3)}%
        </div>
        {r.modelId && <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Model …{shortId(r.modelId)}</div>}
      </div>

      {contribs.length > 0 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', minWidth: 200 }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Top Feature Contributions</div>
          {contribs.slice(0, 5).map((c, i) => {
            const val = Number(c.contribution ?? c.value ?? 0);
            return (
              <div key={c.feature || c.name || i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: MUTED }}>{c.feature || c.name}</span>
                <span style={{ color: val > 0 ? GREEN : val < 0 ? RED : MUTED, fontFamily: 'monospace' }}>
                  {val >= 0 ? '+' : ''}{fmtN(val, 4)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Model Registry table ──────────────────────────────────────────────────────
function ModelRegistryTable({ models, championModel, onPromote, onViewImportance, onSelectChallenger, selectedChallengerId, importanceModelId }) {
  if (!models.length) return <div style={{ color: MUTED, fontSize: 12 }}>No trained models yet. Use the training panel above.</div>;
  const champId = championModel?.modelId || championModel?.id;
  const th = { padding: '6px 9px', fontSize: 11, color: MUTED, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
  const td = { padding: '5px 8px', fontSize: 11, borderBottom: `1px solid ${BORDER}22`, verticalAlign: 'middle' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr>
            <th style={th}>Model ID</th>
            <th style={th}>Type</th>
            <th style={{ ...th, textAlign: 'center' }}>Horizon</th>
            <th style={{ ...th, textAlign: 'right' }}>Train Acc</th>
            <th style={{ ...th, textAlign: 'right' }}>Val Acc</th>
            <th style={{ ...th, textAlign: 'right' }}>OOS Acc</th>
            <th style={{ ...th, textAlign: 'right' }}>OOS F1</th>
            <th style={th}>Trained At</th>
            <th style={th}>Status</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m, i) => {
            const mId = m.modelId || m.id;
            const isChamp  = mId && mId === champId;
            const isChall  = mId && mId === selectedChallengerId;
            const isImport = mId && mId === importanceModelId;
            const trainAcc = m.trainAccuracy ?? m.train_accuracy ?? m.metrics?.trainAccuracy;
            const valAcc   = m.valAccuracy   ?? m.val_accuracy   ?? m.metrics?.valAccuracy;
            const oosAcc   = m.oosAccuracy   ?? m.oos_accuracy   ?? m.testAccuracy ?? m.metrics?.oosAccuracy;
            const oosF1    = m.oosF1         ?? m.oos_f1         ?? m.f1           ?? m.metrics?.oosF1;
            const trainedAt = m.trainedAt || m.trained_at || m.createdAt;
            return (
              <tr key={mId || i} style={{ background: isChamp ? GREEN + '08' : isChall ? VIOLET + '08' : 'transparent' }}>
                <td style={{ ...td, fontFamily: 'monospace', color: TEXT }}>
                  {isChamp && <span style={{ color: GREEN, marginRight: 4, fontSize: 9 }}>★</span>}
                  …{shortId(mId)}
                </td>
                <td style={{ ...td, color: MUTED }}>{m.modelType || m.model_type || '—'}</td>
                <td style={{ ...td, textAlign: 'center', color: MUTED }}>{m.horizon || '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtPct(trainAcc, 1)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtPct(valAcc, 1)}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: Number(oosAcc) > 0.55 || (Number(oosAcc) <= 1 && Number(oosAcc) > 0.55) ? GREEN : TEXT }}>
                  {fmtPct(oosAcc, 1)}
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmtN(oosF1, 3)}</td>
                <td style={{ ...td, color: MUTED, fontSize: 10 }}>{trainedAt ? new Date(trainedAt).toLocaleString() : '—'}</td>
                <td style={td}>
                  {isChamp
                    ? <span style={{ background: GREEN + '22', color: GREEN, border: `1px solid ${GREEN}55`, borderRadius: 4, fontSize: 10, padding: '2px 6px', fontWeight: 700 }}>★ CHAMPION</span>
                    : <span style={{ background: SURFACE, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 4, fontSize: 10, padding: '2px 6px' }}>challenger</span>}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {!isChamp && (
                      <button onClick={() => onPromote(mId)} style={{ background: GREEN + '22', color: GREEN, border: `1px solid ${GREEN}44`, borderRadius: 4, fontSize: 10, padding: '2px 7px', cursor: 'pointer' }}>
                        ★ Promote
                      </button>
                    )}
                    <button onClick={() => onViewImportance(mId)} style={{ background: isImport ? BLUE + '44' : SURFACE, color: BLUE, border: `1px solid ${BLUE}44`, borderRadius: 4, fontSize: 10, padding: '2px 7px', cursor: 'pointer' }}>
                      Importance
                    </button>
                    {!isChamp && (
                      <button onClick={() => onSelectChallenger(mId === selectedChallengerId ? null : mId)} style={{ background: isChall ? VIOLET + '44' : SURFACE, color: VIOLET, border: `1px solid ${VIOLET}44`, borderRadius: 4, fontSize: 10, padding: '2px 7px', cursor: 'pointer' }}>
                        {isChall ? '✓ Selected' : 'Compare'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────────
export default function AILabWorkspace() {
  const s  = useAILabStore();
  const ml = useMLSignalStore();

  useEffect(() => { s.refreshAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Bootstrap: workspace mounts AFTER the event fires when user navigates here
    // from HistoricalData. Read the persisted selection from historicalDataStore.
    const { selectedMlDatasetId: histId, selectedMlDataset: histDataset } =
      useHistoricalDataStore.getState();
    if (histId && !useAILabStore.getState().selectedMlDatasetId) {
      s.setSelectedDataset(histId, histDataset);
    }

    function onDatasetMl(e) {
      const { datasetId, dataset } = e.detail || {};
      if (datasetId) s.setSelectedDataset(datasetId, dataset);
    }
    window.addEventListener('reversal:use-dataset-ml', onDatasetMl);
    return () => window.removeEventListener('reversal:use-dataset-ml', onDatasetMl);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load P1 signal when symbol changes
  useEffect(() => {
    if (s.symbol) {
      ml.loadSignal(s.symbol);
      ml.loadFeatures(s.symbol);
      ml.loadDiagnostics();
    }
  }, [s.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const champId = s.championModel?.modelId || s.championModel?.id;
  const mlSignal   = ml.signalBySymbol[s.symbol] || null;
  const mlFeatures = ml.featuresBySymbol[s.symbol] || null;
  const mlSigLoading = ml.signalLoading[s.symbol] || false;
  const mlSigError   = ml.signalError[s.symbol] || '';

  return (
    <section style={{ display: 'grid', gap: 12 }}>

      {/* Disclaimer */}
      <div style={{ ...panel, borderColor: '#7c2d12', background: '#111827' }}>
        <strong style={{ color: AMBER }}>AI Lab — measured analytics and ML signal research. Past model performance does not guarantee future results. Split methodology is strictly chronological (70/15/15). No random splits.</strong>
      </div>

      {/* Controls */}
      <div style={{ ...panel, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
        <label style={{ fontSize: 12, color: MUTED }}>Symbol
          <input
            value={s.symbol}
            onChange={(e) => s.setSymbol(e.target.value)}
            onBlur={() => { if (!s.symbol.trim()) s.setSymbol('SPY'); }}
            style={{ ...iStyle, width: '100%', marginTop: 3 }}
          />
        </label>
        <label style={{ fontSize: 12, color: MUTED }}>Horizon (bars)
          <input type="number" min="1" value={s.horizon} onChange={(e) => s.setHorizon(e.target.value)} style={{ ...iStyle, width: '100%', marginTop: 3 }} />
        </label>
        <label style={{ fontSize: 12, color: MUTED }}>Limit
          <input type="number" min="1" value={s.limit} onChange={(e) => s.setLimit(e.target.value)} style={{ ...iStyle, width: '100%', marginTop: 3 }} />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <button
            onClick={s.refreshAll}
            disabled={s.loading || s.analyticsLoading}
            style={{ background: BLUE, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            {(s.loading || s.analyticsLoading) ? 'Refreshing…' : '↻ Refresh All'}
          </button>
        </div>
      </div>

      {/* ── P1 ML Signal ──────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: TEXT }}>P1 ML Signal — {s.symbol}</h3>
          <button
            onClick={() => ml.refreshAll(s.symbol)}
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
          >
            Refresh Signal
          </button>
        </div>
        <MLSignalPanel
          signal={mlSignal}
          features={mlFeatures}
          loading={mlSigLoading}
          error={mlSigError}
        />
      </div>

      {/* ── P1 Diagnostics ────────────────────────────────────────────────── */}
      <div style={panel}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: TEXT }}>ML Diagnostics & Drift</h3>
        <MLDiagnosticsPanel
          diagnostics={ml.diagnostics}
          loading={ml.diagnosticsLoading}
          error={ml.diagnosticsError}
        />
      </div>

      {/* Error */}
      {(s.error || s.analyticsError) && (
        <div style={{ ...panel, borderColor: '#7f1d1d', color: '#fecaca', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>{s.error || s.analyticsError}</span>
          <button onClick={s.clearError} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #7f1d1d', borderRadius: 5, color: '#fecaca', cursor: 'pointer', padding: '2px 10px' }}>Dismiss</button>
        </div>
      )}

      {/* ── Model Training ──────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Model Training</strong>
          <span style={{ fontSize: 10, background: BLUE + '22', color: BLUE, border: `1px solid ${BLUE}44`, borderRadius: 4, padding: '2px 7px' }}>
            Chronological split: 70% train / 15% val / 15% test — no leakage
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>Model type</span>
            <select value={s.trainConfig.modelType} onChange={(e) => s.setTrainConfig({ modelType: e.target.value })} style={iStyle}>
              <option value="xgboost">XGBoost</option>
              <option value="lightgbm">LightGBM</option>
              <option value="random_forest">Random Forest</option>
              <option value="logistic_regression">Logistic Regression</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>N estimators</span>
            <input type="number" min="50" max="1000" step="50" value={s.trainConfig.nEstimators} onChange={(e) => s.setTrainConfig({ nEstimators: Number(e.target.value) })} style={{ ...iStyle, width: 80 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>Max depth</span>
            <input type="number" min="2" max="12" value={s.trainConfig.maxDepth} onChange={(e) => s.setTrainConfig({ maxDepth: Number(e.target.value) })} style={{ ...iStyle, width: 70 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>Learning rate</span>
            <input type="number" min="0.01" max="0.5" step="0.01" value={s.trainConfig.learningRate} onChange={(e) => s.setTrainConfig({ learningRate: Number(e.target.value) })} style={{ ...iStyle, width: 80 }} />
          </div>
          <button
            onClick={s.trainModel}
            disabled={s.trainLoading}
            style={{ background: VIOLET, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: s.trainLoading ? 'default' : 'pointer', opacity: s.trainLoading ? 0.7 : 1, alignSelf: 'flex-end' }}
          >
            {s.trainLoading ? 'Training…' : '⚡ Train Model'}
          </button>
        </div>

        {s.selectedMlDatasetId
          ? <div style={{ color: MUTED, fontSize: 12, marginTop: 8 }}>
              Selected dataset: <strong>{s.selectedMlDatasetId}</strong>
              {s.selectedMlDataset?.rowCount ? ` · ${s.selectedMlDataset.rowCount} rows` : ''}
            </div>
          : <div style={{ color: MUTED, fontSize: 12, marginTop: 8 }}>
              No historical dataset selected. Go to Historical Data and click "Use for ML Training".
            </div>
        }
        {s.trainError && <div style={{ color: RED, fontSize: 12, marginTop: 8 }}>{s.trainError}</div>}

        {s.trainingJob && (
          <div style={{ marginTop: 12, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
              <span>Status: <strong style={{ color: s.trainingJob.status === 'complete' ? GREEN : s.trainingJob.status === 'failed' ? RED : AMBER }}>{s.trainingJob.status || 'complete'}</strong></span>
              {s.trainingJob.modelId && <span>ID: <code style={{ fontSize: 11 }}>…{shortId(s.trainingJob.modelId)}</code></span>}
              {s.trainingJob.metrics?.oosAccuracy != null && <span>OOS Acc: <strong style={{ color: GREEN }}>{fmtPct(s.trainingJob.metrics.oosAccuracy, 1)}</strong></span>}
              {s.trainingJob.metrics?.oosF1 != null && <span>OOS F1: <strong>{fmtN(s.trainingJob.metrics.oosF1, 3)}</strong></span>}
              {s.trainingJob.message && <span style={{ color: MUTED }}>{s.trainingJob.message}</span>}
            </div>
            {s.trainingJob.splitInfo && (
              <div style={{ marginTop: 6, fontSize: 11, color: MUTED }}>
                Split — Train: <strong>{s.trainingJob.splitInfo.trainSize}</strong> · Val: <strong>{s.trainingJob.splitInfo.valSize}</strong> · Test: <strong>{s.trainingJob.splitInfo.testSize}</strong>
                {s.trainingJob.splitInfo.datasetHash && <> · Hash: <code>{String(s.trainingJob.splitInfo.datasetHash).slice(0, 12)}</code></>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Model Registry ──────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Model Registry</strong>
          {s.registryLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
          {s.modelRegistry.length > 0 && <span style={{ fontSize: 11, color: MUTED }}>{s.modelRegistry.length} model{s.modelRegistry.length !== 1 ? 's' : ''}</span>}
          <button onClick={s.loadModelRegistry} style={{ marginLeft: 'auto', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}>↻ Refresh</button>
        </div>
        {s.registryError && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{s.registryError}</div>}
        <ModelRegistryTable
          models={s.modelRegistry}
          championModel={s.championModel}
          onPromote={s.promoteToChampion}
          onViewImportance={s.loadFeatureImportance}
          onSelectChallenger={s.setSelectedChallengerModelId}
          selectedChallengerId={s.selectedChallengerModelId}
          importanceModelId={s.importanceModelId}
        />
      </div>

      {/* ── Champion + Inference ────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Champion Model &amp; Live Inference</strong>
          {s.championLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
          <button onClick={s.loadChampionModel} style={{ marginLeft: 'auto', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}>↻ Refresh</button>
        </div>

        {s.championError && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{s.championError}</div>}

        {s.championModel ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              ['Model ID',     `…${shortId(champId)}`],
              ['Type',         s.championModel.modelType || s.championModel.model_type || '—'],
              ['Horizon',      s.championModel.horizon || '—'],
              ['OOS Accuracy', fmtPct(s.championModel.oosAccuracy ?? s.championModel.metrics?.oosAccuracy ?? s.championModel.testAccuracy, 1)],
              ['OOS F1',       fmtN(s.championModel.oosF1 ?? s.championModel.metrics?.oosF1, 3)],
              ['Dataset Hash', String(s.championModel.datasetHash || s.championModel.dataset_hash || '—').slice(0, 12)],
            ].map(([label, val]) => (
              <div key={label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, color: MUTED }}>{label}</div>
                <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13, color: TEXT }}>{val}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: MUTED, fontSize: 12, marginBottom: 12 }}>No champion model. Train and promote a model.</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button
            onClick={s.runInference}
            disabled={s.inferenceLoading || !s.championModel}
            style={{ background: GREEN, color: '#000', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: (s.inferenceLoading || !s.championModel) ? 'default' : 'pointer', opacity: (s.inferenceLoading || !s.championModel) ? 0.5 : 1 }}
          >
            {s.inferenceLoading ? 'Running…' : '▶ Run Inference'}
          </button>
          {s.inferenceError && <span style={{ color: RED, fontSize: 12 }}>{s.inferenceError}</span>}
        </div>
        <InferenceDisplay r={s.inferenceResult} />
      </div>

      {/* ── Feature Importance ──────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Feature Importance</strong>
          {s.importanceLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
          {s.importanceModelId && <span style={{ fontSize: 11, color: MUTED }}>Model: …{shortId(s.importanceModelId)}</span>}
        </div>
        {s.importanceError && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{s.importanceError}</div>}
        <FeatureImportanceChart importance={s.featureImportance} />
      </div>

      {/* ── PSI Drift Monitoring ────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>PSI Drift Monitoring</strong>
          {s.driftLoading && <span style={{ color: MUTED, fontSize: 12 }}>Loading…</span>}
          <button
            onClick={() => s.loadDriftReport(champId)}
            disabled={s.driftLoading || !s.championModel}
            style={{ marginLeft: 'auto', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 11, padding: '3px 10px', cursor: 'pointer', opacity: s.championModel ? 1 : 0.5 }}
          >
            ↻ Check Drift
          </button>
        </div>
        <div style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: 11 }}>
          <span><span style={{ color: GREEN }}>■</span> {'<'}0.10 Stable</span>
          <span><span style={{ color: AMBER }}>■</span> 0.10–0.20 Slight</span>
          <span><span style={{ color: RED }}>■</span> {'>'}0.20 Significant</span>
        </div>
        {s.driftError && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{s.driftError}</div>}
        <DriftTable driftReport={s.driftReport} />
      </div>

      {/* ── Champion/Challenger Comparison ──────────────────────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong>Champion / Challenger Comparison</strong>
          {s.comparisonLoading && <span style={{ color: MUTED, fontSize: 12 }}>Running…</span>}
        </div>
        {s.comparisonError && <div style={{ color: RED, fontSize: 12, marginBottom: 8 }}>{s.comparisonError}</div>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: MUTED }}>Challenger:</span>
          <select
            value={s.selectedChallengerModelId || ''}
            onChange={(e) => s.setSelectedChallengerModelId(e.target.value || null)}
            style={{ ...iStyle, minWidth: 200 }}
          >
            <option value="">— select from registry —</option>
            {s.modelRegistry
              .filter((m) => (m.modelId || m.id) !== champId)
              .map((m) => {
                const mId = m.modelId || m.id;
                return <option key={mId} value={mId}>…{shortId(mId)} ({m.modelType || m.model_type || 'model'})</option>;
              })}
          </select>
          <button
            onClick={() => s.compareWithChampion(s.selectedChallengerModelId)}
            disabled={s.comparisonLoading || !s.selectedChallengerModelId || !s.championModel}
            style={{ background: VIOLET, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (s.comparisonLoading || !s.selectedChallengerModelId || !s.championModel) ? 0.5 : 1 }}
          >
            Compare
          </button>
        </div>
        <ComparisonTable result={s.comparisonResult} />
      </div>

      {/* ── Existing analytics (unchanged) ──────────────────────────────────── */}
      <div style={panel}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: TEXT }}>Regime Detection</h3>
        {!s.currentRegime
          ? <div style={{ color: MUTED }}>Regime unavailable.</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, fontSize: 13 }}>
              {Object.entries(s.currentRegime || {}).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => <div key={k}><b>{k}:</b> {String(v)}</div>)}
              {s.currentRegime?.warnings?.length > 0 && <div style={{ color: AMBER }}><b>Warnings:</b> {Array.isArray(s.currentRegime.warnings) ? s.currentRegime.warnings.join(', ') : s.currentRegime.warnings}</div>}
            </div>
          )}
      </div>

      <div style={panel}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: TEXT }}>Dataset Analytics</h3>
        {!s.datasetAnalytics
          ? <div style={{ color: MUTED }}>No dataset analytics yet.</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, fontSize: 13 }}>
              {Object.entries(s.datasetAnalytics || {}).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => <div key={k}><b>{k}:</b> {String(v)}</div>)}
              {(s.datasetAnalytics?.warnings?.length > 0 || s.datasetAnalytics?.insufficientData) && <div style={{ color: AMBER }}><b>Warnings:</b> {Array.isArray(s.datasetAnalytics.warnings) ? s.datasetAnalytics.warnings.join(', ') : 'Insufficient data'}</div>}
            </div>
          )}
      </div>

      <div style={panel}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: TEXT }}>Feature Analytics</h3>
        {!s.featureAnalytics
          ? <div style={{ color: MUTED }}>No feature analytics yet.</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, fontSize: 13 }}>
              {Object.entries(s.featureAnalytics || {}).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => <div key={k}><b>{k}:</b> {String(v)}</div>)}
            </div>
          )}
      </div>

      <div style={panel}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: TEXT }}>Regime Performance</h3>
        {!s.regimeAnalytics
          ? <div style={{ color: MUTED }}>No regime analytics yet.</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, fontSize: 13 }}>
              {Object.entries(s.regimeAnalytics || {}).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => <div key={k}><b>{k}:</b> {String(v)}</div>)}
            </div>
          )}
      </div>

      <div style={panel}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: TEXT }}>Analytics Actions</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={s.analyzeDataset} disabled={s.analyticsLoading} style={{ background: BLUE, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Analyze Dataset
          </button>
          <button onClick={s.clearDatasetAnalytics} disabled={s.analyticsLoading} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
            Clear Analytics
          </button>
        </div>
        <div style={{ color: MUTED, marginTop: 8, fontSize: 12 }}>Last updated: {fmtDate(s.lastUpdated)}</div>
      </div>

    </section>
  );
}
