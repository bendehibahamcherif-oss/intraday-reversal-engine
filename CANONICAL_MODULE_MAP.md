# Canonical Module Map

**Project:** intraday-reversal-engine  
**Purpose:** Defines the authoritative post-deduplication module list. Each entry is the single source of truth for its feature area. All workspace registry IDs, backend routes, stores, and API functions that are not listed as canonical here must be removed or redirected to the canonical form.  
**Date:** 2026-06-09  
**Prerequisite reading:** `FUNCTIONAL_DUPLICATE_AUDIT.md`

---

## Module Registry (18 Canonical Modules)

### 1. ChartOrderflow — Chart + Volume Profile

| Field | Value |
|---|---|
| **Canonical ID** | `ChartOrderflow` |
| **Label** | Chart |
| **Component file** | `src/workspaces/ChartOrderflowWorkspace.jsx` |
| **ComponentKey** | `ChartOrderflow` |
| **Sub-features (tabs)** | Chart view, Orderflow (footprint/CVD), Volume Profile |
| **API dependencies** | `/api/chart/candles`, `/api/chart/indicators`, `/api/chart/overlays`, `/api/chart/orderflow`, `/api/chart/payload`, `/api/chart/cvd`, `/api/chart/footprint`, `/api/volume-profile/:symbol` |
| **Data requirements** | `chartStore`, `volumeProfileStore`, `cvdStore`, `footprintStore`, `activeSymbolStore` |
| **Mobile priority** | `mobilePrimary: true` |
| **Status** | Operational |
| **Merged from** | `VolumeProfile` (order 110) — Volume Profile is already an internal tab; separate registry entry removed |

---

### 2. LiveData — Live Data & Providers

| Field | Value |
|---|---|
| **Canonical ID** | `LiveData` |
| **Label** | Live Data |
| **Component file** | `src/workspaces/LiveDataWorkspace.jsx` |
| **ComponentKey** | `LiveData` |
| **Sub-features (tabs)** | `market` (Market Data), `providers` (Provider Setup), `credentials` (Provider Credentials), `stream` (Stream Status), `diagnostics` (Provider Diagnostics), `volumeprofile` (Volume Profile — secondary display) |
| **API dependencies** | `/api/feeds/status`, `/api/feeds/tick/:symbol`, `/api/feeds/candle/:symbol`, `/api/feeds/orderbook/:symbol`, `/api/providers/health`, `/api/providers/credentials`, `/api/providers/credentials/:provider`, `/api/providers/active`, `/api/market/runtime`, `/api/market/subscriptions`, `/api/market/subscribe` |
| **Data requirements** | `feedStore` |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational — tab deep-linking **needs fix** (see Section: Deep-Link Mechanism) |
| **Merged from** | `Providers` (order 70), `Credentials` (order 80), `StreamStatus` (order 90), `ProviderDiagnostics` (order 100) — all four rendered the `market` tab due to missing `workspaceId` prop; entries removed pending deep-link fix |

---

### 3. MacroMultiAsset — Macro / Multi-Asset Analytics

| Field | Value |
|---|---|
| **Canonical ID** | `MacroMultiAsset` |
| **Label** | Macro / Multi-Asset |
| **Component file** | `src/workspaces/MacroWorkspace.jsx` |
| **ComponentKey** | `Macro` |
| **Sub-features (tabs)** | Correlation matrix, Beta analysis, Sector rotation, Volatility surface |
| **API dependencies** | `/api/multi-asset/correlation`, `/api/multi-asset/beta`, `/api/multi-asset/sector-rotation`, `/api/multi-asset/volatility` |
| **Data requirements** | `macroStore` |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | `Macro` (order 20), `Correlation` (order 240), `Beta` (order 250) — all rendered `MacroWorkspace` with no tab distinction; `MacroMultiAsset` is the most descriptive ID; `Macro` ariaLabel "Markets" conflicted with the entry's actual analytics purpose |

**Backend note:** `/api/macro` route alias removed from `server/index.cjs`. Canonical backend prefix is `/api/multi-asset`. The `workspaceNavigationOverrides` entry for `Macro` must be migrated to `MacroMultiAsset` during registry cleanup (ariaLabel: `'Macro'`, navTestId: `'workspace-nav-macro'`).

