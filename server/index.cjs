const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { MongoClient } = require('mongodb');

const integrateRuntime = require('./bootstrap/runtimeIntegration');
const runtimeHealthEndpoint = require('./monitoring/runtimeHealthEndpoint');
const runtimeBootstrapper = require('./runtime/runtimeBootstrapper');
const marketDataAdapter = require('./integration/marketDataAdapter');

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

async function start() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed =
        origin === 'http://localhost:5173' ||
        origin === 'http://127.0.0.1:5173' ||
        /^https:\/\/[a-zA-Z0-9-]+\.onrender\.com$/.test(origin);
      callback(allowed ? null : new Error('CORS blocked'), allowed);
    },
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.use('/api/monitoring', runtimeHealthEndpoint);
  app.use('/api/runtime', runtimeHealthEndpoint);

  const mongoClient = await connectMongo().catch((err) => {
    console.error('Mongo connection failed, continuing without mongo:', err.message);
    return null;
  });

  const mongoDb = mongoClient ? mongoClient.db(process.env.MONGO_DB_NAME || 'intraday_reversal_engine') : null;

  integrateRuntime({ app, wss, mongoDb });

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
