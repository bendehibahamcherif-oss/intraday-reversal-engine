# Full App Bug Inventory

Generated from source scans before code changes on 2026-06-06.

## Scan evidence

- Frontend scan command: `rg -n "fetch\(|axios|apiRequest|safeApi|/api/|/api/ai|/api/ml|/api/ml/champion|/api/feed|/api/feeds|Endpoint not available|API endpoint not found|Invalid JSON response|NaN|Infinity|undefined|datasetId|selectedDataset|selectedMlDataset|selectedBacktestDataset|selectedCorrelationDataset|champion|promote|model-runs|inference|beta|correlation|macro|backtest|provider|fallback_demo|localStorage|JSON\.parse|Zustand persist|mobile nav|workspace registry|activeWorkspace|ErrorBoundary|WebSocket" -S --glob '!node_modules' --glob '!dist' --glob '!build' --glob '!coverage' .` found 3254 matches.
- Backend scan command: `rg -n "app\.use|router\.(get|post|put|delete)|/api/ml|/api/ai|/api/historical|/api/backtest|/api/macro|/api/multi-asset|/api/providers|/api/feed|/api/feeds|/api/portfolio|/api/risk|NaN|Infinity|undefined|JSON\.stringify|\.send\(|res\.json|error middleware|route not found|model registry|training service|dataset registry|provider store" -S server server-deliverables` found 408 matches.

## A. Workspace matrix