---

### 4. Alerts

| Field | Value |
|---|---|
| **Canonical ID** | `Alerts` |
| **Label** | Alerts |
| **Component file** | `src/workspaces/AlertsWorkspace.jsx` |
| **ComponentKey** | `Alerts` |
| **Sub-features (tabs)** | Active alerts, Alert history, Alert diagnostics |
| **API dependencies** | `/api/alerts`, `/api/alerts/:id`, `/api/alerts/:id/enable`, `/api/alerts/:id/disable`, `/api/alerts/history`, `/api/alerts/diagnostics` |
| **Data requirements** | `alertStore` |
| **Mobile priority** | `mobilePrimary: true` |
| **Status** | Operational |
| **Merged from** | None — unique entry |

---

### 5. AILab — AI Lab

| Field | Value |
|---|---|
| **Canonical ID** | `AILab` |
| **Label** | AI Lab |
| **Component file** | `src/workspaces/AILabWorkspace.jsx` |
| **ComponentKey** | `AILab` |
| **Sub-features (tabs)** | Feature engineering, Outcome labeling, Model training (Phase 9A), Model registry, Champion promotion, Inference, Drift monitoring, Feature importance, Champion/Challenger comparison |
| **API dependencies** | `/api/ml/features/save/:symbol`, `/api/ml/features/:symbol`, `/api/ml/labels/:symbol`, `/api/ml/labels/record/:id`, `/api/ml/labels/symbol/:symbol`, `/api/ml/analytics/:symbol`, `/api/ml/analytics/analyze/:symbol`, `/api/ml/analytics/features/:symbol`, `/api/ml/analytics/regimes/:symbol`, `/api/ml/regime/:symbol`, `/api/ml/train`, `/api/ml/model-runs`, `/api/ml/model`, `/api/ml/promote/:modelId`, `/api/ml/infer/:symbol`, `/api/ml/drift` |
| **Data requirements** | `aiLabStore` (unique state: feature records, labels, dataset analytics, regime analytics, Phase 9A training workflow) |
| **Mobile priority** | `mobilePrimary: true` |
| **Status** | Operational |
| **Merged from** | `MLChampionInference` (order 170) — champion inference is an operation within AI Lab; separate entry removed |

**Store note:** `aiLabStore` is retained. Overlapping state (champion model, drift report, feature importance) should be wired to `mlStore` selectors in a follow-up refactor, but the store itself is not deleted — its unique feature-record/label/analytics state has no equivalent in `mlStore`.

---

### 6. MLEngine — ML Dashboard

| Field | Value |
|---|---|
| **Canonical ID** | `MLEngine` |
| **Label** | ML Dashboard |
| **Component file** | `src/workspaces/MLDashboard.jsx` |
| **ComponentKey** | `MLEngine` |
| **Sub-features (tabs)** | `dashboard` (Signal + health overview), `model-card` (Model Card), `runs` (Training Runs), `history` (Prediction History), `drift` (Drift metrics), `features` (Feature Importance) |
| **API dependencies** | `/api/ml/health`, `/api/ml/model`, `/api/ml/model-runs`, `/api/ml/signal/:symbol`, `/api/ml/infer/:symbol`, `/api/ml/predictions`, `/api/ml/feature-importance`, `/api/ml/drift`, `/api/ml/model-card`, `/api/ml/metrics`, `/api/ml/models`, `/api/ml/promote/:modelVersion` |
| **Data requirements** | `mlStore` (Phase 9B) — `useMLSignalStore` alias in `mlStore.js` covers Phase 9A consumers |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational — tab deep-linking **needs fix** (see Section: Deep-Link Mechanism) |
| **Merged from** | `MLModelCard` (order 130), `MLTrainingRuns` (order 140), `MLPredictions` (order 150), `MLDiagnosticsDrift` (order 160) — all four entries rendered the default `dashboard` tab; removed pending deep-link fix |

**Store note:** `mlSignalStore.js` is deleted. `mlStore.js` already exports `export const useMLSignalStore = useMLStore` at line 323. All imports of `useMLSignalStore` from `mlSignalStore.js` must be repointed to `mlStore.js`.

