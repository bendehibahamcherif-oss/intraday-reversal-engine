# GLOBAL PLATFORM AUDIT — intraday-reversal-engine

**Audit date**: 2026-06-04  
**Branch**: `claude/intraday-reversal-frontend-audit-cM6Lu`  
**Status**: Production stabilization in progress

---

## 1. ARCHITECTURE OVERVIEW

### Dual-Backend Architecture

The frontend (`VITE_API_BASE`) targets **two separate backend processes**:

| Backend | Repo | Routes |
|---------|------|--------|
| **This repo** (`server/index.cjs`) | `bendehibahamcherif-oss/intraday-reversal-engine` | `/api/ml/*`, `/api/portfolio/*`, `/api/paper/*`, `/api/multi-asset/*`, `/api/institutional/*`, `/api/ops/*`, `/api/replay/*`, `/api/monitoring`, `/api/runtime`, `/health`, `/metrics`, `POST /api/market/tick`, `WS /ws` |
| **Reversal backend** (separate repo) | Not available in this environment | `/api/feeds/*`, `/api/providers/*`, `/api/chart/*`, `/api/volume-profile/*`, `/auth/*`, `/api/alerts/*`, `/api/strategy-lab/*`, `/api/rules/*`, `/api/backtest/*`, `/api/validation/*`, `/api/execution/*`, `/api/oms/*`, `/api/market/runtime`, `/api/market/subscriptions`, `/api/providers/health` |

**Critical**: The frontend environment variable `VITE_API_BASE` points to a single URL (`https://reversal.onrender.com`). Both backends are expected to be co-deployed or reverse-proxied behind the same origin.

---

## 2. FRONTEND STACK

| Layer | Technology | Version |
|-------|-----------|---------|
| UI Framework | React | 18.3.1 |
| State | Zustand | 5.0.3 |
| Build | Vite + @vitejs/plugin-react | 5.4.10 / 4.3.1 |
| WebSocket | Custom ResilientWebSocket class | ws 8.18.0 |
| Real-time | socket.io-client (legacy) | 4.8.1 |
| Testing | Vitest + @testing-library/react | 4.1.7 |

### 27 Zustand Stores (src/store/)

| Store | Persists to localStorage | Key Purpose |
|-------|--------------------------|-------------|
| activeSymbolStore | No | Current symbol, WS subscription |
| aiLabStore | No | AI Lab: training runs, model versions |
| alertStore | No | Alert management |
| chartStore | No | Chart display settings |
| commandPaletteStore | No | Keyboard shortcut palette |
| cvdStore | No | Cumulative Volume Delta |
| executionStore | No | Order execution tracking |
| feedStore | No | Feed sources, provider health, credentials status |
| footprintStore | No | Market Footprint visualization |
| institutionalStore | No | Institutional position sizing |
| macroStore | No | Macro market conditions |
| marketRuntimeStore | No | Market feed runtime status |
| marketStore | No | Real-time market data cache |
| mlSignalStore | No | ML signal state |
| mlStore | No | ML Engine: models, predictions, drift |
| omsStore | No | Order Management System |
| opsStore | No | Operational status |
| paperTradingStore | No | Paper trading account |
| portfolioStore | No | Portfolio analytics |
| quantLabStore | No | Quantitative analysis |
| replayStore | No | Historical replay control |
| ruleBuilderStore | No | Rule builder for strategies |
| socketStore | No | WebSocket connection state |
| strategyLabStore | No | Strategy development |
| terminalLayoutStore | No | Terminal UI layout |
| volumeProfileStore | No | Volume Profile visualization |
| watchlistStore | No | Symbol watchlist |
| workspaceStore | No | Current workspace |

**Note**: No store uses Zustand `persist` middleware. All state is in-memory and resets on browser reload. Provider selections, credential status, and active symbols are re-fetched from the backend on init.

---

## 3. API CLIENT (src/api.js — 899 lines)

### Base URL Resolution

```js
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:10000';
```

### Auth

- JWT Bearer token via `getToken()` / localStorage
- Legacy fallback: `X-User-Token` header
- Routes: `/auth/login`, `/auth/register`, `/auth/me`

### Error Normalization

All API errors pass through `normalizeApiError()` which produces:
```js
{
  message: string,  // Human-readable
  status: number,   // HTTP status code
  method: string,   // GET/POST/etc
  url: string,      // Full URL
  responseBody: any // Raw response
}
```

---

## 4. ROUTE INVENTORY: Frontend Calls vs Backend Existence

### Routes in THIS repo (always available)