| Workspace/Menu | Desktop component | Mobile component | Store | API calls | Backend routes | Duplicates? | Risk | Fix |
|---|---|---|---|---|---|---|---|---|
| Chart | `ChartOrderflowWorkspace` | same registry/component | workspace/feed/volume profile stores | `/api/feeds/*`, `/api/feed/status`, chart routes | provider router + chart runtime | no | stale symbol/path params | validate symbol helpers and smoke paths |
| Markets | `MacroWorkspace` | same registry/component | `macroStore`, historical selection | `/api/multi-asset/*` currently, canonical also `/api/macro/*` | mounted at `/api/multi-asset` and `/api/macro` | alias with Macro / Multi-Asset | NaN beta/correlation, dataset not propagated | finite formatters + persisted selected correlation dataset |
| Live Data | `LiveDataWorkspace` | same registry/component | feed/provider stores | `/api/feed/status`, `/api/providers/*`, `/api/feeds/*` | provider router under `/api` | no | local provider state overriding backend truth | force backend source of truth |
| Providers | `LiveDataWorkspace` tab | same registry/component | feed/provider stores | `/api/providers/health`, credentials, active | provider router | no | fallback_demo stale localStorage | no localStorage provider authority |
| Credentials | `LiveDataWorkspace` tab | same registry/component | feed/provider stores | `/api/providers/credentials*` | provider router | no | configured providers appear missing | normalize backend credential state |
| Stream Status | `LiveDataWorkspace` tab | same registry/component | feed/socket stores | `/api/feed/status` | provider router | no | WS failure blocks UX | capped WS reconnect + REST fallback |
| Provider Diagnostics | `LiveDataWorkspace` tab | same registry/component | provider diagnostics | `/api/providers/health` | provider router | no | inconsistent provider health language | backend truth rendering |
| Volume Profile | `ChartOrderflowWorkspace` panel | same registry/component | volumeProfileStore | `/api/volume-profile`, `/api/feeds/*` | runtime/provider routes | no | corrupt persisted settings | safe storage parse |
| Alerts | `AlertsWorkspace` | same registry/component | alert store | `/api/alerts/*` | runtime integration | no | empty route safety | smoke JSON contract |
| AI Lab | `AILabWorkspace` | same registry/component | `aiLabStore`, historical selection | `/api/ml/train`, `/api/ml/model`, `/api/ml/model-runs`, `/api/ml/infer/:symbol` | `/api/ml` | overlaps with ML dashboard | selected ML dataset not persisted globally | shared persisted dataset selection + canonical endpoints |
| ML Dashboard | `MLDashboard` | same registry/component | `mlStore`, historical selection | `/api/ml/health`, model, runs, predictions, feature-importance, drift, model-card | `/api/ml` | overlaps with AI Lab | champion mismatch/stale endpoint risk | same `/api/ml/model` champion source |
| ML Model Card | `MLDashboard` | same registry/component | `mlStore` | `/api/ml/model-card` | `/api/ml` | no | 404 if route absent | smoke route exists |
| ML Training Runs | `MLDashboard` | same registry/component | `mlStore` | `/api/ml/model-runs` | `/api/ml` | no | stale model registry shape | normalize runs arrays |
| ML Predictions | `MLDashboard` | same registry/component | `mlStore` | `/api/ml/predictions` | `/api/ml` | no | empty prediction state | safe empty arrays |
| ML Diagnostics & Drift | `MLDashboard` | same registry/component | `mlStore` | `/api/ml/feature-importance`, `/api/ml/drift` | `/api/ml` | no | dead metrics/worker endpoint risk | document optional legacy, smoke canonical |
| ML Champion Inference | `AILabWorkspace` | same registry/component | `aiLabStore` | `/api/ml/infer/:symbol` | `/api/ml` | overlaps with AI Lab | symbol undefined or fake neutral | enforce symbol fallback and render only returned prediction |
| Historical Data | `HistoricalDataWorkspace` | same registry/component | `historicalDataStore` | `/api/historical/*` | `/api/historical` | no | use-for endpoints missing, selection not persisted | add use-for endpoints and persistent shared selection |
| Backtesting | `StrategyBuilderWorkspace` | same registry/component | `quantLabStore`, historical selection | `/api/backtest/run` | `/api/backtest` | no | selected dataset optional/local only | persisted selected backtest dataset + payload guard |
| Paper Trading | `PaperTradingWorkspace` | same registry/component | paper/portfolio stores | `/api/paper`, portfolio/risk | `/api/paper`, `/api/portfolio`, `/api/risk` | no | safe empty states | smoke portfolio/risk empty JSON |
| Portfolio | `PortfolioWorkspace` | same registry/component | portfolio store | `/api/portfolio/*` | `/api/portfolio` | no | `.map`/Object.keys on undefined | normalize arrays/objects |
| Risk | `RiskWorkspace` | same registry/component | risk store | `/api/risk/*` | `/api/risk` | no | null VaR/ES rendering | render em dash for null/invalid |
| Macro / Multi-Asset | `MacroWorkspace` | same registry/component | `macroStore` | `/api/multi-asset/*` | `/api/multi-asset`, `/api/macro` | alias with Markets | NaN/invalid beta interpretation | finite guards |
| Correlation | `MacroWorkspace` | same registry/component | `macroStore` | correlation route with datasetId | `/api/multi-asset/correlation` | no | NaN matrix cells | null/finite formatters |
| Beta | `MacroWorkspace` | same registry/component | `macroStore` | beta route with datasetId | `/api/multi-asset/beta` | no | Rolling Beta NaN | invalid renders `—`/not enough data |
| Strategy Lab | `StrategyLabWorkspace` | same registry/component | strategyLabStore | `/api/strategy-lab/*` | runtime integration | no | dead compare route handled client-side | smoke no raw 404 in menus |
| Quant Lab | `QuantLabWorkspace` | same registry/component | quantLabStore | quant/backtest routes | runtime integration + backtest | no | dataset not shared to backtest | hydrate from historical store |
| Replay | `ReplayWorkspace` | same registry/component | replay stores | `/api/replay/*`, legacy candles | replay routes | no | legacy endpoint 404 | mounted routes/safe errors |
| Settings / More | `OpsWorkspace`/More menu | same registry controls | workspace/layout stores | `/api/ops/status` | `/api/ops` | no | corrupt active workspace | safe persist validation |
| OMS / Institutional / Ops | registered extras | same registry/component | domain stores | `/api/oms/*`, `/api/institutional/*`, `/api/ops/status` | mounted where available | no | safe route/empty state | included in smoke |

## B. API matrix

