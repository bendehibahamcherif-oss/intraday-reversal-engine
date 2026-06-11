import { useEffect, useState } from 'react';
import { safeHistoricalError, useHistoricalDataStore } from '../store/historicalDataStore.js';
import { getDatasetId } from '../utils/datasets.js';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return mobile;
}

// ── Constants (mirrors backend canonicalSchema) ───────────────────────────────
const TIMEFRAMES  = ['1m', '5m', '15m', '30m', '1h', '1d'];
const SESSIONS    = ['RTH', 'EXTENDED', 'ALL'];
const PURPOSES    = ['ml', 'backtest', 'correlation', 'general'];
const FORMATS     = ['csv', 'json'];

export function parseSymbols(value) {
  return String(value || '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .filter((symbol, index, arr) => arr.indexOf(symbol) === index);
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    display: 'flex',
    height: '100%',
    maxWidth: '100%',
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
    minWidth: 0,
    maxWidth: '100%',
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
    maxWidth: '100%',
    boxSizing: 'border-box',
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
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
    lineHeight: 'normal',
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
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflowWrap: 'anywhere',
  }),
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 24,
    fontSize: 9,
    padding: '1px 5px',
    background: 'var(--t-bg-3)',
    border: '1px solid var(--t-border)',
    borderRadius: 2,
    color: 'var(--t-text-3)',
    marginRight: 3,
  },
  chip: (color) => ({
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 24,
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
    <div style={{ overflow: 'auto', flex: 1, minWidth: 0, maxWidth: '100%' }}>
      {datasets.map((ds) => (
        <div
          key={getDatasetId(ds)}
          style={S.datasetRow(getDatasetId(ds) === selectedDatasetId)}
          onClick={() => onSelect(getDatasetId(ds))}
        >
          <div className="historical-detail-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0, maxWidth: '100%' }}>
            <span className="historical-long-text" style={{ flex: '1 1 auto', fontWeight: 700, fontSize: 11, minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{getDatasetId(ds)}</span>
            <button
              className="historical-action-button historical-icon-button"
              style={{ ...S.btn(false), flex: '0 0 auto', padding: '1px 6px', fontSize: 10 }}
              onClick={(e) => { e.stopPropagation(); onDelete(getDatasetId(ds)); }}
              title="Remove dataset"
            >✕</button>
          </div>
          <div style={{ color: 'var(--t-text-3)', fontSize: 10, minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {(ds.symbols || []).join(', ')} &nbsp;·&nbsp; {ds.timeframe} &nbsp;·&nbsp;
            {ds.startDate} → {ds.endDate}
          </div>
          <div style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            <span className="historical-status-text" style={S.tag}>{ds.provider}</span>
            <span className="historical-status-text" style={S.tag}>{ds.session}</span>
            <span className="historical-status-text" style={S.tag}>{ds.purpose}</span>
            {ds.rowCount != null && <span className="historical-status-text" style={S.tag}>{ds.rowCount} rows</span>}
            {ds.status && (
              <span className="historical-status-text" style={S.chip(
                ds.status === 'ready' ? '#2a7' :
                ds.status === 'file_missing' ? '#a44' : '#a72'
              )}>{ds.status}</span>
            )}
            {ds.fileExists === false && ds.status !== 'file_missing' && (
              <span className="historical-status-text" style={S.chip('#a44')}>file missing</span>
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
    <form onSubmit={handleSubmit} style={{ padding: 12, maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      {(localError || error) && <div style={S.error}>{localError || error}</div>}
      {result && result.ok && (
        <div style={S.success}>
          Downloaded dataset → {result.dataset?.datasetId || result.datasetId || 'ready'}
        </div>
      )}
      {result && !result.ok && !error && (
        <div style={S.error}>{safeHistoricalError(result.error?.message || result.error || result.message, 'Historical data is unavailable.')}</div>
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

      <div className="historical-responsive-row" style={{ display: 'flex', gap: 8, marginBottom: 10, minWidth: 0 }}>
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

      <div className="historical-responsive-row" style={{ display: 'flex', gap: 8, marginBottom: 10, minWidth: 0 }}>
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

      <button type="submit" className="historical-action-button" style={S.btn(true)} disabled={loading}>
        {loading ? 'Downloading…' : 'Download'}
      </button>
    </form>
  );
}

// ── Dataset detail / use panel ─────────────────────────────────────────────────
const S_ACTION_BTN = (accent) => ({
  ...S.btn(accent),
  minHeight: 44,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  fontSize: 12,
  fontWeight: accent ? 700 : 500,
});

function DatasetDetail({ dataset, diagnostics, diagnosticsLoading, onUseForML, onUseForBacktest, onUseForCorrelation }) {
  if (!dataset) {
    return (
      <div style={{ padding: 12, color: 'var(--t-text-3)', fontSize: 11 }} data-testid="dataset-detail-empty">
        Select a dataset from the list to view details and connect it to ML, Backtest, or Correlation.
      </div>
    );
  }

  const fileMissing = diagnostics
    ? !diagnostics.fileExists
    : dataset.status === 'file_missing' || dataset.fileExists === false;

  return (
    <div className="dataset-detail-card" data-testid="dataset-detail-panel" style={{ padding: 12, width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden', minWidth: 0 }}>
      <div style={{ marginBottom: 10, minWidth: 0 }}>
        <div className="historical-long-text" data-testid="dataset-detail-id" style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }}>{getDatasetId(dataset)}</div>

        {fileMissing && (
          <div style={{
            marginBottom: 8,
            padding: '6px 8px',
            background: 'rgba(180,40,40,.12)',
            border: '1px solid rgba(180,40,40,.4)',
            borderRadius: 3,
            fontSize: 11,
            color: 'var(--t-red, #f77)',
          }}>
            Dataset file missing on server. Re-download this dataset before using it.
          </div>
        )}

        {diagnosticsLoading && (
          <div style={{ fontSize: 10, color: 'var(--t-text-3)', marginBottom: 6 }}>Checking file…</div>
        )}


        <div className="historical-table-wrap" style={{ maxWidth: '100%', minWidth: 0, overflowX: 'auto' }}>
        <table className="historical-detail-table" style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%', maxWidth: '100%', tableLayout: 'fixed' }}>
          <tbody>
            {[
              ['Dataset ID', getDatasetId(dataset)],
              ['Symbols',   (dataset.symbols || []).join(', ') || '—'],
              ['Timeframe', dataset.timeframe],
              ['Range',     `${dataset.startDate} → ${dataset.endDate}`],
              ['Provider',  dataset.provider],
              ['Session',   dataset.session],
              ['Purpose',   dataset.purpose],
              ['Rows',      dataset.rowCount != null ? String(dataset.rowCount) : '—'],
              ['File',      diagnostics
                ? (diagnostics.fileExists
                    ? `✓ exists (${diagnostics.fileSizeBytes != null ? Math.round(diagnostics.fileSizeBytes / 1024) + ' KB' : 'ok'})`
                    : '✗ missing')
                : (dataset.status || '—')],
              ['CSV File',   dataset.files?.csv || '—'],
              ['Rows By Symbol', Object.keys(dataset.rowsBySymbol || {}).length ? Object.entries(dataset.rowsBySymbol || {}).map(([k, v]) => `${k}: ${v}`).join(', ') : '—'],
              ['Warnings',   (dataset.warnings || []).join(', ') || '—'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ color: 'var(--t-text-3)', paddingRight: 10, paddingBottom: 2, whiteSpace: 'nowrap', width: 112, maxWidth: '38%', verticalAlign: 'top' }}>{k}</td>
                <td className={`dataset-value-cell historical-long-text ${k === 'CSV File' || k === 'Warnings' ? 'historical-path-text' : ''}`} style={{ paddingBottom: 2, overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: k === 'CSV File' || k === 'Warnings' ? 'pre-wrap' : 'normal', minWidth: 0, maxWidth: '100%' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--t-border)', paddingTop: 10 }}>
        <div style={{ fontSize: 10, color: 'var(--t-text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Use in
        </div>
        {fileMissing ? (
          <div style={{ fontSize: 11, color: 'var(--t-red, #f77)', padding: '4px 0' }}>
            Dataset file missing on server. Re-download dataset to use it.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="dataset-actions">
            <button className="historical-action-button" style={S_ACTION_BTN(true)} onClick={() => onUseForML(dataset)} data-testid="btn-use-for-ml" aria-label="Use for ML Training">
              Use for ML Training
            </button>
            <button className="historical-action-button" style={S_ACTION_BTN(false)} onClick={() => onUseForBacktest(dataset)} data-testid="btn-use-for-backtest" aria-label="Use for Backtesting">
              Use for Backtesting
            </button>
            <button className="historical-action-button" style={S_ACTION_BTN(false)} onClick={() => onUseForCorrelation(dataset)} data-testid="btn-use-for-correlation" aria-label="Use for Correlation">

              Use for Correlation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function HistoricalDataWorkspace() {
  const store = useHistoricalDataStore();
  const isMobile = useIsMobile();
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

  async function handleUseForML(dataset) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[HistoricalDataWorkspace] useDatasetForMl', {
        action: 'useDatasetForMl',
        datasetId: getDatasetId(dataset),
        dataset,
        selectedMlDatasetId: getDatasetId(dataset),
      });
    }
    const result = await store.useDatasetForMl(dataset);
    if (!result.ok) return notify(result.error, true);
    window.dispatchEvent(new CustomEvent('reversal:use-dataset-ml', { detail: { datasetId: result.datasetId, dataset: result.dataset || dataset } }));
    notify(`Dataset "${result.datasetId}" sent to ML Engine`);
  }

  async function handleUseForBacktest(dataset) {
    const result = await store.useDatasetForBacktest(dataset);
    if (!result.ok) return notify(result.error, true);
    window.dispatchEvent(new CustomEvent('reversal:use-dataset-backtest', { detail: { datasetId: result.datasetId, dataset: result.dataset || dataset } }));
    notify(`Dataset "${result.datasetId}" sent to Backtesting`);
  }

  async function handleUseForCorrelation(dataset) {
    const result = await store.useDatasetForCorrelation(dataset);
    if (!result.ok) return notify(result.error, true);
    window.dispatchEvent(new CustomEvent('reversal:use-dataset-correlation', { detail: { datasetId: result.datasetId, dataset: result.dataset || dataset } }));
    notify(`Dataset "${result.datasetId}" sent to Correlation`);
  }

  const tabs = [
    { id: 'download', label: 'Download' },
    { id: 'detail',   label: 'Detail' },
  ];

  const rootStyle = {
    ...S.root,
    flexDirection: isMobile ? 'column' : 'row',
    overflowX: 'hidden',
    overflowY: isMobile ? 'auto' : 'hidden',
  };
  const panelStyle = {
    ...S.panel,
    width: isMobile ? '100%' : 320,
    minWidth: 0,
    maxWidth: '100%',
    maxHeight: isMobile ? 240 : undefined,
    borderRight: isMobile ? 'none' : '1px solid var(--t-border)',
    borderBottom: isMobile ? '1px solid var(--t-border)' : 'none',
    flexShrink: isMobile ? 0 : 0,
    overflow: 'auto',
  };
  const mainStyle = {
    ...S.main,
    minWidth: 0,
    maxWidth: '100%',
    paddingBottom: isMobile ? 80 : 0,
  };

  return (
    <div className="historical-data-workspace" data-testid="historical-data-workspace" style={rootStyle}>
      {/* Dataset list panel */}
      <div style={panelStyle} data-testid="dataset-list-panel">
        <div style={S.header}>
          <span style={S.headerTitle}>Historical Datasets</span>
          <button
            className="historical-action-button historical-icon-button"
            style={{ ...S.btn(false), marginLeft: 'auto', padding: '2px 8px', fontSize: 10 }}
            onClick={() => store.fetchDatasets()}
            disabled={store.datasetsLoading}
            title="Refresh"
            aria-label="Refresh datasets"
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

      {/* Detail / download panel */}
      <div style={mainStyle}>
        <div style={S.header}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className="historical-action-button"
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
            <span className="historical-long-text historical-toast-text" style={{
              marginLeft: 'auto',
              fontSize: 10,
              padding: '2px 8px',
              color: notification.isError ? 'var(--t-red,#f44)' : 'var(--t-green,#4f4)',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              minWidth: 0,
              maxWidth: isMobile ? '55%' : '70%',
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
              diagnostics={store.diagnostics}
              diagnosticsLoading={store.diagnosticsLoading}
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