| Endpoint | Backend File | Notes |
|----------|-------------|-------|
| `GET /health` | server/index.cjs | Basic health |
| `GET /api/monitoring` | server/monitoring/runtimeHealthEndpoint.js | Runtime health |
| `GET /api/runtime` | server/monitoring/runtimeHealthEndpoint.js | Same |
| `POST /api/market/tick` | server/index.cjs | Tick ingestion |
| `GET /metrics` | server/index.cjs | Prometheus |
| `WS /ws` | server/ws/wsBootstrap.js | WebSocket |
| `GET /api/replay/candles/:symbol` | server/api/replayRoutes.js | |
| `GET /api/replay/ticks/:symbol` | server/api/replayRoutes.js | |
| `POST /api/replay/start` | server/api/replaySessionRoutes.js | |
| `POST /api/replay/pause` | server/api/replaySessionRoutes.js | |
| `POST /api/replay/resume` | server/api/replaySessionRoutes.js | |
| `POST /api/replay/stop` | server/api/replaySessionRoutes.js | |
| `GET /api/ml/health` | server-deliverables/ai/mlRoutes.js | |
| `GET /api/ml/model` | server-deliverables/ai/mlRoutes.js | |
| `POST /api/ml/infer/:symbol` | server-deliverables/ai/mlRoutes.js | |
| `POST /api/ml/train` | server-deliverables/ai/mlRoutes.js | |
| `GET /api/ml/model-runs` | server-deliverables/ai/mlRoutes.js | |
| `GET /api/ml/predictions` | server-deliverables/ai/mlRoutes.js | |
| `GET /api/ml/feature-importance` | server-deliverables/ai/mlRoutes.js | |
| `GET /api/ml/drift` | server-deliverables/ai/mlRoutes.js | |
| `GET /api/ml/model-card` | server-deliverables/ai/mlRoutes.js | |
| `POST /api/ml/models/:version/promote` | server-deliverables/ai/mlRoutes.js | |
| `GET /api/portfolio/positions` | server-deliverables/api/portfolioRoutes.js | Returns empty shape |
| `GET /api/portfolio/pnl` | server-deliverables/api/portfolioRoutes.js | Returns empty shape |
| `GET /api/portfolio/exposure` | server-deliverables/api/portfolioRoutes.js | Returns empty shape |
| `GET /api/portfolio/drawdown` | server-deliverables/api/portfolioRoutes.js | Returns empty shape |
| `POST /api/portfolio/var` | server-deliverables/api/portfolioRoutes.js | Returns empty shape |
| `POST /api/portfolio/stress-test` | server-deliverables/api/portfolioRoutes.js | Returns empty shape |
| `POST /api/paper/orders` | server-deliverables/api/portfolioRoutes.js | |
| `GET /api/paper/orders` | server-deliverables/api/portfolioRoutes.js | |
| `DELETE /api/paper/orders/:id` | server-deliverables/api/portfolioRoutes.js | |
| `GET /api/paper/fills` | server-deliverables/api/portfolioRoutes.js | |
| `GET /api/paper/positions` | server-deliverables/api/portfolioRoutes.js | |
| `GET /api/paper/risk/status` | server-deliverables/api/portfolioRoutes.js | |
| `POST /api/paper/risk/kill-switch` | server-deliverables/api/portfolioRoutes.js | |
| `DELETE /api/paper/risk/kill-switch` | server-deliverables/api/portfolioRoutes.js | |
| `POST /api/paper/reset` | server-deliverables/api/portfolioRoutes.js | |
| `GET /api/multi-asset/correlation` | server-deliverables/api/multiAssetRoutes.js | |
| `GET /api/multi-asset/beta` | server-deliverables/api/multiAssetRoutes.js | |
| `GET /api/multi-asset/sector-rotation` | server-deliverables/api/multiAssetRoutes.js | |
| `GET /api/multi-asset/volatility` | server-deliverables/api/multiAssetRoutes.js | |
| `POST /api/institutional/analysis` | server-deliverables/api/institutionalRoutes.js | |
| `POST /api/institutional/scenarios` | server-deliverables/api/institutionalRoutes.js | |
| `GET /api/institutional/audit` | server-deliverables/api/institutionalRoutes.js | |
| `GET /api/ops/status` | server-deliverables/api15/opsRoutes.js | |

### Routes in the REVERSAL backend (may 404 if not co-deployed)