**API note:** `trainMLModel` in `api.js` is deprecated in favor of `trainMLModelP1`. `aiLabStore.trainModel()` must be updated to call `trainMLModelP1` with the options-object signature.

---

### 7. Risk

| Field | Value |
|---|---|
| **Canonical ID** | `Risk` |
| **Label** | Risk |
| **Component file** | `src/workspaces/RiskWorkspace.jsx` |
| **ComponentKey** | `Risk` |
| **Sub-features (tabs)** | Risk summary, VaR, Drawdown, Exposure, Risk alerts, Limits |
| **API dependencies** | `/api/risk/summary`, `/api/risk/limits`, `/api/risk/var`, `/api/risk/drawdown`, `/api/risk/exposure`, `/api/risk/alerts` |
| **Data requirements** | Inline (no dedicated risk store; uses direct API calls or shared portfolio state) |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | None — unique entry |

---

### 8. HistoricalData — Historical Data

| Field | Value |
|---|---|
| **Canonical ID** | `HistoricalData` |
| **Label** | Historical Data |
| **Component file** | `src/workspaces/HistoricalDataWorkspace.jsx` |
| **ComponentKey** | `HistoricalData` |
| **Sub-features (tabs)** | Dataset browser, Download / ingest, Dataset diagnostics, Use for ML / Backtest / Correlation |
| **API dependencies** | `/api/historical/providers`, `/api/historical/datasets`, `/api/historical/datasets/:id`, `/api/historical/datasets/:id/diagnostics`, `/api/historical/download`, `/api/historical/use-for-ml`, `/api/historical/use-for-backtest`, `/api/historical/use-for-correlation` |
| **Data requirements** | `historicalDataStore` |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | None — unique entry |

---

### 9. Execution

| Field | Value |
|---|---|
| **Canonical ID** | `Execution` |
| **Label** | Execution |
| **Component file** | `src/workspaces/ExecutionWorkspace.jsx` |
| **ComponentKey** | `Execution` |
| **Sub-features (tabs)** | Order placement, Open orders, Fill history, Execution analytics, Pre-trade risk check |
| **API dependencies** | `/api/execution/order`, `/api/execution/orders`, `/api/execution/fills`, `/api/execution/analytics`, `/api/execution/risk-check` |
| **Data requirements** | `executionStore` |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | None — unique entry |

---

### 10. Backtesting

| Field | Value |
|---|---|
| **Canonical ID** | `Backtesting` |
| **Label** | Backtesting |
| **Component file** | `src/workspaces/StrategyBuilderWorkspace.jsx` |
| **ComponentKey** | `StrategyBuilder` |
| **Sub-features (tabs)** | Run backtest, Results, Walk-forward, Monte Carlo, Report viewer |
| **API dependencies** | `/api/backtest/run`, `/api/backtest/results/:symbol`, `/api/backtest/results/:symbol/:id`, `/api/backtest/walk-forward/:symbol`, `/api/backtest/monte-carlo/:symbol`, `/api/backtest/results/:symbol/:id/report` |
| **Data requirements** | `ruleBuilderStore` (strategy selection); `historicalDataStore` (dataset selection) |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | `StrategyBuilder` (order 280) — same component (`StrategyBuilderWorkspace`), same data, no functional distinction. `Backtesting` is the canonical ID per `workspaceNavigationOverrides`. `StrategyBuilder` entry removed. |

**Note:** The ComponentKey remains `StrategyBuilder` (it references the component file name); only the workspace registry ID `StrategyBuilder` is removed.

---

### 11. PaperTrading — Paper Trading

| Field | Value |
|---|---|
| **Canonical ID** | `PaperTrading` |
| **Label** | Paper Trading |
| **Component file** | `src/workspaces/PaperTradingWorkspace.jsx` |
| **ComponentKey** | `PaperTrading` |
| **Sub-features (tabs)** | Orders, Positions, Fills, Risk status, Account reset |
| **API dependencies** | `/api/paper/orders`, `/api/paper/fills`, `/api/paper/positions`, `/api/paper/positions/:symbol`, `/api/paper/positions/:symbol/close`, `/api/paper/risk/kill-switch`, `/api/paper/risk/status`, `/api/paper/reset` |
| **Data requirements** | `paperTradingStore` |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | None — unique entry |

