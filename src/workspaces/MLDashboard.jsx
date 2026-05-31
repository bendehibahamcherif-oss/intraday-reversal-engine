import { useEffect, useState } from 'react';
import { useMLStore } from '../store/mlStore.js';
import MLSignalPanel from '../components/MLSignalPanel.jsx';
import MLDiagnosticsPanel from '../components/MLDiagnosticsPanel.jsx';
import ModelHealthCard from '../components/ModelHealthCard.jsx';
import FeatureImportanceTable from '../components/FeatureImportanceTable.jsx';
import TrainingRunsPanel from '../components/TrainingRunsPanel.jsx';
import PredictionHistoryTable from '../components/PredictionHistoryTable.jsx';
import DriftDashboard from '../components/DriftDashboard.jsx';
import ModelCardViewer from '../components/ModelCardViewer.jsx';
import { useActiveSymbolStore } from '../store/activeSymbolStore.js';

const TABS = [
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'model-card',   label: 'Model Card' },
  { id: 'runs',         label: 'Training Runs' },
  { id: 'history',      label: 'Predictions' },
  { id: 'drift',        label: 'Drift' },
  { id: 'features',     label: 'Features' },
];

const S = {
  root:    { display: 'flex', flexDirection: 'column', height: '100%', background: '#050505', color: '#e0e0f0', overflow: 'hidden' },
  header:  { padding: '14px 20px 0', borderBottom: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 },
  tabBar:  { display: 'flex', gap: 4, paddingBottom: 0 },
  tab:     (active) => ({
    padding: '7px 16px',
    borderRadius: '6px 6px 0 0',
    border: '1px solid',
    borderBottom: active ? '1px solid #050505' : '1px solid #1f2937',
    borderColor: active ? '#2563eb #2563eb #050505' : '#1f2937',
    background: active ? '#050505' : '#0d0d1a',
    color: active ? '#60a5fa' : '#6b7280',
    fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer',
  }),
  body:    { flex: 1, overflow: 'auto', padding: 20 },
  grid2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' },
  grid3:   { display: 'grid', gridTemplateColumns: '300px 1fr 1fr', gap: 16, alignItems: 'start' },
  card:    { background: '#0d0d1a', border: '1px solid #1f2937', borderRadius: 10, padding: 16 },
  sec:     { fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
};

export default function MLDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [symbol, setSymbol] = useState('');

  const activeSymbol = useActiveSymbolStore?.((s) => s.symbol) || '';

  const signalBySymbol  = useMLStore((s) => s.signalBySymbol);
  const signalLoading   = useMLStore((s) => s.signalLoading);
  const diagnostics     = useMLStore((s) => s.diagnostics);
  const diagLoading     = useMLStore((s) => s.diagnosticsLoading);
  const featureImportance = useMLStore((s) => s.featureImportance);
  const importanceLoading = useMLStore((s) => s.importanceLoading);
  const importanceError   = useMLStore((s) => s.importanceError);
  const predictionHistory = useMLStore((s) => s.predictionHistory);
  const predictionsLoading = useMLStore((s) => s.predictionsLoading);
  const predictionsError   = useMLStore((s) => s.predictionsError);

  const loadSignal           = useMLStore((s) => s.loadSignal);
  const fetchHealth          = useMLStore((s) => s.fetchHealth);
  const fetchModelInfo       = useMLStore((s) => s.fetchModelInfo);
  const fetchTrainingRuns    = useMLStore((s) => s.fetchTrainingRuns);
  const fetchFeatureImportance = useMLStore((s) => s.fetchFeatureImportance);
  const fetchPredictionHistory = useMLStore((s) => s.fetchPredictionHistory);
  const fetchDriftMetrics    = useMLStore((s) => s.fetchDriftMetrics);
  const fetchModelCard       = useMLStore((s) => s.fetchModelCard);
  const loadDiagnostics      = useMLStore((s) => s.loadDiagnostics);
  const promoteModel         = useMLStore((s) => s.promoteModel);

  const sym = (symbol || activeSymbol || 'SPY').toUpperCase();
  const signal = signalBySymbol[sym];

  // Initial load
  useEffect(() => {
    fetchHealth();
    fetchModelInfo();
    fetchTrainingRuns();
    loadDiagnostics();
    fetchFeatureImportance();
  }, []);

  // Load on tab change
  useEffect(() => {
    if (activeTab === 'history')   fetchPredictionHistory();
    if (activeTab === 'drift')     fetchDriftMetrics();
    if (activeTab === 'model-card') fetchModelCard();
    if (activeTab === 'features')  fetchFeatureImportance();
  }, [activeTab]);

  // Load signal when symbol changes
  useEffect(() => {
    if (sym) loadSignal(sym);
  }, [sym]);

  const handlePromote = async (version) => {
    try { await promoteModel(version); } catch (err) { alert(err.message); }
  };

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 900 }}>ML Signal Engine</span>
            <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 12 }}>Phase 9 · XGBoost · tradable_v1</span>
          </div>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder={`Symbol (${sym})`}
            style={{
              background: '#050505', border: '1px solid #1f2937', borderRadius: 8,
              color: '#e0e0f0', padding: '6px 10px', fontSize: 12, width: 140,
            }}
          />
        </div>
        {/* Tab bar */}
        <div style={S.tabBar}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={S.tab(activeTab === t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={S.body}>

        {/* ── Dashboard tab ───────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Top row: signal + health */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
              <div style={S.card}>
                <div style={S.sec}>Live Signal — {sym}</div>
                <MLSignalPanel
                  symbol={sym}
                  signal={signal}
                  loading={signalLoading[sym]}
                  onRefresh={() => loadSignal(sym)}
                />
              </div>
              <ModelHealthCard onPromoteChallenger={handlePromote} showPromoteButton />
            </div>

            {/* Bottom row: diagnostics */}
            <div style={S.card}>
              <div style={S.sec}>ML Diagnostics & Drift</div>
              <MLDiagnosticsPanel
                diagnostics={diagnostics}
                loading={diagLoading}
              />
            </div>
          </div>
        )}

        {/* ── Model Card tab ───────────────────────────────────────────────────── */}
        {activeTab === 'model-card' && (
          <div style={{ maxWidth: 800 }}>
            <ModelCardViewer />
          </div>
        )}

        {/* ── Training Runs tab ────────────────────────────────────────────────── */}
        {activeTab === 'runs' && (
          <div style={{ maxWidth: 900 }}>
            <TrainingRunsPanel onPromote={handlePromote} />
          </div>
        )}

        {/* ── Predictions tab ─────────────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <PredictionHistoryTable
            predictions={predictionHistory}
            loading={predictionsLoading}
            error={predictionsError}
          />
        )}

        {/* ── Drift tab ───────────────────────────────────────────────────────── */}
        {activeTab === 'drift' && (
          <div style={{ maxWidth: 800 }}>
            <DriftDashboard />
          </div>
        )}

        {/* ── Features tab ────────────────────────────────────────────────────── */}
        {activeTab === 'features' && (
          <div style={{ maxWidth: 900 }}>
            <div style={{ ...S.card, marginBottom: 16 }}>
              <div style={S.sec}>Feature Importance — Champion Model</div>
              <FeatureImportanceTable
                features={featureImportance}
                loading={importanceLoading}
                error={importanceError}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