| Endpoint | Consumer | Impact on UI |
|----------|---------|--------------|
| `GET /api/feeds/status` | feedStore.loadFeedStatus | Feed status panel shows empty |
| `GET /api/feeds/providers` | feedStore.loadProviders | Provider list empty |
| `GET /api/feeds/providers/active` | feedStore.loadActiveProviders | Active providers unknown |
| `POST /api/feeds/providers/active` | feedStore.saveActiveProviders | Provider selection save fails |
| `GET /api/feeds/tick/:symbol` | feedStore.loadLatestMarketData | Tick data unavailable |
| `GET /api/feeds/candle/:symbol` | feedStore.loadLatestMarketData | Candle data unavailable |
| `GET /api/feeds/orderbook/:symbol` | feedStore.loadLatestMarketData | Order book unavailable |
| `POST /api/feeds/start` | feedStore | Feed start fails |
| `POST /api/feeds/stop` | feedStore | Feed stop fails |
| `POST /api/feeds/providers/:p/credentials` | feedStore.saveCredentials | Credential save fails |
| `DELETE /api/feeds/providers/:p/credentials` | feedStore.deleteCredentials | Credential delete fails |
| `GET /api/providers/credentials` | feedStore | Credential list fails |
| `POST /api/providers/credentials` | feedStore | Credential save fails |
| `GET /api/providers/health` | marketRuntimeStore | Provider health unknown |
| `GET /api/chart/candles/:symbol` | Chart workspace | Chart fails |
| `GET /api/chart/payload/:symbol` | Chart workspace | Chart fails |
| `GET /api/chart/indicators/:symbol` | Chart workspace | Indicators fail |
| `GET /api/volume-profile/:symbol` | Volume profile | VP fails |
| `GET /auth/login` | AuthGate | Login fails |
| `GET /auth/register` | AuthGate | Register fails |
| `GET /auth/me` | AuthGate | Auth fails |
| `GET /api/alerts` | alertStore | Alerts 404 |
| `POST /api/alerts` | alertStore | Create alert fails |
| `GET /api/strategy-lab/*` | strategyLabStore | Strategies 404 |
| `GET /api/backtest/*` | strategyLabStore | Backtest 404 |
| `GET /api/rules/*` | ruleBuilderStore | Rules 404 |
| `GET /api/execution/*` | executionStore | Execution 404 |
| `GET /api/oms/*` | omsStore | OMS 404 |
| `GET /api/market/runtime` | marketRuntimeStore | Runtime unknown |

---

## 5. WEBSOCKET ARCHITECTURE

**Client**: `src/services/wsClient.js` — `ResilientWebSocket` class

**URL Resolution** (priority order):
1. `VITE_WS_URL` env override
2. Derive from `VITE_API_BASE`: `https://...` → `wss://...`, `http://...` → `ws://...`
3. Current page origin (`window.location`) — ensures `wss://` on HTTPS pages
4. Fallback: `ws://localhost:3001/ws`

**Resilience**:
- Auto-reconnect with exponential backoff (up to 5s, unlimited attempts)
- Heartbeat ping every 5s
- Stale-feed watchdog: marks stale after 15s of silence
- Channel subscription/unsubscription
- Connection/disconnection lifecycle callbacks

**Server** (`server/ws/wsBootstrap.js`):
- Heartbeat ping/pong (5s interval)
- Client tracking via `clientManager`
- Channel-based broadcast via `broadcastEngine`
- Message recovery for missed sequences (`recoveryEngine`)

**Known Issue**: If `VITE_API_BASE` is not set and the app is served over HTTPS, the fallback uses `window.location` which correctly derives `wss://`. Fixed in this branch.

---

## 6. ML ENGINE

### Phase 9A (JavaScript fallback — `server-deliverables/ml/`)
- In-memory model registry
- XGBoost training via Python subprocess (`python/train_xgboost.py`)
- Inference via worker pool
- Routes registered as `/api/ml/*` backward-compat aliases

### Phase 9B (Python workers — `server-deliverables/ai/`)
- Python worker pool (`inference/infer_worker.py`)
- XGBoost inference with SHAP values
- Data drift monitoring via PSI
- Model card generation
- Routes: `mlRoutes.js` registered at `/api/ml/*`

**All ML routes return stable empty-state shapes when no model is available** (HTTP 200, `ok: false`).

---

## 7. DATA FLOWS

### Market Data Initialization

```
initializeFeedWorkspace()
  → loadActiveProviders()    → GET /api/feeds/providers/active
  → loadFeedStatus()         → GET /api/feeds/status
  → loadLatestMarketData()   → GET /api/feeds/tick/:symbol + GET /api/feeds/candle/:symbol + GET /api/feeds/orderbook/:symbol
  → loadProviders()          → GET /api/feeds/providers
```