---

### 12. Portfolio

| Field | Value |
|---|---|
| **Canonical ID** | `Portfolio` |
| **Label** | Portfolio |
| **Component file** | `src/workspaces/PortfolioWorkspace.jsx` |
| **ComponentKey** | `Portfolio` |
| **Sub-features (tabs)** | Summary, Positions, P&L, Exposure, Drawdown, VaR, Stress test, History |
| **API dependencies** | `/api/portfolio/summary`, `/api/portfolio/positions`, `/api/portfolio/pnl`, `/api/portfolio/exposure`, `/api/portfolio/drawdown`, `/api/portfolio/var`, `/api/portfolio/stress-test`, `/api/portfolio/history` |
| **Data requirements** | `portfolioStore` |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | None — unique entry |

---

### 13. StrategyLab — Strategy Lab

| Field | Value |
|---|---|
| **Canonical ID** | `StrategyLab` |
| **Label** | Strategy Lab |
| **Component file** | `src/workspaces/StrategyLabWorkspace.jsx` |
| **ComponentKey** | `StrategyLab` |
| **Sub-features (tabs)** | Saved strategies, Strategy comparison, Reversal-to-strategy conversion |
| **API dependencies** | `/api/strategy-lab/strategies/:symbol`, `/api/strategy-lab/strategy/:id`, `/api/strategy-lab/save/:symbol`, `/api/strategy-lab/compare/:symbol`, `/api/reversals/points/:symbol`, `/api/reversals/detect/:symbol`, `/api/reversals/strategy/:symbol/:id`, `/api/reversals/save-strategy/:symbol/:id` |
| **Data requirements** | `strategyLabStore` |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | None — unique entry (distinct from `StrategyBuilder`/`Backtesting`) |

---

### 14. QuantLab — Quant Lab

| Field | Value |
|---|---|
| **Canonical ID** | `QuantLab` |
| **Label** | Quant Lab |
| **Component file** | `src/workspaces/QuantLabWorkspace.jsx` |
| **ComponentKey** | `QuantLab` |
| **Sub-features (tabs)** | Feature extraction, Pipeline runs, Analytics trend, Snapshot comparison |
| **API dependencies** | `/api/quant/features/:symbol`, `/api/quant/extract/:symbol`, `/api/quant/pipeline/:symbol`, `/api/quant/history/:symbol`, `/api/quant/history/snapshot/:id`, `/api/analytics/trend/:symbol`, `/api/analytics/latest/:symbol`, `/api/analytics/compare/:symbol` |
| **Data requirements** | `quantLabStore` |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | None — unique entry |

---

### 15. Replay

| Field | Value |
|---|---|
| **Canonical ID** | `Replay` |
| **Label** | Replay |
| **Component file** | `src/workspaces/ReplayWorkspace.jsx` |
| **ComponentKey** | `Replay` |
| **Sub-features (tabs)** | Session control (start, pause, resume, stop), Legacy candle replay |
| **API dependencies** | `/api/replay/start`, `/api/replay/pause`, `/api/replay/resume`, `/api/replay/stop`, `/api/replay-legacy/candles/:symbol` |
| **Data requirements** | `replayStore` |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | None — unique entry |

---

### 16. OMS

| Field | Value |
|---|---|
| **Canonical ID** | `OMS` |
| **Label** | OMS |
| **Component file** | `src/workspaces/OMSWorkspace.jsx` |
| **ComponentKey** | `OMS` |
| **Sub-features (tabs)** | Order book, Order events, Reconciliation, Stats |
| **API dependencies** | `/api/oms/orders`, `/api/oms/orders/:id`, `/api/oms/orders/:id/events`, `/api/oms/reconciliation`, `/api/oms/stats` |
| **Data requirements** | `omsStore` |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | None — unique entry |

---

### 17. Institutional

