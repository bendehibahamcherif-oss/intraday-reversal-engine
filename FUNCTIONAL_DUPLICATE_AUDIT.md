# Functional Duplicate Audit

**Project:** intraday-reversal-engine  
**Scope:** Workspace registry, component map, backend routes, Zustand stores, API client  
**Date:** 2026-06-09  
**Status:** Pre-stabilization — registry has 33 entries resolving to 18 distinct components

---

## 1. Executive Summary

The workspace registry (`src/config/workspaces.js`) contains 33 entries but only 18 distinct React components (`src/config/workspaceComponents.jsx`). The surplus 15 entries are aliases that each render the same component as an existing entry, contributing zero additional functionality while fragmenting navigation, complicating deep-linking, and inflating every workspace-aware list (sidebar, command palette, mobile nav).

The pattern repeats at every layer of the stack:

- **Backend routes:** Two mount-pairs each register the same Express router under two prefixes (`/api/multi-asset` + `/api/macro`; `/api/portfolio` + `/api/paper`). Only the canonical prefix is referenced by the frontend API client, making the alias prefixes dead surface area.
- **Zustand stores:** `mlSignalStore.js` is a Phase 9A artifact. `mlStore.js` (Phase 9B) is a strict superset: it re-implements every action in `mlSignalStore`, adds comprehensive ML dashboard state, and already exports `useMLSignalStore` as a backward-compat alias pointing to `useMLStore`. The original file is now an orphan.
- **API client functions:** `trainMLModel` (Phase 9A, symbol-first signature) and `trainMLModelP1` (Phase 9B, options-object signature) both POST to `/api/ml/train`. They differ only in call signature; both are live in `src/api.js`.

Beyond consolidation, there is a **deep-linking regression** introduced by the duplicate LiveData entries: `Providers`, `Credentials`, `StreamStatus`, and `ProviderDiagnostics` each map to `LiveDataWorkspace` but the workspace system passes no `workspaceId` prop to rendered components (`App.jsx` line 89: `<WorkspaceComponent marketData={marketData} />`). Navigating to the "Providers" entry always renders `LiveDataWorkspace` with its default tab (`market`), not the `providers` tab.

**Total duplicate entries to remove: 15 workspace IDs, 2 backend route aliases, 1 store file, 1 API function.**

---

## 2. Workspace Registry — Complete Entry Table (33 entries)

Entries are listed in `order` sequence as they appear in `baseWorkspaceDefinitions`.

