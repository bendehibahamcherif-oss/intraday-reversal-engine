#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIRS = ['src'];
const results = [];
const errors = [];
const forbidden = [
  { code: 'STALE_API_AI', pattern: /\/api\/ai\//, message: 'Forbidden stale /api/ai/ endpoint in active source' },
  { code: 'STALE_ML_CHAMPION', pattern: /\/api\/ml\/champion\b/, message: 'Forbidden /api/ml/champion endpoint in active source' },
  { code: 'STALE_AI_MODELS', pattern: /\/api\/ai\/models/, message: 'Forbidden /api/ai/models endpoint in active source' },
  { code: 'STALE_MODELS_CHAMPION', pattern: /\/api\/models\/champion/, message: 'Forbidden /api/models/champion endpoint in active source' },
  { code: 'STALE_FEED_SINGULAR', pattern: /\/api\/feed\//, message: 'Use canonical /api/feeds/ route' },
  { code: 'TEMPLATE_UNDEFINED', pattern: /\$\{\s*undefined\s*\}/, message: 'Endpoint template contains ${undefined}' },
  { code: 'UNDEFINED_DATASET_PAYLOAD', pattern: /datasetId\s*:\s*undefined/, message: 'Payload literal contains datasetId: undefined' },
  { code: 'UNDEFINED_SYMBOL_PAYLOAD', pattern: /symbol\s*:\s*undefined/, message: 'Payload literal contains symbol: undefined' },
  { code: 'UNSAFE_LOCALSTORAGE_JSON_PARSE', pattern: /JSON\.parse\(\s*localStorage(?![\s\S]{0,120}\bcatch\b)/, message: 'JSON.parse(localStorage...) must be guarded' },
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

for (const sourceDir of SOURCE_DIRS) {
  for (const file of walk(path.join(ROOT, sourceDir))) {
    if (file.includes(`${path.sep}test${path.sep}`)) continue;
    const rel = path.relative(ROOT, file);
    const text = fs.readFileSync(file, 'utf8');
    for (const rule of forbidden) {
      const match = text.match(rule.pattern);
      if (match) errors.push({ file: rel, code: rule.code, message: rule.message, match: match[0] });
    }
    if (/endpointPath\s*=\s*`[^`]*\$\{[^`]*(?:id|Id|symbol|Symbol)[^`]*\}/.test(text) && !/assert|normalize|if\s*\([^)]*(?:id|Id|symbol|Symbol)/.test(text)) {
      errors.push({ file: rel, code: 'UNGUARDED_ENDPOINT_BUILDER', message: 'Endpoint path builder without visible id guard' });
    }
    if (/(Macro|Beta)/.test(rel) && /Number\([^)]+\)\.toFixed\(/.test(text) && !/Number\.isFinite/.test(text)) {
      errors.push({ file: rel, code: 'UNSAFE_TO_FIXED', message: 'Macro/Beta formatting must finite-check before toFixed' });
    }
    if (/Math\.(min|max)\(\.\.\s*\w+\)/.test(text) && !/\.length|,\s*0|,\s*Infinity|,\s*-Infinity/.test(text)) {
      errors.push({ file: rel, code: 'UNSAFE_EMPTY_SPREAD', message: 'Math min/max spread requires empty-array guard' });
    }
    results.push({ file: rel, bytes: text.length });
  }
}
const output = { generatedAt: new Date().toISOString(), ok: errors.length === 0, scannedFiles: results.length, errors };
fs.writeFileSync('STATIC_API_SCAN_RESULTS.json', JSON.stringify(output, null, 2));
if (!output.ok) {
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}
console.log(`Static API scanner passed (${results.length} files).`);
