'use strict';

/**
 * In-process Prometheus-compatible metrics.
 *
 * Exposes three instrument types:
 *   - Counter   (monotonically increasing)
 *   - Gauge     (arbitrary up/down)
 *   - Histogram (sliding-window latency buckets, computes p50/p95/p99)
 *
 * Renders to Prometheus text format via getPrometheusText().
 * Mount GET /metrics → getPrometheusText() for scraping by Prometheus / Grafana Cloud.
 */

// Boundaries in milliseconds for HTTP latency histograms
const LATENCY_BOUNDS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const HIST_WINDOW    = 1000; // keep last N samples per label set

const counters   = new Map(); // key → number
const gauges     = new Map(); // key → number
const hists      = new Map(); // key → number[]  (rolling window)
const meta       = new Map(); // key → { help, type }

// ── helpers ───────────────────────────────────────────────────────────────────

function labelStr(labels) {
  if (!labels || !Object.keys(labels).length) return '';
  const pairs = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
  return `{${pairs}}`;
}

function key(name, labels) { return `${name}${labelStr(labels)}`; }

// ── public API ────────────────────────────────────────────────────────────────

function registerMetric(name, type, help) {
  if (!meta.has(name)) meta.set(name, { type, help: help || name });
}

function incCounter(name, labels = {}, amount = 1) {
  const k = key(name, labels);
  counters.set(k, (counters.get(k) || 0) + amount);
}

function setGauge(name, value, labels = {}) {
  gauges.set(key(name, labels), Number(value));
}

function incGauge(name, delta = 1, labels = {}) {
  const k = key(name, labels);
  gauges.set(k, (gauges.get(k) || 0) + delta);
}

function recordHistogram(name, valueMs, labels = {}) {
  const k = key(name, labels);
  const arr = hists.get(k) || [];
  arr.push(valueMs);
  if (arr.length > HIST_WINDOW) arr.shift();
  hists.set(k, arr);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Prometheus text format ─────────────────────────────────────────────────────

function getPrometheusText() {
  const lines = [];
  const now   = Date.now();

  // Counters
  for (const [k, v] of counters) {
    const name = k.split('{')[0];
    const m    = meta.get(name) || {};
    lines.push(`# HELP ${name} ${m.help || name}`);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${k} ${v} ${now}`);
  }

  // Gauges
  for (const [k, v] of gauges) {
    const name = k.split('{')[0];
    const m    = meta.get(name) || {};
    lines.push(`# HELP ${name} ${m.help || name}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${k} ${v} ${now}`);
  }

  // Histograms → summary style (p50/p95/p99 + count + sum)
  for (const [k, arr] of hists) {
    const name   = k.split('{')[0];
    const labels = k.includes('{') ? k.slice(k.indexOf('{')) : '';
    const m      = meta.get(name) || {};
    const sorted = [...arr].sort((a, b) => a - b);
    const sum    = arr.reduce((s, x) => s + x, 0);
    lines.push(`# HELP ${name} ${m.help || name}`);
    lines.push(`# TYPE ${name} summary`);
    for (const q of [0.5, 0.9, 0.95, 0.99]) {
      const lbl = labels ? labels.slice(0, -1) + `,quantile="${q}"}` : `{quantile="${q}"}`;
      lines.push(`${name}${lbl} ${percentile(sorted, q).toFixed(2)} ${now}`);
    }
    // Bucket counts for compatibility
    for (const bound of LATENCY_BOUNDS) {
      const count = arr.filter(v => v <= bound).length;
      const lbl   = labels ? labels.slice(0, -1) + `,le="${bound}"}` : `{le="${bound}"}`;
      lines.push(`${name}_bucket${lbl} ${count} ${now}`);
    }
    lines.push(`${name}_count${labels} ${arr.length} ${now}`);
    lines.push(`${name}_sum${labels} ${sum.toFixed(2)} ${now}`);
  }

  return lines.join('\n') + '\n';
}

// ── Snapshot for internal use (ops endpoint) ──────────────────────────────────

function getSnapshot() {
  const snap = { counters: {}, gauges: {}, histograms: {} };
  for (const [k, v] of counters) snap.counters[k] = v;
  for (const [k, v] of gauges)   snap.gauges[k]   = v;
  for (const [k, arr] of hists) {
    if (!arr.length) continue;
    const sorted = [...arr].sort((a, b) => a - b);
    snap.histograms[k] = {
      count: arr.length,
      p50:   percentile(sorted, 0.5),
      p95:   percentile(sorted, 0.95),
      p99:   percentile(sorted, 0.99),
      mean:  arr.reduce((s, x) => s + x, 0) / arr.length,
    };
  }
  return snap;
}

// Pre-register core metrics
registerMetric('http_requests_total',        'counter',   'Total HTTP requests');
registerMetric('http_errors_total',          'counter',   'Total HTTP errors (4xx+5xx)');
registerMetric('http_request_duration_ms',   'histogram', 'HTTP request latency in ms');
registerMetric('ws_connections_active',      'gauge',     'Active WebSocket connections');
registerMetric('ws_messages_total',          'counter',   'Total WebSocket messages');
registerMetric('provider_health',            'gauge',     'Provider health (1=up, 0=down)');
registerMetric('rate_limit_rejections_total','counter',   'Rate limit rejections');
registerMetric('auth_failures_total',        'counter',   'Authentication failures');

module.exports = {
  incCounter, setGauge, incGauge, recordHistogram,
  getPrometheusText, getSnapshot, registerMetric,
  // expose for direct use
  LATENCY_BOUNDS,
};