| Field | Value |
|---|---|
| **Canonical ID** | `Institutional` |
| **Label** | Institutional |
| **Component file** | `src/workspaces/InstitutionalWorkspace.jsx` |
| **ComponentKey** | `Institutional` |
| **Sub-features (tabs)** | Sizing analysis, Scenario results, Audit log |
| **API dependencies** | `/api/institutional/analysis`, `/api/institutional/scenarios`, `/api/institutional/audit` |
| **Data requirements** | `institutionalStore` |
| **Mobile priority** | `mobilePrimary: false` |
| **Status** | Operational |
| **Merged from** | None — unique entry |

---

### 18. Ops — Operations

| Field | Value |
|---|---|
| **Canonical ID** | `Ops` |
| **Label** | Operations |
| **Component file** | `src/workspaces/OpsWorkspace.jsx` |
| **ComponentKey** | `Ops` |
| **Sub-features (tabs)** | System status, Metrics (Prometheus), Runtime health |
| **API dependencies** | `/api/ops/status`, `/metrics` (Prometheus text), `/api/runtime/health`, `/api/monitoring/*` |
| **Data requirements** | `opsStore` |
| **Mobile priority** | `mobilePrimary: false` (desktop + mobile visible) |
| **Status** | Operational |
| **Merged from** | None removed — `Settings` (order 300, `mobileVisible: true, desktopVisible: false`) is **retained** as a mobile-only navigation alias. It renders `OpsWorkspace` on mobile where a "Settings / More" button replaces the desktop "Ops" label. This is a display-routing split, not a functional duplicate. |

---

## Workspace ID-to-Tab Deep-Link Mechanism

### Problem Statement

`LiveDataWorkspace` and `MLDashboard` each maintain internal tab state as local `useState` with a hardcoded default (`'market'` and `'dashboard'` respectively). The workspace renderer in `App.jsx` (line 89) passes only `marketData` as a prop:

```jsx
return <WorkspaceComponent marketData={marketData} />;
```

No `workspaceId` is passed. When a user navigates to the `Providers` entry (order 70), `WorkspaceSwitch` resolves `componentKey: 'LiveData'` and renders `LiveDataWorkspace` with `useState('market')` — the `providers` tab is never activated. The same failure affects all five LiveData aliases and all five MLEngine aliases.

### Required Fix: Pass `workspaceId` to Workspace Components

**Step 1 — `WorkspaceSwitch` in `App.jsx`:**

```jsx
function WorkspaceSwitch({ workspace, marketData }) {
  const workspaceConfig = getWorkspace(workspace);
  const WorkspaceComponent = getWorkspaceComponent(workspaceConfig);

  if (!WorkspaceComponent) {
    const DefaultComponent = getWorkspaceComponent(getWorkspace(DEFAULT_WORKSPACE_ID));
    return <DefaultComponent marketData={marketData} />;
  }

  // Pass workspaceId so multi-tab components can derive their initial tab
  return <WorkspaceComponent marketData={marketData} workspaceId={workspace} />;
}
```

**Step 2 — Per-component `workspaceId` → `defaultTab` mapping:**

Each multi-tab workspace component reads `workspaceId` from props and derives its initial tab on mount. The tab is only used for the initial `useState` value — subsequent tab changes are driven by the user clicking the tab bar (local state, not URL-driven).

#### LiveDataWorkspace initial tab derivation

```js
const WORKSPACE_ID_TO_TAB = {
  LiveData:           'market',
  Providers:          'providers',
  Credentials:        'credentials',
  StreamStatus:       'stream',
  ProviderDiagnostics: 'diagnostics',
};

export default function LiveDataWorkspace({ workspaceId }) {
  const initialTab = WORKSPACE_ID_TO_TAB[workspaceId] ?? 'market';
  const [tab, setTab] = useState(initialTab);
  // ...
}
```

#### MLDashboard initial tab derivation

```js
const WORKSPACE_ID_TO_TAB = {
  MLEngine:           'dashboard',
  MLModelCard:        'model-card',
  MLTrainingRuns:     'runs',
  MLPredictions:      'history',
  MLDiagnosticsDrift: 'drift',
};

export default function MLDashboard({ workspaceId }) {
  const initialTab = WORKSPACE_ID_TO_TAB[workspaceId] ?? 'dashboard';
  const [activeTab, setActiveTab] = useState(initialTab);
  // ...
}
```

### Post-Fix: Registry Entries to Restore

