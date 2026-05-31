'use strict';

/**
 * Model registry — JSON file-backed, in-memory cache.
 *
 * Schema per entry:
 *   modelVersion, createdAt, datasetHash, featureVersion, labelSpecVersion,
 *   trainMetrics, valMetrics, testMetrics,
 *   champion: bool, challenger: bool,
 *   artifactPath (path to model.ubj), manifestPath,
 *   featureImportance (top 10), bestIteration,
 *   symbol, timeframe
 */

const fs   = require('fs');
const path = require('path');

const REGISTRY_DIR  = path.join(__dirname, 'registry');
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'registry.json');

// In-memory cache
let _registry = null;

function _load() {
  if (_registry) return _registry;
  try {
    if (!fs.existsSync(REGISTRY_DIR)) fs.mkdirSync(REGISTRY_DIR, { recursive: true });
    if (fs.existsSync(REGISTRY_PATH)) {
      _registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    } else {
      _registry = { models: [], champion: null, challenger: null };
      _persist();
    }
  } catch {
    _registry = { models: [], champion: null, challenger: null };
  }
  return _registry;
}

function _persist() {
  try {
    if (!fs.existsSync(REGISTRY_DIR)) fs.mkdirSync(REGISTRY_DIR, { recursive: true });
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(_registry, null, 2));
  } catch (err) {
    console.error('[modelRegistry] persist failed:', err.message);
  }
}

/**
 * Register a new model from a training manifest.
 */
function register(manifest) {
  const reg = _load();
  const existing = reg.models.findIndex((m) => m.modelVersion === manifest.modelVersion);
  if (existing !== -1) {
    reg.models[existing] = { ...manifest, champion: false, challenger: false, registeredAt: new Date().toISOString() };
  } else {
    reg.models.push({ ...manifest, champion: false, challenger: false, registeredAt: new Date().toISOString() });
  }
  _persist();
  return manifest.modelVersion;
}

/**
 * Promote a model to champion. Demotes previous champion to non-champion.
 */
function promoteChampion(modelVersion) {
  const reg = _load();
  const target = reg.models.find((m) => m.modelVersion === modelVersion);
  if (!target) throw new Error(`Model not found: ${modelVersion}`);

  for (const m of reg.models) m.champion = false;
  target.champion   = true;
  target.challenger = false;
  reg.champion      = modelVersion;
  _persist();
  return target;
}

/**
 * Set a model as challenger (for A/B comparison against champion).
 */
function setChallenger(modelVersion) {
  const reg = _load();
  const target = reg.models.find((m) => m.modelVersion === modelVersion);
  if (!target) throw new Error(`Model not found: ${modelVersion}`);

  for (const m of reg.models) m.challenger = false;
  target.challenger = true;
  reg.challenger    = modelVersion;
  _persist();
  return target;
}

function getChampion(symbol) {
  const reg = _load();
  const models = symbol
    ? reg.models.filter((m) => m.symbol === symbol)
    : reg.models;
  return models.find((m) => m.champion) || null;
}

function getChallenger(symbol) {
  const reg = _load();
  const models = symbol
    ? reg.models.filter((m) => m.symbol === symbol)
    : reg.models;
  return models.find((m) => m.challenger) || null;
}

function getModel(modelVersion) {
  const reg = _load();
  return reg.models.find((m) => m.modelVersion === modelVersion) || null;
}

function listModels(symbol) {
  const reg = _load();
  const models = symbol
    ? reg.models.filter((m) => m.symbol === symbol)
    : reg.models;
  return [...models].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getStats() {
  const reg = _load();
  return {
    totalModels: reg.models.length,
    champion:    reg.champion,
    challenger:  reg.challenger,
  };
}

// For testing
function _reset() { _registry = null; if (fs.existsSync(REGISTRY_PATH)) fs.unlinkSync(REGISTRY_PATH); }

module.exports = { register, promoteChampion, setChallenger, getChampion, getChallenger, getModel, listModels, getStats, _reset };
