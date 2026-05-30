# Phase 15 — Professional Platform Hardening: Backend Integration Guide

## Files delivered

```
server-deliverables/
├── package.json                        ← "type": "commonjs" (required for Node ESM compatibility)
├── observability/
│   ├── logger.js                       ← Structured NDJSON logger
│   └── metrics.js                      ← In-process Prometheus-compatible metrics
├── middleware/
│   ├── correlationMiddleware.js        ← Correlation/trace/tenant ID injection
│   ├── latencyMiddleware.js            ← HTTP latency recording + structured access logs
│   └── rateLimiter.js                  ← Sliding-window rate limiter (4 tiers)
├── guardrails/
│   └── marketSessionGuardrails.js     ← US equity RTH guardrails (no external deps)
├── ws/
│   └── wsScalingAdapter.js            ← WS broadcast adapter (in-memory / Redis upgrade path)
├── failover/
│   └── providerFailover.js            ← Circuit breaker + failover chain + drill runner
├── config/
│   └── runtimeConfig.js               ← Centralized env-var config with startup validation
└── api15/
    └── opsRoutes.js                    ← GET /api/ops/status health endpoint
```

## Wiring into the backend Express app

### 1. Install (no new packages required)
All modules use only Node.js stdlib.

### 2. Register middleware (app.js / server.js)

```js
const { correlationMiddleware }  = require('./middleware/correlationMiddleware');
const { latencyMiddleware }      = require('./middleware/latencyMiddleware');
const { rateLimiter }            = require('./middleware/rateLimiter');
const config                     = require('./config/runtimeConfig');
const metrics                    = require('./observability/metrics');

// Before routes
app.use(correlationMiddleware());
app.use(latencyMiddleware());

// Rate limits per route group
app.use('/auth',               rateLimiter('auth'));
app.use('/api/ml',             rateLimiter('heavy'));
app.use('/api/multi-asset',    rateLimiter('heavy'));
app.use('/api/institutional',  rateLimiter('heavy'));
app.use('/api',                rateLimiter('api'));

// Prometheus scrape endpoint
app.get(config.metricsPath, (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics.getPrometheusText());
});

// Ops status
const opsRouter = require('./api15/opsRoutes');
app.use('/api/ops', opsRouter);
```

### 3. Market session guardrail on live orders

```js
const { guardLiveOrder } = require('./guardrails/marketSessionGuardrails');
app.use('/api/execution/order', guardLiveOrder());
```

### 4. WebSocket adapter

```js
const { wsAdapter } = require('./ws/wsScalingAdapter');

// In your WS connection handler:
wsAdapter.register(connectionId, ws);
ws.on('close', () => wsAdapter.unregister(connectionId));
ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.type === 'subscribe') wsAdapter.subscribe(connectionId, msg.channel);
  // ...
});

// To broadcast market data:
wsAdapter.publish('quotes', { symbol: 'SPY', price: 555.12 });
```

### 5. Provider failover chain

```js
const { ProviderChain } = require('./failover/providerFailover');

const dataChain = new ProviderChain([
  { name: 'polygon',      fn: async (args) => fetchPolygon(args) },
  { name: 'alphaVantage', fn: async (args) => fetchAlphaVantage(args) },
  { name: 'twelvedata',   fn: async (args) => fetchTwelveData(args) },
]);

// In route handler:
const { result, provider } = await dataChain.execute({ symbol, timeframe });
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `10000` | Server port |
| `NODE_ENV` | `development` | Environment |
| `JWT_SECRET` | `change-me-in-production` | **Must be set in production** |
| `REDIS_URL` | `` | Set to enable Redis WS adapter |
| `LOG_LEVEL` | `info` | `error`/`warn`/`info`/`debug` |
| `LOG_PRETTY` | `false` in prod | Human-readable log output |
| `BLOCK_LIVE_OUTSIDE_HOURS` | `true` | Block live orders outside RTH |
| `MULTI_TENANT` | `false` | Enable multi-tenancy |
| `CORS_ORIGINS` | `localhost:5173,localhost:3000` | Comma-separated allowed origins |
| `RL_HEAVY_MAX` | `30` | Heavy tier rate limit per minute |
| `RL_API_MAX` | `200` | API tier rate limit per minute |
| `RL_AUTH_MAX` | `20` | Auth tier rate limit per minute |

## Validation

```bash
node --input-type=commonjs validation-script.cjs
# ✓ logger NDJSON output
# ✓ metrics counters/gauges/histogram
# ✓ rate limiter sliding window
# ✓ market session guardrails (OPEN/WEEKEND/HOLIDAY)
# ✓ circuit breaker CLOSED→OPEN, failover chain
```