### ML Inference

```
mlInfer(symbol, featureVector)
  → POST /api/ml/infer/:symbol
  → Python worker pool (pythonInference.js)
  → infer_worker.py (XGBoost predict)
  → {signal, confidence, probabilities, shapValues}
  → mlSignalStore / mlStore
```

### WebSocket Ticks

```
wsClient.connect() → WS /ws
  → wsBootstrap (server)
  → clientManager.addClient()
  → wsClient.subscribe('ticks:SPY')
  → broadcastEngine.broadcast() on tick ingestion
  → marketStore.updateTick()
  → watchlistStore.updatePrice()
```

---

## 8. SECURITY

| Control | Implementation |
|---------|---------------|
| Auth | JWT Bearer (localStorage) + X-User-Token fallback |
| Rate limiting | Tiered: api(200/min), auth(20/min), ws(500/min), heavy(30/min) |
| Market session guard | Blocks live orders outside RTH (9:30-16:00 ET) |
| CORS | Allows Render domains + localhost |
| WS auth | `x-auth-token` header validated by `wsAuthMiddleware` |
| **Credentials** | Provider API keys stored ONLY on backend — never in localStorage |

---

## 9. KNOWN PRODUCTION ISSUES (pre-audit)

| # | Severity | Issue | Root Cause | Status |
|---|----------|-------|-----------|--------|
| 1 | Critical | React crash `d.toFixed is not a function` | `.toFixed()` called on string API values in 5 components | **FIXED** |
| 2 | High | Portfolio/Risk 404s | Routes missing from backend | **FIXED** — stable empty shapes returned |
| 3 | High | WebSocket always DISCONNECTED on HTTPS | `ws://` used instead of `wss://` | **FIXED** — `wss://` derived from API base |
| 4 | High | ML model 404s | Endpoint returned 404 instead of empty shape | **FIXED** — 200 + `ok: false` |
| 5 | High | Terminal crash swallowed | ErrorBoundary showed "System Error" with no details | **FIXED** — shows message + reset/reload buttons |
| 6 | Medium | Raw "HTTP 404" in UI error messages | No STATUS_MESSAGES mapping | **FIXED** — human-readable messages |
| 7 | Medium | `PredictionHistoryTable` crash on null | Missing `Array.isArray` guard | **FIXED** |
| 8 | Medium | Provider credential inconsistency | `missing_credentials` from feed status not synced to `providerCredentialsStatus` | **FIXED** in this branch |
| 9 | Low | Vitest finds ML files with custom harness | No exclude pattern in vitest config | **FIXED** |

---

## 10. ARCHITECTURAL CONSTRAINTS

1. **Two backends** — frontend cannot be fully functional without both backends running at the same API base URL
2. **No localStorage persistence** — all state is ephemeral; provider selections, watchlists, and chart settings reset on reload (intentional — backend is source of truth)
3. **Python worker dependency** — ML inference requires Python 3.x + XGBoost installed; falls back to Phase 9A JavaScript
4. **MongoDB optional** — replay persistence requires MongoDB; degrades gracefully to in-memory
5. **Market hours enforcement** — live orders blocked outside 09:30–16:00 ET; paper trading always allowed
6. **No live trading** — paper-tested only; live execution layer is present but disabled

---

## 11. DEPENDENCY RISK

| Dependency | Risk | Notes |
|-----------|------|-------|
| `react-resizable-panels` | Low | Pinned 4.11.2 |
| `zustand` | Low | Flat actions pattern; no nested setState |
| `socket.io-client` | Low | Legacy, not used for primary WS |
| Python subprocess for ML | Medium | Must be installed separately; worker fails silently |
| MongoDB | Low | Graceful degradation to in-memory |
| Reversal backend | High | Charts, auth, alerts, feeds all depend on it |

---

## 12. TEST COVERAGE

**Passing tests** (46 tests across 3 files):
- `productionStability.test.jsx` — 25 tests: API error handling, feed store, socket store, portfolio store, ML store, ErrorBoundary
- `symbolInput.test.jsx` — 10 tests: Symbol input component
- `terminalShell.test.jsx` — 11 tests: Terminal shell rendering

**Excluded from Vitest** (custom node-run harness):
- `server-deliverables/ml/__tests__/featureLeakageGuards.test.js`
- `server-deliverables/ml/__tests__/featureService.test.js`
- `server-deliverables/ml/__tests__/mlSignal.int.test.js`

Run ML tests with: `node server-deliverables/ml/__tests__/featureService.test.js`