| # | ID | Label | ComponentKey | Group | Order | mobileVisible | desktopVisible | mobilePrimary |
|---|----|----|----|----|----|----|----|----|
| 1 | `ChartOrderflow` | Chart | `ChartOrderflow` | Primary | 10 | true | true | true |
| 2 | `Macro` | Markets | `Macro` | Markets | 20 | true | true | true |
| 3 | `Alerts` | Alerts | `Alerts` | Primary | 30 | true | true | true |
| 4 | `AILab` | AI Lab | `AILab` | ML | 40 | true | true | true |
| 5 | `Risk` | Risk | `Risk` | Risk | 50 | true | true | false |
| 6 | `LiveData` | Live Data | `LiveData` | Data | 60 | true | true | false |
| 7 | `Providers` | Providers | `LiveData` | Data | 70 | true | true | false |
| 8 | `Credentials` | Credentials | `LiveData` | Data | 80 | true | true | false |
| 9 | `StreamStatus` | Stream Status | `LiveData` | Data | 90 | true | true | false |
| 10 | `ProviderDiagnostics` | Provider Diagnostics | `LiveData` | Data | 100 | true | true | false |
| 11 | `VolumeProfile` | Volume Profile | `ChartOrderflow` | Chart | 110 | true | true | false |
| 12 | `MLEngine` | ML Dashboard | `MLEngine` | ML | 120 | true | true | false |
| 13 | `MLModelCard` | ML Model Card | `MLEngine` | ML | 130 | true | true | false |
| 14 | `MLTrainingRuns` | ML Training Runs | `MLEngine` | ML | 140 | true | true | false |
| 15 | `MLPredictions` | ML Predictions | `MLEngine` | ML | 150 | true | true | false |
| 16 | `MLDiagnosticsDrift` | ML Diagnostics & Drift | `MLEngine` | ML | 160 | true | true | false |
| 17 | `MLChampionInference` | ML Champion Inference | `AILab` | ML | 170 | true | true | false |
| 18 | `HistoricalData` | Historical Data | `HistoricalData` | Data | 180 | true | true | false |
| 19 | `Execution` | Execution | `Execution` | Trading | 190 | true | true | false |
| 20 | `Backtesting` | Backtesting | `StrategyBuilder` | Trading | 200 | true | true | false |
| 21 | `PaperTrading` | Paper Trading | `PaperTrading` | Trading | 210 | true | true | false |
| 22 | `Portfolio` | Portfolio | `Portfolio` | Risk | 220 | true | true | false |
| 23 | `MacroMultiAsset` | Macro / Multi-Asset | `Macro` | Markets | 230 | true | true | false |
| 24 | `Correlation` | Correlation | `Macro` | Markets | 240 | true | true | false |
| 25 | `Beta` | Beta | `Macro` | Markets | 250 | true | true | false |
| 26 | `StrategyLab` | Strategy Lab | `StrategyLab` | Trading | 260 | true | true | false |
| 27 | `QuantLab` | Quant Lab | `QuantLab` | Trading | 270 | true | true | false |
| 28 | `StrategyBuilder` | Strategy Builder | `StrategyBuilder` | Trading | 280 | true | true | false |
| 29 | `Replay` | Replay | `Replay` | Trading | 290 | true | true | false |
| 30 | `Settings` | Settings / More | `Ops` | System | 300 | true | **false** | false |
| 31 | `OMS` | OMS | `OMS` | Trading | 310 | true | true | false |
| 32 | `Institutional` | Institutional | `Institutional` | System | 320 | true | true | false |
| 33 | `Ops` | Operations | `Ops` | System | 330 | true | true | false |

**Notes:**
- `Settings` (order 300) is the only entry with `desktopVisible: false` — it is a mobile-only navigation entry.
- `mobilePrimary: true` applies only to entries 1–4 (ChartOrderflow, Macro, Alerts, AILab); all others appear in the mobile "More" menu.
- No entry has `implemented: false`; all 33 are marked `implemented: true`.

---

## 3. Component-to-Workspace Mapping

The `workspaceComponents` registry in `src/config/workspaceComponents.jsx` maps 18 component keys to 18 React component files in `src/workspaces/`.

| ComponentKey | Component File | Workspace IDs That Use It | Count |
|---|---|---|---|
| `ChartOrderflow` | `ChartOrderflowWorkspace.jsx` | `ChartOrderflow`, `VolumeProfile` | 2 |
| `Macro` | `MacroWorkspace.jsx` | `Macro`, `MacroMultiAsset`, `Correlation`, `Beta` | 4 |
| `AILab` | `AILabWorkspace.jsx` | `AILab`, `MLChampionInference` | 2 |
| `LiveData` | `LiveDataWorkspace.jsx` | `LiveData`, `Providers`, `Credentials`, `StreamStatus`, `ProviderDiagnostics` | 5 |
| `MLEngine` | `MLDashboard.jsx` | `MLEngine`, `MLModelCard`, `MLTrainingRuns`, `MLPredictions`, `MLDiagnosticsDrift` | 5 |
| `StrategyBuilder` | `StrategyBuilderWorkspace.jsx` | `Backtesting`, `StrategyBuilder` | 2 |
| `Ops` | `OpsWorkspace.jsx` | `Settings`, `Ops` | 2 |
| `Risk` | `RiskWorkspace.jsx` | `Risk` | 1 |
| `Portfolio` | `PortfolioWorkspace.jsx` | `Portfolio` | 1 |
| `Execution` | `ExecutionWorkspace.jsx` | `Execution` | 1 |
| `Replay` | `ReplayWorkspace.jsx` | `Replay` | 1 |
| `QuantLab` | `QuantLabWorkspace.jsx` | `QuantLab` | 1 |
| `StrategyLab` | `StrategyLabWorkspace.jsx` | `StrategyLab` | 1 |
| `PaperTrading` | `PaperTradingWorkspace.jsx` | `PaperTrading` | 1 |
| `Alerts` | `AlertsWorkspace.jsx` | `Alerts` | 1 |
| `OMS` | `OMSWorkspace.jsx` | `OMS` | 1 |
| `Institutional` | `InstitutionalWorkspace.jsx` | `Institutional` | 1 |
| `HistoricalData` | `HistoricalDataWorkspace.jsx` | `HistoricalData` | 1 |

