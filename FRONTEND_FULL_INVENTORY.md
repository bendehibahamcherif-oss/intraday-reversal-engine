# Frontend Full Inventory

Audit of every workspace, its store(s), API surface, and functional-bug risk.
Generated during the full-platform stabilization pass. Layout/design were **not**
touched — this inventory tracks functional state/API behaviour only.

App shell: single-workspace renderer (`src/App.jsx` → `WorkspaceSwitch`), one
workspace mounted at a time. Cross-workspace handoff uses persisted Zustand
stores (not just `window` events).

## 1. Workspaces

| Menu | Component | Store(s) | Key API calls | State / bug risk | Status |
|------|-----------|----------|---------------|------------------|--------|
| Chart / Orderflow | `ChartOrderflowWorkspace` | chartStore, feedStore, cvdStore, footprintStore | `/api/feeds/*`, `/api/feed/status` | stale ticks | OK |
| Markets / Live Data | `LiveDataWorkspace` | feedStore, marketRuntimeStore | `/api/feed/status`, `/api/providers/*` | delayed vs broken status | OK (backend = source of truth) |
| Providers / Credentials | `LiveDataWorkspace` (tabs) | feedStore | `/api/providers/credentials*`, `/api/providers/active` | fallback_demo persistence | OK |
| Volume Profile | `VolumeProfilePanel` | volumeProfileStore | `/api/feeds/*` | guarded persist | OK |
| Alerts | `AlertsWorkspace` | alertStore | `/api/alerts/*` | empty vs error states | OK |
| AI Lab | `AILabWorkspace` | aiLabStore | `/api/ml/*`, `/api/ai/analytics/*` | **promote endpoint**, compare dead route, drift/inference null | **Fixed** |
| ML Dashboard | `MLDashboard` | mlStore | `/api/ml/*` | pendingDatasetId bootstrap | OK (prior fix) |
| ML Model Card | `ModelCardViewer` | mlStore | `/api/ml/model-card` | empty-state | OK |
| ML Training Runs | `TrainingRunsPanel` | mlStore | `/api/ml/model-runs`, `/api/ml/train` | datasetId propagation | OK (prior fix) |
| ML Predictions | `PredictionHistoryTable` | mlStore | `/api/ml/predictions` | empty-state | OK |
| ML Diagnostics / Drift | `MLDiagnosticsPanel`, `DriftDashboard` | mlStore | `/api/ml/drift`, `/api/ml/metrics` | not_enough_data shape | OK |
| ML Champion Inference | `MLSignalPanel`, AILab inference | aiLabStore, mlSignalStore | `/api/ml/infer/:symbol`, `/api/ml/model` | no-champion / fake NEUTRAL | OK (null-guarded, no faking) |
| Historical Data | `HistoricalDataWorkspace` | historicalDataStore | `/api/historical/*` | datasetId propagation, file diagnostics | OK (prior fix) |
| Backtesting | `QuantLabWorkspace` (backtest) | quantLabStore | `/api/backtest/run` | datasetId undefined | OK (stripUndefinedDeep) |
| Paper Trading | `PaperTradingWorkspace` | paperTradingStore | `/api/paper/*` | wrapped in ErrorBoundary | OK |
| Portfolio | `PortfolioWorkspace` | portfolioStore | `/api/portfolio/*` | empty positions | OK |
| Risk | `RiskWorkspace` | portfolioStore, engines | `/api/risk/*` | null VaR/ES → "—" | OK |
| Macro / Multi-Asset | `MacroWorkspace` | macroStore | `/api/multi-asset/*` | NaN beta, datasetId null | OK (helpers guard) |
| Correlation | `MacroWorkspace` (tab) | macroStore | `/api/multi-asset/correlation` | datasetId conditional | OK |
| Beta | `MacroWorkspace` (tab) | macroStore | `/api/multi-asset/beta` | NaN/Infinity render | OK |
| Strategy Lab | `StrategyLabWorkspace` | strategyLabStore | `/api/strategy-lab/*` | — | OK |
| Quant Lab | `QuantLabWorkspace` | quantLabStore | `/api/backtest/*` | — | OK |
| Replay | `ReplayWorkspace` | replayStore | `/api/replay/*` | **Math.min/max on empty → NaN** | **Fixed** |
| Strategy Builder | `StrategyBuilderWorkspace` | ruleBuilderStore | `/api/strategy/*` | — | OK |
| Execution / OMS | `ExecutionWorkspace`, `OMSWorkspace` | executionStore, omsStore | `/api/oms/*` | — | OK |
| Institutional | `InstitutionalWorkspace` | institutionalStore | `/api/institutional/*` | — | OK |
| Ops | `OpsWorkspace` | opsStore | `/api/ops/*` | — | OK |
| Settings / More | sidebar | workspaceStore | localStorage | versionless persist (low risk) | OK |
| WebSocket / status bar | `TerminalStatusBar`, `wsClient` | socketStore | `wss://…/ws` | **infinite reconnect** | **Fixed** |