| Frontend call | Method | Current URL | Expected URL | Backend exists? | Mounted? | Response shape | Fix |
|---|---|---|---|---|---|---|---|
| ML health | GET | `/api/ml/health` | same | yes | yes | `{ ok, status, worker }` | smoke required |
| Champion model | GET | `/api/ml/model` | same | yes | yes | `{ ok, champion, challengers, status }` | use everywhere; no `/api/ml/champion` |
| Model runs | GET | `/api/ml/model-runs` | same | yes | yes | `{ ok, runs }` | registry uses this |
| Predictions | GET | `/api/ml/predictions` | same | yes | yes | `{ ok, predictions }` | empty array safe |
| Feature importance | GET | `/api/ml/feature-importance` | same | yes | yes | `{ ok, features }` | canonical route only |
| Drift | GET | `/api/ml/drift` | same | yes | yes | `{ ok, drift, status }` | canonical route only |
| Model card | GET | `/api/ml/model-card` | same | yes | yes | `{ ok, modelCard, status }` | canonical route only |
| Train | POST | `/api/ml/train` | same with datasetId if selected | yes | yes | structured success/error | selected dataset payload guard |
| Promote | POST | `/api/ml/promote/:modelId` | same | yes | yes | `{ ok, champion }` | smoke no stale champion endpoint |
| Infer | POST | `/api/ml/infer/:symbol` | same | yes | yes | prediction or precise no champion/error | never fake prediction |
| Historical providers | GET | `/api/historical/providers` | same | yes | yes | `{ ok, providers }` | smoke required |
| Historical datasets | GET | `/api/historical/datasets` | same | yes | yes | `{ ok, datasets }` | normalize ids |
| Historical detail | GET | `/api/historical/datasets/:datasetId` | same | yes | yes | `{ ok, dataset }` | guard datasetId |
| Historical diagnostics | GET | `/api/historical/datasets/:datasetId/diagnostics` | same | yes | yes | `{ ok, issues }` | JSON safe 404 |
| Download | POST | `/api/historical/download` | same | yes | yes | `{ ok, datasetId, dataset }` | symbols uppercase array |
| Use for ML | POST | missing in client/backend | `/api/historical/use-for-ml` | no before fix | no before fix | `{ ok, datasetId, dataset }` | add route/client action |
| Use for backtest | POST | missing in client/backend | `/api/historical/use-for-backtest` | no before fix | no before fix | `{ ok, datasetId, dataset }` | add route/client action |
| Use for correlation | POST | missing in client/backend | `/api/historical/use-for-correlation` | no before fix | no before fix | `{ ok, datasetId, dataset }` | add route/client action |
| Backtest run | POST | `/api/backtest/run` | same | yes | yes | `{ ok, status, result, dataSource }` | datasetId from persisted selection |
| Macro correlation | GET | `/api/multi-asset/correlation` | `/api/macro/correlation` or mounted alias | yes | yes | finite/null matrix | render finite only |
| Macro beta | GET | `/api/multi-asset/beta` | `/api/macro/beta` or mounted alias | yes | yes | finite/null beta/r2 | render `—` invalid |
| Sector rotation | GET | `/api/multi-asset/sector-rotation` | `/api/macro/sector-rotation` alias | yes | yes | safe empty | smoke route |
| Vol heatmap | GET | `/api/multi-asset/volatility` | canonical `/api/macro/volatility-heatmap` missing alias | partial | partial | safe empty | add alias if needed |
| Providers health | GET | `/api/providers/health` | same | yes | yes | backend provider truth | ignore local override |
| Active providers | GET/POST | `/api/providers/active` | same | yes | yes | `{ ok, activeProviders }` | backend truth |
| Feed status | GET | `/api/feed/status` | same | yes | yes | provider status | Yahoo delayed not broken |
| Feeds tick/candle/orderbook | GET | `/api/feeds/*/:symbol` | same | yes | yes | JSON no fake data | smoke required |
| Portfolio | GET | `/api/portfolio/*` | same | yes | yes | zero/empty safe states | smoke required |
| Risk | GET | `/api/risk/*` | same | yes | yes | not_enough_data/null safe | smoke required |

## C. State matrix

| State | Store | Persisted key | Used by | Backend truth? | Risk | Fix |
|---|---|---|---|---|---|---|
| activeWorkspace | `workspaceStore` | `reversal-workspace` | desktop/mobile nav, shell | no | corrupt/stale workspace id | normalize + safe storage + versioned smoke |
| selectedDatasetId | `historicalDataStore` | not persisted before fix | Historical Data | backend registry | refresh loses selection | persist with version and refresh detail |
| selectedMlDatasetId | historical/AI/ML stores | fragmented/not persisted before fix | AI Lab, ML Dashboard, training | backend historical registry | AI Lab says no dataset after training/navigation | shared persisted historical selection + hydrate child stores |
| selectedBacktestDatasetId | historical/quant stores | fragmented/not persisted before fix | Backtesting | backend historical registry | backtests omit datasetId | shared persisted selection + payload guard |
| selectedCorrelationDatasetId | historical/macro stores | fragmented/not persisted before fix | Macro/correlation/beta | backend historical registry | beta/correlation use default or show NaN | shared persisted selection + finite rendering |
| provider selection | feed/live stores | localStorage may contain stale `providerSelection` | Live Data/Providers/Credentials | backend provider store | fallback_demo overrides backend | backend truth wins; no local authority |
| champion model | ML stores | transient only | AI Lab/ML Dashboard | `/api/ml/model` | duplicate screen mismatch | both stores reload same endpoint after promote |
| training status | AI/ML stores | transient | AI Lab/ML Dashboard | training route/registry | stale error after success | clear old errors on success, do not clear dataset |
| terminal layout | `terminalLayoutStore` | `reversal-terminal-layout` | shell | no | corrupt JSON/layout | safe persist merge/defaults |
| watchlist | `watchlistStore` | `terminal_watchlist_v2` | shell/watchlist panels | no | corrupt JSON/symbol undefined | safe normalize/dedupe |
| volume profile settings | `volumeProfileStore` | custom localStorage | panel | no | corrupt JSON | safe parse already present; smoke |
| websocket status | socket/ws store | transient | status bar/live panels | backend WS | infinite retry/blocking | cap reconnect/manual reconnect |