**Summary:** 18 unique components, 33 registry entries. 15 entries are component-sharing duplicates.

---

## 4. Duplicate Groups Analysis

| Group | Entries (IDs) | Type | Same Purpose? | Same APIs? | Same State? | Keep Canonical | Remove / Quarantine | Reason |
|---|---|---|---|---|---|---|---|---|
| Chart / Volume Profile | `ChartOrderflow`, `VolumeProfile` | Sub-feature alias | Yes — both render `ChartOrderflowWorkspace` | Yes | Yes | `ChartOrderflow` | `VolumeProfile` | Volume Profile is already a tab inside `ChartOrderflowWorkspace`. A separate registry entry provides no extra capability and splits a coherent chart surface. |
| Macro cluster | `Macro`, `MacroMultiAsset`, `Correlation`, `Beta` | Sub-feature aliases | Yes — all render `MacroWorkspace` | Yes | Yes | `MacroMultiAsset` (more descriptive) | `Macro`, `Correlation`, `Beta` | `MacroMultiAsset` communicates scope precisely. `Correlation` and `Beta` are analytics tabs within the workspace, not independent destinations. `Macro` label is ambiguous ("Markets" ariaLabel conflicts with purpose). |
| AI Lab / Champion Inference | `AILab`, `MLChampionInference` | Sub-feature alias | Yes — both render `AILabWorkspace` | Yes | Yes | `AILab` | `MLChampionInference` | Champion inference is an operation within AI Lab, not a standalone workspace. The entry was added as a shortcut during Phase 9A without adding new capability. |
| Live Data cluster | `LiveData`, `Providers`, `Credentials`, `StreamStatus`, `ProviderDiagnostics` | Sub-feature aliases (broken deep-link) | Yes — all render `LiveDataWorkspace` | Yes | Yes (`feedStore`) | `LiveData` | `Providers`, `Credentials`, `StreamStatus`, `ProviderDiagnostics` | These four were intended to land on their respective tabs, but the workspace renderer (`App.jsx:89`) passes no `workspaceId` prop, so all four aliases open the `market` tab. The bug makes them functionally identical to `LiveData`. Tab deep-linking must be implemented before these aliases can serve any purpose; until then they are defective duplicates. |
| ML Dashboard cluster | `MLEngine`, `MLModelCard`, `MLTrainingRuns`, `MLPredictions`, `MLDiagnosticsDrift` | Sub-feature aliases | Yes — all render `MLDashboard` | Yes | Yes (`mlStore`) | `MLEngine` | `MLModelCard`, `MLTrainingRuns`, `MLPredictions`, `MLDiagnosticsDrift` | `MLDashboard` already has six internal tabs: `dashboard`, `model-card`, `runs`, `history`, `drift`, `features`. Same deep-link problem as Live Data cluster. |
| Backtesting / StrategyBuilder | `Backtesting`, `StrategyBuilder` | Renamed alias | Partially — unclear ownership | Yes | Yes (`StrategyBuilderWorkspace`) | `Backtesting` | `StrategyBuilder` | `Backtesting` is the intended canonical name per the nav override map. `StrategyBuilder` is the component name leaking into the registry. Both render `StrategyBuilderWorkspace`; keeping two creates user confusion about which to navigate to. |
| Settings / Ops | `Settings`, `Ops` | Platform-split alias | Partial — `Settings` is mobile-only (`desktopVisible: false`) | Yes | Yes (`OpsWorkspace`) | `Ops` (desktop + mobile) | `Settings` is a **legitimate** mobile-only nav entry — keep it | `Settings` serves mobile navigation where a dedicated "Settings" button replaces the desktop "Ops" entry. It is not a functional duplicate; it is a platform display variant. The underlying component is the same but the display routing is intentional. |

