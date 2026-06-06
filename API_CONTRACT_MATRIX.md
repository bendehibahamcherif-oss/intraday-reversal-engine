# API Contract Matrix

Generated during the functional stabilization pass. Every endpoint below is either mounted by this repository backend or marked `not_implemented_but_safe` when no frontend runtime call should be made.

| Frontend endpoint | Backend route | Method | Exists | Mounted | Response schema | Consumer | Status | Fix |
|---|---|---:|---|---|---|---|---|---|
| `/api/feed/status` | `server/providerStateService.cjs` | GET | yes | yes (`/api`) | `{ success, providers, activeProviders, feedStatus }` | Live Data, Stream Status, Diagnostics | fixed | canonical provider/feed truth |
| `/api/providers/health` | `server/providerStateService.cjs` | GET | yes | yes (`/api`) | `{ success, providers, activeProviders, providerOrder }` | Providers, Diagnostics | fixed | credentials/runtime consistency |
| `/api/providers/credentials` | `server/providerStateService.cjs` | GET | yes | yes (`/api`) | `{ success, credentials }` | Credentials | fixed | backend canonical credential state |
| `/api/providers/credentials/:providerId` | `server/providerStateService.cjs` | POST | yes | yes (`/api`) | `{ success, provider, credentials, providers }` | Credentials | fixed | save Alpha Vantage and refresh truth |
| `/api/providers/credentials/:providerId` | `server/providerStateService.cjs` | DELETE | yes | yes (`/api`) | `{ success, provider, credentials, providers }` | Credentials | fixed | remove credential and active invalid provider |
| `/api/providers/active` | `server/providerStateService.cjs` | GET | yes | yes (`/api`) | `{ success, providers, activeProviders, providerOrder }` | Provider selection | fixed | fallback_demo is not re-added silently |
| `/api/providers/active` | `server/providerStateService.cjs` | POST | yes | yes (`/api`) | `{ success, providers, activeProviders, providerOrder }` or 400 structured error | Provider selection | fixed | rejects selected credentialed provider without key |
| `/api/feeds/tick/:symbol` | `server/providerStateService.cjs` | GET | yes | yes (`/api`) | `{ ok, tick:null, symbol, source, status }` | Live Data latest tick | fixed | no 404, no fake tick |
| `/api/feeds/candle/:symbol` | `server/providerStateService.cjs` | GET | yes | yes (`/api`) | `{ ok, candle:null, symbol, timeframe, source, status }` | Chart/Live Data latest candle | fixed | no 404, no fake candle |
| `/api/feeds/orderbook/:symbol` | `server/providerStateService.cjs` | GET | yes | yes (`/api`) | `{ ok, orderBook:null, symbol, source, status }` | Live Data order book | fixed | no 404, no fake orderbook |
| `/api/feeds/start` | `server/providerStateService.cjs` | POST | yes | yes (`/api`) | provider health contract | Live Data controls | fixed | mounted legacy control path |
| `/api/feeds/stop` | `server/providerStateService.cjs` | POST | yes | yes (`/api`) | provider health contract | Live Data controls | fixed | mounted legacy control path |
| `/api/feeds/demo/tick/:symbol` | `server/providerStateService.cjs` | POST | yes | yes (`/api`) | `{ ok:false, tick:null, status:'demo_generation_disabled' }` | Demo generator panel | fixed | mounted safe endpoint without fake data |
| `/api/feeds/demo/candle/:symbol` | `server/providerStateService.cjs` | POST | yes | yes (`/api`) | `{ ok:false, candle:null, status:'demo_generation_disabled' }` | Demo generator panel | fixed | mounted safe endpoint without fake data |
| `/api/feeds/demo/orderbook/:symbol` | `server/providerStateService.cjs` | POST | yes | yes (`/api`) | `{ ok:false, orderBook:null, status:'demo_generation_disabled' }` | Demo generator panel | fixed | mounted safe endpoint without fake data |
| `/api/ml/health` | `server-deliverables/ai/mlRoutes.js` | GET | yes | yes (`/api/ml`) | `{ ok:true, status:'available', worker }` | ML Dashboard | fixed | returns available/no worker state |
| `/api/ml/model` | `server-deliverables/ai/mlRoutes.js` | GET | yes | yes (`/api/ml`) | `{ ok, champion, challengers, status }` | Champion/Registry | fixed | no 404 for no model |
| `/api/ml/model-runs` | `server-deliverables/ai/mlRoutes.js` | GET | yes | yes (`/api/ml`) | `{ ok, runs }` | Model Registry/Training Runs | fixed | empty registry safe state |
| `/api/ml/predictions` | `server-deliverables/ai/mlRoutes.js` | GET | yes | yes (`/api/ml`) | `{ ok, predictions }` | Prediction History | fixed | empty predictions safe state |
| `/api/ml/feature-importance` | `server-deliverables/ai/mlRoutes.js` | GET | yes | yes (`/api/ml`) | `{ ok, features }` | Feature Importance | fixed | empty features safe state |
| `/api/ml/drift` | `server-deliverables/ai/mlRoutes.js` | GET | yes | yes (`/api/ml`) | `{ ok, drift:{ status, psi, features, lastComputedAt } }` | Diagnostics & Drift | fixed | not_enough_data instead of unavailable |
| `/api/ml/model-card` | `server-deliverables/ai/mlRoutes.js` | GET | yes | yes (`/api/ml`) | `{ ok, modelCard, status }` | Model Card | fixed | not_available instead of unavailable |
| `/api/ml/infer/:symbol` | `server-deliverables/ai/mlRoutes.js` | POST | yes | yes (`/api/ml`) | `{ ok:false, status:'no_champion_model', message }` when no champion | Champion Inference | fixed | no trained model is explicit |
| `/api/portfolio/summary` | `server-deliverables/api/portfolioRoutes.js` | GET | yes | yes (`/api/portfolio`) | `{ ok, summary }` | Portfolio | fixed | added safe empty route |
| `/api/portfolio/positions` | `server-deliverables/api/portfolioRoutes.js` | GET | yes | yes (`/api/portfolio`) | `{ ok, positions:[] }` | Portfolio | fixed | no open positions state |
| `/api/portfolio/pnl` | `server-deliverables/api/portfolioRoutes.js` | GET | yes | yes (`/api/portfolio`) | `{ ok, pnl }` | Portfolio | fixed | zero PnL state |
| `/api/portfolio/exposure` | `server-deliverables/api/portfolioRoutes.js` | GET | yes | yes (`/api/portfolio`) | `{ ok, exposure }` | Portfolio/Risk | fixed | zero exposure state |
| `/api/portfolio/drawdown` | `server-deliverables/api/portfolioRoutes.js` | GET | yes | yes (`/api/portfolio`) | `{ ok, drawdown }` | Risk/Portfolio | fixed | no history state |
| `/api/portfolio/history` | `server-deliverables/api/portfolioRoutes.js` | GET | yes | yes (`/api/portfolio`) | `{ ok, history:[] }` | Portfolio | fixed | added safe empty route |
| `/api/risk/summary` | `server-deliverables/api/riskRoutes.js` | GET | yes | yes (`/api/risk`) | `{ ok, risk }` | Risk | fixed | added safe empty route |
| `/api/risk/limits` | `server-deliverables/api/riskRoutes.js` | GET | yes | yes (`/api/risk`) | `{ ok, limits:[] }` | Risk | fixed | added safe empty route |
| `/api/risk/var` | `server-deliverables/api/riskRoutes.js` | GET | yes | yes (`/api/risk`) | `{ ok, var }` | Risk | fixed | added safe empty route |
| `/api/risk/drawdown` | `server-deliverables/api/riskRoutes.js` | GET | yes | yes (`/api/risk`) | `{ ok, drawdown }` | Risk | fixed | added safe empty route |
| `/api/risk/exposure` | `server-deliverables/api/riskRoutes.js` | GET | yes | yes (`/api/risk`) | `{ ok, exposure, risk }` | Risk | fixed | added safe empty route |
| `/api/risk/alerts` | `server-deliverables/api/riskRoutes.js` | GET | yes | yes (`/api/risk`) | `{ ok, alerts:[] }` | Risk | fixed | added safe empty route |
| Strategy Lab/Quant Lab advanced AI endpoints | runtime/legacy modules | mixed | partial | partial | feature-specific | Strategy Lab, Quant Lab | not_implemented_but_safe | panels catch endpoint errors; no fake trading data added |
