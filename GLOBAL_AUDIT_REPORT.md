# GLOBAL_AUDIT_REPORT.md
**Intraday Reversal Engine — Full-Stack Audit**
Date: 2026-06-04 | Branch: `claude/intraday-reversal-frontend-audit-cM6Lu`

---

## 1. Architecture Cartography

### Frontend (Vite + React 18 + Zustand v5)

| Layer | Files | Notes |
|---|---|---|
| App shell | `src/App.jsx`, `src/TerminalTopBar.jsx`, `src/TerminalSidebar.jsx` | Bloomberg-style 48px topbar + 48px icon rail |
| Terminal UI | `src/components/terminal/` | CommandPalette, ResizableTerminalLayout, TerminalStatusBar, MobileBottomNav, LayoutPresetSelector |
| Workspaces | `src/workspaces/` (18 files) | Risk, Macro, Portfolio, Execution, Replay, QuantLab, StrategyLab, StrategyBuilder, PaperTrading, LiveData, ChartOrderflow, AILab, Alerts, OMS, Institutional, Ops, MLDashboard |
| Stores | `src/store/` (16 files) | Zustand v5, flat actions, granular selectors, `persist` middleware |
| Services | `src/services/wsClient.js` | Singleton WS client with reconnect, pub/sub, heartbeat |
| API | `src/api.js` | fetch wrapper, Auth JWT header, all REST calls |
| Styles | `src/styles/terminalTheme.css`, `src/terminal.css` | CSS variable token system |

### Backend (Express + CJS + Node.js)

| Layer | Entry / Files | Notes |
|---|---|---|
| HTTP server | `server/index.cjs` | Express + `ws` WebSocketServer on port 3001 |
| Runtime integration | `server/bootstrap/runtimeIntegration.js` | Mounts replay routes + wsBootstrap |
| Replay API | `server/api/` (3 files) | `/api/replay*`, `/api/realtime-replay`, `/api/replay-session` |
| WebSocket | `server/ws/` (5 files) | wsBootstrap, clientManager, broadcastEngine, heartbeat, recoveryEngine |
| Market data | `server/marketdata/` (4 files) | liveMarketPipeline, orderBookEngine, tickAggregator, candleBuilder |
| Runtime | `server/runtime/` (10 files) | runtimeBootstrapper, runtimeOrchestrator, runtimeEventBus, etc. |
| Phase 9A ML | `server-deliverables/ml/` | Single-worker Python subprocess, Phase 9A feature/signal pipeline |
| Phase 9B ML | `server-deliverables/ai/` | Worker-pool (×2) XGBoost inference, SQLite registry, PSI drift |
| Multi-asset | `server-deliverables/api/multiAssetRoutes.js` | Correlation, beta, sector rotation, volatility |
| Institutional | `server-deliverables/api/institutionalRoutes.js` | Vol/Kelly sizing, scenario analysis, audit trail |
| Phase 15 | `server-deliverables/middleware/`, `server-deliverables/observability/`, `server-deliverables/guardrails/`, `server-deliverables/api15/` | Correlation middleware, latency middleware, rate limiter, metrics, market session guardrails, ops status |
| Failover | `server-deliverables/failover/providerFailover.js` | Circuit breaker + provider chain |

---

## 2. Bug Inventory

### P0 — Data Correctness (Fixed)

| ID | Location | Bug | Fix Applied |
|---|---|---|---|
| P0-1 | `src/store/cvdStore.js:loadCVD()` | No AbortController → stale SPY response overwrites AAPL display on fast symbol switch | Added `_cvdAbort` module-level controller; abort previous request; guard `signal.aborted` and symbol-change post-await |
| P0-2 | `src/store/footprintStore.js:loadFootprint()` | Same race condition as P0-1 | Added `_footprintAbort` module-level controller; same guard pattern |
| P0-3 | `src/api.js:getChartCVD()` | Missing `signal` parameter, required by P0-1 fix | Added `{ signal }` option; passed to `fetch()` |
| P0-4 | `src/api.js:getChartFootprint()` | Missing `signal` parameter, required by P0-2 fix | Added `signal` to options destructure; passed to `fetch()` |

### P1 — Stability / Security (Fixed)