---

## 5. Backend Route Duplicates

### 5.1 `/api/multi-asset` and `/api/macro`

**File:** `server/index.cjs`, lines 113–114

```js
app.use('/api/multi-asset', multiAssetRoutes);
app.use('/api/macro',       multiAssetRoutes);
```

Both prefixes mount the **same router instance** (`multiAssetRoutes` from `server-deliverables/api/multiAssetRoutes.js`). The frontend API client (`src/api.js`) exclusively calls `/api/multi-asset/*` endpoints (`getMultiAssetCorrelation`, `getMultiAssetBeta`, `getMultiAssetSectorRotation`, `getMultiAssetVolatility`). No frontend function references `/api/macro/*` paths.

**Impact:** `/api/macro` is a dead mount. It consumes a rate-limiter slot registration (the `rateLimiter('heavy')` middleware at line 89 covers `/api/multi-asset` but not `/api/macro` — meaning macro requests bypass the heavy rate limiter entirely, a potential abuse vector).

**Resolution:** Remove `app.use('/api/macro', multiAssetRoutes)`. Retain `/api/multi-asset` as the sole canonical prefix.

### 5.2 `/api/portfolio` and `/api/paper`

**File:** `server/index.cjs`, lines 108–109

```js
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/paper',     portfolioRoutes);
```

Both mount the **same `portfolioRoutes` router**. The frontend API client contains routes under both prefixes:

- `/api/portfolio/*` — used by `getPortfolioSummary`, `getPortfolioPositions`, `getPortfolioPnL`, `getPortfolioExposure`, `getPortfolioDrawdown`, `getPortfolioVaR`, `runPortfolioStressTest`, `getPortfolioHistory`
- `/api/paper/*` — used by `placePaperOrder`, `getPaperOrders`, `cancelPaperOrder`, `getPaperFills`, `getPaperPositions`, `getPaperPosition`, `closePaperPosition`, `enablePaperKillSwitch`, `disablePaperKillSwitch`, `getPaperRiskStatus`, `resetPaperAccount`

Unlike the macro/multi-asset case, **both prefixes are actively used by the frontend**. This is a legitimate logical split where the same `portfolioRoutes` router handles two feature areas distinguished by URL prefix. This is not a simple dead alias — but it does mean the route file contains sub-paths for both concerns. The ambiguity is whether `portfolioRoutes` should be split into `portfolioRoutes` + `paperTradingRoutes`, or whether the shared mount is intentional.

**Status:** Functional duplicate mount with both sides in active use. The router itself likely branches internally on the URL prefix (or ignores it, serving all endpoints from either prefix). This warrants inspection of `portfolioRoutes.js` sub-paths but is lower priority than the macro alias.

---

## 6. Store Analysis: `aiLabStore` vs `mlSignalStore` vs `mlStore`

### Store inventory

| File | Export | Phase | Primary Purpose |
|---|---|---|---|
| `src/store/aiLabStore.js` | `useAILabStore` | 9A | Feature engineering, outcome labeling, model training (symbol-centric), model registry, champion promotion, inference, drift, feature importance |
| `src/store/mlSignalStore.js` | `useMLSignalStore` | 9A | Real-time signal per symbol, feature snapshot, model list, diagnostics, WS signal handler |
| `src/store/mlStore.js` | `useMLStore` (+ `useMLSignalStore` alias) | 9B | Superset of mlSignalStore; adds health status, training runs, prediction history, feature importance, drift metrics, model card, model info |

### Overlap analysis

**`mlStore.js` vs `mlSignalStore.js`**

`mlStore.js` explicitly re-implements every action from `mlSignalStore.js`:

