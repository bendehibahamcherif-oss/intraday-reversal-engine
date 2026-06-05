# Production API Verification — Remaining ML/Macro Bugs

Generated on 2026-06-05.

## Exact frontend calls inspected

| Panel | Component | Store/action | API function | Method | Exact URL | Params/body sent | Expected response |
|---|---|---|---|---|---|---|---|
| ML Diagnostics & Drift | `src/workspaces/MLDashboard.jsx` → `DriftDashboard` | `useMLStore.fetchDriftMetrics()` | `api.getMLDriftMetrics()` | GET | `/api/ml/drift` | none | `{ ok, drift:{ status, psi, features, lastComputedAt } }` |
| Model Training | `src/workspaces/AILabWorkspace.jsx` | `useAILabStore.trainModel()` | `api.trainMLModel()` | POST | `/api/ml/train` | JSON `{ symbol:'SPY', horizon, limit, modelType, nEstimators, maxDepth, learningRate }` | JSON success or `{ ok:false, status:'training_unavailable', message, details }` |
| Model Registry | `src/workspaces/AILabWorkspace.jsx` → `ModelRegistryTable` | `useAILabStore.loadModelRegistry()` | `api.getMLModelRegistry(symbol)` | GET | `/api/ml/model-runs?symbol=SPY` | optional `symbol`, uppercased | `{ ok, runs, symbol, status }` |
| Champion Model & Live Inference | `src/workspaces/AILabWorkspace.jsx` | `useAILabStore.loadChampionModel()` | `api.getChampionModel(symbol)` | GET | `/api/ml/model?symbol=SPY` | optional `symbol`, uppercased | `{ ok, champion, challengers, status }` |
| Champion Model & Live Inference | `src/workspaces/AILabWorkspace.jsx` | `useAILabStore.runInference()` | `api.runMLInference(symbol)` | POST | `/api/ml/infer/SPY` | JSON `{ horizon }` or inference config | `{ ok:false, status:'no_champion_model', message }` when no champion |
| Training Runs tab | `src/components/TrainingRunsPanel.jsx` | `useMLStore.fetchTrainingRuns()` | `api.getMLModelRuns(symbol)` | GET | `/api/ml/model-runs?symbol=SPY` when symbol is supplied, else `/api/ml/model-runs` | optional `symbol`, no undefined symbol | `{ ok, runs, symbol, status }` |
| Predictions tab | `src/workspaces/MLDashboard.jsx` → `PredictionHistoryTable` | `useMLStore.fetchPredictionHistory()` | `api.getMLPredictions()` | GET | `/api/ml/predictions?limit=100` | optional `symbol` supported | `{ ok, predictions, symbol, status }` |
| Model Card tab | `src/workspaces/MLDashboard.jsx` → `ModelCardViewer` | `useMLStore.fetchModelCard()` | `api.getMLModelCard()` | GET | `/api/ml/model-card` | none | `{ ok, modelCard, status }` |
| Feature importance | `src/workspaces/AILabWorkspace.jsx` | `useAILabStore.loadFeatureImportance(modelId)` | `api.getMLFeatureImportance(modelId)` | GET | `/api/ml/feature-importance?modelVersion=<modelId>` | optional model version | `{ ok, features, status }` |
| Macro rolling correlation | `src/workspaces/MacroWorkspace.jsx` | `useMacroStore.loadCorrelation()` | `api.getMultiAssetCorrelation()` | GET | `/api/multi-asset/correlation?window=20&timeframe=1d&symbols=SPY%2CQQQ%2CIWM%2CDIA%2CTLT%2CGLD` | symbols/window/timeframe | `{ ok, symbols, matrix, status }` |
| Macro beta | `src/workspaces/MacroWorkspace.jsx` | `useMacroStore.loadBeta()` | `api.getMultiAssetBeta()` | GET | `/api/multi-asset/beta?symbol=QQQ&benchmark=SPY&window=20&timeframe=1d` | symbol/benchmark/window/timeframe | `{ ok, symbol, benchmark, beta, r2, status }` |
| Macro sector rotation | `src/workspaces/MacroWorkspace.jsx` | `useMacroStore.loadSectorRotation()` | `api.getMultiAssetSectorRotation()` | GET | `/api/multi-asset/sector-rotation?window=20&timeframe=1d` | window/timeframe | `{ ok, sectors, status }` |
| Macro volatility heatmap | `src/workspaces/MacroWorkspace.jsx` | `useMacroStore.loadVolatility()` | `api.getMultiAssetVolatility()` | GET | `/api/multi-asset/volatility?window=20&timeframe=1d&symbols=SPY%2CQQQ%2CIWM%2CDIA%2CTLT%2CGLD` | symbols/window/timeframe | `{ ok, heatmap, volatility, status }` |

## Production endpoint verification

`API_BASE=https://reversal.onrender.com node scripts/production-api-smoke.js` was executed from this Codex environment. The environment proxy blocked outbound HTTPS CONNECT to Render, so the production results below are marked as environment-blocked rather than API-contract failures. The script still wrote `PRODUCTION_API_SMOKE_RESULTS.json` and will fail correctly in CI/Render if an endpoint returns 404, HTML, invalid JSON, or a bad shape.

| Endpoint | Status | Content-Type | Valid JSON? | Shape OK? | Problem |
|---|---:|---|---|---|---|
| `/api/ml/health` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/ml/model` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/ml/model-runs?symbol=SPY` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/ml/predictions?limit=100&symbol=SPY` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/ml/feature-importance` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/ml/drift` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/ml/model-card` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/ml/train` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/ml/infer/SPY` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/multi-asset/correlation?window=20&timeframe=1d&symbols=SPY%2CQQQ%2CIWM%2CDIA%2CTLT%2CGLD` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/multi-asset/beta?symbol=QQQ&benchmark=SPY&window=20&timeframe=1d` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/multi-asset/sector-rotation?window=20&timeframe=1d` | 0 |  | no | no | Codex egress blocked: `fetch failed` |
| `/api/multi-asset/volatility?window=20&timeframe=1d&symbols=SPY%2CQQQ%2CIWM%2CDIA%2CTLT%2CGLD` | 0 |  | no | no | Codex egress blocked: `fetch failed` |

## Local exact-contract verification after fix

The same smoke script was run against the local backend started from this branch:

```bash
PORT=4112 MONGO_URI='' node server/index.cjs
API_BASE=http://127.0.0.1:4112 node scripts/production-api-smoke.js
```

Result: all exact frontend endpoints returned JSON with the required top-level keys. The training endpoint returned a structured JSON unavailable/validation state instead of HTML or plain text, which is acceptable for the frontend empty-state path.
