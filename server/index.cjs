const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { MongoClient } = require('mongodb');

const integrateRuntime = require('./bootstrap/runtimeIntegration');
const runtimeHealthEndpoint = require('./monitoring/runtimeHealthEndpoint');
const runtimeBootstrapper = require('./runtime/runtimeBootstrapper');
const marketDataAdapter = require('./integration/marketDataAdapter');

// Phase 15: observability middleware
const correlationMiddleware = require('../server-deliverables/middleware/correlationMiddleware');
const latencyMiddleware     = require('../server-deliverables/middleware/latencyMiddleware');
const { rateLimiter }       = require('../server-deliverables/middleware/rateLimiter');
const metrics               = require('../server-deliverables/observability/metrics');

// Phase 15: route modules
const opsRoutes             = require('../server-deliverables/api15/opsRoutes');
const multiAssetRoutes      = require('../server-deliverables/api/multiAssetRoutes');
const institutionalRoutes   = require('../server-deliverables/api/institutionalRoutes');

// Phase 9B: ML routes (worker-pool inference)
const mlRoutes              = require('../server-deliverables/ai/mlRoutes');

// Portfolio & paper-trading routes
const portfolioRoutes       = require('../server-deliverables/api/portfolioRoutes');

// Phase 15: market session guardrail
const { guardLiveOrder }    = require('../server-deliverables/guardrails/marketSessionGuardrails');

const PORT = Number(process.env.PORT || 3001);
const MONGO_URI = process.env.MONGO_URI || '';
const MARKET_FEED_KEY = process.env.MARKET_FEED_KEY || '';
const MARKET_FEED_SECRET = process.env.MARKET_FEED_SECRET || '';

async function connectMongo() {
  if (!MONGO_URI) {
    console.warn('MONGO_URI not set, running with in-memory persistence only.');
    return null;
  }

  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 4000 });
  await client.connect();
  console.log('Mongo connected');
  return client;
}

// ── Global error handlers — prevent silent crashes ─────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

async function start() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.use(cors({
    origin: [
      'https://intraday-reversal-engine.onrender.com',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ],
  }));
  app.use(express.json({ limit: '1mb' }));

  // ── Phase 15: request tracing + latency recording ──────────────────────────
  app.use(correlationMiddleware);
  app.use(latencyMiddleware);

  app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.use('/api/monitoring', runtimeHealthEndpoint);
  app.use('/api/runtime', runtimeHealthEndpoint);

  // ── Phase 15: rate-limiting per tier ──────────────────────────────────────
  app.use('/api/ml',            rateLimiter('heavy'));
  app.use('/api/multi-asset',   rateLimiter('heavy'));
  app.use('/api/institutional', rateLimiter('heavy'));
  app.use('/api',               rateLimiter('api'));

  const mongoClient = await connectMongo().catch((err) => {
    console.error('Mongo connection failed, continuing without mongo:', err.message);
    return null;
  });

  const mongoDb = mongoClient ? mongoClient.db(process.env.MONGO_DB_NAME || 'intraday_reversal_engine') : null;

  integrateRuntime({ app, wss, mongoDb });

  // ── Phase 9B: ML inference (worker-pool XGBoost) ──────────────────────────
  app.use('/api/ml', mlRoutes);

  // ── Portfolio & paper-trading analytics ────────────────────────────────────
  app.use('/api/portfolio', portfolioRoutes);
  app.use('/api/paper',     portfolioRoutes);

  // ── Phase 13: multi-asset analysis ────────────────────────────────────────
  app.use('/api/multi-asset', multiAssetRoutes);

  // ── Phase 13: institutional sizing + scenario analysis ────────────────────
  app.use('/api/institutional', institutionalRoutes);

  // ── Phase 15: ops status + Prometheus metrics ─────────────────────────────
  app.use('/api/ops', opsRoutes);
  app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics.getPrometheusText());
  });

  // ── Market session guardrail: live orders only during RTH ─────────────────
  app.use('/api/execution/order', guardLiveOrder());

  runtimeBootstrapper.boot({ marketDataAdapter });

  if (!MARKET_FEED_KEY || !MARKET_FEED_SECRET) {
    console.warn('Market feed credentials absent. Live feed ingestion disabled; API, replay and websocket remain active.');
  }

  app.post('/api/market/tick', async (req, res) => {
    if (!MARKET_FEED_KEY || !MARKET_FEED_SECRET) {
      return res.status(503).json({ success: false, error: 'Live market feed not configured' });
    }

    try {
      const out = await marketDataAdapter.ingestTick('manual', req.body || {});
      res.json({ success: true, out });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  server.listen(PORT, () => {
    console.log(`Runtime backend listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});