| mlSignalStore action | mlStore equivalent | Notes |
|---|---|---|
| `loadSignal(symbol, timeframe)` | `loadSignal(symbol, timeframe)` | Identical — both call `api.getMLSignal` |
| `loadFeatures(symbol, timeframe)` | Not present | mlStore omits per-symbol feature snapshot loading |
| `refreshAll(symbol, timeframe)` | `refreshAll(symbol, timeframe)` | mlStore calls more actions |
| `loadModels(symbol)` | `loadModels(symbol)` | Both call `api.getMLModels` |
| `promoteModel(modelVersion)` | `promoteModel(modelVersion)` | mlStore also refreshes model info after promotion |
| `loadDiagnostics()` | `loadDiagnostics()` | Identical — both call `api.getMLMetrics` |
| `handleWsSignal(msg)` | `handleWsSignal(msg)` | Identical signal merge logic |
| `clearSymbol(symbol)` | `clearSymbol(symbol)` | Identical |

**Additionally**, `mlStore.js` line 323 exports: `export const useMLSignalStore = useMLStore;`

This makes `mlSignalStore.js` a dead module: any consumer importing `useMLSignalStore` from `mlSignalStore.js` is loading a redundant store instance that maintains its own independent state, while components using `mlStore.js`'s `useMLSignalStore` alias share unified state with the ML Dashboard. If both stores are instantiated, signal state is silently duplicated and WS updates may land in only one store.

**`aiLabStore.js` vs `mlStore.js`**

These stores serve different but overlapping ML workflows:

| Concern | aiLabStore | mlStore |
|---|---|---|
| Real-time signal per symbol | `signalBySymbol` (via `runMLInference`) | `signalBySymbol` (via `getMLSignal`) |
| Model training | `trainModel()` → `api.trainMLModel()` (Phase 9A) | `startTraining()` → `api.trainMLModelP1()` (Phase 9B) |
| Model registry / runs | `modelRegistry` via `api.getMLModelRegistry` | `trainingRuns` via `api.getMLModelRuns` — same backend endpoint (`/api/ml/model-runs`) |
| Champion model | `championModel` via `api.getChampionModel` | `modelInfo` via `api.getMLModelInfo` — same backend endpoint (`/api/ml/model`) |
| Drift | `driftReport` via `api.getMLDrift` (symbol + modelId params) | `driftMetrics` via `api.getMLDriftMetrics` (no params) |
| Feature importance | `featureImportance` via `api.getMLFeatureImportance(modelId)` | `featureImportance` via `api.getMLFeatureImportance(modelVersion)` — same endpoint |
| Feature records / labels | Yes (unique to aiLabStore) | Not present |
| Dataset analytics / regime | Yes (unique to aiLabStore) | Not present |
| Health status | Not present | `healthStatus` via `api.getMLHealth` |
| Prediction history | Not present | `predictionHistory` via `api.getMLPredictions` |
| Model card | Not present | `modelCard` via `api.getMLModelCard` |
| Challenger comparison | `comparisonResult` (throws — backend not implemented) | Not present |
| WS signal update | Not present | `handleWsSignal` |
| Dataset selection for training | `selectedMlDatasetId` / `selectedMlDataset` | `pendingDatasetId` / `selectedMlDatasetId` / `selectedMlDataset` |

`aiLabStore` is **not** a full duplicate of `mlStore`. It holds unique state: feature records, outcome labels, dataset analytics, regime analytics, and the Phase 9A training workflow. However, the champion model, model runs/registry, drift, and feature importance sub-sections are parallel implementations of the same backend data.

**Resolution path:**
1. `mlSignalStore.js` — **quarantine and remove**. Re-export from `mlStore.js` covers all consumers.
2. `aiLabStore.js` — **keep but scope-reduce**. Remove duplicated champion/drift/feature-importance state; wire those fields to `mlStore` selectors. Retain unique Phase 9A state: feature records, labels, dataset analytics, regime analytics.

---

## 7. API Function Duplicates: `trainMLModel` vs `trainMLModelP1`

Both functions are defined in `src/api.js` and both POST to `/api/ml/train`:

| Function | Line | Signature | Body shape | Consumer |
|---|---|---|---|---|
| `trainMLModel` | ~442 | `(symbol, config = {})` | `{ symbol, horizon, limit, modelType, nEstimators, maxDepth, learningRate, datasetId? }` | `aiLabStore.js` → `trainModel()` |
| `trainMLModelP1` | ~1002 | `({ symbol, timeframe, candles, xgbConfig, datasetId, horizon, datasetPath, promote } = {})` | `{ symbol, timeframe, candles, xgbConfig, horizon, datasetPath, promote, datasetId? }` | `mlStore.js` → `startTraining()` |