| ID | Location | Bug | Fix Applied |
|---|---|---|---|
| P1-1 | `src/workspaces/LiveDataWorkspace.jsx:line 98` | `useFeedStore()` without selector → component re-renders on every feedStore state mutation (every WS tick) | Replaced with `useFeedStore(useShallow((s) => s))` — shallow equality prevents re-renders when same-value fields are set |
| P1-2 | `server/index.cjs` | Phase 15 middleware (correlation, latency, rate limiter) NOT wired → no request tracing, no DDoS protection on heavy ML/multi-asset routes | Wired `correlationMiddleware`, `latencyMiddleware`, `rateLimiter()` per tier before route handlers |
| P1-3 | `server/index.cjs` | Phase 9B ML routes, multi-asset routes, institutional routes, ops routes, Prometheus `/metrics` endpoint — all NOT mounted | All six missing route groups wired with correct path prefixes |
| P1-4 | `server/index.cjs` | No `uncaughtException` / `unhandledRejection` process-level handlers → silent crashes | Added both handlers at process level before `start()` |
| P1-5 | `server/index.cjs` | Market session guardrail (`guardLiveOrder`) NOT enforced on `/api/execution/order` → live orders possible outside RTH | Wired `guardLiveOrder()` middleware on execution order path |
| P1-6 | `server-deliverables/ml/inferenceService.js:_worker.on('exit')` | Worker crash does not reject in-flight pending requests → requests hang indefinitely | Added loop over `_pendingRequests` in exit handler; clears all timers and rejects with descriptive error |

### P2 — Lower-severity (Not Fixed — Accepted)

| ID | Location | Issue | Rationale for deferral |
|---|---|---|---|
| P2-1 | `src/store/socketStore.js:line 53` | `setInterval` handle not stored; cannot be cleared (mitigated by `_initialized` guard — interval is created at most once per process) | Minor; no observable impact |
| P2-2 | `server-deliverables/ml/inferenceService.js` | Phase 9A: no restart after crash (single-worker mode; Phase 9B pool is primary) | Phase 9B pool handles primary inference; Phase 9A is fallback only |
| P2-3 | `server-deliverables/failover/providerFailover.js` | Circuit state not persisted across process restart | Intentional — state resets are safe; no persistent storage layer wired |
| P2-4 | `server-deliverables/middleware/rateLimiter.js` | `x-forwarded-for` header not validated for format — spoofable if not behind trusted reverse proxy | Deploy-time concern; not an application bug |
| P2-5 | `server-deliverables/guardrails/marketSessionGuardrails.js` | Holiday list hardcoded to 2026 | Needs annual update; low production risk in current paper-trade-only deployment |
| P2-6 | `server/ws/wsBootstrap.js:line 10` | `clientId` uses `Date.now() + Math.random()` not `crypto.randomUUID()` | Collision probability negligible at single-instance scale |
| P2-7 | `src/components/terminal/TerminalStatusBar.jsx` | Live clock runs in the same component as slow-changing socket state — extra re-renders per second | Extract `<Clock />` as memoized child; deferred to avoid gratuitous refactor |

---

## 3. Files Modified

| File | Change |
|---|---|
| `src/api.js` | Added `signal` option to `getChartCVD()` and `getChartFootprint()` |
| `src/store/cvdStore.js` | Module-level `_cvdAbort` controller; AbortController + stale guard in `loadCVD()` |
| `src/store/footprintStore.js` | Module-level `_footprintAbort` controller; AbortController + stale guard in `loadFootprint()` |
| `src/workspaces/LiveDataWorkspace.jsx` | `useFeedStore(useShallow((s) => s))` to prevent excessive re-renders |
| `server/index.cjs` | Wired Phase 15 middleware, ML routes, multi-asset routes, institutional routes, ops routes, Prometheus endpoint, market session guardrail, global error handlers |
| `server-deliverables/ml/inferenceService.js` | `_worker.on('exit')` now rejects and clears all in-flight pending requests |

---

## 4. Test Results

```
Terminal shell (26 tests): 26 passed, 0 failed
ML/Integration (31 tests): 31 passed, 0 failed
Build (Vite):              ✓ 118 modules — no new errors
```

Pre-existing empty test stubs (3 files: `featureLeakageGuards.test.js`, `featureService.test.js`, `mlSignal.int.test.js`) report "No test suite found" — not regressions.

---

## 5. Security Audit

- API keys for Polygon, AlphaVantage, IBKR stored server-side only via env vars — confirmed no key in frontend localStorage or source.
- Credentials endpoint returns masked status strings only — no raw key values ever sent to frontend.
- Rate limiting (30 req/min) now enforced on all heavy compute routes (`/api/ml`, `/api/multi-asset`, `/api/institutional`).
- Market session guardrail now active on `/api/execution/order` — paper-mode passes; live-mode rejected outside RTH.
- No live trading execution paths — paper-tested only.

---

## 6. Architecture Decisions Preserved

Per audit constraints, the following were explicitly NOT touched:

- `MarketStreamEngine`, `liveMarketPipeline`, `marketDataAdapter` — untouched
- `VolumeProfilePanel`, `VolumeProfileStore` — untouched
- Core orderflow/footprint data pipeline — data normalisation logic untouched (only AbortController added around the fetch call)
- Execution Layer — untouched
- Provider failover chain — untouched
- Existing API contracts — all preserved; only new routes added
