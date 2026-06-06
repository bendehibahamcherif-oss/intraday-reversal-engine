import { useEffect, useState } from 'react';
import { useHistoricalDataStore } from '../store/historicalDataStore.js';

// ── Constants (mirrors backend canonicalSchema) ───────────────────────────────
const TIMEFRAMES  = ['1m', '5m', '15m', '30m', '1h', '1d'];
const SESSIONS    = ['RTH', 'EXTENDED', 'ALL'];
const PURPOSES    = ['ml', 'backtest', 'correlation', 'general'];
const FORMATS     = ['csv', 'json'];

export function parseSymbols(value) {
  return String(value || '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    display: 'flex',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--t-bg)',
    color: 'var(--t-text)',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  panel: {
    width: 320,
    borderRight: '1px solid var(--t-border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flexShrink: 0,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--t-border)',
    background: 'var(--t-bg-2)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--t-accent)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: 12,
  },
  label: {
    display: 'block',
    fontSize: 10,
    color: 'var(--t-text-3)',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    width: '100%',
    background: 'var(--t-bg-3)',
    border: '1px solid var(--t-border)',
    color: 'var(--t-text)',
    fontFamily: 'monospace',
    fontSize: 12,
    padding: '4px 6px',
    borderRadius: 2,
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    background: 'var(--t-bg-3)',
    border: '1px solid var(--t-border)',
    color: 'var(--t-text)',
    fontFamily: 'monospace',
    fontSize: 12,
    padding: '4px 6px',
    borderRadius: 2,
    boxSizing: 'border-box',
  },
  fieldGroup: {
    marginBottom: 10,
  },
  btn: (accent) => ({
    padding: '5px 12px',
    background: accent ? 'var(--t-accent)' : 'var(--t-bg-3)',
    color: accent ? 'white' : 'var(--t-text)',
    border: '1px solid var(--t-border)',
    borderRadius: 2,
    fontFamily: 'monospace',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: accent ? 700 : 400,
  }),
  error: {
    color: 'var(--t-red, #f44)',
    fontSize: 11,
    padding: '6px 8px',
    background: 'rgba(255,60,60,.08)',
    border: '1px solid rgba(255,60,60,.2)',
    borderRadius: 2,
    marginBottom: 8,
  },
  success: {
    color: 'var(--t-green, #4f4)',
    fontSize: 11,
    padding: '6px 8px',
    background: 'rgba(60,255,60,.08)',
    border: '1px solid rgba(60,255,60,.2)',
    borderRadius: 2,
    marginBottom: 8,
  },
  datasetRow: (selected) => ({
    padding: '6px 10px',
    borderBottom: '1px solid var(--t-border)',
    background: selected ? 'rgba(var(--t-accent-rgb,65,105,225),.15)' : 'transparent',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }),
  tag: {
    display: 'inline-block',
    fontSize: 9,
    padding: '1px 5px',
    background: 'var(--t-bg-3)',
    border: '1px solid var(--t-border)',
    borderRadius: 2,
    color: 'var(--t-text-3)',
    marginRight: 3,
  },
  chip: (color) => ({
    display: 'inline-block',
    fontSize: 9,
    padding: '1px 5px',
    background: color,
    borderRadius: 2,
    color: 'white',
    fontWeight: 700,
    marginLeft: 4,
  }),
};

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Dataset list panel ────────────────────────────────────────────────────────
function DatasetList({ datasets, selectedDatasetId, onSelect, onDelete }) {
  if (!datasets.length) {
    return (
      <div style={{ padding: 12, color: 'var(--t-text-3)', fontSize: 11 }}>
        No datasets yet. Use the Download panel to fetch historical data.
      </div>
    );
  }
  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {datasets.map((ds) => (
        <div
          key={ds.datasetId}
          style={S.datasetRow(ds.datasetId === selectedDatasetId)}
          onClick={() => onSelect(ds.datasetId)}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 11 }}>{ds.datasetId}</span>
            <button
              style={{ ...S.btn(false), padding: '1px 6px', fontSize: 10 }}
              onClick={(e) => { e.stopPropagation(); onDelete(ds.datasetId); }}
              title="Remove dataset"
            >✕</button>
          </div>
          <div style={{ color: 'var(--t-text-3)', fontSize: 10 }}>
            {(ds.symbols || []).join(', ')} &nbsp;·&nbsp; {ds.timeframe} &nbsp;·&nbsp;
            {ds.startDate} → {ds.endDate}
          </div>
          <div>
            <span style={S.tag}>{ds.provider}</span>
            <span style={S.tag}>{ds.session}</span>
            <span style={S.tag}>{ds.purpose}</span>
            {ds.rowCount != null && <span style={S.tag}>{ds.rowCount} rows</span>}
            {ds.status && (
              <span style={S.chip(ds.status === 'ready' ? '#2a7' : '#a72')}>{ds.status}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Download form ─────────────────────────────────────────────────────────────
export function DownloadForm({ providers, onDownload, loading, error, result, onClear }) {
  const [form, setForm] = useState({
    provider:   'auto',
    symbols:    'SPY',
    timeframe:  '1d',
    startDate:  daysAgo(365),
    endDate:    today(),
    session:    'RTH',
    purpose:    'general',
    formats:    ['csv'],
    forceRefresh: false,
  });
  const [localError, setLocalError] = useState('');

  function setField(k, v) {
    setLocalError('');
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleFormat(fmt) {
    setForm((f) => {
      const has = f.formats.includes(fmt);
      if (has && f.formats.length === 1) return f; // keep at least one
      return { ...f, formats: has ? f.formats.filter((x) => x !== fmt) : [...f.formats, fmt] };
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    onClear();
    const symbols = parseSymbols(form.symbols);
    if (symbols.length === 0) {
      setLocalError('At least one symbol is required.');
      return;
    }
    const payload = {
      provider:     form.provider,
      symbols,
      timeframe:    form.timeframe,
      startDate:    form.startDate,
      endDate:      form.endDate || today(),
      session:      form.session,
      purpose:      form.purpose,
      outputFormat: form.formats,
      forceRefresh: form.forceRefresh,
    };
    if (import.meta.env.DEV) console.debug('historical download payload', payload);
    onDownload(payload);
  }

  const providerOptions = [
    { id: 'auto', label: 'Auto (best available)' },
    ...(providers || []).filter((p) => p.id !== 'fallback_demo').map((p) => ({
      id: p.id,
      label: `${p.label || p.id}${p.hasCredentials === false ? ' (no key)' : ''}`,
    })),
  ];

  return (
    <form onSubmit={handleSubmit} style={{ padding: 12 }}>
      {(localError || error) && <div style={S.error}>{localError || error}</div>}
      {result && result.ok && (
        <div style={S.success}>
          Downloaded {result.totalRows} rows → {result.datasetId}
        </div>
      )}
      {result && !result.ok && !error && (
        <div style={S.error}>{result.error?.message || 'Download failed'}</div>
      )}

      <div style={S.fieldGroup}>
        <label style={S.label}>Provider</label>
        <select style={S.select} value={form.provider} onChange={(e) => setField('provider', e.target.value)}>
          {providerOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      <div style={S.fieldGroup}>
        <label style={S.label}>Symbols (comma-separated, max 20)</label>
        <input
          style={S.input}
          value={form.symbols}
          onChange={(e) => setField('symbols', e.target.value)}
          placeholder="SPY, QQQ, IWM"
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Timeframe</label>
          <select style={S.select} value={form.timeframe} onChange={(e) => setField('timeframe', e.target.value)}>
            {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Session</label>
          <select style={S.select} value={form.session} onChange={(e) => setField('session', e.target.value)}>
            {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Start Date</label>
          <input
            type="date"
            style={S.input}
            value={form.startDate}
            onChange={(e) => setField('startDate', e.target.value)}
            required
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>End Date</label>
          <input
            type="date"
            style={S.input}
            value={form.endDate}
            onChange={(e) => setField('endDate', e.target.value)}
            required
          />
        </div>
      </div>

      <div style={S.fieldGroup}>
        <label style={S.label}>Purpose</label>
        <select style={S.select} value={form.purpose} onChange={(e) => setField('purpose', e.target.value)}>
          {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div style={S.fieldGroup}>
        <label style={S.label}>Output Format</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {FORMATS.map((fmt) => (
            <label key={fmt} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.formats.includes(fmt)}
                onChange={() => toggleFormat(fmt)}
              />
              {fmt.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      <div style={{ ...S.fieldGroup, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          id="forceRefresh"
          checked={form.forceRefresh}
          onChange={(e) => setField('forceRefresh', e.target.checked)}
        />
        <label htmlFor="forceRefresh" style={{ fontSize: 11, cursor: 'pointer' }}>Force re-download</label>
      </div>

      <button type="submit" style={S.btn(true)} disabled={loading}>
        {loading ? 'Downloading…' : 'Download'}
      </button>
    </form>
  );
}

// ── Dataset detail / use panel ─────────────────────────────────────────────────
function DatasetDetail({ dataset, onUseForML, onUseForBacktest, onUseForCorrelation }) {
  if (!dataset) {
    return (
      <div style={{ padding: 12, color: 'var(--t-text-3)', fontSize: 11 }}>
        Select a dataset from the list to view details and connect it to ML, Backtest, or Correlation.
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{dataset.datasetId}</div>
        <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {[
              ['Symbols',   (dataset.symbols || []).join(', ')],
              ['Timeframe', dataset.timeframe],
              ['Range',     `${dataset.startDate} → ${dataset.endDate}`],
              ['Provider',  dataset.provider],
              ['Session',   dataset.session],
              ['Purpose',   dataset.purpose],
              ['Rows',      dataset.rowCount != null ? String(dataset.rowCount) : '—'],
              ['Status',    dataset.status || '—'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ color: 'var(--t-text-3)', paddingRight: 10, paddingBottom: 2, whiteSpace: 'nowrap' }}>{k}</td>
                <td style={{ paddingBottom: 2 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: '1px solid var(--t-border)', paddingTop: 10 }}>
        <div style={{ fontSize: 10, color: 'var(--t-text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Use in
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button style={S.btn(true)} onClick={() => onUseForML(dataset.datasetId)}>
            Use for ML Training
          </button>
          <button style={S.btn(false)} onClick={() => onUseForBacktest(dataset.datasetId)}>
            Use for Backtesting
          </button>
          <button style={S.btn(false)} onClick={() => onUseForCorrelation(dataset.datasetId)}>
            Use for Correlation
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function HistoricalDataWorkspace() {
  const store = useHistoricalDataStore();
  const [activeTab, setActiveTab] = useState('download'); // 'download' | 'detail'
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    store.fetchProviders();
    store.fetchDatasets();
  }, []);

  function notify(msg, isError = false) {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 4000);
  }

  function handleSelect(datasetId) {
    store.selectDataset(datasetId);
    setActiveTab('detail');
  }

  function handleDelete(datasetId) {
    store.deleteDataset(datasetId).then(() => {
      if (store.selectedDatasetId === datasetId) setActiveTab('download');
    });
  }

  function handleDownload(params) {
    store.downloadData(params).catch(() => {}); // error shown in form
  }

  function handleUseForML(datasetId) {
    // Navigate to ML Engine workspace with the dataset pre-selected
    // We dispatch a custom event that MLDashboard listens for
    window.dispatchEvent(new CustomEvent('reversal:use-dataset-ml', { detail: { datasetId } }));
    notify(`Dataset "${datasetId}" sent to ML Engine.`);
  }

  function handleUseForBacktest(datasetId) {
    window.dispatchEvent(new CustomEvent('reversal:use-dataset-backtest', { detail: { datasetId } }));
    notify(`Dataset "${datasetId}" sent to Quant Lab.`);
  }

  function handleUseForCorrelation(datasetId) {
    window.dispatchEvent(new CustomEvent('reversal:use-dataset-correlation', { detail: { datasetId } }));
    notify(`Dataset "${datasetId}" sent to Live Markets correlation.`);
  }

  const tabs = [
    { id: 'download', label: 'Download' },
    { id: 'detail',   label: 'Detail' },
  ];

  return (
    <div style={S.root}>
      {/* Left panel: dataset list */}
      <div style={S.panel}>
        <div style={S.header}>
          <span style={S.headerTitle}>Historical Datasets</span>
          <button
            style={{ ...S.btn(false), marginLeft: 'auto', padding: '2px 8px', fontSize: 10 }}
            onClick={() => store.fetchDatasets()}
            disabled={store.datasetsLoading}
            title="Refresh"
          >⟳</button>
        </div>
        {store.datasetsError && <div style={{ ...S.error, margin: 8 }}>{store.datasetsError}</div>}
        {store.datasetsLoading && (
          <div style={{ padding: 12, color: 'var(--t-text-3)', fontSize: 11 }}>Loading…</div>
        )}
        <DatasetList
          datasets={store.datasets}
          selectedDatasetId={store.selectedDatasetId}
          onSelect={handleSelect}
          onDelete={handleDelete}
        />
      </div>

      {/* Right panel */}
      <div style={S.main}>
        <div style={S.header}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              style={{
                ...S.btn(activeTab === tab.id),
                padding: '3px 10px',
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          {notification && (
            <span style={{
              marginLeft: 'auto',
              fontSize: 10,
              padding: '2px 8px',
              color: notification.isError ? 'var(--t-red,#f44)' : 'var(--t-green,#4f4)',
            }}>
              {notification.msg}
            </span>
          )}
        </div>

        <div style={S.body}>
          {activeTab === 'download' && (
            <DownloadForm
              providers={store.providers}
              onDownload={handleDownload}
              loading={store.downloadLoading}
              error={store.downloadError}
              result={store.downloadResult}
              onClear={store.clearDownloadResult}
            />
          )}
          {activeTab === 'detail' && (
            <DatasetDetail
              dataset={store.selectedDataset}
              onUseForML={handleUseForML}
              onUseForBacktest={handleUseForBacktest}
              onUseForCorrelation={handleUseForCorrelation}
            />
          )}
        </div>
      </div>
    </div>
  );
}