## D. Bug matrix

| Bug class | Evidence | Root cause | Files | Fix | Test |
|---|---|---|---|---|---|
| ML champion mismatch/dead endpoint | Source contains canonical `/api/ml/model`, tests guard `/api/ai/models`, but duplicate AI Lab/ML dashboard stores can diverge | duplicate ML stores without shared champion reload after promote | `src/api.js`, `src/store/aiLabStore.js`, `src/store/mlStore.js`, `src/workspaces/AILabWorkspace.jsx`, `src/workspaces/MLDashboard.jsx` | enforce canonical endpoints and reload champion/runs consistently | frontend smoke forbidden endpoint + ML tests |
| Selected dataset lost after navigation/refresh | historical store has selected dataset fields but no persist middleware | fragmented non-persisted state across historical/AI/ML/backtest/macro stores | `src/store/historicalDataStore.js`, `src/store/aiLabStore.js`, `src/store/mlStore.js`, `src/store/quantLabStore.js`, `src/store/macroStore.js` | persist versioned selected datasets; hydrate dependents | dataset persistence test/smoke |
| Missing use-for backend contract | canonical endpoints requested but historical router only has providers/datasets/download/jobs/delete | route/client actions absent | `server-deliverables/api/historicalRoutes.js`, `src/api.js`, `src/store/historicalDataStore.js` | add `/use-for-ml`, `/use-for-backtest`, `/use-for-correlation` JSON routes and client methods | backend/frontend route tests |
| NaN/Infinity beta/correlation | Macro beta rendering and backend computations referenced in scans; user observed Rolling Beta NaN | UI did not universally finite-guard every field/interpretation | `src/workspaces/MacroWorkspace.jsx`, `src/store/macroStore.js`, `server-deliverables/api/multiAssetRoutes.js` | finite formatters and null backend sanitizer | macro NaN render tests + backend smoke |
| Backend `/api/*` HTML/invalid JSON risk | server lacks final `/api` JSON 404/error middleware after mounted routes | Express default HTML for unknown routes/errors | `server/index.cjs`, `server-deliverables/api/jsonSafety.js` | add JSON-only API 404 and error handler | backend smoke unknown route |
| Portfolio/risk undefined crashes | stores/components fetch arrays/objects from live routes; tests mention Endpoint not available historical failures | callers may map or Object.keys undefined | portfolio/risk stores/components | normalize response arrays/objects | production stability tests |
| Provider inconsistency | provider frontend flow test seeds stale `providerSelection` localStorage | local storage can diverge from backend active providers | LiveData/provider stores | backend health/active source wins | provider flow test |
| Corrupt localStorage crash | workspace store safe; layout/watchlist lack custom safe storage/version validation | Zustand JSON parse can throw or merge invalid shapes | `workspaceStore`, `terminalLayoutStore`, `watchlistStore`, `storage.js` | safe JSON storage/merge/defaults | corrupt localStorage tests |
| Workspace crash blanks shell | ErrorBoundary exists; workspace wrapping must be verified | panel/workspace errors can escape if unwrapped | `src/components/ErrorBoundary.jsx`, shell/workspace rendering | wrap workspaces/panels and reset on navigation | terminal shell test |
| WebSocket retry blocks app | WS client parses and reconnects; cap/manual semantics need smoke | uncapped reconnect risk | `src/services/wsClient.js`, socket store | cap attempts and surface unavailable | WS reliability smoke |
| Python LogisticRegression failure | user requirement and existing training pipeline scan | deprecated/unsupported constructor arg risk | `server/ai/train_pipeline.py`, `server-deliverables/ai/training/train_pipeline.py` | no `multi_class=` and JSON failure diagnostics | pytest/help command |
