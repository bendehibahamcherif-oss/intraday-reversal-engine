'use strict';

const fs = require('fs');
const path = require('path');

const ARTIFACT_ROOT = path.join(__dirname, 'artifacts');
const REGISTRY_PATH = path.join(ARTIFACT_ROOT, 'registry.json');

let cache = null;

function ensureRegistry() {
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  if (!fs.existsSync(REGISTRY_PATH)) {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify({ models: [] }, null, 2));
  }
}

function loadRegistry() {
  if (cache) return cache;
  ensureRegistry();
  try {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    cache = { models: Array.isArray(parsed.models) ? parsed.models : [] };
  } catch {
    cache = { models: [] };
  }
  return cache;
}

function saveRegistry(registry) {
  ensureRegistry();
  cache = registry;
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

function normalizeRun(run) {
  const modelId = run.modelId || run.modelVersion || run.version;
  if (!modelId) throw new Error('modelId is required');
  return {
    modelId,
    modelVersion: modelId,
    version: modelId,
    createdAt: run.createdAt || new Date().toISOString(),
    symbol: run.symbol || '',
    timeframe: run.timeframe || '',
    horizon: Number(run.horizon || 20),
    datasetHash: run.datasetHash || run.dataset_hash || '',
    featureSchemaHash: run.featureSchemaHash || run.feature_schema_hash || '',
    metrics: run.metrics || {},
    artifactPath: run.artifactPath || run.artifact_uri || '',
    manifestPath: run.manifestPath || '',
    status: run.status || 'candidate',
    promotedAt: run.promotedAt || null,
  };
}

function registerModel(run) {
  const registry = loadRegistry();
  const normalized = normalizeRun(run);
  const index = registry.models.findIndex((model) => model.modelId === normalized.modelId);
  if (index >= 0) {
    registry.models[index] = { ...registry.models[index], ...normalized };
  } else {
    registry.models.push(normalized);
  }
  saveRegistry(registry);
  return normalized;
}

function listModels(symbol) {
  const upper = symbol ? String(symbol).toUpperCase() : null;
  return loadRegistry().models
    .filter((model) => !upper || String(model.symbol).toUpperCase() === upper)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getModel(modelId) {
  return loadRegistry().models.find((model) => model.modelId === modelId || model.modelVersion === modelId || model.version === modelId) || null;
}

function getChampion(symbol) {
  const upper = symbol ? String(symbol).toUpperCase() : null;
  return listModels(upper).find((model) => model.status === 'champion') || null;
}

function promoteModel(modelId) {
  const registry = loadRegistry();
  const target = registry.models.find((model) => model.modelId === modelId || model.modelVersion === modelId || model.version === modelId);
  if (!target) throw new Error(`Model not found: ${modelId}`);
  const now = new Date().toISOString();
  for (const model of registry.models) {
    if (model.status === 'champion') model.status = 'archived';
    model.promotedAt = model.promotedAt || null;
  }
  target.status = 'champion';
  target.promotedAt = now;
  saveRegistry(registry);
  return target;
}

function getStats() {
  const models = loadRegistry().models;
  const champion = models.find((model) => model.status === 'champion') || null;
  return { totalModels: models.length, champion: champion?.modelId || null };
}

function _reset() {
  cache = { models: [] };
  ensureRegistry();
  saveRegistry(cache);
}

module.exports = {
  ARTIFACT_ROOT,
  REGISTRY_PATH,
  registerModel,
  listModels,
  getModel,
  getChampion,
  promoteModel,
  getStats,
  _reset,
};