After the deep-link fix is implemented, the following alias entries may be **re-added to the registry** if navigation shortcuts are desired. Until the fix lands, they must remain absent (re-adding them before the fix is confirmed working would restore broken behavior):

| Workspace ID | Target Tab | Add back? |
|---|---|---|
| `Providers` | `providers` | Optional — LiveData tabs are accessible from within the workspace |
| `Credentials` | `credentials` | Optional |
| `StreamStatus` | `stream` | Optional |
| `ProviderDiagnostics` | `diagnostics` | Optional |
| `MLModelCard` | `model-card` | Optional |
| `MLTrainingRuns` | `runs` | Optional |
| `MLPredictions` | `history` | Optional |
| `MLDiagnosticsDrift` | `drift` | Optional |

**Recommendation:** Do not restore these entries. The consolidated canonical IDs (`LiveData`, `MLEngine`) are sufficient for navigation. Internal tabs are reachable from within the workspace. Separate registry entries for sub-tabs bloat the sidebar and command palette and provide marginal UX benefit over a tab bar that is already visible in the component.

---

## Removed Entries Summary

The following 15 workspace registry entries are removed during stabilization:

| Removed ID | Was order | ComponentKey | Reason |
|---|---|---|---|
| `VolumeProfile` | 110 | `ChartOrderflow` | Sub-tab of ChartOrderflow; no added capability |
| `Providers` | 70 | `LiveData` | Deep-link broken; tab accessible inside LiveData |
| `Credentials` | 80 | `LiveData` | Deep-link broken; tab accessible inside LiveData |
| `StreamStatus` | 90 | `LiveData` | Deep-link broken; tab accessible inside LiveData |
| `ProviderDiagnostics` | 100 | `LiveData` | Deep-link broken; tab accessible inside LiveData |
| `MLModelCard` | 130 | `MLEngine` | Deep-link broken; tab accessible inside MLEngine |
| `MLTrainingRuns` | 140 | `MLEngine` | Deep-link broken; tab accessible inside MLEngine |
| `MLPredictions` | 150 | `MLEngine` | Deep-link broken; tab accessible inside MLEngine |
| `MLDiagnosticsDrift` | 160 | `MLEngine` | Deep-link broken; tab accessible inside MLEngine |
| `MLChampionInference` | 170 | `AILab` | Operation within AI Lab; not a standalone workspace |
| `Macro` | 20 | `Macro` | Subsumed by MacroMultiAsset (more precise label) |
| `Correlation` | 240 | `Macro` | Sub-feature of MacroMultiAsset |
| `Beta` | 250 | `Macro` | Sub-feature of MacroMultiAsset |
| `StrategyBuilder` | 280 | `StrategyBuilder` | Same component as Backtesting; componentKey name leaked into registry |

**Retained with note:**

| ID | Reason retained |
|---|---|
| `Settings` | Mobile-only (`desktopVisible: false`) navigation alias for Ops; intentional platform display split |

---

## Deleted / Redirected Artifacts

| Artifact | File | Action |
|---|---|---|
| `useMLSignalStore` (original) | `src/store/mlSignalStore.js` | **Delete file.** Re-export in `mlStore.js` line 323 covers all consumers. Update all `import { useMLSignalStore } from '../store/mlSignalStore.js'` to `import { useMLSignalStore } from '../store/mlStore.js'` |
| `trainMLModel` | `src/api.js` | **Deprecate.** Update `aiLabStore.trainModel()` to call `api.trainMLModelP1({symbol, horizon, limit, xgbConfig: {modelType, nEstimators, maxDepth, learningRate}, datasetId})`. Remove `trainMLModel` after migration. |
| `/api/macro` mount | `server/index.cjs` line 114 | **Remove** `app.use('/api/macro', multiAssetRoutes)`. Canonical prefix is `/api/multi-asset`. |
| `Macro` nav override | `src/config/workspaces.js` `workspaceNavigationOverrides` | **Migrate** the `Macro` override key to `MacroMultiAsset` |
| `DEFAULT_WORKSPACE_ID` value | `src/config/workspaces.js` line 1 | No change needed — `DEFAULT_WORKSPACE_ID = 'ChartOrderflow'` remains valid |
