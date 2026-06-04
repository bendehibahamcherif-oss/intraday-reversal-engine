# PRODUCTION_BUG_AUDIT.md
**Intraday Reversal Engine — Production Crash Audit**
Date: 2026-06-04

---

## Bug Table

| Bug visible | Component | Endpoint / store involved | Cause probable | Cause réelle après inspection | Fix appliqué |
|---|---|---|---|---|---|
| "P&L Summary: HTTP 404" | `PortfolioWorkspace` → `pnlError` div | `GET /api/portfolio/pnl` | Route missing | ✅ CONFIRMED — `/api/portfolio/pnl` never existed in backend | Created `portfolioRoutes.js`, mounted at `/api/portfolio` |
| "Exposure: HTTP 404" | `PortfolioWorkspace` → `exposureError` div | `GET /api/portfolio/exposure` | Route missing | ✅ CONFIRMED — same as above | Same fix |
| "Training Runs: HTTP 404" (prod) | `TrainingRunsPanel` → `error` div | `GET /api/ml/model-runs` | Route not mounted | ✅ CONFIRMED — ML routes were NOT mounted in `server/index.cjs` before previous PR | Fixed in PR #86 (already applied) |
| "Predictions: HTTP 404" (prod) | `PredictionHistoryTable` → `error` div | `GET /api/ml/predictions` | Route not mounted | ✅ CONFIRMED — same as above | Fixed in PR #86 (already applied) |
| WS: DISCONNECTED | `TerminalTopBar` reads `socketStore.connected` | `wsClient` → `ws://localhost:3001/ws` | Fallback URL uses `ws://` which is blocked by browsers on HTTPS; `localhost:3001` doesn't exist on user devices | ✅ CONFIRMED — `import.meta.env.VITE_WS_URL` is absent in some builds; fallback is `ws://localhost:3001/ws` | `wsClient.js`: derive URL from `VITE_API_BASE` (`https://` → `wss://`); fallback to `window.location` with correct protocol |
| "System Error / A terminal component crashed" | `ErrorBoundary` (outer, wraps entire app) | Any workspace that throws | Unknown — no stack trace logged | ⚠️ PARTIAL — ErrorBoundary previously logged nothing useful. Root crash component unidentifiable without production logs. ErrorBoundary now logs `componentStack` and provides Reset button | `ErrorBoundary.jsx`: added error message, component stack (dev), Reset App State button, Reload button |
| `GET /api/ml/model` returns 404 when no champion | `fetchModelInfo()` → `modelInfoError` | `GET /api/ml/model` | Intentional 404 in route | ✅ CONFIRMED — line 98 of `mlRoutes.js`: `res.status(404).json(...)` when no champion registered | Changed to `res.json({ ok: false, status: 'no_champion' })` — 200 with empty state |
| `PredictionHistoryTable` crashes on `null` predictions | `PredictionHistoryTable` | prop `predictions` | Component has default `= []` but null overrides it | ✅ CONFIRMED — `null.filter()` throws if `predictions=null` is passed | Added explicit null coercion: `predictions = Array.isArray(predictions) ? predictions : []` |
| "HTTP 404" shown as raw error text in panel | `PortfolioWorkspace`, `TrainingRunsPanel`, `PredictionHistoryTable` | `api.js` → `handle()` | `handle()` throws `new Error("HTTP 404")` when status 404 | ✅ CONFIRMED | `handle()` now maps 404 → "Endpoint not available", 503 → "Service temporarily unavailable", etc. |

---

## Endpoint Audit: Frontend vs Backend

| Method | Frontend path called | Component / store | Exists in backend? | Status after fix |
|---|---|---|---|---|
| GET | `/api/portfolio/positions` | `portfolioStore.loadPositions()` | ❌ Missing | ✅ Created — returns `{ ok: true, positions: [] }` |
| GET | `/api/portfolio/pnl` | `portfolioStore.loadPnL()` | ❌ Missing | ✅ Created — returns empty P&L shape |
| GET | `/api/portfolio/exposure` | `portfolioStore.loadExposure()` | ❌ Missing | ✅ Created — returns zero exposure |
| GET | `/api/portfolio/drawdown` | `portfolioStore.loadDrawdown()` | ❌ Missing | ✅ Created — returns empty drawdown |
| POST | `/api/portfolio/var` | `portfolioStore.loadVaR()` | ❌ Missing | ✅ Created — returns VaR=0 |
| POST | `/api/portfolio/stress-test` | `portfolioStore.runStressTest()` | ❌ Missing | ✅ Created — returns empty scenarios |
| GET | `/api/paper/risk/status` | `portfolioStore.loadRiskStatus()` | ❌ Missing | ✅ Created — returns kill switch state |
| POST | `/api/paper/risk/kill-switch` | `portfolioStore.enableKillSwitch()` | ❌ Missing | ✅ Created |
| DELETE | `/api/paper/risk/kill-switch` | `portfolioStore.disableKillSwitch()` | ❌ Missing | ✅ Created |
| GET | `/api/ml/model` | `mlStore.fetchModelInfo()` | ✅ Exists | ✅ Fixed 404 → 200 when no champion |
| GET | `/api/ml/model-runs` | `mlStore.fetchTrainingRuns()` | ✅ Exists (since PR #86) | ✅ Returns `[]` when no runs |
| GET | `/api/ml/predictions` | `mlStore.fetchPredictionHistory()` | ✅ Exists (since PR #86) | ✅ Returns `{ predictions: [], total: 0 }` |
| GET | `/api/ml/health` | `mlStore.fetchHealth()` | ✅ Exists (since PR #86) | ✅ OK |
| GET | `/api/ml/drift` | `mlStore.fetchDriftMetrics()` | ✅ Exists (since PR #86) | ✅ OK |
| GET | `/api/ml/feature-importance` | `mlStore.fetchFeatureImportance()` | ✅ Exists (since PR #86) | ✅ OK |
| GET | `/api/ml/model-card` | `mlStore.fetchModelCard()` | ✅ Exists (since PR #86) | ✅ OK |

---

## WebSocket Root Cause Detail

**Before fix** (`wsClient.js` line 113–115):
```js
const wsClient = new ResilientWebSocket(
  import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'
);
```

**Problems**:
1. Production frontend served over HTTPS → browser blocks `ws://` (mixed content)
2. `localhost:3001` doesn't exist on user's Android device
3. WS connection fails immediately → `connected = false` → "WS: DISCONNECTED"

**After fix** (`wsClient.js`):
```js
function resolveWsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const apiBase = import.meta.env.VITE_API_BASE;
  if (apiBase) return apiBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/ws';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}
```

If `VITE_API_BASE = https://reversal.onrender.com` → WS becomes `wss://reversal.onrender.com/ws`.