The two functions differ in:
- **Call signature:** `trainMLModel` takes `(symbol, config)` positionally; `trainMLModelP1` takes a single options object.
- **Config fields:** `trainMLModel` sends `modelType`, `nEstimators`, `maxDepth`, `learningRate` (XGBoost hyperparameters flattened). `trainMLModelP1` sends an `xgbConfig` sub-object plus `candles`, `datasetPath`, `promote`.
- **Backend endpoint:** Identical — both hit `POST /api/ml/train`.

The backend receives both shapes; it must handle whichever fields are present. This dual-function pattern creates implicit coupling between store versions and API versions. The Phase 9B shape (`trainMLModelP1` / `mlStore`) is the forward-compatible form and should be the sole training API call going forward.

---

## 8. Summary of Findings

| Category | Total Duplicates | Recommended Action |
|---|---|---|
| Workspace registry entries (surplus) | 15 | Remove from `workspaces.js`; implement workspaceId→defaultTab mapping for remaining multi-tab workspaces |
| Backend route mount aliases | 2 (macro alias; paper/portfolio is active) | Remove `/api/macro` mount; audit `/api/paper` vs `/api/portfolio` split in portfolioRoutes |
| Zustand stores (dead) | 1 (`mlSignalStore.js`) | Delete file; ensure all imports resolve to `mlStore.js` |
| API client functions (redundant) | 1 (`trainMLModel`) | Deprecate in favor of `trainMLModelP1`; update `aiLabStore.trainModel` to use the P1 signature |
| Deep-link regression (broken tab routing) | 9 entries affected (LiveData cluster × 4 + MLEngine cluster × 4 + StrategyBuilder/Backtesting) | Implement `workspaceId` prop pass-through in `WorkspaceSwitch`; add `initialTab` derivation in affected workspace components |

**Legitimate features confirmed to keep as-is (not duplicates):**
- `Settings` workspace entry (`mobileVisible: true, desktopVisible: false`) — intentional mobile-only navigation entry.
- `StrategyLab` and `StrategyBuilder` — different components (`StrategyLabWorkspace` vs `StrategyBuilderWorkspace`), different componentKeys; not duplicates.
- `Portfolio` and `PaperTrading` — different components, different routes.
- `aiLabStore.js` unique state (feature records, labels, dataset analytics, regime) — no overlap with `mlStore`.
- `/api/portfolio` and `/api/paper` dual prefix — both are referenced by distinct frontend API functions; requires further review before removal.

---

## 9. Legitimate Separate Features (Keep)

The following registry entries share no component with any other entry and represent distinct, independently-navigable features:

| ID | Component | Why Distinct |
|---|---|---|
| `Risk` | `RiskWorkspace` | Dedicated risk analytics surface |
| `Alerts` | `AlertsWorkspace` | Alert management, not a sub-tab of any other workspace |
| `HistoricalData` | `HistoricalDataWorkspace` | Dataset download center, standalone workflow |
| `Execution` | `ExecutionWorkspace` | Live/paper order placement and fill tracking |
| `PaperTrading` | `PaperTradingWorkspace` | Paper account management (distinct from execution) |
| `Portfolio` | `PortfolioWorkspace` | Portfolio analytics and P&L |
| `StrategyLab` | `StrategyLabWorkspace` | Saved-strategy management and comparison |
| `QuantLab` | `QuantLabWorkspace` | Quant feature extraction pipeline |
| `Replay` | `ReplayWorkspace` | Market session replay engine |
| `OMS` | `OMSWorkspace` | Order management system with audit trail |
| `Institutional` | `InstitutionalWorkspace` | Institutional sizing and scenario analysis |
| `Ops` | `OpsWorkspace` | Observability, ops status, Prometheus metrics |
| `Settings` | `OpsWorkspace` | Mobile-only navigation alias for Ops (display split, not functional duplicate) |