## 2. API Calls Audited (ML lifecycle — the high-risk surface)

| Store/component | Method | Was | Now (canonical) | Notes |
|-----------------|--------|-----|-----------------|-------|
| aiLabStore.promoteToChampion | `setChampionModel` | `POST /api/ai/models/:id/champion` (dead → 404) | `POST /api/ml/promote/:modelId` | **fixed** |
| aiLabStore.loadFeatureImportance | `getMLFeatureImportance` | dup key; dead `/api/ai/models/:id/importance` shadowed | `GET /api/ml/feature-importance?modelVersion=` | dead duplicate removed |
| aiLabStore.compareWithChampion | `compareMLModels` | `POST /api/ai/models/compare` (no backend) | fails fast w/ clear message | no dead-endpoint 404 |
| (unused) | `getMLModel` | `GET /api/ai/models/:id` (dead, no callers) | removed | cleanup |
| aiLabStore.loadChampionModel | `getChampionModel` | `GET /api/ml/model` | unchanged | correct |
| aiLabStore.runInference | `runMLInference` | `POST /api/ml/infer/:symbol` | unchanged | correct |
| aiLabStore.loadDriftReport | `getMLDrift` | `GET /api/ml/drift` | unchanged | correct |
| quantLabStore.runBacktest | `runBacktest` | `POST /api/backtest/run` | unchanged | already strips undefined datasetId |
| macroStore.loadCorrelation/Beta | `getMultiAsset*` | `GET /api/multi-asset/*` | unchanged | datasetId guarded; real backend path |

Backend ML routes confirmed in `server-deliverables/ai/mlRoutes.js`:
`/api/ml/{health,model,model-runs,predictions,feature-importance,drift,model-card}`,
`POST /api/ml/{train,infer/:symbol,promote/:modelId,models/:version/promote}`.
There is **no** `/api/ml/champion`, `/api/ml/compare`, or `/api/ai/models/*` lifecycle route.

## 3. Persisted Stores (localStorage)

| Store | Key | Versioned | Backend truth? | JSON.parse guarded | Risk |
|-------|-----|-----------|----------------|--------------------|------|
| workspaceStore | `reversal-workspace` | no | n/a (UI nav) | Zustand persist | low |
| watchlistStore | `terminal_watchlist_v2` | no | no (UI cache) | Zustand persist | low |
| terminalLayoutStore | `reversal-terminal-layout` | no | no (UI cache) | Zustand persist | low |
| volumeProfileStore | `vp_settings_v1` | implicit `_v1` | no | try/catch ✓ | low |
| api.getUser | `reversal_user_profile` | no | yes (token) | try/catch ✓ | low |
| storage.loadSettings | app settings | no | no | try/catch ✓ | low |

No unguarded `JSON.parse` found in hot paths. App-level `ErrorBoundary._reset()`
clears the crash-prone keys. Backend responses always override these caches at load.
